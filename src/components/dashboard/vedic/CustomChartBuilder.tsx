import { useEffect, useMemo, useState } from "react";
import { Save, Trash2, Sparkles, FolderOpen, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { generateReading, type PlacementInput } from "@/lib/vedic/readingEngine";
import { rashis } from "@/data/nakshatraData";

const SIGN_NAMES_LIST: string[] = rashis.map((r) => r.name);

/**
 * custom chart builder
 *
 * chart construction by hand: no time, no location, no ephemeris. the operator
 * places planets into houses 1-12 and picks the sign on house 1; the same
 * deterministic reading engine the ephemeris charts use then reads the board.
 * planets move by drag on a pointer device and by tap-to-select, tap-to-place
 * on a touch screen, where html drag-and-drop does not fire.
 *
 * persistence: localStorage on this device, under STORAGE_KEY.
 */

const PLANETS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"] as const;
type PlanetName = typeof PLANETS[number];

// SIGN_NAMES_LIST defined above from rashis

const NAK_NAMES = [
  "Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra",
  "Punarvasu","Pushya","Ashlesha","Magha","Purva Phalguni","Uttara Phalguni",
  "Hasta","Chitra","Swati","Vishakha","Anuradha","Jyeshtha",
  "Mula","Purva Ashadha","Uttara Ashadha","Shravana","Dhanishta",
  "Shatabhisha","Purva Bhadrapada","Uttara Bhadrapada","Revati",
];

interface ChartPlanet {
  name: PlanetName;
  retrograde: boolean;
  /** Optional nakshatra index 0..26. If absent, reading falls back to sign-only. */
  nakIndex?: number;
}

interface CustomChart {
  id: string;
  name: string;
  /** Sign occupying House 1 (lagna). All other houses follow whole-sign order. */
  ascendantSignIndex: number;
  /** house number 1..12 -> planets sitting in that house */
  houses: Record<number, ChartPlanet[]>;
  createdAt: string;
}

const STORAGE_KEY = "asher_vedic_custom_charts_v1";

const emptyHouses = (): Record<number, ChartPlanet[]> => {
  const o: Record<number, ChartPlanet[]> = {};
  for (let i = 1; i <= 12; i++) o[i] = [];
  return o;
};

const loadCharts = (): CustomChart[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // a hand-edited or truncated store must not take the room down
    return parsed.filter((c): c is CustomChart =>
      !!c && typeof c === "object" && typeof (c as CustomChart).id === "string" && typeof (c as CustomChart).name === "string"
      && typeof (c as CustomChart).ascendantSignIndex === "number" && !!(c as CustomChart).houses && typeof (c as CustomChart).houses === "object",
    ).map((c) => ({ ...c, houses: { ...emptyHouses(), ...c.houses } }));
  } catch { return []; }
};

const saveCharts = (charts: CustomChart[]) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(charts)); } catch { toast.error("the custom chart could not be stored on this device"); }
};

export default function CustomChartBuilder() {
  const [ascSign, setAscSign] = useState<number>(0);
  const [houses, setHouses] = useState<Record<number, ChartPlanet[]>>(emptyHouses());
  const [chartName, setChartName] = useState("");
  const [saved, setSaved] = useState<CustomChart[]>([]);
  const [reading, setReading] = useState<ReturnType<typeof generateReading> | null>(null);
  const [building, setBuilding] = useState(false);
  const [dragPlanet, setDragPlanet] = useState<PlanetName | null>(null);

  useEffect(() => { setSaved(loadCharts()); }, []);

  const placedPlanets = useMemo(() => {
    const set = new Set<string>();
    Object.values(houses).forEach((arr) => arr.forEach((p) => set.add(p.name)));
    return set;
  }, [houses]);

  const palettePlanets = PLANETS.filter((p) => !placedPlanets.has(p));

  const placePlanet = (house: number, name: PlanetName | "" | null) => {
    if (!name) return;
    if (placedPlanets.has(name)) return;
    setHouses((prev) => ({ ...prev, [house]: [...prev[house], { name, retrograde: false }] }));
    setDragPlanet(null);
  };

  const onDropToHouse = (house: number, e: React.DragEvent) => {
    e.preventDefault();
    placePlanet(house, (e.dataTransfer.getData("text/plain") || dragPlanet) as PlanetName | "");
  };

  const removePlanet = (house: number, name: PlanetName) => {
    setHouses((prev) => ({ ...prev, [house]: prev[house].filter((p) => p.name !== name) }));
  };

  const toggleRetro = (house: number, name: PlanetName) => {
    setHouses((prev) => ({
      ...prev,
      [house]: prev[house].map((p) => p.name === name ? { ...p, retrograde: !p.retrograde } : p),
    }));
  };

  const setNakshatra = (house: number, name: PlanetName, nakIndex: number) => {
    setHouses((prev) => ({
      ...prev,
      [house]: prev[house].map((p) => p.name === name ? { ...p, nakIndex } : p),
    }));
  };

  const resetBoard = () => {
    setHouses(emptyHouses());
    setAscSign(0);
    setReading(null);
    setChartName("");
  };

  const houseSignIndex = (house: number) => (ascSign + (house - 1)) % 12;

  const buildPlacements = (): PlacementInput[] => {
    const placements: PlacementInput[] = [];
    for (let h = 1; h <= 12; h++) {
      for (const p of houses[h]) {
        placements.push({
          name: p.name,
          house: h,
          signIndex: houseSignIndex(h),
          // If operator did not pick a nakshatra, default to nakshatra 0 of that sign.
          // This still produces a valid reading; sign + house dominate the corpus.
          nakIndex: p.nakIndex ?? (Math.floor(houseSignIndex(h) * 27 / 12)),
          retrograde: p.retrograde,
        });
      }
    }
    return placements;
  };

  const runReading = () => {
    const placements = buildPlacements();
    if (placements.length === 0) {
      toast.error("place at least one planet on the board first");
      return;
    }
    setBuilding(true);
    try {
      const r = generateReading(placements);
      setReading(r);
      toast.success(`read · ${r.sections.length} placements, ${r.conjunctions.length} conjunctions`);
    } catch (err) {
      console.warn("[vedic] custom reading failed", err);
      toast.error("the reading engine could not read this board");
    } finally {
      setBuilding(false);
    }
  };

  const handleSave = () => {
    if (!chartName.trim()) { toast.error("name the custom chart first"); return; }
    if (Object.values(houses).every((a) => a.length === 0)) { toast.error("the board is empty"); return; }
    const chart: CustomChart = {
      id: crypto.randomUUID(),
      name: chartName.trim(),
      ascendantSignIndex: ascSign,
      houses,
      createdAt: new Date().toISOString(),
    };
    const next = [chart, ...saved];
    setSaved(next);
    saveCharts(next);
    toast.success(`saved · ${chart.name}`);
  };

  const handleLoad = (chart: CustomChart) => {
    setAscSign(chart.ascendantSignIndex);
    setHouses(chart.houses);
    setChartName(chart.name);
    setReading(null);
    toast.success(`loaded · ${chart.name}`);
  };

  const handleDelete = (id: string) => {
    const next = saved.filter((c) => c.id !== id);
    setSaved(next);
    saveCharts(next);
  };

  return (
    <div className="space-y-5">
      {/* HEADER + ACTIONS */}
      <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl p-4 space-y-3">
        <div className="flex items-center gap-2 border-b border-border/15 pb-3">
          <Sparkles className="h-4 w-4 text-foreground/70" />
          <h3 className="text-sm font-light tracking-[0.15em] text-foreground">custom chart builder</h3>
          <span className="text-[10px] font-light text-muted-foreground/70 italic ml-auto">
            drag or tap planets into houses · no time or place needed
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-light tracking-[0.2em] text-muted-foreground/70">lagna (house 1) sign</label>
            <select
              value={ascSign}
              onChange={(e) => setAscSign(Number(e.target.value))}
              className="rounded-md border border-border/30 bg-background/40 px-3 py-2 text-xs font-light tracking-wide text-foreground focus:outline-none focus:border-foreground/40"
            >
              {SIGN_NAMES_LIST.map((s, i) => <option key={s} value={i}>{s}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-[9px] font-light tracking-[0.2em] text-muted-foreground/70">chart name</label>
            <input
              value={chartName}
              onChange={(e) => setChartName(e.target.value)}
              placeholder="e.g. a founder chart to test"
              className="rounded-md border border-border/30 bg-background/40 px-3 py-2 text-xs font-light tracking-wide text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/40"
            />
          </div>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 rounded-md border border-border/30 bg-foreground/10 hover:bg-foreground/20 px-3 py-2 text-[10px] font-light tracking-[0.15em] text-foreground transition"
          >
            <Save className="h-3 w-3" /> save
          </button>
          <button
            onClick={runReading}
            disabled={building}
            className="flex items-center gap-2 rounded-md border border-border/30 bg-foreground/90 hover:bg-foreground text-background px-3 py-2 text-[10px] font-light tracking-[0.15em] transition disabled:opacity-50"
          >
            {building ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            read chart
          </button>
          <button
            onClick={resetBoard}
            className="flex items-center gap-2 rounded-md border border-border/30 bg-background/40 hover:bg-foreground/5 px-3 py-2 text-[10px] font-light tracking-[0.15em] text-muted-foreground hover:text-foreground transition"
          >
            <RotateCcw className="h-3 w-3" /> reset
          </button>
        </div>
      </div>

      {/* PLANET PALETTE */}
      <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl p-4">
        <p className="text-[9px] font-light tracking-[0.2em] text-muted-foreground/70 mb-2">
          planet palette · drag onto a house, or tap a planet then tap a house
        </p>
        <div className="flex flex-wrap gap-2">
          {palettePlanets.length === 0 && (
            <span className="text-[11px] text-muted-foreground/50 italic">all 9 planets placed</span>
          )}
          {palettePlanets.map((p) => (
            <button
              key={p}
              type="button"
              draggable
              aria-pressed={dragPlanet === p}
              onClick={() => setDragPlanet((cur) => (cur === p ? null : p))}
              onDragStart={(e) => { e.dataTransfer.setData("text/plain", p); setDragPlanet(p); }}
              onDragEnd={() => setDragPlanet(null)}
              className={`cursor-grab active:cursor-grabbing select-none rounded-md border px-3 py-1.5 text-xs font-light tracking-wide text-foreground transition ${dragPlanet === p ? "border-foreground/70 bg-foreground/15" : "border-border/40 bg-background/60 hover:border-foreground/40 hover:bg-foreground/10"}`}
            >
              {p}
            </button>
          ))}
        </div>
        {dragPlanet && (
          <p className="mt-2 text-[10px] text-foreground/70">{dragPlanet} selected — tap a house to place it, or tap {dragPlanet} again to let go.</p>
        )}
      </div>

      {/* 12-HOUSE GRID */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => {
          const signIdx = houseSignIndex(h);
          const planets = houses[h];
          return (
            <div
              key={h}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDropToHouse(h, e)}
              onClick={() => { if (dragPlanet) placePlanet(h, dragPlanet); }}
              role={dragPlanet ? "button" : undefined}
              aria-label={dragPlanet ? `place ${dragPlanet} in house ${h}` : undefined}
              className={`rounded-xl border bg-background/40 backdrop-blur-xl p-3 min-h-[140px] transition ${dragPlanet ? "border-foreground/40 cursor-pointer" : "border-border/30 hover:border-foreground/40"}`}
            >
              <div className="flex items-center justify-between border-b border-border/15 pb-1.5 mb-2">
                <span className="text-[10px] font-light tracking-[0.2em] text-muted-foreground/70">house {h}</span>
                <span className="text-[10px] font-light text-foreground/80">{SIGN_NAMES_LIST[signIdx]}</span>
              </div>
              <div className="space-y-1.5">
                {planets.length === 0 && (
                  <p className="text-[10px] text-muted-foreground/40 italic">{dragPlanet ? `tap to place ${dragPlanet}` : "drop planets here"}</p>
                )}
                {planets.map((p) => (
                  <div key={p.name} className="rounded border border-border/30 bg-background/60 px-2 py-1.5 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-light text-foreground">
                        {p.name}{p.retrograde && <span className="text-amber-400 ml-1">(R)</span>}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleRetro(h, p.name); }}
                          title="toggle retrograde"
                          aria-label={`toggle retrograde for ${p.name}`}
                          className="text-[9px] tracking-wide text-muted-foreground hover:text-amber-400 px-1"
                        >R</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); removePlanet(h, p.name); }}
                          title="remove"
                          aria-label={`remove ${p.name}`}
                          className="text-muted-foreground hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <select
                      value={p.nakIndex ?? ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setNakshatra(h, p.name, Number(e.target.value))}
                      aria-label={`nakshatra for ${p.name}`}
                      className="w-full rounded border border-border/20 bg-background/40 px-1.5 py-0.5 text-[10px] font-light text-foreground/80 focus:outline-none"
                    >
                      <option value="">nakshatra (auto)</option>
                      {NAK_NAMES.map((n, idx) => <option key={n} value={idx}>{n}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* SAVED CHARTS */}
      {saved.length > 0 && (
        <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl p-4">
          <div className="flex items-center gap-2 border-b border-border/15 pb-2 mb-3">
            <FolderOpen className="h-4 w-4 text-foreground/70" />
            <h3 className="text-sm font-light tracking-[0.15em] text-foreground">saved custom charts</h3>
            <span className="text-[10px] text-muted-foreground/60 ml-auto">{saved.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {saved.map((c) => (
              <div key={c.id} className="rounded-md border border-border/30 bg-background/40 p-2.5 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleLoad(c)}
                  className="text-left flex-1 min-w-0"
                >
                  <p className="text-xs font-light text-foreground truncate">{c.name}</p>
                  <p className="text-[10px] text-muted-foreground/60">
                    lagna {SIGN_NAMES_LIST[c.ascendantSignIndex]} · {Object.values(c.houses).reduce((a, b) => a + b.length, 0)} planets
                  </p>
                </button>
                <button onClick={() => handleDelete(c.id)} aria-label={`remove ${c.name}`} className="text-muted-foreground hover:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI READING OUTPUT */}
      {reading && (
        <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-border/15 pb-3">
            <Sparkles className="h-4 w-4 text-foreground/70" />
            <h3 className="text-sm font-light tracking-[0.15em] text-foreground">deterministic reading</h3>
            <span className="text-[10px] text-muted-foreground/60 ml-auto">
              {reading.sections.length} placements · {reading.conjunctions.length} conjunctions
            </span>
          </div>
          <div className="space-y-4">
            {reading.sections.map((s, i) => (
              <div key={i} className="rounded-md border border-border/20 bg-background/40 p-3">
                <p className="text-xs font-light tracking-[0.1em] text-foreground mb-2">{s.headline}</p>
                <ul className="space-y-1.5">
                  {s.bullets.map((b, j) => (
                    <li key={j} className="text-[11px] font-light text-muted-foreground leading-relaxed pl-3 border-l border-border/20">{b}</li>
                  ))}
                </ul>
              </div>
            ))}
            {reading.conjunctions.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-light tracking-[0.2em] text-muted-foreground/70">conjunctions</p>
                {reading.conjunctions.map((s, i) => (
                  <div key={i} className="rounded-md border border-border/20 bg-background/40 p-3">
                    <p className="text-xs font-light tracking-[0.1em] text-foreground mb-2">{s.headline} · {s.planet}</p>
                    <ul className="space-y-1.5">
                      {s.bullets.map((b, j) => (
                        <li key={j} className="text-[11px] font-light text-muted-foreground leading-relaxed pl-3 border-l border-border/20">{b}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
