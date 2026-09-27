// IDE Pain Point #7 + #17: One-command templates + natural-language commands.
// Generates a multi-file scaffold from a single phrase.
//
// Examples (used by both Aureon's IdeCommandPalette and Asher IDE's command bar):
//   "new component ThreatCard"
//   "new hook useDebounce"
//   "new page Dashboard"
//   "new context Auth"
//   "new api intelligence"

export interface ScaffoldFile {
  path: string;
  content: string;
  language: string;
}

export interface ScaffoldResult {
  kind: string;
  name: string;
  files: ScaffoldFile[];
  /** Which file should open in the editor first */
  primary: string;
}

const PHRASE_RE = /^\s*(?:new|create|make|scaffold|generate)\s+(component|page|hook|context|api|model|util|test)\s+([A-Za-z_][\w$-]*)\s*$/i;

export function parseTemplatePhrase(phrase: string): { kind: string; name: string } | null {
  const m = phrase.match(PHRASE_RE);
  if (!m) return null;
  return { kind: m[1].toLowerCase(), name: m[2] };
}

export function scaffold(kind: string, rawName: string, opts: { ts?: boolean; tailwind?: boolean } = { ts: true, tailwind: true }): ScaffoldResult | null {
  const name = pascal(rawName);
  const ts = opts.ts !== false;
  const ext = ts ? "tsx" : "jsx";
  switch (kind.toLowerCase()) {
    case "component": return scaffoldComponent(name, ext, ts, opts.tailwind !== false);
    case "page":      return scaffoldPage(name, ext, ts, opts.tailwind !== false);
    case "hook":      return scaffoldHook(rawName, ts);
    case "context":   return scaffoldContext(name, ts);
    case "api":       return scaffoldApi(rawName, ts);
    case "model":     return scaffoldModel(name, ts);
    case "util":      return scaffoldUtil(rawName, ts);
    case "test":      return scaffoldTest(name, ts);
    default: return null;
  }
}

function pascal(s: string): string {
  return s.replace(/(^|[-_\s])(\w)/g, (_, _b, c) => c.toUpperCase());
}
function camel(s: string): string {
  const p = pascal(s);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

function scaffoldComponent(name: string, ext: string, ts: boolean, tailwind: boolean): ScaffoldResult {
  const propType = ts ? `\ninterface ${name}Props {\n  className?: string;\n  children?: React.ReactNode;\n}\n` : "";
  const sig = ts ? `({ className, children }: ${name}Props)` : `({ className, children })`;
  const cls = tailwind ? `\`rounded-md border border-border/40 bg-card/40 p-4 \${className ?? ""}\`` : `className`;
  return {
    kind: "component", name,
    primary: `src/components/${name}.${ext}`,
    files: [
      { path: `src/components/${name}.${ext}`, language: ext, content:
`import React from "react";
${propType}
export function ${name}${sig} {
  return (
    <div className={${cls}}>
      <h3 className="text-sm font-medium tracking-tight">${name}</h3>
      {children}
    </div>
  );
}

export default ${name};
` },
      { path: `src/components/${name}.test.${ext}`, language: ext, content:
`import { render, screen } from "@testing-library/react";
import { ${name} } from "./${name}";

describe("${name}", () => {
  it("renders its title", () => {
    render(<${name}>hello</${name}>);
    expect(screen.getByText("${name}")).toBeInTheDocument();
  });

  it("renders children", () => {
    render(<${name}>child node</${name}>);
    expect(screen.getByText("child node")).toBeInTheDocument();
  });
});
` },
    ],
  };
}

function scaffoldPage(name: string, ext: string, ts: boolean, tailwind: boolean): ScaffoldResult {
  return {
    kind: "page", name,
    primary: `src/pages/${name}.${ext}`,
    files: [
      { path: `src/pages/${name}.${ext}`, language: ext, content:
`import React from "react";

export default function ${name}() {
  return (
    <main className="${tailwind ? "min-h-screen p-6 bg-background text-foreground" : ""}">
      <h1 className="${tailwind ? "text-2xl font-semibold tracking-tight mb-4" : ""}">${name}</h1>
      <p className="${tailwind ? "text-sm text-muted-foreground" : ""}">Page scaffolded by Aureon IDE.</p>
    </main>
  );
}
` },
    ],
  };
}

function scaffoldHook(rawName: string, ts: boolean): ScaffoldResult {
  const hookName = rawName.startsWith("use") ? rawName : `use${pascal(rawName)}`;
  const ext = ts ? "ts" : "js";
  return {
    kind: "hook", name: hookName,
    primary: `src/hooks/${hookName}.${ext}`,
    files: [
      { path: `src/hooks/${hookName}.${ext}`, language: ext, content:
`import { useEffect, useState } from "react";

export function ${hookName}${ts ? "<T>(initial: T)" : "(initial)"} {
  const [value, setValue] = useState${ts ? "<T>" : ""}(initial);

  useEffect(() => {
    // setup
    return () => {
      // cleanup
    };
  }, []);

  return [value, setValue]${ts ? " as const" : ""};
}
` },
      { path: `src/hooks/${hookName}.test.${ext}`, language: ext, content:
`import { renderHook, act } from "@testing-library/react";
import { ${hookName} } from "./${hookName}";

describe("${hookName}", () => {
  it("returns initial value", () => {
    const { result } = renderHook(() => ${hookName}(0));
    expect(result.current[0]).toBe(0);
  });

  it("updates value", () => {
    const { result } = renderHook(() => ${hookName}(0));
    act(() => result.current[1](5));
    expect(result.current[0]).toBe(5);
  });
});
` },
    ],
  };
}

function scaffoldContext(name: string, ts: boolean): ScaffoldResult {
  const ext = ts ? "tsx" : "jsx";
  const ctxName = `${name}Context`;
  const provName = `${name}Provider`;
  const hookName = `use${name}`;
  return {
    kind: "context", name,
    primary: `src/contexts/${ctxName}.${ext}`,
    files: [
      { path: `src/contexts/${ctxName}.${ext}`, language: ext, content:
`import React, { createContext, useContext, useState${ts ? ", type ReactNode" : ""} } from "react";

${ts ? `interface ${name}State {\n  value: string;\n  setValue: (v: string) => void;\n}\n` : ""}
const ${ctxName} = createContext${ts ? `<${name}State | null>` : ""}(null);

export function ${provName}({ children }${ts ? ": { children: ReactNode }" : ""}) {
  const [value, setValue] = useState("");
  return <${ctxName}.Provider value={{ value, setValue }}>{children}</${ctxName}.Provider>;
}

export function ${hookName}() {
  const ctx = useContext(${ctxName});
  if (!ctx) throw new Error("${hookName} must be used inside <${provName}>");
  return ctx;
}
` },
    ],
  };
}

function scaffoldApi(rawName: string, ts: boolean): ScaffoldResult {
  const ext = ts ? "ts" : "js";
  const fnName = camel(rawName);
  return {
    kind: "api", name: fnName,
    primary: `src/api/${fnName}.${ext}`,
    files: [
      { path: `src/api/${fnName}.${ext}`, language: ext, content:
`import { supabase } from "@/integrations/supabase/client";

export async function fetch${pascal(rawName)}(${ts ? "params?: Record<string, unknown>" : "params"}) {
  const { data, error } = await supabase.functions.invoke("${fnName}", { body: params ?? {} });
  if (error) throw error;
  return data;
}
` },
    ],
  };
}

function scaffoldModel(name: string, ts: boolean): ScaffoldResult {
  const ext = ts ? "ts" : "js";
  return {
    kind: "model", name,
    primary: `src/models/${name}.${ext}`,
    files: [
      { path: `src/models/${name}.${ext}`, language: ext, content:
ts
  ? `export interface ${name} {\n  id: string;\n  createdAt: Date;\n  updatedAt: Date;\n}\n\nexport function create${name}(partial: Partial<${name}>): ${name} {\n  return { id: crypto.randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...partial };\n}\n`
  : `export function create${name}(partial = {}) {\n  return { id: crypto.randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...partial };\n}\n`
      },
    ],
  };
}

function scaffoldUtil(rawName: string, ts: boolean): ScaffoldResult {
  const ext = ts ? "ts" : "js";
  const fnName = camel(rawName);
  return {
    kind: "util", name: fnName,
    primary: `src/lib/${fnName}.${ext}`,
    files: [
      { path: `src/lib/${fnName}.${ext}`, language: ext, content:
`/**\n * ${fnName} — describe what this utility does.\n */\nexport function ${fnName}(${ts ? "input: string" : "input"}) {\n  return input;\n}\n`
      },
    ],
  };
}

function scaffoldTest(name: string, ts: boolean): ScaffoldResult {
  const ext = ts ? "test.ts" : "test.js";
  return {
    kind: "test", name,
    primary: `src/__tests__/${name}.${ext}`,
    files: [
      { path: `src/__tests__/${name}.${ext}`, language: ts ? "ts" : "js", content:
`describe("${name}", () => {\n  it("works", () => {\n    expect(true).toBe(true);\n  });\n});\n`
      },
    ],
  };
}
