// SymbolicPassageCard + SymbolicSpineCard — the "Symbolic Deep-Read" surface
// for Asherin and Asher chats.
//
// The model emits one of two fence types (see gematriaChatDirective.ts):
//
//   ```card:symbolic
//   { corpus, reference, literal, symbolic, archetype?, numeric?,
//     echoes?: [{ tradition, note }], arc_position?, sources?: [...] }
//   ```
//
//   ```card:symbolic-spine
//   { corpus, title?, summary?, nodes: [ { id, title, reference?, summary,
//     motifs?: string[], sources?: [...] } ], sources?: [...] }
//   ```
//
// Both cards render locally — no network, no persistence side-effects — so
// they are safe to render inside a streaming assistant message. Every
// factual claim carries a provenance link the operator can click to verify
// the underlying passage in a public-domain source (bible.com, sefaria,
// sacred-texts.com, wikisource, etc.).
//
// Design flaws pre-emptively defused:
// - No `dangerouslySetInnerHTML`. All string fields render as text.
// - Sources are URL-validated (https only) and open in a sandboxed new tab.
// - Length caps on every field to prevent an overlong model output from
//   nuking the chat viewport.
// - No hardcoded colors — uses semantic tokens so light/dark both work.
// - Expandable nodes render lazily via native <details>; no state library.

import { useMemo, useState } from "react";
import { safeHref } from "@/lib/safeUrl";
import { BookOpen, Sparkles as SparkIcon, GitBranch, ExternalLink, ChevronDown } from "lucide-react";

type Source = "chat:aureon" | "chat:asher";

const clamp = (s: unknown, max = 400) =>
  typeof s === "string" ? s.trim().slice(0, max) : "";

const clampList = (v: unknown, cap = 12): unknown[] =>
  Array.isArray(v) ? v.slice(0, cap) : [];

const safeUrl = (u: unknown): string | null => {
  if (typeof u !== "string") return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

interface CitedSource {
  title?: string;
  url: string;
}

const normalizeSources = (raw: unknown): CitedSource[] => {
  const out: CitedSource[] = [];
  for (const s of clampList(raw, 8)) {
    if (typeof s === "string") {
      const url = safeUrl(s);
      if (url) out.push({ url });
      continue;
    }
    if (s && typeof s === "object") {
      const url = safeUrl((s as any).url);
      if (!url) continue;
      const title = clamp((s as any).title, 140);
      out.push(title ? { url, title } : { url });
    }
  }
  return out;
};

// ─── card:symbolic ─────────────────────────────────────────────────────────

interface SymbolicPayload {
  corpus?: unknown;
  reference?: unknown;
  literal?: unknown;
  symbolic?: unknown;
  tradition?: unknown;
  archetype?: unknown;
  numeric?: unknown;
  echoes?: unknown;
  arc_position?: unknown;
  sources?: unknown;
}

interface EchoRow { tradition: string; note: string; }

export function SymbolicPassageCard({ payload, source }: { payload: SymbolicPayload; source?: Source }) {
  const view = useMemo(() => {
    const reference = clamp(payload.reference, 120);
    const literal = clamp(payload.literal, 1200);
    const symbolic = clamp(payload.symbolic, 1200);
    if (!reference || !symbolic) return null;

    const echoes: EchoRow[] = clampList(payload.echoes, 8)
      .map((e) => {
        if (!e || typeof e !== "object") return null;
        const tradition = clamp((e as any).tradition, 80);
        const note = clamp((e as any).note, 400);
        return tradition && note ? { tradition, note } : null;
      })
      .filter((e): e is EchoRow => !!e);

    return {
      corpus: clamp(payload.corpus, 60),
      reference,
      literal,
      symbolic,
      tradition: clamp(payload.tradition, 80),
      archetype: clamp(payload.archetype, 300),
      numeric: clamp(payload.numeric, 300),
      arc_position: clamp(payload.arc_position, 300),
      echoes,
      sources: normalizeSources(payload.sources),
    };
  }, [payload]);

  if (!view) return null;

  return (
    <div
      className="my-3 rounded-lg border border-border/40 bg-background/40 backdrop-blur-sm overflow-hidden"
      data-source={source}
    >
      <div className="flex items-center gap-2 border-b border-border/30 bg-foreground/[0.03] px-3 py-2">
        <BookOpen className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
        <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Symbolic reading</span>
        {view.corpus && (
          <span className="ml-auto text-[10px] uppercase tracking-widest text-muted-foreground/70">{view.corpus}</span>
        )}
      </div>

      <div className="px-3 py-3 space-y-3 text-sm">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs text-foreground/80">{view.reference}</span>
          {view.tradition && (
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 border border-border/30 rounded px-1.5 py-0.5">
              {view.tradition}
            </span>
          )}
        </div>

        {view.literal && (
          <blockquote className="border-l-2 border-border/40 pl-3 italic text-foreground/70 leading-relaxed text-[13px]">
            {view.literal}
          </blockquote>
        )}

        <Section label="Symbolic">{view.symbolic}</Section>
        {view.archetype && <Section label="Archetype">{view.archetype}</Section>}
        {view.numeric && <Section label="Numeric">{view.numeric}</Section>}
        {view.arc_position && <Section label="Arc position">{view.arc_position}</Section>}

        {view.echoes.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80 mb-1.5">Echoes</div>
            <ul className="space-y-1 text-[13px] text-foreground/80">
              {view.echoes.map((e, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-muted-foreground/70 text-[10px] uppercase tracking-widest min-w-[90px] pt-[3px]">{e.tradition}</span>
                  <span className="flex-1 leading-relaxed">{e.note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {view.sources.length > 0 && <SourcesRow sources={view.sources} />}
      </div>
    </div>
  );
}

// ─── card:symbolic-spine ──────────────────────────────────────────────────

interface SpineNodeRaw {
  id?: unknown;
  title?: unknown;
  reference?: unknown;
  summary?: unknown;
  motifs?: unknown;
  sources?: unknown;
}
interface SpinePayload {
  corpus?: unknown;
  title?: unknown;
  summary?: unknown;
  nodes?: unknown;
  sources?: unknown;
}

interface SpineNode {
  id: string;
  title: string;
  reference?: string;
  summary: string;
  motifs: string[];
  sources: CitedSource[];
}

export function SymbolicSpineCard({ payload, source }: { payload: SpinePayload; source?: Source }) {
  const view = useMemo(() => {
    const nodes: SpineNode[] = [];
    clampList(payload.nodes, 24).forEach((n, idx) => {
      if (!n || typeof n !== "object") return;
      const raw = n as SpineNodeRaw;
      const title = clamp(raw.title, 140);
      const summary = clamp(raw.summary, 900);
      if (!title || !summary) return;
      const motifs = clampList(raw.motifs, 8)
        .map((m) => clamp(m, 40))
        .filter((m) => m.length > 0);
      const reference = clamp(raw.reference, 120);
      const node: SpineNode = {
        id: clamp(raw.id, 40) || `n${idx}`,
        title,
        summary,
        motifs,
        sources: normalizeSources(raw.sources),
      };
      if (reference) node.reference = reference;
      nodes.push(node);
    });

    if (nodes.length === 0) return null;
    return {
      corpus: clamp(payload.corpus, 60),
      title: clamp(payload.title, 160),
      summary: clamp(payload.summary, 600),
      nodes,
      sources: normalizeSources(payload.sources),
    };
  }, [payload]);

  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  if (!view) return null;

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div
      className="my-3 rounded-lg border border-border/40 bg-background/40 backdrop-blur-sm overflow-hidden"
      data-source={source}
    >
      <div className="flex items-center gap-2 border-b border-border/30 bg-foreground/[0.03] px-3 py-2">
        <GitBranch className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
        <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Symbolic spine</span>
        {view.corpus && (
          <span className="ml-auto text-[10px] uppercase tracking-widest text-muted-foreground/70">{view.corpus}</span>
        )}
      </div>

      <div className="px-3 py-3 space-y-3">
        {(view.title || view.summary) && (
          <div className="space-y-1">
            {view.title && <div className="text-sm font-medium text-foreground/90">{view.title}</div>}
            {view.summary && <div className="text-[13px] text-foreground/70 leading-relaxed">{view.summary}</div>}
          </div>
        )}

        <ol className="relative border-l border-border/30 pl-4 space-y-2">
          {view.nodes.map((node, i) => {
            const open = openIds.has(node.id);
            return (
              <li key={node.id} className="relative">
                <span className="absolute -left-[19px] top-2 h-2 w-2 rounded-full bg-foreground/40" aria-hidden />
                <button
                  type="button"
                  onClick={() => toggle(node.id)}
                  aria-expanded={open}
                  className="w-full text-left flex items-start gap-2 py-1.5 group"
                >
                  <span className="text-[10px] font-mono text-muted-foreground/60 pt-1 min-w-[22px]">{String(i + 1).padStart(2, "0")}</span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-medium text-foreground/90">{node.title}</span>
                      {node.reference && (
                        <span className="font-mono text-[10px] text-muted-foreground/70">{node.reference}</span>
                      )}
                    </span>
                    {!open && (
                      <span className="block text-[12px] text-muted-foreground/80 mt-0.5 line-clamp-1">
                        {node.summary}
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 mt-1 text-muted-foreground/60 transition-transform ${open ? "rotate-180" : ""}`}
                    strokeWidth={1.5}
                  />
                </button>

                {open && (
                  <div className="pl-[30px] pb-2 space-y-2">
                    <p className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-line">{node.summary}</p>
                    {node.motifs.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {node.motifs.map((m) => (
                          <span key={m} className="text-[10px] uppercase tracking-widest text-muted-foreground/80 border border-border/30 rounded px-1.5 py-0.5">
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                    {node.sources.length > 0 && <SourcesRow sources={node.sources} compact />}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {view.sources.length > 0 && (
          <div className="pt-2 border-t border-border/20">
            <SourcesRow sources={view.sources} />
          </div>
        )}

        <div className="pt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/60">
          <SparkIcon className="h-3 w-3" strokeWidth={1.5} />
          {'Ask "expand <node title>" to go deeper on any node.'}
        </div>
      </div>
    </div>
  );
}

// ─── shared subcomponents ────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80 mb-1">{label}</div>
      <p className="text-[13px] text-foreground/85 leading-relaxed whitespace-pre-line">{children}</p>
    </div>
  );
}

function SourcesRow({ sources, compact = false }: { sources: CitedSource[]; compact?: boolean }) {
  return (
    <div className={compact ? "flex flex-wrap gap-1.5" : "flex flex-wrap gap-1.5 pt-1"}>
      {!compact && (
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 mr-1 self-center">Sources</span>
      )}
      {sources.map((s, i) => (
        <a
          key={i}
          href={safeHref(s.url)}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex items-center gap-1 text-[11px] text-foreground/70 hover:text-foreground border border-border/30 hover:border-border/60 rounded px-1.5 py-0.5 transition-colors"
        >
          <ExternalLink className="h-2.5 w-2.5" strokeWidth={1.5} />
          <span className="max-w-[240px] truncate">{s.title ?? new URL(s.url).hostname.replace(/^www\./, "")}</span>
        </a>
      ))}
    </div>
  );
}
