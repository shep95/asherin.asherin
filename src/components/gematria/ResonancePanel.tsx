// Resonance panel — surfaces past/present/future date collisions for the
// currently-submitted gematria phrase. Client-side only, live-computed.

import { useEffect, useMemo, useState } from "react";
import { Clock, History, Radar, Sparkles, ShieldCheck, ShieldX, Info } from "lucide-react";
import {
  projectResonance,
  synthesizeTheory,
  type Direction,
  type Resonance,
  type Theory,
} from "@/lib/gematria/resonance";
import {
  loadTheories,
  upsertTheories,
  updateTheoryStatus,
} from "@/lib/gematria/theoryStore";

interface Props { phrase: string }

const DIRECTIONS: { key: Direction; label: string; icon: typeof Clock; hint: string }[] = [
  { key: "past",    label: "Past echoes",     icon: History,  hint: "Historical events whose date fingerprint collides with this phrase." },
  { key: "present", label: "Present window",  icon: Radar,    hint: "Days in the next 30 with the strongest multi-axis resonance." },
  { key: "future",  label: "Future candidates", icon: Sparkles, hint: "Dates in the coming years where 2+ axes align. Falsifiable ±3 days." },
];

export default function ResonancePanel({ phrase }: Props) {
  const output = useMemo(() => phrase ? projectResonance(phrase, { futureYears: 4, topK: 6 }) : null, [phrase]);
  const [theories, setTheories] = useState<Theory[]>(() => loadTheories());
  const [activeDir, setActiveDir] = useState<Direction>("past");

  // Auto-persist any theory the user hasn't already saved when a new phrase is scored.
  useEffect(() => {
    if (!output || !phrase) return;
    const fresh: Theory[] = [];
    for (const dir of ["past", "present", "future"] as Direction[]) {
      const list = output[dir];
      const precedents = output.past;
      for (const r of list) fresh.push(synthesizeTheory(phrase, r, precedents));
    }
    if (fresh.length) setTheories(upsertTheories(fresh));
  }, [output, phrase]);

  if (!phrase || !output) return null;

  const totals = {
    past: output.past.length,
    present: output.present.length,
    future: output.future.length,
  };
  const active = output[activeDir];

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-xs tracking-[0.2em] uppercase text-muted-foreground flex-1">
          Resonance Chronogram · "{phrase}"
        </h2>
        <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
          <Info className="h-3 w-3" strokeWidth={1.5} />
          statistical collision search · falsifiable
        </span>
      </div>

      <Chronogram output={output} />

      <div className="flex gap-1.5 flex-wrap">
        {DIRECTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveDir(key)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] tracking-wide transition-colors ${
              activeDir === key
                ? "border-foreground/40 bg-foreground/[0.06] text-foreground"
                : "border-border/30 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.02]"
            }`}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
            {label}
            <span className="text-muted-foreground/60">({totals[key]})</span>
          </button>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
        {DIRECTIONS.find((d) => d.key === activeDir)?.hint}
      </p>

      {active.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/30 py-6 text-center text-xs text-muted-foreground">
          No {activeDir} resonance for this phrase in the current scan window.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {active.map((r) => {
            const t = theories.find((x) => x.date === r.date && x.direction === activeDir && x.phrase === phrase);
            return t ? (
              <TheoryCard key={t.id} theory={t} onStatus={(s) => setTheories(updateTheoryStatus(t.id, s))} />
            ) : null;
          })}
        </div>
      )}
    </section>
  );
}

function Chronogram({ output }: { output: { past: Resonance[]; present: Resonance[]; future: Resonance[] } }) {
  const all = [...output.past, ...output.present, ...output.future];
  if (all.length === 0) return null;

  // Y-mapped by date, min = earliest past, max = latest future.
  const times = all.map((r) => new Date(r.date + "T00:00:00Z").getTime());
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(1, max - min);
  const maxScore = Math.max(...all.map((r) => r.score));

  const now = Date.now();
  const nowPct = ((now - min) / span) * 100;

  const dotColor = (dir: Direction) =>
    dir === "past" ? "bg-foreground/50" : dir === "present" ? "bg-foreground" : "bg-foreground/70 ring-1 ring-foreground/40";

  return (
    <div className="relative h-16 rounded-md border border-border/30 bg-foreground/[0.02] px-4 py-2 overflow-hidden">
      <div className="absolute inset-x-4 top-1/2 h-px bg-border/40" />
      {nowPct >= 0 && nowPct <= 100 && (
        <div
          className="absolute top-2 bottom-2 w-px bg-foreground/60"
          style={{ left: `calc(${nowPct}% + 1rem)` }}
          title="now"
        />
      )}
      {all.map((r, i) => {
        const t = new Date(r.date + "T00:00:00Z").getTime();
        const x = ((t - min) / span) * 100;
        const size = 4 + (r.score / maxScore) * 10;
        return (
          <div
            key={`${r.date}-${i}`}
            className={`absolute top-1/2 -translate-y-1/2 rounded-full ${dotColor(r.direction)}`}
            style={{
              left: `calc(${x}% + 1rem - ${size / 2}px)`,
              width: `${size}px`,
              height: `${size}px`,
            }}
            title={`${r.date} · score ${r.score} · ${r.event?.t ?? r.direction}`}
          />
        );
      })}
      <div className="absolute inset-x-4 bottom-1 flex justify-between text-[9px] text-muted-foreground/60 font-mono">
        <span>{isoOf(min)}</span>
        <span>{isoOf(max)}</span>
      </div>
    </div>
  );
}

function isoOf(ms: number) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function TheoryCard({ theory, onStatus }: { theory: Theory; onStatus: (s: Theory["status"]) => void }) {
  const confColor =
    theory.confidence === "high" ? "text-foreground border-foreground/40 bg-foreground/[0.06]"
    : theory.confidence === "medium" ? "text-foreground/80 border-border/40 bg-foreground/[0.03]"
    : "text-muted-foreground border-border/30 bg-transparent";

  const statusBadge =
    theory.status === "confirmed" ? { label: "confirmed", cls: "border-foreground/50 text-foreground bg-foreground/[0.08]" }
    : theory.status === "refuted" ? { label: "refuted", cls: "border-border/40 text-muted-foreground line-through" }
    : { label: "open", cls: "border-border/30 text-muted-foreground" };

  return (
    <article className="rounded-lg border border-border/30 bg-foreground/[0.015] p-3 space-y-2 hover:border-border/50 transition-colors">
      <header className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-mono text-sm text-foreground">{theory.date}</p>
          {theory.event && (
            <p className="text-[11px] text-muted-foreground truncate" title={theory.event.t}>
              marker · {theory.event.t}
            </p>
          )}
        </div>
        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-widest ${confColor}`}>
          {theory.confidence} · {theory.score}
        </span>
      </header>

      <ul className="space-y-0.5 text-[11px] text-muted-foreground font-mono">
        {theory.hits.slice(0, 4).map((h, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-foreground/70">◉</span>
            <span className="truncate">{h.phraseSide} ↔ {h.dateSide}</span>
          </li>
        ))}
        {theory.hits.length > 4 && (
          <li className="text-muted-foreground/50">+{theory.hits.length - 4} more axes</li>
        )}
      </ul>

      <p className="text-[11px] text-foreground/80 leading-relaxed">{theory.hypothesis}</p>
      <p className="text-[10px] text-muted-foreground/70 italic leading-relaxed">
        Falsifiable: {theory.falsifiability}
      </p>

      {theory.precedents.length > 0 && (
        <div className="pt-1 border-t border-border/20">
          <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60 mb-1">Precedents</p>
          <ul className="space-y-0.5 text-[10px] text-muted-foreground">
            {theory.precedents.map((p, i) => (
              <li key={i} className="flex gap-2 truncate">
                <span className="font-mono text-muted-foreground/60">{p.date}</span>
                <span className="truncate">{p.title}</span>
                <span className="ml-auto font-mono text-muted-foreground/50">{p.score}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className="flex items-center gap-1 pt-1">
        <span className={`rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-widest ${statusBadge.cls}`}>
          {statusBadge.label}
        </span>
        <div className="flex-1" />
        {theory.direction !== "past" && theory.status !== "confirmed" && (
          <button
            type="button"
            onClick={() => onStatus("confirmed")}
            className="inline-flex items-center gap-1 rounded border border-border/30 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-foreground/40"
            title="Mark confirmed"
          >
            <ShieldCheck className="h-3 w-3" strokeWidth={1.5} /> confirm
          </button>
        )}
        {theory.direction !== "past" && theory.status !== "refuted" && (
          <button
            type="button"
            onClick={() => onStatus("refuted")}
            className="inline-flex items-center gap-1 rounded border border-border/30 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-foreground/40"
            title="Mark refuted"
          >
            <ShieldX className="h-3 w-3" strokeWidth={1.5} /> refute
          </button>
        )}
      </footer>
    </article>
  );
}
