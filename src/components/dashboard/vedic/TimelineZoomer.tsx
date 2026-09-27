import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Rewind, FastForward, RotateCcw } from "lucide-react";
import { DEEP_TIMELINE, type PowerSnapshot } from "@/data/vedic/globalPredictions";

// Linear interpolation between the two nearest snapshots so the chart
// animates smoothly between actual data points.
function interpolate(year: number): PowerSnapshot {
  const sorted = DEEP_TIMELINE;
  if (year <= sorted[0].year) return sorted[0];
  if (year >= sorted[sorted.length - 1].year) return sorted[sorted.length - 1];
  let lo = sorted[0], hi = sorted[sorted.length - 1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].year <= year && sorted[i + 1].year >= year) {
      lo = sorted[i]; hi = sorted[i + 1]; break;
    }
  }
  const span = hi.year - lo.year || 1;
  const t = (year - lo.year) / span;
  // For categorical hegemon, snap to nearest. For numeric share, lerp.
  const useHi = t >= 0.5;
  const base = useHi ? hi : lo;
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  return {
    year,
    hegemon: base.hegemon,
    flag: base.flag,
    share: lerp(lo.share, hi.share),
    intensity: lerp(lo.intensity, hi.intensity),
    yoga: base.yoga,
    event: base.event,
    runners: base.runners.map((r, i) => ({
      name: r.name,
      flag: r.flag,
      share: lerp(lo.runners[i]?.share ?? r.share, hi.runners[i]?.share ?? r.share),
    })),
  };
}

const MIN_YEAR = DEEP_TIMELINE[0].year;
const MAX_YEAR = DEEP_TIMELINE[DEEP_TIMELINE.length - 1].year;
const PRESENT = 2025;

export default function TimelineZoomer() {
  const [year, setYear] = useState<number>(PRESENT);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2); // years per tick
  const rafRef = useRef<number | null>(null);
  const lastTs = useRef<number>(0);

  useEffect(() => {
    if (!playing) return;
    const tick = (ts: number) => {
      if (!lastTs.current) lastTs.current = ts;
      const dt = ts - lastTs.current;
      if (dt > 80) {
        lastTs.current = ts;
        setYear((y) => {
          const next = y + speed;
          if (next >= MAX_YEAR) { setPlaying(false); return MAX_YEAR; }
          return next;
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTs.current = 0;
    };
  }, [playing, speed]);

  const snap = useMemo(() => interpolate(year), [year]);
  const era = year < PRESENT - 2 ? "Past" : year > PRESENT + 2 ? "Future" : "Present";

  // Position of present marker on the slider
  const pct = ((year - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;
  const presentPct = ((PRESENT - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;

  return (
    <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-5 space-y-4">
      <div className="flex items-center gap-2 border-b border-border/15 pb-3">
        <span className="text-xs font-light tracking-[0.18em] uppercase text-foreground/80">Power Timeline · ±500 Years</span>
        <span className={`ml-auto text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${era === "Past" ? "bg-foreground/10 text-foreground/70" : era === "Future" ? "bg-amber-500/10 text-amber-400/90" : "bg-emerald-500/10 text-emerald-400/90"}`}>
          {era}
        </span>
      </div>

      {/* Animated hegemon card */}
      <div className="rounded-lg border border-border/25 bg-background/30 p-4 transition-all duration-300">
        <div className="flex items-baseline gap-3">
          <div className="text-4xl font-extralight tabular-nums text-foreground/95">{year}</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">CE</div>
          <div className="ml-auto text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">Hegemon</div>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-3xl">{snap.flag}</span>
          <span className="text-xl font-light text-foreground/95">{snap.hegemon}</span>
          <span className="ml-auto text-2xl font-extralight tabular-nums text-foreground/85">{snap.share}<span className="text-xs text-muted-foreground/60">%</span></span>
        </div>
        <div className="mt-2 h-1.5 rounded bg-foreground/10 overflow-hidden">
          <div className="h-full bg-foreground/70 transition-all duration-300" style={{ width: `${snap.share}%` }} />
        </div>
        <div className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground/70">{snap.yoga}</div>
        <div className="text-[12px] text-foreground/85 italic mt-1">{snap.event}</div>

        {/* Runners */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {snap.runners.map((r, i) => (
            <div key={i} className="rounded border border-border/20 bg-background/30 p-2">
              <div className="flex items-center gap-1.5 text-[11px] text-foreground/85">
                <span>{r.flag}</span>
                <span className="truncate">{r.name}</span>
                <span className="ml-auto tabular-nums text-foreground/70">{r.share}%</span>
              </div>
              <div className="mt-1 h-1 rounded bg-foreground/10 overflow-hidden">
                <div className="h-full bg-foreground/40 transition-all duration-300" style={{ width: `${r.share}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Intensity (war/upheaval index) */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground/70">
            <span>Upheaval Index</span><span className="tabular-nums">{snap.intensity}/100</span>
          </div>
          <div className="mt-1 h-1 rounded bg-foreground/10 overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{ width: `${snap.intensity}%`, background: snap.intensity > 70 ? "rgb(239 68 68 / 0.7)" : snap.intensity > 45 ? "rgb(245 158 11 / 0.7)" : "rgb(34 197 94 / 0.6)" }}
            />
          </div>
        </div>
      </div>

      {/* Scrubber */}
      <div className="space-y-2">
        <div className="relative h-6">
          {/* Present marker */}
          <div
            className="absolute top-0 bottom-0 w-px bg-emerald-500/60 z-10 pointer-events-none"
            style={{ left: `${presentPct}%` }}
            title="Present (2025)"
          />
          <input
            type="range"
            min={MIN_YEAR}
            max={MAX_YEAR}
            step={1}
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer
                       [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-foreground/15
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:mt-[-6px] [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(255,255,255,0.4)]"
          />
        </div>
        <div className="flex items-center justify-between text-[10px] tabular-nums text-muted-foreground/70">
          <span>{MIN_YEAR}</span>
          <span className="text-emerald-500/80">▲ 2025 (now)</span>
          <span>{MAX_YEAR}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setYear(MIN_YEAR)} className="rounded-md border border-border/30 bg-background/40 px-2 py-1.5 text-xs text-foreground/85 hover:bg-foreground/[0.06]" title="Jump to -500"><Rewind className="h-3.5 w-3.5" /></button>
        <button onClick={() => setYear((y) => Math.max(MIN_YEAR, y - 25))} className="rounded-md border border-border/30 bg-background/40 px-2 py-1 text-[11px] text-foreground/85 hover:bg-foreground/[0.06]">-25y</button>
        <button onClick={() => setPlaying((p) => !p)} className="rounded-md border border-foreground/30 bg-foreground/[0.06] px-3 py-1.5 text-xs text-foreground hover:bg-foreground/[0.12] flex items-center gap-1.5">
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {playing ? "Pause" : "Play"}
        </button>
        <button onClick={() => setYear((y) => Math.min(MAX_YEAR, y + 25))} className="rounded-md border border-border/30 bg-background/40 px-2 py-1 text-[11px] text-foreground/85 hover:bg-foreground/[0.06]">+25y</button>
        <button onClick={() => setYear(MAX_YEAR)} className="rounded-md border border-border/30 bg-background/40 px-2 py-1.5 text-xs text-foreground/85 hover:bg-foreground/[0.06]" title="Jump to +500"><FastForward className="h-3.5 w-3.5" /></button>
        <button onClick={() => { setYear(PRESENT); setPlaying(false); }} className="rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] px-2 py-1.5 text-xs text-emerald-400/90 hover:bg-emerald-500/[0.12] flex items-center gap-1.5"><RotateCcw className="h-3.5 w-3.5" /> Now</button>

        <div className="ml-auto flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Speed
          <select value={speed} onChange={(e) => setSpeed(parseInt(e.target.value))} className="rounded border border-border/30 bg-background/40 px-1.5 py-0.5 text-foreground">
            <option value={1}>1×</option><option value={2}>2×</option><option value={5}>5×</option><option value={10}>10×</option><option value={25}>25×</option>
          </select>
        </div>
      </div>
    </div>
  );
}
