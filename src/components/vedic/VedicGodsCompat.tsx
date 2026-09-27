import { useEffect, useMemo, useState } from "react";
import { Sparkles, Crown, Skull, Flame, Coins, Infinity as InfinityIcon } from "lucide-react";
import {
  matchMythology, computePowers,
  matchMythologyFromChart, computePowersFromChart,
  type Match, type ChartPlacement,
} from "@/lib/vedic/mythologyMatch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";


const PantheonIcon = ({ p }: { p: Match["pantheon"] }) => {
  if (p === "Greek") return <Crown className="h-3.5 w-3.5 text-amber-300/80" strokeWidth={1.5} />;
  if (p === "Roman") return <Sparkles className="h-3.5 w-3.5 text-foreground/70" strokeWidth={1.5} />;
  if (p === "Greek-Monster") return <Skull className="h-3.5 w-3.5 text-rose-300/80" strokeWidth={1.5} />;
  return <Flame className="h-3.5 w-3.5 text-orange-300/80" strokeWidth={1.5} />;
};

const Row = ({ m }: { m: Match }) => (
  <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-5 transition-colors hover:border-border/40">
    <div className="mb-1 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <PantheonIcon p={m.pantheon} />
        <span className="text-sm font-light tracking-wide text-foreground">{m.name}</span>
        <span className="text-[10px] font-extralight tracking-[0.2em] uppercase text-muted-foreground/70">{m.pantheon}</span>
      </div>
      <span className="font-mono text-sm tracking-wider text-foreground">{m.percent}%</span>
    </div>
    <div className="text-[11px] font-extralight uppercase tracking-[0.2em] text-muted-foreground/70">{m.domain}</div>
    <p className="mt-2 text-xs font-extralight leading-relaxed text-muted-foreground">{m.blurb}</p>
    <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-border/20">
      <div className="h-full bg-foreground/70 transition-all" style={{ width: `${m.percent}%` }} />
    </div>
  </div>
);

interface Props {
  defaultDate?: string;
  hideHeader?: boolean;
  ascendantSidDeg?: number;
  placements?: ChartPlacement[];
}

const VedicGodsCompat = ({ defaultDate = "", hideHeader = false, ascendantSidDeg, placements }: Props) => {
  const [date, setDate] = useState(defaultDate);
  useEffect(() => { if (defaultDate) setDate(defaultDate); }, [defaultDate]);

  const hasChart = typeof ascendantSidDeg === "number" && Array.isArray(placements) && placements.length > 0;

  const matches = useMemo(() => {
    if (hasChart) return matchMythologyFromChart(ascendantSidDeg!, placements!);
    return date ? matchMythology(new Date(date)) : [];
  }, [hasChart, ascendantSidDeg, placements, date]);

  const powers = useMemo(() => {
    if (hasChart) return computePowersFromChart(ascendantSidDeg!, placements!);
    return date ? computePowers(new Date(date)) : null;
  }, [hasChart, ascendantSidDeg, placements, date]);

  const top = matches[0];
  const filterBy = (p: string) => matches.filter((m) => m.pantheon === p).slice(0, 6);

  return (
    <section className="relative z-10 px-2 sm:px-6 py-8">
      <div className="mx-auto max-w-6xl">
        {!hideHeader && (
          <div className="mb-10 flex flex-col items-start gap-4">
            <div className="rounded-full border border-border/20 bg-card/30 backdrop-blur-md px-3 py-1 inline-flex items-center gap-2">
              <Crown className="h-3 w-3 text-foreground/70" />
              <span className="text-[10px] font-light tracking-[0.3em] text-muted-foreground uppercase">Mythological Archetype Match</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extralight tracking-wide text-foreground">
              Compare Your Chart to Greek &amp; Roman Gods — and Their Monsters
            </h2>
            <p className="text-sm font-extralight text-muted-foreground max-w-2xl">
              Your Vedic signature is mapped against eight domain weights — authority, war, wisdom, love, chaos, sea, sky, wealth — and scored cosine-style against twenty-eight mythological figures. The closer the percentage, the closer the operating signature.
            </p>
          </div>
        )}

        {!hasChart && (
          <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-end gap-3 w-full max-w-md">
            <div className="flex-1">
              <label className="text-[10px] font-extralight tracking-[0.25em] uppercase text-muted-foreground">Birth Date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="mt-1 bg-card/30 border-border/30 backdrop-blur-md" />
            </div>
            <Button onClick={() => date && setDate(date)} disabled={!date}
              className="bg-foreground text-background hover:bg-foreground/90 font-light">
              Reveal Archetypes
            </Button>
          </div>
        )}
        {hasChart && (
          <div className="mb-6 text-[10px] font-extralight tracking-[0.25em] uppercase text-muted-foreground/70">
            Derived from live placements · Lagna + 9 grahas across signs &amp; whole-sign houses
          </div>
        )}

        {top && powers && (
          <div className="mb-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Headline archetype */}
            <div className="rounded-2xl border border-foreground/30 bg-foreground/[0.04] backdrop-blur-md p-5 lg:col-span-1">
              <div className="text-[10px] font-extralight tracking-[0.3em] uppercase text-muted-foreground/80">Closest Archetype</div>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="text-3xl font-extralight tracking-wide text-foreground">{top.name}</span>
                <span className="font-mono text-lg text-foreground/80">{top.percent}%</span>
              </div>
              <div className="mt-1 text-[11px] font-extralight uppercase tracking-[0.2em] text-muted-foreground/70">{top.pantheon} · {top.domain}</div>
              <p className="mt-3 text-xs font-extralight leading-relaxed text-muted-foreground">
                You carry the chart of <span className="text-foreground">{top.name}</span> by <span className="text-foreground font-mono">{top.percent}%</span>. {top.blurb}
              </p>
            </div>

            {/* Material Power */}
            <div className="rounded-2xl border border-border/25 bg-card/30 backdrop-blur-md p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Coins className="h-3.5 w-3.5 text-amber-300/80" strokeWidth={1.5} />
                  <span className="text-[10px] font-extralight tracking-[0.3em] uppercase text-muted-foreground/80">Material Power</span>
                </div>
                <span className="font-mono text-2xl text-foreground">{powers.material}%</span>
              </div>
              <div className="mt-3 h-[4px] w-full overflow-hidden rounded-full bg-border/20">
                <div className="h-full bg-gradient-to-r from-amber-300/60 to-foreground/80 transition-all" style={{ width: `${powers.material}%` }} />
              </div>
              <p className="mt-3 text-xs font-extralight leading-relaxed text-muted-foreground">{powers.materialBlurb}</p>
            </div>

            {/* Spiritual Power */}
            <div className="rounded-2xl border border-border/25 bg-card/30 backdrop-blur-md p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <InfinityIcon className="h-3.5 w-3.5 text-foreground/70" strokeWidth={1.5} />
                  <span className="text-[10px] font-extralight tracking-[0.3em] uppercase text-muted-foreground/80">Spiritual Power</span>
                </div>
                <span className="font-mono text-2xl text-foreground">{powers.spiritual}%</span>
              </div>
              <div className="mt-3 h-[4px] w-full overflow-hidden rounded-full bg-border/20">
                <div className="h-full bg-gradient-to-r from-foreground/80 to-violet-300/60 transition-all" style={{ width: `${powers.spiritual}%` }} />
              </div>
              <p className="mt-3 text-xs font-extralight leading-relaxed text-muted-foreground">{powers.spiritualBlurb}</p>
            </div>
          </div>
        )}

        {matches.length > 0 && (
          <div className="space-y-4">
            <div className="text-[10px] font-extralight tracking-[0.3em] uppercase text-muted-foreground/70">Other Resonances</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {matches.slice(1, 10).map((m) => <Row key={m.name} m={m} />)}
            </div>
          </div>
        )}
        {!matches.length && (
          <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-10 text-center">
            <p className="text-xs font-extralight tracking-wide text-muted-foreground">
              Enter a birth date above to compute archetype resonance and material vs spiritual power across both pantheons.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

export default VedicGodsCompat;
