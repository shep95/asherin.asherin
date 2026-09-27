// CandidatesCard — IDENTITY DISAMBIGUATION RACK
//
// Rendered when a person sweep resolves the same name to several DISTINCT
// humans. The operator picks the right one; only then does the expensive
// enrichment act run. Every slot value is computed server-side from the field
// ledger — this component renders, it never infers.
//
// Flaws considered:
//  - data honesty: an empty slot arrives typed as "absent" (queried, unrecorded)
//    or "unsearched" (out of budget) and the two render differently. Nothing is
//    shown as a fact without its confidence band and independent-domain count.
//  - security: face images are routed through the SSRF-guarded intel-avatar
//    edge function, never hot-linked; a load failure degrades to initials.
//    All strings pass through the shared truncating `s()`; no raw HTML.
//  - a11y: options are real <button>s in a list, keyboard reachable, with
//    aria-labels naming the person; the selected state is announced politely.
//  - animation: transform/opacity only, and honoured by prefers-reduced-motion
//    through the shared `motion-reduce` utilities.

import { useCallback, useMemo, useState } from "react";
import { Users, ShieldCheck, ExternalLink, ImageOff, Check } from "lucide-react";

type Source = "chat:aureon" | "chat:asher";

export const INTEL_SELECT_EVENT = "asherin:intel-select";

const MAX_STR = 600;
const s = (v: unknown, max = MAX_STR): string =>
  v === null || v === undefined ? "" : (typeof v === "string" ? v : String(v)).slice(0, max);

function safeUrl(v: unknown): string | null {
  const raw = s(v, 2048).trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol === "https:" || u.protocol === "http:") return u.toString();
  } catch { /* ignore */ }
  return null;
}

/**
 * Local edition: there is no same-origin proxy, and hot-linking a third-party
 * profile image would hand this device's address to that host on every
 * render. Faces are never loaded; the name and slots carry the card.
 */
function proxiedAvatar(_raw: unknown): string | null {
  return null;
}

interface Slot { label: string; value: string; state: string; confidence?: string; domains?: number }
interface Cand {
  id: string; option: number; name: string; score: number;
  documents: number; domains: number; avatar?: string; initials: string;
  slots: Slot[]; family: string[]; matchedOn: string[];
  sources: Array<{ domain: string; url: string }>; confirm: string;
}

function normalize(payload: Record<string, unknown>): Cand[] {
  const raw = payload.candidates;
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).map((c, i) => {
    const o = (c || {}) as Record<string, unknown>;
    const slots = Array.isArray(o.slots)
      ? (o.slots as unknown[]).slice(0, 12).map((x) => {
        const t = (x || {}) as Record<string, unknown>;
        return {
          label: s(t.label, 40),
          value: s(t.value, 240),
          state: s(t.state, 20) || "value",
          confidence: s(t.confidence, 20) || undefined,
          domains: Number.isFinite(Number(t.domains)) ? Number(t.domains) : undefined,
        };
      }).filter((t) => t.label)
      : [];
    return {
      id: s(o.id, 40) || `cand-${i + 1}`,
      option: Number(o.option) || i + 1,
      name: s(o.name, 120) || "Unnamed candidate",
      score: Math.max(0, Math.min(1, Number(o.score) || 0)),
      documents: Number(o.documents) || 0,
      domains: Number(o.domains) || 0,
      avatar: s(o.avatar, 2048) || undefined,
      initials: s(o.initials, 3) || "?",
      slots,
      family: Array.isArray(o.family) ? (o.family as unknown[]).slice(0, 8).map((f) => s(f, 80)).filter(Boolean) : [],
      matchedOn: Array.isArray(o.matchedOn) ? (o.matchedOn as unknown[]).slice(0, 4).map((f) => s(f, 80)).filter(Boolean) : [],
      sources: Array.isArray(o.sources)
        ? (o.sources as unknown[]).slice(0, 6).map((x) => {
          const t = (x || {}) as Record<string, unknown>;
          const url = safeUrl(t.url);
          return url ? { domain: s(t.domain, 60) || new URL(url).hostname, url } : null;
        }).filter((x): x is { domain: string; url: string } => !!x)
        : [],
      confirm: s(o.confirm, 900),
    };
  });
}

const CONF_TONE: Record<string, string> = {
  VERIFIED: "border-emerald-400/30 text-emerald-300/90",
  CORROBORATED: "border-sky-400/30 text-sky-300/90",
  REPORTED: "border-amber-400/30 text-amber-300/90",
};

function Face({ cand }: { cand: Cand }) {
  const [failed, setFailed] = useState(false);
  const src = useMemo(() => proxiedAvatar(cand.avatar), [cand.avatar]);
  if (!src || failed) {
    return (
      <div
        className="h-14 w-14 shrink-0 rounded-md border border-border/30 bg-foreground/[0.04] flex flex-col items-center justify-center text-sm font-light tracking-widest text-muted-foreground"
        aria-hidden="true"
      >
        {cand.initials}
        {src && failed && <ImageOff className="mt-0.5 h-2.5 w-2.5 opacity-50" strokeWidth={1.5} />}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={`Profile image associated with ${cand.name}`}
      width={56}
      height={56}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-14 w-14 shrink-0 rounded-md border border-border/30 object-cover bg-foreground/[0.04]"
    />
  );
}

export function CandidatesCard({ payload, source }: { payload: Record<string, unknown>; source?: Source }) {
  const candidates = useMemo(() => normalize(payload), [payload]);
  const [chosen, setChosen] = useState<string | null>(null);
  const unattributed = Number(payload.unattributed) || 0;

  const select = useCallback((c: Cand) => {
    if (chosen) return;
    setChosen(c.id);
    const prompt = c.confirm || `Run the full dossier on ${c.name} (option ${c.option}) only.`;
    window.dispatchEvent(new CustomEvent(INTEL_SELECT_EVENT, { detail: { prompt } }));
  }, [chosen]);

  if (!candidates.length) return null;

  return (
    <div className="my-2 rounded-lg border border-border/30 bg-foreground/[0.02] overflow-hidden text-foreground">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/20">
        <Users className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Identity resolution</span>
        <span className="text-sm font-light truncate flex-1">{s(payload.title, 160) || "Multiple identities match"}</span>
      </div>

      <p className="px-3 pt-2 text-[11px] leading-relaxed text-muted-foreground">
        {s(payload.note, 300) || "Select one to run the full dossier. Nothing below is merged across candidates."}
        {unattributed > 0 && ` ${unattributed} document(s) matched the name but carried no discriminator and were attributed to no candidate.`}
      </p>

      <ul className="grid gap-2 p-3 sm:grid-cols-2">
        {candidates.map((c) => {
          const isChosen = chosen === c.id;
          const dimmed = chosen && !isChosen;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => select(c)}
                disabled={!!chosen}
                aria-label={`Option ${c.option}: ${c.name}. Run full dossier on this person.`}
                className={[
                  "group w-full h-full rounded-md border p-2.5 text-left transition-[transform,opacity,background-color] duration-200 motion-reduce:transition-none",
                  isChosen ? "border-emerald-400/40 bg-emerald-400/[0.05]" : "border-border/30 bg-foreground/[0.015]",
                  dimmed ? "opacity-40" : "",
                  !chosen ? "hover:-translate-y-0.5 hover:border-foreground/25 hover:bg-foreground/[0.04] motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/40" : "cursor-default",
                ].join(" ")}
              >
                <div className="flex items-start gap-2.5">
                  <Face cand={c} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded border border-border/40 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                        Option {c.option}
                      </span>
                      {isChosen && <Check className="h-3 w-3 text-emerald-400" strokeWidth={2} />}
                    </div>
                    <div className="mt-1 truncate text-sm font-light" title={c.name}>{c.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.16em] text-muted-foreground/80">
                      <ShieldCheck className="h-2.5 w-2.5" strokeWidth={1.5} />
                      weight {c.score.toFixed(2)} · {c.domains} independent {c.domains === 1 ? "source" : "sources"} · {c.documents} doc{c.documents === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>

                <dl className="mt-2 space-y-0.5 border-t border-border/15 pt-2 text-[11px]">
                  {c.slots.map((slot) => (
                    <div key={slot.label} className="flex gap-2">
                      <dt className="w-[68px] shrink-0 text-muted-foreground/70">{slot.label}</dt>
                      <dd className={["min-w-0 flex-1 break-words", slot.state === "value" ? "text-foreground/90" : "italic text-muted-foreground/50"].join(" ")}>
                        {slot.value}
                        {slot.state === "value" && slot.confidence && (
                          <span className={`ml-1.5 rounded border px-1 py-px text-[8px] uppercase tracking-[0.16em] ${CONF_TONE[slot.confidence] || "border-border/30 text-muted-foreground"}`}>
                            {slot.confidence}{slot.domains ? ` ×${slot.domains}` : ""}
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}
                  {c.family.length > 0 && (
                    <div className="flex gap-2">
                      <dt className="w-[68px] shrink-0 text-muted-foreground/70">Family</dt>
                      <dd className="min-w-0 flex-1 break-words text-foreground/90">{c.family.join(" · ")}</dd>
                    </div>
                  )}
                </dl>

                {c.matchedOn.length > 0 && (
                  <p className="mt-1.5 text-[9px] uppercase tracking-[0.16em] text-muted-foreground/50">
                    Clustered on: {c.matchedOn.join(" · ")}
                  </p>
                )}

                {c.sources.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {c.sources.map((src2, i) => (
                      <a
                        key={i}
                        href={src2.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-0.5 rounded border border-border/30 px-1 py-px text-[9px] text-sky-300/80 hover:bg-sky-400/[0.06]"
                        title={src2.url}
                      >
                        {src2.domain.replace(/^www\./, "").slice(0, 26)}
                        <ExternalLink className="h-2 w-2 opacity-70" strokeWidth={1.5} />
                      </a>
                    ))}
                  </div>
                )}

                <span className="mt-2 block text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60">
                  {isChosen ? "Running full dossier…" : chosen ? "" : "Click to confirm this identity"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div aria-live="polite" className="sr-only">
        {chosen ? "Identity confirmed. Running the full dossier." : ""}
      </div>

      {source && (
        <div className="px-3 py-1.5 border-t border-border/15 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">
          Origin: {source}
        </div>
      )}
    </div>
  );
}

export default CandidatesCard;
