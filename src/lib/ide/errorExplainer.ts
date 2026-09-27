// IDE Pain Point #13 + #14: Debugging & cryptic errors.
// Plain-English explanations + suggested fixes for common runtime / build
// errors. Uses a local lookup table for the well-known cases (instant, free)
// and falls back to the AI gateway via the supabase edge function.

import { supabase } from "@/integrations/supabase/client";

export interface ExplainedError {
  rawMessage: string;
  plainEnglish: string;
  rootCause: string;
  fixes: { title: string; code?: string; description: string }[];
  /** Full corrected version of the provided contextCode, ready to overwrite the file. */
  correctedCode?: string;
  source: "local" | "ai";
}

interface Pattern {
  match: RegExp;
  build: (m: RegExpMatchArray) => Omit<ExplainedError, "rawMessage" | "source">;
}

const PATTERNS: Pattern[] = [
  {
    match: /Cannot read propert(?:y|ies) (?:'|")(\w+)(?:'|") of (undefined|null)/,
    build: (m) => ({
      plainEnglish: `Your code tried to read .${m[1]} on something that is ${m[2]}.`,
      rootCause: `The variable you're accessing was ${m[2]} when this line ran. The most common reason is an async value that hadn't loaded yet.`,
      fixes: [
        { title: "Use optional chaining", code: `obj?.${m[1]}`, description: "Returns undefined instead of crashing when the parent is null/undefined." },
        { title: "Guard with a default", code: `(obj ?? {}).${m[1]}`, description: "Substitute an empty object when the value is missing." },
        { title: "Add a loading check", description: "If this is data from an API, render a loading state until it arrives." },
      ],
    }),
  },
  {
    match: /(\w+) is not (?:defined|a function)/,
    build: (m) => ({
      plainEnglish: `\`${m[1]}\` is being used but the runtime can't find it.`,
      rootCause: "Either the import is missing/typo'd, or the symbol was never exported from its module.",
      fixes: [
        { title: "Check the import", code: `import { ${m[1]} } from "...";`, description: "Make sure the file you're importing from actually exports this name." },
        { title: "Check spelling/case", description: "JS is case-sensitive. `useState` ≠ `UseState`." },
      ],
    }),
  },
  {
    match: /Module not found.*['"]([^'"]+)['"]/,
    build: (m) => ({
      plainEnglish: `The package or file \`${m[1]}\` isn't installed or doesn't exist at that path.`,
      rootCause: "Either the dependency hasn't been installed, or the relative path is wrong.",
      fixes: [
        { title: "Install the package", code: `npm install ${m[1]}`, description: "If it's an npm package." },
        { title: "Fix the path", description: "If it's a relative import, double-check the path starts from the current file." },
      ],
    }),
  },
  {
    match: /Maximum (?:call stack|update depth) exceeded|Too many re-renders/,
    build: () => ({
      plainEnglish: "Your component is re-rendering in an infinite loop.",
      rootCause: "Usually a `setState` call placed directly in the render body, or an effect that updates state without proper dependencies.",
      fixes: [
        { title: "Move setState into an effect or handler", description: "Never call setState during render — wrap it in useEffect or an event handler." },
        { title: "Check useEffect dependencies", description: "If the effect updates state that's in its dependency array, you'll get an infinite loop." },
      ],
    }),
  },
  {
    match: /Hydration failed|did not match.*server-rendered HTML/,
    build: () => ({
      plainEnglish: "The HTML the server rendered doesn't match what React rendered on the client.",
      rootCause: "Common causes: using `Date.now()`, `Math.random()`, `window.*`, or browser-only APIs during render.",
      fixes: [
        { title: "Move browser code into useEffect", description: "Anything that depends on `window` or random/time should run after mount." },
        { title: "Use suppressHydrationWarning sparingly", description: "Last resort for unavoidable mismatches like timestamps." },
      ],
    }),
  },
  {
    match: /CORS.*blocked|Access-Control-Allow-Origin/,
    build: () => ({
      plainEnglish: "The browser blocked your request because the server didn't send a CORS header.",
      rootCause: "Cross-origin requests need the server to explicitly allow your origin via `Access-Control-Allow-Origin`.",
      fixes: [
        { title: "Add CORS headers on the server", code: `'Access-Control-Allow-Origin': '*'`, description: "If you control the server, add the header." },
        { title: "Use a Supabase edge function", description: "Proxy the call through your own backend so the browser only talks to your origin." },
      ],
    }),
  },
  {
    match: /Network ?Error|Failed to fetch/,
    build: () => ({
      plainEnglish: "The network request couldn't reach the server.",
      rootCause: "Could be: server down, wrong URL, offline, or CORS preflight failed silently.",
      fixes: [
        { title: "Check the URL", description: "Log the URL right before the fetch and try it in a new browser tab." },
        { title: "Add error handling", code: `try { await fetch(url); } catch (e) { /* show message */ }`, description: "Always wrap fetch in try/catch and show a user-friendly message." },
      ],
    }),
  },
];

export function explainErrorLocal(message: string): ExplainedError | null {
  for (const p of PATTERNS) {
    const m = message.match(p.match);
    if (m) return { rawMessage: message, source: "local", ...p.build(m) };
  }
  return null;
}

export async function explainError(message: string, contextCode?: string): Promise<ExplainedError> {
  const local = explainErrorLocal(message);
  if (local && !contextCode) return local;

  // Fallback to AI via existing zali-chat edge function (already wired to Lovable AI Gateway).
  try {
    const { data, error } = await supabase.functions.invoke("zali-chat", {
      body: {
        messages: [
          { role: "system", content: "You explain runtime/build errors to developers AND produce a fully corrected version of the file. Reply with strict JSON: {\"plainEnglish\":string,\"rootCause\":string,\"fixes\":[{\"title\":string,\"description\":string,\"code\":string?}],\"correctedCode\":string}. \"correctedCode\" MUST be the COMPLETE corrected file contents (not a diff, no markdown fences) that resolves the error while preserving everything else exactly. If no contextCode was provided, set correctedCode to an empty string. Keep plainEnglish/rootCause/fix entries under 240 chars. No markdown, no preamble." },
          { role: "user", content: `Error: ${message}${contextCode ? `\n\nFull current file:\n${contextCode.slice(0, 8000)}` : ""}` },
        ],
        responseMode: "json",
      },
    });
    if (error) throw error;
    const text = typeof data === "string" ? data : (data?.content ?? data?.message ?? "");
    const parsed = parseJsonLoose(text);
    if (parsed) {
      const correctedRaw = typeof parsed.correctedCode === "string" ? parsed.correctedCode : "";
      const corrected = correctedRaw.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
      return {
        rawMessage: message,
        source: "ai",
        plainEnglish: String(parsed.plainEnglish ?? local?.plainEnglish ?? "Couldn't explain this error."),
        rootCause: String(parsed.rootCause ?? local?.rootCause ?? ""),
        fixes: Array.isArray(parsed.fixes) ? parsed.fixes.slice(0, 5).map((f: any) => ({
          title: String(f.title ?? "Suggested fix"),
          description: String(f.description ?? ""),
          code: f.code ? String(f.code) : undefined,
        })) : (local?.fixes ?? []),
        correctedCode: corrected && corrected !== contextCode?.trim() ? corrected : undefined,
      };
    }
  } catch (e: any) {
    const msg = String(e?.message || e || "");
    // Re-throw rate-limit / quota errors so the swarm can back off and retry.
    if (/429|rate.?limit|quota|too.?many.?requests/i.test(msg)) throw e;
    // Other errors → fall through to local/generic explanation.
    console.warn("[explainError] AI fallback failed:", msg);
  }

  if (local) return local;

  return {
    rawMessage: message,
    source: "local",
    plainEnglish: "An error occurred but no specific explanation is available.",
    rootCause: "The error message didn't match a known pattern. Check the stack trace for the file and line where it originated.",
    fixes: [
      { title: "Search the error", description: `Copy the message and search for "${message.slice(0, 60)}…" — most runtime errors are well-documented.` },
      { title: "Check the most recent change", description: "Run `git diff` to see what changed; the bug is almost always in your last few edits." },
    ],
  };
}

function parseJsonLoose(text: string): any | null {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}
