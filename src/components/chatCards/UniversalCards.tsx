// Universal shape-based cards for chat responses across any domain.
// Each card renders defensively — missing optional fields simply don't render.
// A shared <CardShell> gives every card the same visual DNA: dark glass frame,
// uppercase tracking-[0.2em] label chip, optional source footer.
//
// Flaws considered:
//  - Payloads come from the model → all strings are truncated + treated as text
//    (no dangerouslySetInnerHTML, no raw markdown injection at HTML level).
//  - Arrays are validated with Array.isArray + item shape checks.
//  - Image URLs pass a strict http(s) check to prevent javascript: schemes.
//  - Every card has an "empty valid payload" path that renders nothing rather
//    than throwing.

import { Fragment } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Info,
  User,
  Network,
  Clock,
  Columns3,
  TrendingUp,
  Quote as QuoteIcon,
  Link2,
  List as ListIcon,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";

type Source = "chat:aureon" | "chat:asher";

// ────────────────────────────── shared utils ──────────────────────────────

const MAX_STR = 2000;

function s(v: unknown, max = MAX_STR): string {
  if (v === null || v === undefined) return "";
  const raw = typeof v === "string" ? v : String(v);
  return raw.slice(0, max);
}

function safeUrl(v: unknown): string | null {
  const raw = s(v, 2048).trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
  } catch { /* fall through */ }
  return null;
}

interface Citation { title?: string; url: string }
function normSources(v: unknown): Citation[] {
  if (!Array.isArray(v)) return [];
  const out: Citation[] = [];
  for (const item of v) {
    if (typeof item === "string") {
      const url = safeUrl(item);
      if (url) out.push({ url });
    } else if (item && typeof item === "object") {
      const url = safeUrl((item as any).url);
      if (url) out.push({ url, title: s((item as any).title, 200) || undefined });
    }
    if (out.length >= 12) break;
  }
  return out;
}

// ────────────────────────────── shell ──────────────────────────────

interface ShellProps {
  icon: React.ComponentType<any>;
  label: string;
  title?: string;
  sources?: Citation[];
  origin?: Source;
  children: React.ReactNode;
}
function CardShell({ icon: Icon, label, title, sources, origin, children }: ShellProps) {
  return (
    <div className="my-2 rounded-lg border border-border/30 bg-foreground/[0.02] overflow-hidden text-foreground">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/20">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
        {title && (
          <span className="text-sm font-light truncate flex-1" title={title}>{title}</span>
        )}
      </div>
      <div className="px-3 py-2.5">{children}</div>
      {(sources && sources.length > 0) || origin ? (
        <div className="px-3 py-1.5 border-t border-border/15 flex items-center justify-between gap-2 flex-wrap text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">
          {sources && sources.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap normal-case tracking-normal">
              <span className="uppercase tracking-[0.2em]">Sources:</span>
              {sources.map((c, i) => (
                <a
                  key={i}
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 rounded border border-border/30 px-1.5 py-0.5 text-[10px] text-sky-300/90 hover:bg-sky-400/[0.06]"
                  title={c.url}
                >
                  {c.title ? c.title.slice(0, 40) : new URL(c.url).hostname.replace(/^www\./, "")}
                  <ExternalLink className="h-2.5 w-2.5 opacity-70" strokeWidth={1.5} />
                </a>
              ))}
            </div>
          ) : <span />}
          {origin && <span>Origin: {origin}</span>}
        </div>
      ) : null}
    </div>
  );
}

// Markdown body used inside cards. Keep prose tight and safe.
function CardMarkdown({ children }: { children: string }) {
  if (!children.trim()) return null;
  return (
    <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_code]:text-accent [&_code]:bg-secondary/40 [&_code]:px-1 [&_code]:rounded">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

// ────────────────────────────── info ──────────────────────────────
// Universal fact card. Payload:
// { title, subtitle?, summary?, fields?: [{label, value}], imageUrl?, sources? }

export function InfoCard({ payload, source }: { payload: Record<string, unknown>; source?: Source }) {
  const title = s(payload.title, 200);
  const subtitle = s(payload.subtitle, 200);
  const summary = s(payload.summary, 4000);
  const imageUrl = safeUrl(payload.imageUrl);
  const sources = normSources(payload.sources);
  const rawFields = Array.isArray(payload.fields) ? payload.fields : [];
  const fields = rawFields
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({ label: s((f as any).label, 80), value: s((f as any).value, 400) }))
    .filter((f) => f.label && f.value)
    .slice(0, 20);

  if (!title && !summary && fields.length === 0) return null;

  return (
    <CardShell icon={Info} label="Info" title={title || undefined} sources={sources} origin={source}>
      <div className="flex gap-3">
        {imageUrl && (
          <img
            src={imageUrl}
            alt={title || "Info image"}
            loading="lazy"
            className="h-20 w-20 rounded object-cover border border-border/30 shrink-0"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        )}
        <div className="flex-1 min-w-0 space-y-1.5">
          {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
          {summary && <CardMarkdown>{summary}</CardMarkdown>}
          {fields.length > 0 && (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs mt-2">
              {fields.map((f, i) => (
                <div key={i} className="contents">
                  <dt className="text-muted-foreground uppercase tracking-wider text-[10px] pt-0.5">{f.label}</dt>
                  <dd className="text-foreground/90">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </CardShell>
  );
}

// ────────────────────────────── entity ──────────────────────────────
// Person / place / thing profile.
// { name, kind?, imageUrl?, description?, facts?: [{label, value}], sources? }

export function EntityCard({ payload, source }: { payload: Record<string, unknown>; source?: Source }) {
  const name = s(payload.name, 200);
  const kind = s(payload.kind, 80);
  const imageUrl = safeUrl(payload.imageUrl);
  const description = s(payload.description, 4000);
  const sources = normSources(payload.sources);
  const rawFacts = Array.isArray(payload.facts) ? payload.facts : [];
  const facts = rawFacts
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({ label: s((f as any).label, 80), value: s((f as any).value, 400) }))
    .filter((f) => f.label && f.value)
    .slice(0, 24);

  if (!name) return null;

  return (
    <CardShell icon={User} label={kind || "Entity"} title={name} sources={sources} origin={source}>
      <div className="flex gap-3">
        {imageUrl && (
          <img
            src={imageUrl}
            alt={name}
            loading="lazy"
            className="h-24 w-24 rounded object-cover border border-border/30 shrink-0"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        )}
        <div className="flex-1 min-w-0 space-y-2">
          {description && <CardMarkdown>{description}</CardMarkdown>}
          {facts.length > 0 && (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
              {facts.map((f, i) => (
                <div key={i} className="contents">
                  <dt className="text-muted-foreground uppercase tracking-wider text-[10px] pt-0.5">{f.label}</dt>
                  <dd className="text-foreground/90">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </CardShell>
  );
}

// Ring-aware intelligence tree.
//   ring 0 = subject, ring 1 = direct contacts, ring 2 = contacts of contacts.
//   Edges may carry `weight` (independent domains) and `inferred: true`
//   (produced by set intersection, NOT asserted by any single source) — inferred
//   links render dashed and explicitly labelled so a hypothesis is never read
//   as a fact.
export function RelationshipCard({ payload, source }: { payload: Record<string, unknown>; source?: Source }) {
  const subject = s(payload.subject, 200);
  const rawNodes = Array.isArray(payload.nodes) ? payload.nodes : [];
  const nodes = rawNodes.filter((node): node is Record<string, unknown> => !!node && typeof node === "object")
    .map((node) => {
      const ringRaw = Number((node as any).ring);
      return {
        id: s(node.id, 100),
        label: s(node.label, 200),
        detail: s(node.detail, 300),
        ring: Number.isFinite(ringRaw) && ringRaw >= 0 && ringRaw <= 2 ? (ringRaw as 0 | 1 | 2) : null,
        kind: s((node as any).kind, 40),
        attributes: (Array.isArray(node.attributes) ? node.attributes : [])
          .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
          .map((a) => ({ label: s(a.label, 60), value: s(a.value, 400) }))
          .filter((a) => a.label && a.value)
          .slice(0, 14),
      };
    })
    .filter((node) => node.id && node.label).slice(0, 120);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const rawEdges = Array.isArray(payload.edges) ? payload.edges : [];
  const edges = rawEdges.filter((edge): edge is Record<string, unknown> => !!edge && typeof edge === "object")
    .map((edge) => {
      const w = Number((edge as any).weight);
      return {
        from: s(edge.from, 100),
        to: s(edge.to, 100),
        label: s(edge.label, 120),
        confidence: s(edge.confidence, 40),
        weight: Number.isFinite(w) && w > 0 ? Math.min(w, 99) : 0,
        inferred: (edge as any).inferred === true,
        sources: normSources(edge.sources),
      };
    })
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to) && edge.label).slice(0, 200);
  const sources = normSources(payload.sources);
  if (!subject || nodes.length === 0) return null;

  const subjectNode = nodes.find((node) => node.id === "subject") || nodes.find((n) => n.ring === 0) || nodes[0];
  const asserted = edges.filter((e) => !e.inferred);
  const inferred = edges.filter((e) => e.inferred);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Ring assignment falls back to graph distance when the model omitted `ring`.
  const ringOf = (id: string): number => {
    const declared = byId.get(id)?.ring;
    if (declared !== null && declared !== undefined) return declared;
    if (id === subjectNode.id) return 0;
    return asserted.some((e) => (e.from === subjectNode.id && e.to === id) || (e.to === subjectNode.id && e.from === id)) ? 1 : 2;
  };

  const parentsOf = (id: string) =>
    asserted.filter((e) => e.to === id || e.from === id)
      .map((e) => byId.get(e.from === id ? e.to : e.from))
      .filter((n): n is NonNullable<typeof n> => !!n && n.id !== id && ringOf(n.id) < ringOf(id));

  const edgeTo = (id: string) => asserted.find((e) => e.to === id) || asserted.find((e) => e.from === id);

  const ring1 = nodes.filter((n) => n.id !== subjectNode.id && ringOf(n.id) === 1);
  const ring2 = nodes.filter((n) => n.id !== subjectNode.id && ringOf(n.id) === 2);

  const Attributes = ({ rows }: { rows: { label: string; value: string }[] }) => rows.length === 0 ? null : (
    <dl className="mt-1.5 grid grid-cols-[minmax(72px,auto)_1fr] gap-x-2 gap-y-0.5">
      {rows.map((row, i) => (
        <Fragment key={i}>
          <dt className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{row.label}</dt>
          <dd className="text-[11px] text-foreground/80 break-words">{row.value}</dd>
        </Fragment>
      ))}
    </dl>
  );

  const NodeBlock = ({ node, ring }: { node: typeof nodes[number]; ring: 1 | 2 }) => {
    const edge = edgeTo(node.id);
    const via = ring === 2 ? parentsOf(node.id).map((p) => p.label).slice(0, 3) : [];
    return (
      <div className={`relative rounded border px-3 py-2 ${ring === 1 ? "border-border/25" : "border-border/15 bg-foreground/[0.015]"}`}>
        <span className="absolute -left-3 top-1/2 w-3 border-t border-border/30" />
        <div className="flex items-center justify-between gap-2">
          <span className={ring === 1 ? "text-xs text-foreground" : "text-[11px] text-foreground/80"}>{node.label}</span>
          <span className="flex items-center gap-1.5">
            {edge && edge.weight > 0 && (
              <span className="rounded-sm border border-border/30 px-1 text-[9px] font-mono text-muted-foreground" title="independent domains asserting this edge">
                ×{edge.weight}
              </span>
            )}
            <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">{edge?.confidence || "reported"}</span>
          </span>
        </div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-0.5">
          {edge?.label || node.kind || "association"}
          {via.length > 0 && <span className="normal-case tracking-normal text-muted-foreground/70"> · via {via.join(" / ")}</span>}
        </div>
        {node.detail && <div className="text-[11px] text-muted-foreground mt-1">{node.detail}</div>}
        <Attributes rows={node.attributes} />
        {edge && edge.sources.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {edge.sources.map((citation, ci) => (
              <a key={ci} href={citation.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-accent hover:underline">
                {citation.title || safeHost(citation.url)}
              </a>
            ))}
          </div>
        )}
      </div>
    );
  };

  const RingHeader = ({ n, title, note }: { n: number; title: string; note: string }) => (
    <div className="flex items-baseline gap-2 pt-1">
      <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{title}</span>
      <span className="font-mono text-[10px] text-muted-foreground/60">{n}</span>
      <span className="text-[10px] text-muted-foreground/50">{note}</span>
    </div>
  );

  return (
    <CardShell icon={Network} label="Intelligence tree" title={subject} sources={sources} origin={source}>
      <div className="space-y-2">
        <div className="rounded border border-border/30 bg-foreground/[0.03] px-3 py-2">
          <div className="text-sm text-foreground">{subjectNode.label}</div>
          {subjectNode.detail && <div className="text-[11px] text-muted-foreground mt-0.5">{subjectNode.detail}</div>}
          <Attributes rows={subjectNode.attributes} />
        </div>

        {ring1.length === 0 && ring2.length === 0 && (
          <div className="text-xs text-muted-foreground">No relationships met the corroboration threshold.</div>
        )}

        {ring1.length > 0 && (
          <>
            <RingHeader n={ring1.length} title="Ring 1 · direct" note="asserted by retrieved records" />
            <div className="ml-3 border-l border-border/30 pl-3 space-y-2">
              {ring1.map((node) => <NodeBlock key={node.id} node={node} ring={1} />)}
            </div>
          </>
        )}

        {ring2.length > 0 && (
          <>
            <RingHeader n={ring2.length} title="Ring 2 · contacts of contacts" note="pruned expansion" />
            <div className="ml-6 border-l border-dotted border-border/25 pl-3 space-y-2">
              {ring2.map((node) => <NodeBlock key={node.id} node={node} ring={2} />)}
            </div>
          </>
        )}

        {inferred.length > 0 && (
          <div className="mt-1 rounded border border-dashed border-amber-400/30 bg-amber-400/[0.03] px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.22em] text-amber-300/80">Ring 3 · inferred cross-links</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground/70">
              Derived by intersecting branches — hypotheses, not asserted relationships.
            </div>
            <ul className="mt-1.5 space-y-1">
              {inferred.slice(0, 24).map((e, i) => (
                <li key={i} className="text-[11px] text-foreground/75">
                  <span className="text-foreground/90">{byId.get(e.from)?.label}</span>
                  <span className="mx-1.5 text-amber-300/60">⟷</span>
                  <span className="text-foreground/90">{byId.get(e.to)?.label}</span>
                  <span className="ml-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                    {e.label}{e.weight > 0 ? ` · ${e.weight} shared` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </CardShell>
  );
}

function safeHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url.slice(0, 40); }
}



// ────────────────────────────── timeline ──────────────────────────────
// { title?, events: [{ date, label, description? }] }

export function TimelineCard({ payload, source }: { payload: Record<string, unknown>; source?: Source }) {
  const title = s(payload.title, 200);
  const raw = Array.isArray(payload.events) ? payload.events : [];
  const events = raw
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({
      date: s((e as any).date, 40),
      label: s((e as any).label, 200),
      description: s((e as any).description, 600),
    }))
    .filter((e) => e.date && e.label)
    .slice(0, 60);
  const sources = normSources(payload.sources);

  if (events.length === 0) return null;

  return (
    <CardShell icon={Clock} label="Timeline" title={title || undefined} sources={sources} origin={source}>
      <ol className="relative border-l border-border/30 ml-1 space-y-2.5 pl-3">
        {events.map((e, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-[13px] top-1.5 h-1.5 w-1.5 rounded-full bg-amber-400/70" />
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-mono text-[11px] text-amber-300/90">{e.date}</span>
              <span className="text-sm font-light text-foreground">{e.label}</span>
            </div>
            {e.description && (
              <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{e.description}</div>
            )}
          </li>
        ))}
      </ol>
    </CardShell>
  );
}

// ────────────────────────────── comparison ──────────────────────────────
// { title?, items: string[], attributes: [{ label, values: string[] }] }
// values[i] aligns with items[i]. Auto-gilds a cell when >1 item shares the same value.

export function ComparisonCard({ payload, source }: { payload: Record<string, unknown>; source?: Source }) {
  const title = s(payload.title, 200);
  const items = Array.isArray(payload.items)
    ? payload.items.map((v) => s(v, 120)).filter(Boolean).slice(0, 6)
    : [];
  const rawAttrs = Array.isArray(payload.attributes) ? payload.attributes : [];
  const attributes = rawAttrs
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .map((a) => ({
      label: s((a as any).label, 80),
      values: Array.isArray((a as any).values)
        ? (a as any).values.map((v: unknown) => s(v, 200))
        : [],
    }))
    .filter((a) => a.label && a.values.length === items.length)
    .slice(0, 20);
  const sources = normSources(payload.sources);

  if (items.length < 2 || attributes.length === 0) return null;

  return (
    <CardShell icon={Columns3} label="Comparison" title={title || undefined} sources={sources} origin={source}>
      <div className="overflow-x-auto -mx-3">
        <table className="w-full text-sm">
          <thead className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground bg-foreground/[0.02]">
            <tr>
              <th className="text-left px-3 py-1.5 font-normal">Attribute</th>
              {items.map((it, i) => (
                <th key={i} className="text-left px-3 py-1.5 font-normal">{it}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attributes.map((a, r) => {
              const counts = new Map<string, number>();
              a.values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
              return (
                <tr key={r} className="border-t border-border/15">
                  <td className="px-3 py-1.5 text-xs text-muted-foreground uppercase tracking-wider">{a.label}</td>
                  {a.values.map((v, i) => {
                    const gilded = v && (counts.get(v) ?? 0) > 1;
                    return (
                      <td
                        key={i}
                        className={
                          "px-3 py-1.5 text-xs " +
                          (gilded ? "text-amber-300 bg-amber-400/[0.06] font-medium" : "text-foreground/90")
                        }
                        title={gilded ? "Shared value across items" : undefined}
                      >
                        {v || "—"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CardShell>
  );
}

// ────────────────────────────── stat ──────────────────────────────
// { value, unit?, label, context?, sources? }

export function StatCard({ payload, source }: { payload: Record<string, unknown>; source?: Source }) {
  const value = s(payload.value, 40);
  const unit = s(payload.unit, 20);
  const label = s(payload.label, 200);
  const context = s(payload.context, 1000);
  const sources = normSources(payload.sources);

  if (!value || !label) return null;

  return (
    <CardShell icon={TrendingUp} label="Stat" sources={sources} origin={source}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-3xl font-light font-mono text-foreground tracking-tight">{value}</span>
        {unit && <span className="text-sm text-muted-foreground font-mono">{unit}</span>}
      </div>
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mt-1">{label}</div>
      {context && <div className="text-xs text-foreground/80 mt-1.5 leading-snug">{context}</div>}
    </CardShell>
  );
}

// ────────────────────────────── quote ──────────────────────────────
// { text, author?, source_title?, sources? }

export function QuoteCard({ payload, source }: { payload: Record<string, unknown>; source?: Source }) {
  const text = s(payload.text, 2000);
  const author = s(payload.author, 200);
  const sourceTitle = s(payload.source_title, 200);
  const sources = normSources(payload.sources);
  if (!text) return null;

  return (
    <CardShell icon={QuoteIcon} label="Quote" sources={sources} origin={source}>
      <blockquote className="border-l-2 border-amber-400/50 pl-3 text-sm italic text-foreground/90 leading-relaxed">
        "{text}"
      </blockquote>
      {(author || sourceTitle) && (
        <div className="mt-2 text-xs text-muted-foreground">
          {author && <span className="text-foreground/80">— {author}</span>}
          {author && sourceTitle && <span>, </span>}
          {sourceTitle && <span className="italic">{sourceTitle}</span>}
        </div>
      )}
    </CardShell>
  );
}

// ────────────────────────────── sources ──────────────────────────────
// { title?, sources: [{title?, url}] }

export function SourcesCard({ payload, source }: { payload: Record<string, unknown>; source?: Source }) {
  const title = s(payload.title, 200);
  const sources = normSources(payload.sources);
  if (sources.length === 0) return null;

  return (
    <CardShell icon={Link2} label="Sources" title={title || undefined} origin={source}>
      <ul className="space-y-1">
        {sources.map((c, i) => {
          const host = (() => { try { return new URL(c.url).hostname.replace(/^www\./, ""); } catch { return c.url; } })();
          return (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span className="text-muted-foreground font-mono mt-0.5">[{i + 1}]</span>
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-300/90 hover:underline break-all"
              >
                {c.title || host}
                <span className="text-muted-foreground/70 ml-1 text-[10px]">— {host}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </CardShell>
  );
}

// ────────────────────────────── list ──────────────────────────────
// { title?, ordered?: bool, items: [{ label, detail? }] | string[], sources? }

export function ListCard({ payload, source }: { payload: Record<string, unknown>; source?: Source }) {
  const title = s(payload.title, 200);
  const ordered = payload.ordered === true;
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const items = rawItems
    .map((it) => {
      if (typeof it === "string") return { label: s(it, 400), detail: "" };
      if (it && typeof it === "object") {
        return { label: s((it as any).label, 400), detail: s((it as any).detail, 800) };
      }
      return { label: "", detail: "" };
    })
    .filter((it) => it.label)
    .slice(0, 60);
  const sources = normSources(payload.sources);

  if (items.length === 0) return null;

  const ListTag = ordered ? "ol" : "ul";
  return (
    <CardShell icon={ListIcon} label={ordered ? "Ordered List" : "List"} title={title || undefined} sources={sources} origin={source}>
      <ListTag className={ordered ? "list-decimal pl-5 space-y-1.5" : "list-disc pl-5 space-y-1.5"}>
        {items.map((it, i) => (
          <li key={i} className="text-sm text-foreground/90">
            <span>{it.label}</span>
            {it.detail && <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{it.detail}</div>}
          </li>
        ))}
      </ListTag>
    </CardShell>
  );
}

// ────────────────────────────── warning ──────────────────────────────
// { title?, message, severity?: "info" | "warning" | "critical" }

export function WarningCard({ payload, source }: { payload: Record<string, unknown>; source?: Source }) {
  const title = s(payload.title, 200);
  const message = s(payload.message, 2000);
  const severity = payload.severity === "critical" ? "critical"
    : payload.severity === "info" ? "info" : "warning";
  const sources = normSources(payload.sources);
  if (!message) return null;

  const tone =
    severity === "critical" ? "border-red-500/40 bg-red-500/[0.05] text-red-200"
    : severity === "info" ? "border-sky-400/30 bg-sky-400/[0.04] text-sky-100"
    : "border-amber-400/40 bg-amber-400/[0.06] text-amber-100";

  return (
    <div className={`my-2 rounded-lg border overflow-hidden ${tone}`}>
      <div className="flex items-start gap-2 px-3 py-2.5">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={1.5} />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.2em] opacity-80">{severity}</div>
          {title && <div className="text-sm font-medium mt-0.5">{title}</div>}
          <div className="text-xs mt-1 leading-snug opacity-95">{message}</div>
          {sources.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {sources.map((c, i) => (
                <a
                  key={i}
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 rounded border border-current/30 px-1.5 py-0.5 text-[10px] hover:bg-current/10"
                >
                  {c.title ? c.title.slice(0, 40) : new URL(c.url).hostname.replace(/^www\./, "")}
                  <ExternalLink className="h-2.5 w-2.5 opacity-70" strokeWidth={1.5} />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
      {source && (
        <div className="px-3 py-1 border-t border-current/20 text-[9px] uppercase tracking-[0.2em] opacity-70">
          Origin: {source}
        </div>
      )}
    </div>
  );
}
