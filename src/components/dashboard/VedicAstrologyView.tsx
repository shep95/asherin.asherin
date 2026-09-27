import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Building2, Calendar, FolderOpen, Globe2, Heart, Loader2, MapPin, Megaphone, MessageSquare, Moon, Save, Sparkles, Trash2, TrendingUp, User2 } from "lucide-react";
const wallpaperAureon = "/wallpapers/wallpaper-aureon.webp";
import {
  getNakshatraFromDeg,
  getRashiFromDeg,
  rashis,
} from "@/data/nakshatraData";
import { supabase } from "@/integrations/supabase/client";
import { computeMahadasha, ensureChildren, findCurrentDasha, DASHA_LEVEL_LABEL, type DashaPeriod } from "@/lib/vedic/dasha";
import { buildDashaInsight } from "@/lib/vedic/dashaReading";
import { houseFromAsc } from "@/lib/vedic/dignities";
import { generateReading, type PlacementInput } from "@/lib/vedic/readingEngine";
import { calculateSweVedicChart, type SweVedicChart, type SweVedicPlanet } from "@/lib/vedic/sweChart";
import { resolveBirthTimezone } from "@/lib/vedic/timezoneLookup";
import { COUNTRY_CHARTS, type CountryFoundation } from "@/data/vedic/countryCharts";
import { COUNTRY_LEADERS, getLeaderForCountry, type LeaderRecord } from "@/data/vedic/countryLeaders";
import { COMPANY_CHARTS, COMPANY_FOUNDERS, getFounderForCompany, type CompanyFoundation, type FounderRecord } from "@/data/vedic/companyCharts";
import { toast } from "sonner";
import WealthHousesPanel from "./vedic/WealthHousesPanel";
import AsherChatPanel from "./vedic/AsherChatPanel";
import GlobalPredictionsTab from "./vedic/GlobalPredictionsTab";
import GlobalChartTab from "./vedic/GlobalChartTab";
import CompatibilityPanel from "./vedic/CompatibilityPanel";
import SwvPanel from "./vedic/SwvPanel";
import DashaNode from "./vedic/DashaNode";
import CustomChartBuilder from "./vedic/CustomChartBuilder";
import TransitsPanel from "./vedic/TransitsPanel";
import type { SignIngress } from "@/lib/vedic/transits";
import { classifyLagnaRelation, relationColorClass, relationLabel, signIndexFromName } from "@/lib/vedic/lagnaRelationship";
import VedicGodsCompat from "@/components/vedic/VedicGodsCompat";
import { Crown } from "lucide-react";

interface SavedChart {
  id: string;
  name: string;
  birth_date: string;
  birth_time: string;
  tz_offset: number;
  latitude: number;
  longitude: number;
  city_label: string | null;
  created_at: string;
}

function fmtDeg(deg: number): string {
  const d = Math.floor(deg);
  const mFloat = (deg - d) * 60;
  const m = Math.floor(mFloat);
  const s = Math.floor((mFloat - m) * 60);
  return `${d}° ${m.toString().padStart(2, "0")}' ${s.toString().padStart(2, "0")}"`;
}

function fmtDate(date: Date): string {
  // US format: MM/DD/YYYY
  return date.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function fmtDateTime(date: Date): string {
  // US format: MM/DD/YYYY, h:mm AM/PM
  return date.toLocaleString("en-US", { year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtDuration(years: number): string {
  if (years >= 1) return `${years.toFixed(2)} yrs`;
  const days = years * 365.2425;
  if (days >= 30) return `${(days / 30.4375).toFixed(1)} mo`;
  if (days >= 1) return `${days.toFixed(1)} d`;
  return `${(days * 24).toFixed(1)} h`;
}

function VedicWheel({
  ascendant,
  planets,
  size = 420,
}: {
  ascendant: number;
  planets: SweVedicPlanet[];
  size?: number;
}) {
  const houses = useMemo(() => {
    const ascSign = Math.floor(ascendant / 30);
    const list: { house: number; signIndex: number; planets: SweVedicPlanet[] }[] = [];
    for (let i = 0; i < 12; i++) {
      const signIndex = (ascSign + i) % 12;
      const housePlanets = planets.filter((p) => Math.floor(p.sid / 30) === signIndex);
      list.push({ house: i + 1, signIndex, planets: housePlanets });
    }
    return list;
  }, [ascendant, planets]);

  const c = size / 2;
  const SLOTS = [
    { x: 0.5, y: 0.25 },
    { x: 0.25, y: 0.12 },
    { x: 0.12, y: 0.25 },
    { x: 0.25, y: 0.5 },
    { x: 0.12, y: 0.75 },
    { x: 0.25, y: 0.88 },
    { x: 0.5, y: 0.75 },
    { x: 0.75, y: 0.88 },
    { x: 0.88, y: 0.75 },
    { x: 0.75, y: 0.5 },
    { x: 0.88, y: 0.25 },
    { x: 0.75, y: 0.12 },
  ];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="select-none max-w-full h-auto">
      <rect x={1} y={1} width={size - 2} height={size - 2} fill="none" stroke="hsl(var(--border) / 0.3)" strokeWidth={1} />
      <line x1={0} y1={0} x2={size} y2={size} stroke="hsl(var(--border) / 0.25)" />
      <line x1={size} y1={0} x2={0} y2={size} stroke="hsl(var(--border) / 0.25)" />
      <polygon points={`${c},0 ${size},${c} ${c},${size} 0,${c}`} fill="none" stroke="hsl(var(--border) / 0.3)" />
      {houses.map((h, i) => {
        const slot = SLOTS[i];
        const px = slot.x * size;
        const py = slot.y * size;
        return (
          <g key={h.house}>
            <text x={px} y={py - 32} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground) / 0.45)" fontWeight={300}>
              {rashis[h.signIndex].sanskrit} · H{h.house}
            </text>
            {h.planets.map((p, j) => (
              <text key={p.name} x={px} y={py - 14 + j * 12} textAnchor="middle" fontSize={11} fill="hsl(var(--foreground) / 0.85)" fontWeight={300}>
                {p.symbol} {p.name.slice(0, 2)}{p.retrograde ? "ʀ" : ""}
              </text>
            ))}
          </g>
        );
      })}
      <text x={c} y={size - 6} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground) / 0.5)" letterSpacing="0.15em">
        ASC {fmtDeg(ascendant % 30)} {rashis[Math.floor(ascendant / 30)].name.toUpperCase()}
      </text>
    </svg>
  );
}

function PlacementsStrip({ items }: { items: { name: string; symbol: string; sign: string; house: number; retro: boolean }[] | undefined }) {
  if (!items) {
    return <div className="mt-1.5 text-[9px] text-muted-foreground/40 italic">computing planets…</div>;
  }
  if (items.length === 0) return null;
  return (
    <div className="mt-1.5 pt-1.5 border-t border-border/15 grid grid-cols-3 gap-x-1.5 gap-y-0.5 text-[9px] font-light text-muted-foreground/80 leading-tight">
      {items.map((p) => (
        <div key={p.name} className="flex items-baseline gap-1 truncate" title={`${p.name} in ${p.sign} · House ${p.house}${p.retro ? " (R)" : ""}`}>
          <span className="text-foreground/70 w-3">{p.symbol}</span>
          <span className="truncate">{p.sign.slice(0, 3)} <span className="text-muted-foreground/50">H{p.house}</span>{p.retro && <span className="text-muted-foreground/60">ʀ</span>}</span>
        </div>
      ))}
    </div>
  );
}

const VedicAstrologyView = () => {
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("12:00");
  const [tzOffset, setTzOffset] = useState("0");
  const [tzZoneName, setTzZoneName] = useState<string | null>(null);
  const [tzAuto, setTzAuto] = useState(true);
  const [tzResolving, setTzResolving] = useState(false);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<{ label: string; lat: number; lon: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const [chart, setChart] = useState<SweVedicChart | null>(null);
  const [expandedDasha, setExpandedDasha] = useState<Record<string, boolean>>({});
  const [loadingChart, setLoadingChart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCharts, setSavedCharts] = useState<SavedChart[]>([]);
  const [chartName, setChartName] = useState("");
  const [showSaved, setShowSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"mine" | "country" | "companies" | "predictions" | "global" | "custom" | "mythology">("mine");
  const [showCompat, setShowCompat] = useState(false);
  const [activeCountry, setActiveCountry] = useState<CountryFoundation | null>(null);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string>("");
  const [chatOpen, setChatOpen] = useState(false);
  const [asherDates, setAsherDates] = useState<string[]>([]);
  const [countryLagnas, setCountryLagnas] = useState<Record<string, { sign: string; sanskrit: string; deg: number } | null>>({});
  const [computingLagnas, setComputingLagnas] = useState(false);
  const [leaderLagnas, setLeaderLagnas] = useState<Record<string, { sign: string; sanskrit: string; deg: number } | null>>({});
  const [companyLagnas, setCompanyLagnas] = useState<Record<string, { sign: string; sanskrit: string; deg: number } | null>>({});
  const [founderLagnas, setFounderLagnas] = useState<Record<string, { sign: string; sanskrit: string; deg: number } | null>>({});
  const [transitIngresses, setTransitIngresses] = useState<SignIngress[] | null>(null);

  // Compact planet placements per chart (for inline display in cards)
  type Placement = { name: string; symbol: string; sign: string; house: number; retro: boolean };
  const [countryPlacements, setCountryPlacements] = useState<Record<string, Placement[]>>({});
  const [leaderPlacements, setLeaderPlacements] = useState<Record<string, Placement[]>>({});
  const [companyPlacements, setCompanyPlacements] = useState<Record<string, Placement[]>>({});
  const [founderPlacements, setFounderPlacements] = useState<Record<string, Placement[]>>({});
  const [savedPlacements, setSavedPlacements] = useState<Record<string, Placement[]>>({});

  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const tzDebounceRef = useRef<number | null>(null);

  const loadSavedCharts = async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setSavedCharts([]);
      return;
    }
    const { data, error: loadError } = await supabase
      .from("vedic_charts")
      .select("id,name,birth_date,birth_time,tz_offset,latitude,longitude,city_label,created_at")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false });
    if (loadError) return;
    setSavedCharts((data ?? []) as SavedChart[]);
  };

  useEffect(() => {
    void loadSavedCharts();
  }, []);

  // Lazy-compute placements for saved user charts
  useEffect(() => {
    const missing = savedCharts.filter((s) => !(s.id in savedPlacements));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, Placement[]> = {};
      for (const s of missing) {
        try {
          const r = await calculateSweVedicChart({
            birthDate: s.birth_date, birthTime: s.birth_time,
            tzOffset: s.tz_offset, lat: s.latitude, lon: s.longitude,
          });
          updates[s.id] = r.planets.map((p) => ({
            name: p.name, symbol: p.symbol,
            sign: rashis[Math.floor(p.sid / 30)].name,
            house: houseFromAsc(p.sid, r.ascendant),
            retro: p.retrograde,
          }));
        } catch {
          updates[s.id] = [];
        }
        if (cancelled) return;
      }
      if (!cancelled) setSavedPlacements((prev) => ({ ...prev, ...updates }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedCharts]);

  const searchCity = async (q?: string) => {
    const query = (q ?? cityQuery).trim();
    if (query.length < 2) {
      setCityResults([]);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=0&q=${encodeURIComponent(query)}`,
        { headers: { "Accept-Language": "en" }, signal: ctrl.signal },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCityResults(
        (data as { display_name: string; lat: string; lon: string }[]).map((d) => ({
          label: d.display_name,
          lat: parseFloat(d.lat),
          lon: parseFloat(d.lon),
        })),
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("City lookup failed");
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (cityQuery.trim().length < 2) {
      setCityResults([]);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      void searchCity(cityQuery);
    }, 350);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityQuery]);

  // Auto-resolve birth-location timezone whenever lat/lon/date/time change.
  useEffect(() => {
    if (!tzAuto) return;
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if (!birthDate || Number.isNaN(latNum) || Number.isNaN(lonNum)) return;
    if (tzDebounceRef.current) window.clearTimeout(tzDebounceRef.current);
    tzDebounceRef.current = window.setTimeout(async () => {
      setTzResolving(true);
      try {
        const r = await resolveBirthTimezone(latNum, lonNum, birthDate, birthTime || "12:00");
        setTzOffset(String(r.offsetHours));
        setTzZoneName(r.ianaName);
      } finally {
        setTzResolving(false);
      }
    }, 300);
    return () => {
      if (tzDebounceRef.current) window.clearTimeout(tzDebounceRef.current);
    };
  }, [lat, lon, birthDate, birthTime, tzAuto]);

  const computeAndSetChart = async (input?: Partial<{ birthDate: string; birthTime: string; tzOffset: string; lat: string; lon: string }>) => {
    const bd = input?.birthDate ?? birthDate;
    const bt = input?.birthTime ?? birthTime;
    const tzText = input?.tzOffset ?? tzOffset;
    const latText = input?.lat ?? lat;
    const lonText = input?.lon ?? lon;
    if (!bd) throw new Error("Birth date required");
    const latNum = parseFloat(latText);
    const lonNum = parseFloat(lonText);
    const tz = parseFloat(tzText);
    if (Number.isNaN(latNum) || Number.isNaN(lonNum)) throw new Error("Latitude / longitude required");
    if (Number.isNaN(tz)) throw new Error("UTC offset required");
    const result = await calculateSweVedicChart({ birthDate: bd, birthTime: bt, tzOffset: tz, lat: latNum, lon: lonNum });
    setChart(result);
    return result;
  };

  const generateChart = async () => {
    setError(null);
    setLoadingChart(true);
    try {
      await computeAndSetChart();
    } catch (e) {
      setError((e as Error).message);
      setChart(null);
    } finally {
      setLoadingChart(false);
    }
  };

  const saveChart = async () => {
    setError(null);
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in to save named charts");
      if (!chartName.trim()) throw new Error("Chart name required");
      if (!birthDate) throw new Error("Generate a chart first");
      const latNum = parseFloat(lat);
      const lonNum = parseFloat(lon);
      const tz = parseFloat(tzOffset);
      if (Number.isNaN(latNum) || Number.isNaN(lonNum) || Number.isNaN(tz)) throw new Error("Birth location required");
      const { error: insertError } = await supabase.from("vedic_charts").insert({
        user_id: auth.user.id,
        name: chartName.trim(),
        birth_date: birthDate,
        birth_time: birthTime,
        tz_offset: tz,
        latitude: latNum,
        longitude: lonNum,
        city_label: cityQuery.trim() || null,
      });
      if (insertError) throw insertError;
      toast.success(`Saved ${chartName.trim()}`);
      setChartName("");
      await loadSavedCharts();
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const loadChart = async (saved: SavedChart) => {
    setTzAuto(false); // honor the saved offset exactly
    setBirthDate(saved.birth_date);
    setBirthTime(saved.birth_time);
    setTzOffset(String(saved.tz_offset));
    setTzZoneName(null);
    setLat(String(saved.latitude));
    setLon(String(saved.longitude));
    setCityQuery(saved.city_label ?? "");
    setShowSaved(false);
    setError(null);
    setLoadingChart(true);
    setActiveCountry(null);
    setActiveSavedId(saved.id);
    setActiveName(saved.name);
    try {
      await computeAndSetChart({
        birthDate: saved.birth_date,
        birthTime: saved.birth_time,
        tzOffset: String(saved.tz_offset),
        lat: String(saved.latitude),
        lon: String(saved.longitude),
      });
      toast.success(`Loaded ${saved.name}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingChart(false);
    }
  };

  const loadCountryChart = async (c: CountryFoundation) => {
    setTzAuto(false);
    setBirthDate(c.birthDate);
    setBirthTime(c.birthTime);
    setTzOffset(String(c.tzOffset));
    setTzZoneName(null);
    setLat(String(c.lat));
    setLon(String(c.lon));
    setCityQuery(`${c.city}, ${c.name}`);
    setError(null);
    setLoadingChart(true);
    setActiveCountry(c);
    setActiveSavedId(null);
    setActiveName(`${c.flag} ${c.name}`);
    try {
      await computeAndSetChart({
        birthDate: c.birthDate, birthTime: c.birthTime,
        tzOffset: String(c.tzOffset), lat: String(c.lat), lon: String(c.lon),
      });
      toast.success(`Loaded ${c.name} foundation chart`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingChart(false);
    }
  };

  const deleteChart = async (id: string) => {
    const { error: deleteError } = await supabase.from("vedic_charts").delete().eq("id", id);
    if (deleteError) {
      toast.error("Delete failed");
      return;
    }
    await loadSavedCharts();
    toast.success("Chart deleted");
  };

  const ascRashi = chart ? rashis[Math.floor(chart.ascendant / 30)] : null;
  const moonPlanet = chart?.planets.find((p) => p.name === "Moon");
  const moonNak = moonPlanet ? getNakshatraFromDeg(moonPlanet.sid) : null;

  const dashaTimeline = useMemo(() => {
    if (!chart || !moonPlanet) return [];
    return computeMahadasha(chart.dashaBirthUtc, chart.dashaMoonSid, 14); // Bishop-compatible 14 mahadashas from birth-lord forward
  }, [chart, moonPlanet]);

  const currentDasha = useMemo(() => findCurrentDasha(dashaTimeline), [dashaTimeline]);

  const reading = useMemo(() => {
    if (!chart) return null;
    const placements: PlacementInput[] = chart.planets.map((planet) => ({
      name: planet.name,
      house: houseFromAsc(planet.sid, chart.ascendant),
      signIndex: Math.floor(planet.sid / 30),
      nakIndex: Math.floor(planet.sid / (360 / 27)),
      retrograde: planet.retrograde,
    }));
    return generateReading(placements);
  }, [chart]);

  // ── Stable chart key + grounded context for ASHER AI side-chat ───────────
  const chartKey = useMemo(() => {
    if (activeCountry) return `country:${activeCountry.code}`;
    if (activeSavedId) return `user:${activeSavedId}`;
    if (chart) return `adhoc:${birthDate}_${birthTime}_${lat}_${lon}`;
    return null;
  }, [activeCountry, activeSavedId, chart, birthDate, birthTime, lat, lon]);

  const chartLabel = useMemo(() => {
    if (activeName) return activeName;
    if (chart) return `Unsaved · ${birthDate} ${birthTime}`;
    return "";
  }, [activeName, chart, birthDate, birthTime]);

  const chartContext = useMemo(() => {
    if (!chart || !ascRashi) return "";
    const lines: string[] = [];
    lines.push(`Birth: ${birthDate} ${birthTime} (UTC${parseFloat(tzOffset) >= 0 ? "+" : ""}${tzOffset}) at ${cityQuery || `${lat}, ${lon}`}`);
    lines.push(`Ascendant: ${ascRashi.name} ${fmtDeg(chart.ascendant % 30)} (ruler ${ascRashi.ruler})`);
    if (moonPlanet && moonNak) {
      lines.push(`Moon Nakshatra: ${moonNak.nakshatra.name} pada ${moonNak.pada} (lord ${moonNak.nakshatra.ruler})`);
    }
    lines.push("Planetary placements (whole-sign houses from Lagna):");
    for (const p of chart.planets) {
      const r = getRashiFromDeg(p.sid);
      const n = getNakshatraFromDeg(p.sid);
      lines.push(`  ${p.name}${p.retrograde ? "(R)" : ""}: H${houseFromAsc(p.sid, chart.ascendant)} ${r.name} ${fmtDeg(p.sid % 30)} · ${n.nakshatra.name} pada ${n.pada}`);
    }
    if (currentDasha.maha) {
      const cd = [currentDasha.maha, currentDasha.antar, currentDasha.pratyantar, currentDasha.sookshma, currentDasha.prana]
        .filter(Boolean)
        .map((p) => `${p!.lord} (${DASHA_LEVEL_LABEL[p!.level]} ends ${fmtDate(p!.end)})`)
        .join(" / ");
      lines.push(`Active Vimshottari path: ${cd}`);
    }
    if (dashaTimeline.length > 0) {
      lines.push("Upcoming Mahadashas:");
      for (const m of dashaTimeline.slice(0, 6)) {
        lines.push(`  ${m.lord}: ${fmtDate(m.start)} → ${fmtDate(m.end)}`);
      }
    }
    return lines.join("\n");
  }, [chart, ascRashi, moonPlanet, moonNak, currentDasha, dashaTimeline, birthDate, birthTime, tzOffset, cityQuery, lat, lon]);

  // Reset Asher-extracted timeline markers when active chart changes
  useEffect(() => { setAsherDates([]); }, [chartKey]);

  // Compute marker positions across the full Vimshottari span (for the timeline strip)
  const timelineSpan = useMemo(() => {
    if (dashaTimeline.length === 0) return null;
    const start = dashaTimeline[0].start.getTime();
    const end = dashaTimeline[dashaTimeline.length - 1].end.getTime();
    return { start, end, span: end - start };
  }, [dashaTimeline]);

  const asherMarkers = useMemo(() => {
    if (!timelineSpan) return [];
    return asherDates
      .map((d) => {
        const t = new Date(`${d}T12:00:00Z`).getTime();
        if (Number.isNaN(t)) return null;
        const pct = ((t - timelineSpan.start) / timelineSpan.span) * 100;
        return { date: d, pct: Math.max(0, Math.min(100, pct)), inRange: pct >= 0 && pct <= 100 };
      })
      .filter((m): m is { date: string; pct: number; inRange: boolean } => m !== null);
  }, [asherDates, timelineSpan]);

  const asherDateSet = useMemo(() => new Set(asherDates), [asherDates]);

  // ── Viral-influence markers across the entire Vimshottari span ──────────
  // Computes influence-flagged windows at maha AND antardasha resolution so
  // sudden viral/public-attention spikes (Rahu / Moon+fame-lord activations)
  // show up as Megaphone icons on the timeline strip.
  const influenceMarkers = useMemo(() => {
    if (!chart || !timelineSpan || dashaTimeline.length === 0) return [];
    const out: { pct: number; label: string; start: Date; end: Date; level: "maha" | "antar" }[] = [];
    for (const maha of dashaTimeline) {
      const mahaInsight = buildDashaInsight(maha, [], chart);
      if (mahaInsight.flags.includes("viral_influence")) {
        const mid = (maha.start.getTime() + maha.end.getTime()) / 2;
        out.push({
          pct: ((mid - timelineSpan.start) / timelineSpan.span) * 100,
          label: `${maha.lord} Mahadasha · viral influence`,
          start: maha.start, end: maha.end, level: "maha",
        });
      }
      // Drill into antardashas for finer-grained viral pulses
      ensureChildren(maha);
      for (const antar of (maha.children ?? [])) {
        const ai = buildDashaInsight(antar, [maha], chart);
        if (ai.flags.includes("viral_influence")) {
          const mid = (antar.start.getTime() + antar.end.getTime()) / 2;
          out.push({
            pct: ((mid - timelineSpan.start) / timelineSpan.span) * 100,
            label: `${maha.lord}/${antar.lord} · viral influence`,
            start: antar.start, end: antar.end, level: "antar",
          });
        }
      }
    }
    return out.filter((m) => m.pct >= 0 && m.pct <= 100);
  }, [chart, dashaTimeline, timelineSpan]);

  // Lazy-compute Lagna (Rising Sign) for every country chart when the Country tab is opened.
  useEffect(() => {
    if (tab !== "country") return;
    if (computingLagnas) return;
    const missing = COUNTRY_CHARTS.filter((c) => !(c.code in countryLagnas));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      setComputingLagnas(true);
      const updates: Record<string, { sign: string; sanskrit: string; deg: number } | null> = {};
      const placeUpdates: Record<string, Placement[]> = {};
      for (const c of missing) {
        try {
          const r = await calculateSweVedicChart({
            birthDate: c.birthDate, birthTime: c.birthTime,
            tzOffset: c.tzOffset, lat: c.lat, lon: c.lon,
          });
          const sign = rashis[Math.floor(r.ascendant / 30)];
          updates[c.code] = { sign: sign.name, sanskrit: sign.sanskrit, deg: r.ascendant % 30 };
          placeUpdates[c.code] = r.planets.map((p) => ({
            name: p.name, symbol: p.symbol,
            sign: rashis[Math.floor(p.sid / 30)].name,
            house: houseFromAsc(p.sid, r.ascendant),
            retro: p.retrograde,
          }));
        } catch {
          updates[c.code] = null;
        }
        if (cancelled) return;
      }
      if (!cancelled) {
        setCountryLagnas((prev) => ({ ...prev, ...updates }));
        setCountryPlacements((prev) => ({ ...prev, ...placeUpdates }));
      }
      setComputingLagnas(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Lazy-compute Lagna for current leaders alongside country charts.
  useEffect(() => {
    if (tab !== "country") return;
    const missing = COUNTRY_LEADERS.filter((l) => !(l.countryCode in leaderLagnas));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, { sign: string; sanskrit: string; deg: number } | null> = {};
      const placeUpdates: Record<string, Placement[]> = {};
      for (const l of missing) {
        try {
          const r = await calculateSweVedicChart({
            birthDate: l.birthDate, birthTime: l.birthTime,
            tzOffset: l.tzOffset, lat: l.lat, lon: l.lon,
          });
          const sign = rashis[Math.floor(r.ascendant / 30)];
          updates[l.countryCode] = { sign: sign.name, sanskrit: sign.sanskrit, deg: r.ascendant % 30 };
          placeUpdates[l.countryCode] = r.planets.map((p) => ({
            name: p.name, symbol: p.symbol,
            sign: rashis[Math.floor(p.sid / 30)].name,
            house: houseFromAsc(p.sid, r.ascendant),
            retro: p.retrograde,
          }));
        } catch {
          updates[l.countryCode] = null;
        }
        if (cancelled) return;
      }
      if (!cancelled) {
        setLeaderLagnas((prev) => ({ ...prev, ...updates }));
        setLeaderPlacements((prev) => ({ ...prev, ...placeUpdates }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const loadLeaderChart = async (l: LeaderRecord) => {
    setTzAuto(false);
    setBirthDate(l.birthDate);
    setBirthTime(l.birthTime);
    setTzOffset(String(l.tzOffset));
    setTzZoneName(null);
    setLat(String(l.lat));
    setLon(String(l.lon));
    setCityQuery(`${l.city}`);
    setError(null);
    setLoadingChart(true);
    setActiveCountry(null);
    setActiveSavedId(null);
    setActiveName(`${l.name} · ${l.role}`);
    try {
      await computeAndSetChart({
        birthDate: l.birthDate, birthTime: l.birthTime,
        tzOffset: String(l.tzOffset), lat: String(l.lat), lon: String(l.lon),
      });
      setTab("mine");
      toast.success(`Loaded ${l.name}'s chart${l.timeKnown ? "" : " (noon-chart)"}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingChart(false);
    }
  };

  // ── COMPANY CHARTS — lazy lagna compute + loaders (mirrors country logic) ──
  useEffect(() => {
    if (tab !== "companies") return;
    const missing = COMPANY_CHARTS.filter((c) => !(c.symbol in companyLagnas));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, { sign: string; sanskrit: string; deg: number } | null> = {};
      const placeUpdates: Record<string, Placement[]> = {};
      for (const c of missing) {
        try {
          const r = await calculateSweVedicChart({
            birthDate: c.birthDate, birthTime: c.birthTime,
            tzOffset: c.tzOffset, lat: c.lat, lon: c.lon,
          });
          const sign = rashis[Math.floor(r.ascendant / 30)];
          updates[c.symbol] = { sign: sign.name, sanskrit: sign.sanskrit, deg: r.ascendant % 30 };
          placeUpdates[c.symbol] = r.planets.map((p) => ({
            name: p.name, symbol: p.symbol,
            sign: rashis[Math.floor(p.sid / 30)].name,
            house: houseFromAsc(p.sid, r.ascendant),
            retro: p.retrograde,
          }));
        } catch {
          updates[c.symbol] = null;
        }
        if (cancelled) return;
      }
      if (!cancelled) {
        setCompanyLagnas((prev) => ({ ...prev, ...updates }));
        setCompanyPlacements((prev) => ({ ...prev, ...placeUpdates }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab !== "companies") return;
    const missing = COMPANY_FOUNDERS.filter((f) => !(f.companySymbol in founderLagnas));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, { sign: string; sanskrit: string; deg: number } | null> = {};
      const placeUpdates: Record<string, Placement[]> = {};
      for (const f of missing) {
        try {
          const r = await calculateSweVedicChart({
            birthDate: f.birthDate, birthTime: f.birthTime,
            tzOffset: f.tzOffset, lat: f.lat, lon: f.lon,
          });
          const sign = rashis[Math.floor(r.ascendant / 30)];
          updates[f.companySymbol] = { sign: sign.name, sanskrit: sign.sanskrit, deg: r.ascendant % 30 };
          placeUpdates[f.companySymbol] = r.planets.map((p) => ({
            name: p.name, symbol: p.symbol,
            sign: rashis[Math.floor(p.sid / 30)].name,
            house: houseFromAsc(p.sid, r.ascendant),
            retro: p.retrograde,
          }));
        } catch {
          updates[f.companySymbol] = null;
        }
        if (cancelled) return;
      }
      if (!cancelled) {
        setFounderLagnas((prev) => ({ ...prev, ...updates }));
        setFounderPlacements((prev) => ({ ...prev, ...placeUpdates }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const loadCompanyChart = async (c: CompanyFoundation) => {
    setTzAuto(false);
    setBirthDate(c.birthDate);
    setBirthTime(c.birthTime);
    setTzOffset(String(c.tzOffset));
    setTzZoneName(null);
    setLat(String(c.lat));
    setLon(String(c.lon));
    setCityQuery(c.city);
    setError(null);
    setLoadingChart(true);
    setActiveCountry(null);
    setActiveSavedId(null);
    setActiveName(`${c.glyph} ${c.name}`);
    try {
      await computeAndSetChart({
        birthDate: c.birthDate, birthTime: c.birthTime,
        tzOffset: String(c.tzOffset), lat: String(c.lat), lon: String(c.lon),
      });
      setTab("mine");
      toast.success(`Loaded ${c.name} ${c.event.toLowerCase()} chart${c.timeKnown ? "" : " (noon-chart)"}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingChart(false);
    }
  };

  const loadFounderChart = async (f: FounderRecord) => {
    setTzAuto(false);
    setBirthDate(f.birthDate);
    setBirthTime(f.birthTime);
    setTzOffset(String(f.tzOffset));
    setTzZoneName(null);
    setLat(String(f.lat));
    setLon(String(f.lon));
    setCityQuery(f.city);
    setError(null);
    setLoadingChart(true);
    setActiveCountry(null);
    setActiveSavedId(null);
    setActiveName(`${f.name} · ${f.role}`);
    try {
      await computeAndSetChart({
        birthDate: f.birthDate, birthTime: f.birthTime,
        tzOffset: String(f.tzOffset), lat: String(f.lat), lon: String(f.lon),
      });
      setTab("mine");
      toast.success(`Loaded ${f.name}'s chart${f.timeKnown ? "" : " (noon-chart)"}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingChart(false);
    }
  };

  return (
    <div
      className="h-full overflow-y-auto relative"
      style={{
        backgroundImage: `linear-gradient(rgba(0,0,0,0.72), rgba(0,0,0,0.78)), url(${wallpaperAureon})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="max-w-6xl mx-auto p-6 space-y-6 relative z-10">
        <div className="flex items-center gap-3 border-b border-border/15 pb-4">
          <div className="h-10 w-10 rounded-full border border-border/30 bg-background/40 backdrop-blur-md flex items-center justify-center">
            <Moon className="h-4 w-4 text-foreground/70" />
          </div>
          <div>
            <h2 className="text-xl font-extralight tracking-[0.15em] text-foreground uppercase">Vedic Strategy</h2>
            <p className="text-[11px] font-light tracking-[0.2em] text-muted-foreground/70 mt-1 uppercase">
              Swiss Ephemeris · Sidereal Lahiri · Custom Chart Engine
            </p>
          </div>
        </div>

        {/* TAB STRIP */}
        <div className="grid grid-cols-2 md:grid-cols-7 rounded-xl border border-border/30 bg-background/40 backdrop-blur-xl overflow-hidden">
          {([
            { key: "mine" as const, icon: User2, label: "My Charts" },
            { key: "country" as const, icon: Globe2, label: "Country Charts" },
            { key: "companies" as const, icon: Building2, label: "Company Charts" },
            { key: "predictions" as const, icon: TrendingUp, label: "Global Predictions" },
            { key: "global" as const, icon: Globe2, label: "Global Chart" },
            { key: "custom" as const, icon: Sparkles, label: "Custom Chart" },
            { key: "mythology" as const, icon: Crown, label: "Mythology Match" },
          ]).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-3 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.18em] transition border-r border-border/20 last:border-r-0 ${tab === key ? "text-foreground bg-foreground/[0.06]" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        {tab === "predictions" && <GlobalPredictionsTab />}
        {tab === "global" && <GlobalChartTab />}
        {tab === "custom" && <CustomChartBuilder />}
        {tab === "mythology" && (
          <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-2 sm:p-4">
            <VedicGodsCompat defaultDate={birthDate} hideHeader />
          </div>
        )}

        {tab === "companies" && (
          <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-border/15 pb-3">
              <Building2 className="h-4 w-4 text-foreground/70" />
              <h3 className="text-sm font-light tracking-[0.15em] text-foreground uppercase">Company Foundation Charts</h3>
              <span className="text-[10px] font-light text-muted-foreground/70 italic ml-auto">Incorporation moments + founder natal · sidereal Lahiri</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[10px] font-light text-muted-foreground/70 -mt-1">
              <span className="uppercase tracking-[0.15em] text-muted-foreground/50">Founder Lagna vs you:</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#ff4fd8] shadow-[0_0_6px_rgba(255,79,216,0.7)]" /> Soulmate</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Friend</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Enemy</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-foreground/80" /> Neutral</span>
              {!chart && <span className="italic text-muted-foreground/50">· generate your chart to activate</span>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {COMPANY_CHARTS.map((c) => {
                const lagna = companyLagnas[c.symbol];
                const founder = getFounderForCompany(c.symbol);
                const founderLagna = founder ? founderLagnas[c.symbol] : undefined;
                return (
                  <div
                    key={c.symbol}
                    className="rounded-lg border border-border/25 bg-background/30 hover:border-border/50 hover:bg-foreground/[0.025] transition"
                  >
                    <button
                      type="button"
                      onClick={() => void loadCompanyChart(c)}
                      className="w-full text-left px-3 pt-2.5 pb-2"
                    >
                      <div className="text-sm font-light text-foreground/90 flex items-center gap-1.5">
                        <span className="text-foreground/70 leading-none w-4 text-center">{c.glyph}</span>
                        <span className="truncate">{c.name}</span>
                        <span className="ml-auto text-[9px] tracking-[0.2em] text-muted-foreground/60 uppercase">{c.symbol}</span>
                      </div>
                      <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/70 mt-0.5">{c.event}</div>
                      <div className="text-[10px] text-muted-foreground/70 mt-0.5 tabular-nums">{c.birthDate} · {c.city}</div>
                      <div className="mt-1.5 pt-1.5 border-t border-border/20 text-[10px] flex items-center justify-between">
                        <span className="text-muted-foreground/60 uppercase tracking-wider text-[9px]">Lagna</span>
                        {lagna === undefined ? (
                          <span className="text-muted-foreground/40 italic">…</span>
                        ) : lagna === null ? (
                          <span className="text-muted-foreground/40">—</span>
                        ) : (
                          <span className="text-foreground/85 font-light">{lagna.sign} <span className="text-muted-foreground/60">· {fmtDeg(lagna.deg)}</span></span>
                        )}
                      </div>
                      <PlacementsStrip items={companyPlacements[c.symbol]} />
                    </button>

                    {founder && (() => {
                      const myAscIdx = chart ? Math.floor(chart.ascendant / 30) : -1;
                      const founderAscIdx = founderLagna ? signIndexFromName(founderLagna.sign) : -1;
                      const rel = (myAscIdx >= 0 && founderAscIdx >= 0)
                        ? classifyLagnaRelation(myAscIdx, founderAscIdx)
                        : "neutral";
                      const nameColor = relationColorClass(rel);
                      return (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); void loadFounderChart(founder); }}
                          className="w-full text-left px-3 pt-2 pb-2.5 border-t border-border/20 hover:bg-foreground/[0.04] transition"
                          title={chart
                            ? `${relationLabel(rel)} — relative to your active chart's Lagna`
                            : (founder.timeKnown ? "Open founder's chart" : "Open noon-chart approximation")}
                        >
                          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60">
                            <User2 className="h-2.5 w-2.5" /> {founder.role}
                          </div>
                          <div className={`text-[12px] font-light mt-0.5 truncate underline-offset-2 hover:underline ${nameColor}`}>
                            {founder.name}
                          </div>
                          <div className="mt-1 text-[10px] flex items-center justify-between">
                            <span className="text-muted-foreground/60 uppercase tracking-wider text-[9px]">Rising</span>
                            {founderLagna === undefined ? (
                              <span className="text-muted-foreground/40 italic">…</span>
                            ) : founderLagna === null ? (
                              <span className="text-muted-foreground/40">—</span>
                            ) : (
                              <span className="text-foreground/85 font-light">
                                {founderLagna.sign}
                                {!founder.timeKnown && <span className="text-muted-foreground/50 ml-1">· noon</span>}
                              </span>
                            )}
                          </div>
                          <PlacementsStrip items={founderPlacements[c.symbol]} />
                        </button>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "country" && (
          <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-border/15 pb-3">
              <Globe2 className="h-4 w-4 text-foreground/70" />
              <h3 className="text-sm font-light tracking-[0.15em] text-foreground uppercase">Global Foundation Charts</h3>
              <span className="text-[10px] font-light text-muted-foreground/70 italic ml-auto">Independence / Constitution moments · sidereal Lahiri</span>
            </div>
            <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2 text-[10px] font-light text-amber-200/80 leading-relaxed">
              <span className="uppercase tracking-[0.15em] text-amber-300/90 font-normal">Data Reliability</span> — Foundation charts use the official independence/constitution moment at the capital. Where the exact birth time of a leader is not on public record, we display a <em className="not-italic text-foreground/80">noon-chart approximation</em> (marked <span className="text-muted-foreground/70">· noon</span>): Sun &amp; Moon signs are reliable, but Lagna (Ascendant) and house cusps are best-estimate placeholders, not predictive.</div>
            <div className="flex flex-wrap items-center gap-3 text-[10px] font-light text-muted-foreground/70 -mt-1">
              <span className="uppercase tracking-[0.15em] text-muted-foreground/50">Leader Lagna vs you:</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#ff4fd8] shadow-[0_0_6px_rgba(255,79,216,0.7)]" /> Soulmate</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Friend</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Enemy</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-foreground/80" /> Neutral</span>
              {!chart && <span className="italic text-muted-foreground/50">· generate your chart to activate</span>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {COUNTRY_CHARTS.map((c) => {
                const lagna = countryLagnas[c.code];
                const leader = getLeaderForCountry(c.code);
                const leaderLagna = leader ? leaderLagnas[c.code] : undefined;
                return (
                  <div
                    key={c.code}
                    className={`rounded-lg border transition ${activeCountry?.code === c.code ? "border-foreground/40 bg-foreground/[0.05]" : "border-border/25 bg-background/30 hover:border-border/50 hover:bg-foreground/[0.025]"}`}
                  >
                    <button
                      type="button"
                      onClick={() => void loadCountryChart(c)}
                      className="w-full text-left px-3 pt-2.5 pb-2"
                    >
                      <div className="text-sm font-light text-foreground/90 flex items-center gap-1.5">
                        <span className="text-base leading-none">{c.flag}</span> {c.name}
                      </div>
                      <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/70 mt-0.5">{c.event}</div>
                      <div className="text-[10px] text-muted-foreground/70 mt-0.5 tabular-nums">{c.birthDate} · {c.birthTime} · {c.city}</div>
                      <div className="mt-1.5 pt-1.5 border-t border-border/20 text-[10px] flex items-center justify-between">
                        <span className="text-muted-foreground/60 uppercase tracking-wider text-[9px]">Lagna</span>
                        {lagna === undefined ? (
                          <span className="text-muted-foreground/40 italic">…</span>
                        ) : lagna === null ? (
                          <span className="text-muted-foreground/40">—</span>
                        ) : (
                          <span className="text-foreground/85 font-light">{lagna.sign} <span className="text-muted-foreground/60">· {fmtDeg(lagna.deg)}</span></span>
                        )}
                      </div>
                      <PlacementsStrip items={countryPlacements[c.code]} />
                    </button>

                    {leader && (() => {
                      const myAscIdx = chart ? Math.floor(chart.ascendant / 30) : -1;
                      const leaderAscIdx = leaderLagna ? signIndexFromName(leaderLagna.sign) : -1;
                      const rel = (myAscIdx >= 0 && leaderAscIdx >= 0)
                        ? classifyLagnaRelation(myAscIdx, leaderAscIdx)
                        : "neutral";
                      const nameColor = relationColorClass(rel);
                      return (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); void loadLeaderChart(leader); }}
                          className="w-full text-left px-3 pt-2 pb-2.5 border-t border-border/20 hover:bg-foreground/[0.04] transition"
                          title={chart
                            ? `${relationLabel(rel)} — relative to your active chart's Lagna`
                            : (leader.timeKnown ? "Open leader's chart" : "Open noon-chart approximation")}
                        >
                          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60">
                            <User2 className="h-2.5 w-2.5" /> {leader.role}
                          </div>
                          <div className={`text-[12px] font-light mt-0.5 truncate underline-offset-2 hover:underline ${nameColor}`}>
                            {leader.name}
                          </div>
                          <div className="mt-1 text-[10px] flex items-center justify-between">
                            <span className="text-muted-foreground/60 uppercase tracking-wider text-[9px]">Rising</span>
                            {leaderLagna === undefined ? (
                              <span className="text-muted-foreground/40 italic">…</span>
                            ) : leaderLagna === null ? (
                              <span className="text-muted-foreground/40">—</span>
                            ) : (
                              <span className="text-foreground/85 font-light">
                                {leaderLagna.sign}
                                {!leader.timeKnown && <span className="text-muted-foreground/50 ml-1">· noon</span>}
                              </span>
                            )}
                          </div>
                          <PlacementsStrip items={leaderPlacements[c.code]} />
                        </button>
                      );
                    })()}
                  </div>
                );
              })}

            </div>
          </div>
        )}

        {tab === "mine" && (
        <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1">
              <span className="text-[10px] font-light text-muted-foreground uppercase tracking-wider">Birth date</span>
              <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="w-full rounded-md border border-border/30 bg-background/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground/40" />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-light text-muted-foreground uppercase tracking-wider">Birth time (local)</span>
              <input type="time" value={birthTime} onChange={(e) => setBirthTime(e.target.value)} className="w-full rounded-md border border-border/30 bg-background/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground/40" />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-light text-muted-foreground uppercase tracking-wider flex items-center justify-between gap-2">
                <span>
                  UTC offset {tzAuto ? "(auto)" : "(manual)"}
                  {tzResolving && <Loader2 className="inline h-2.5 w-2.5 ml-1 animate-spin" />}
                </span>
                <button
                  type="button"
                  onClick={() => setTzAuto((v) => !v)}
                  className="text-[9px] text-muted-foreground/60 hover:text-foreground transition normal-case tracking-normal"
                >
                  {tzAuto ? "override" : "auto"}
                </button>
              </span>
              <input
                type="number"
                step="0.25"
                value={tzOffset}
                onChange={(e) => { setTzAuto(false); setTzOffset(e.target.value); }}
                placeholder="auto from city"
                className="w-full rounded-md border border-border/30 bg-background/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground/40"
              />
              {tzZoneName && tzAuto && (
                <span className="block text-[9px] text-muted-foreground/60 tracking-wider truncate">{tzZoneName}</span>
              )}
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
            <div className="flex gap-2">
              <input value={cityQuery} onChange={(e) => setCityQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void searchCity()} placeholder="Search birth city…" className="flex-1 rounded-md border border-border/30 bg-background/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground/40" />
              <button onClick={() => void searchCity()} disabled={searching} className="rounded-md border border-border/30 bg-background/40 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 transition disabled:opacity-50">
                {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Lat" className="rounded-md border border-border/30 bg-background/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground/40" />
              <input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="Lon" className="rounded-md border border-border/30 bg-background/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground/40" />
            </div>
          </div>

          {cityResults.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto rounded-md border border-border/20 bg-background/30 p-1">
              {cityResults.map((c, i) => (
                <button key={i} onClick={() => { setLat(c.lat.toFixed(4)); setLon(c.lon.toFixed(4)); setCityQuery(c.label); setCityResults([]); }} className="block w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded">
                  {c.label}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
            <input value={chartName} onChange={(e) => setChartName(e.target.value)} placeholder="Name this chart…" className="rounded-md border border-border/30 bg-background/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground/40" />
            <button onClick={() => void saveChart()} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-md border border-border/30 bg-background/40 px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-foreground/40 transition disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save Named Chart
            </button>
            <button onClick={() => setShowSaved((v) => !v)} className="inline-flex items-center justify-center gap-2 rounded-md border border-border/30 bg-background/40 px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-foreground/40 transition">
              <FolderOpen className="h-3.5 w-3.5" /> Saved ({savedCharts.length})
            </button>
            <button onClick={() => setShowCompat((v) => !v)} disabled={!chart} className="inline-flex items-center justify-center gap-2 rounded-md border border-border/30 bg-background/40 px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-foreground/40 transition disabled:opacity-40">
              <Heart className="h-3.5 w-3.5" /> Compatibility
            </button>
          </div>

          {showSaved && (
            <div className="rounded-lg border border-border/25 bg-background/30 divide-y divide-border/15">
              {savedCharts.length === 0 ? (
                <div className="px-3 py-3 text-xs text-muted-foreground">No saved charts yet.</div>
              ) : savedCharts.map((saved) => (
                <div key={saved.id} className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <button onClick={() => void loadChart(saved)} className="flex-1 text-left min-w-0">
                      <span className="block truncate text-sm text-foreground/85 font-light">{saved.name}</span>
                      <span className="block truncate text-[10px] uppercase tracking-wider text-muted-foreground/70">{saved.birth_date} · {saved.birth_time} · {saved.city_label || `${saved.latitude}, ${saved.longitude}`}</span>
                    </button>
                    <button onClick={() => void deleteChart(saved.id)} className="p-1 text-muted-foreground hover:text-destructive transition" aria-label="Delete saved Vedic chart">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <PlacementsStrip items={savedPlacements[saved.id]} />
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            {error && <span className="text-xs text-destructive font-light">{error}</span>}
            <button onClick={() => void generateChart()} disabled={loadingChart} className="ml-auto inline-flex items-center gap-2 rounded-md border border-foreground/20 bg-foreground/5 px-4 py-2 text-xs uppercase tracking-wider text-foreground hover:bg-foreground/10 transition disabled:opacity-50">
              {loadingChart ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Generate Chart
            </button>
          </div>
        </div>
        )}

        {tab === "mine" && showCompat && chart && (
          <CompatibilityPanel
            baseChart={chart}
            baseLabel={activeName || `Chart · ${birthDate} ${birthTime}`}
            savedCharts={savedCharts}
            onClose={() => setShowCompat(false)}
          />
        )}

        {chart && (
          <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
            <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-4 flex justify-center">
              <VedicWheel ascendant={chart.ascendant} planets={chart.planets} />
            </div>

            <div className="space-y-4">
              {ascRashi && (
                <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-4">
                  <div className="text-[10px] font-light text-muted-foreground uppercase tracking-wider mb-2">Ascendant (Lagna)</div>
                  <div className="text-lg font-extralight text-foreground">{ascRashi.name} <span className="text-muted-foreground">· {ascRashi.sanskrit}</span></div>
                  <div className="text-xs text-muted-foreground mt-1">{fmtDeg(chart.ascendant % 30)} · ruled by {ascRashi.ruler}</div>
                </div>
              )}

              {moonPlanet && moonNak && (
                <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-4">
                  <div className="text-[10px] font-light text-muted-foreground uppercase tracking-wider mb-2">Moon Nakshatra</div>
                  <div className="text-lg font-extralight text-foreground">{moonNak.nakshatra.name} <span className="text-muted-foreground">· Pada {moonNak.pada}</span></div>
                  <div className="text-xs text-muted-foreground mt-1">Ruled by {moonNak.nakshatra.ruler} · Deity {moonNak.nakshatra.deity}</div>
                  <div className="text-xs text-muted-foreground/80 mt-2 leading-relaxed font-light">{moonNak.nakshatra.description}</div>
                </div>
              )}

              <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-4">
                <div className="text-[10px] font-light text-muted-foreground uppercase tracking-wider mb-3">Planetary Positions (Swiss Ephemeris · Sidereal Lahiri)</div>
                <div className="space-y-1.5">
                  {chart.planets.map((p) => {
                    const r = getRashiFromDeg(p.sid);
                    const n = getNakshatraFromDeg(p.sid);
                    return (
                      <div key={p.name} className="grid grid-cols-[20px_70px_1fr_auto] items-center gap-3 text-xs font-light">
                        <span className="text-foreground/70">{p.symbol}</span>
                        <span className="text-foreground">{p.name}{p.retrograde && <span className="text-muted-foreground"> ʀ</span>}</span>
                        <span className="text-muted-foreground">House {houseFromAsc(p.sid, chart.ascendant)} · {r.name} · {n.nakshatra.name} (Pada {n.pada})</span>
                        <span className="text-muted-foreground/70 tabular-nums">{fmtDeg(p.sid % 30)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 pt-3 border-t border-border/20 text-[10px] text-muted-foreground/60">Ayanamsa: {chart.ayanamsa.toFixed(6)}° · JD {chart.jd.toFixed(5)}</div>
              </div>
            </div>
          </div>
        )}

        {chart && (
          <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-2 sm:p-4">
            <div className="flex items-center gap-2 border-b border-border/15 pb-3 px-3 pt-2">
              <Crown className="h-4 w-4 text-foreground/70" />
              <h3 className="text-sm font-light tracking-[0.15em] text-foreground uppercase">Mythological Archetype — Greek &amp; Roman Gods / Monsters</h3>
              <span className="text-[10px] font-light text-muted-foreground/70 italic ml-auto">Deterministic · derived from house, sign &amp; planet placements</span>
            </div>
            <VedicGodsCompat
              defaultDate={birthDate}
              hideHeader
              ascendantSidDeg={chart.ascendant}
              placements={chart.planets.map((p) => ({
                name: p.name,
                sid: p.sid,
                house: houseFromAsc(p.sid, chart.ascendant),
                retrograde: p.retrograde,
              }))}
            />
          </div>
        )}

        {chart && (
          <TransitsPanel
            natalAscendant={chart.ascendant}
            natalPlanets={chart.planets}
            lat={parseFloat(lat) || 0}
            lon={parseFloat(lon) || 0}
            chartKey={chartKey}
            userChartName={activeName || "Your Chart"}
            companyCharts={COMPANY_CHARTS}
            currentDasha={currentDasha}
            dashaTimeline={dashaTimeline}
            onIngresses={setTransitIngresses}
          />
        )}

        {chart && <WealthHousesPanel ascendant={chart.ascendant} planets={chart.planets.map((p) => ({ name: p.name, symbol: p.symbol, sid: p.sid, retrograde: p.retrograde }))} ingresses={transitIngresses} />}

        {chart && <SwvPanel ascendant={chart.ascendant} planets={chart.planets.map((p) => ({ name: p.name, symbol: p.symbol, sid: p.sid, retrograde: p.retrograde }))} label={activeName || undefined} />}


        {chart && reading && (
          <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-border/15 pb-3">
              <BookOpen className="h-4 w-4 text-foreground/70" />
              <h3 className="text-sm font-light tracking-[0.15em] text-foreground uppercase">Deterministic Personalized Reading</h3>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {reading.sections.map((section, index) => (
                <div key={`section-${index}-${section.headline}`} className="rounded-lg border border-border/25 bg-background/30 p-3">
                  <div className="text-xs text-foreground/85 font-light mb-2">{section.headline}</div>
                  <ul className="space-y-1.5 text-[11px] text-muted-foreground/85 font-light leading-relaxed">
                    {section.bullets.map((bullet) => <li key={bullet}>◈ {bullet}</li>)}
                  </ul>
                </div>
              ))}
              {reading.conjunctions.map((section, index) => (
                <div key={`conjunction-${index}-${section.planet}-${section.headline}`} className="rounded-lg border border-border/25 bg-foreground/[0.025] p-3">
                  <div className="text-xs text-foreground/85 font-light mb-2">{section.planet} · {section.headline}</div>
                  <ul className="space-y-1.5 text-[11px] text-muted-foreground/85 font-light leading-relaxed">
                    {section.bullets.map((bullet) => <li key={bullet}>◉ {bullet}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {chart && dashaTimeline.length > 0 && (
          <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 border-b border-border/15 pb-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-foreground/70" />
                <h3 className="text-sm font-light tracking-[0.15em] text-foreground uppercase">Vimshottari Timeline</h3>
              </div>
              {currentDasha.maha && (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {[currentDasha.maha?.lord, currentDasha.antar?.lord, currentDasha.pratyantar?.lord, currentDasha.sookshma?.lord, currentDasha.prana?.lord].filter(Boolean).join(" / ")}
                </span>
              )}
            </div>

            {/* ASHER-extracted date markers across the entire Vimshottari span */}
            {asherMarkers.length > 0 && timelineSpan && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">
                  <span>Asher Markers · {asherMarkers.length} date{asherMarkers.length > 1 ? "s" : ""}</span>
                  <button
                    onClick={() => setAsherDates([])}
                    className="normal-case tracking-normal text-[10px] text-muted-foreground/60 hover:text-foreground transition"
                  >
                    clear
                  </button>
                </div>
                <div className="relative h-8 rounded-md border border-border/25 bg-background/40 overflow-hidden">
                  {/* baseline gradient showing time axis */}
                  <div className="absolute inset-0 bg-gradient-to-r from-foreground/[0.03] to-foreground/[0.08]" />
                  {/* "now" indicator */}
                  {(() => {
                    const now = Date.now();
                    if (now < timelineSpan.start || now > timelineSpan.start + timelineSpan.span) return null;
                    const pct = ((now - timelineSpan.start) / timelineSpan.span) * 100;
                    return (
                      <div className="absolute top-0 bottom-0 w-px bg-foreground/40" style={{ left: `${pct}%` }} title="Now" />
                    );
                  })()}
                  {asherMarkers.map((m) => (
                    <div
                      key={m.date}
                      className="absolute top-0 bottom-0 w-0.5 bg-amber-400/80 hover:bg-amber-300 group cursor-help"
                      style={{ left: `${m.pct}%` }}
                      title={m.date}
                    >
                      <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]" />
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5 whitespace-nowrap text-[9px] text-amber-300/90 opacity-0 group-hover:opacity-100 transition pointer-events-none">
                        {m.date}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between text-[9px] tabular-nums text-muted-foreground/60">
                  <span>{new Date(timelineSpan.start).getUTCFullYear()}</span>
                  <span>{new Date(timelineSpan.start + timelineSpan.span).getUTCFullYear()}</span>
                </div>
              </div>
            )}

            {/* Viral-influence timeline strip — Megaphone markers where the chart
                indicates mass-public attention / going viral. */}
            {influenceMarkers.length > 0 && timelineSpan && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">
                  <span className="inline-flex items-center gap-1.5">
                    <Megaphone className="h-3 w-3 text-foreground/80" />
                    Influence Windows · {influenceMarkers.length} pulse{influenceMarkers.length > 1 ? "s" : ""}
                  </span>
                  <span className="normal-case tracking-normal text-[10px] text-muted-foreground/50">
                    viral / public reach
                  </span>
                </div>
                <div className="relative h-10 rounded-md border border-border/25 bg-background/40 overflow-visible">
                  <div className="absolute inset-0 bg-gradient-to-r from-foreground/[0.03] to-foreground/[0.08] rounded-md" />
                  {(() => {
                    const now = Date.now();
                    if (now < timelineSpan.start || now > timelineSpan.start + timelineSpan.span) return null;
                    const pct = ((now - timelineSpan.start) / timelineSpan.span) * 100;
                    return <div className="absolute top-0 bottom-0 w-px bg-foreground/40" style={{ left: `${pct}%` }} title="Now" />;
                  })()}
                  {/* Influence-window bands */}
                  {influenceMarkers.map((m, i) => {
                    const startPct = Math.max(0, ((m.start.getTime() - timelineSpan.start) / timelineSpan.span) * 100);
                    const endPct = Math.min(100, ((m.end.getTime() - timelineSpan.start) / timelineSpan.span) * 100);
                    const width = Math.max(0.4, endPct - startPct);
                    return (
                      <div
                        key={`band-${i}`}
                        className={`absolute top-0 bottom-0 ${m.level === "maha" ? "bg-foreground/[0.10]" : "bg-foreground/[0.06]"}`}
                        style={{ left: `${startPct}%`, width: `${width}%` }}
                        title={`${m.label} · ${m.start.toLocaleDateString("en-US")} → ${m.end.toLocaleDateString("en-US")}`}
                      />
                    );
                  })}
                  {/* Megaphone icons at window midpoints */}
                  {influenceMarkers.map((m, i) => (
                    <div
                      key={`ico-${i}`}
                      className="absolute -top-1 -translate-x-1/2 group cursor-help"
                      style={{ left: `${m.pct}%` }}
                    >
                      <div className={`flex items-center justify-center rounded-full border border-foreground/30 bg-background/90 ${m.level === "maha" ? "h-5 w-5" : "h-4 w-4"} shadow-[0_0_8px_rgba(255,255,255,0.15)]`}>
                        <Megaphone className={`text-foreground/90 ${m.level === "maha" ? "h-3 w-3" : "h-2.5 w-2.5"}`} strokeWidth={1.7} />
                      </div>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap rounded border border-border/30 bg-background/95 px-1.5 py-0.5 text-[9px] text-foreground/90 opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">
                        {m.label}
                        <div className="text-muted-foreground/70 tabular-nums">
                          {m.start.toLocaleDateString("en-US", { month: "short", year: "numeric" })} → {m.end.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between text-[9px] tabular-nums text-muted-foreground/60">
                  <span>{new Date(timelineSpan.start).getUTCFullYear()}</span>
                  <span>now</span>
                  <span>{new Date(timelineSpan.start + timelineSpan.span).getUTCFullYear()}</span>
                </div>
              </div>
            )}

            {currentDasha.maha && (
              <div className="rounded-lg border border-foreground/25 bg-foreground/[0.035] p-3 space-y-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80">Active Period</div>
                {([
                  ["maha", currentDasha.maha],
                  ["antar", currentDasha.antar],
                  ["pratyantar", currentDasha.pratyantar],
                  ["sookshma", currentDasha.sookshma],
                  ["prana", currentDasha.prana],
                ] as const).map(([lvl, p]) =>
                  p ? (
                    <div key={lvl} className="flex items-center justify-between gap-3 flex-wrap text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground/70 w-32 inline-block tracking-wider uppercase text-[9px]">{DASHA_LEVEL_LABEL[lvl]}</span>
                        <span className="text-foreground/90 font-light">{p.lord}</span>
                      </div>
                      <div className="text-muted-foreground tabular-nums">
                        {(lvl === "sookshma" || lvl === "prana") ? fmtDateTime(p.start) : fmtDate(p.start)} → {(lvl === "sookshma" || lvl === "prana") ? fmtDateTime(p.end) : fmtDate(p.end)} · {fmtDuration(p.years)}
                      </div>
                    </div>
                  ) : null
                )}
              </div>
            )}

            {/* 14 Mahadashas with on-demand drill-down */}
            <div className="space-y-2">
              {dashaTimeline.map((period) => {
                const key = `M:${period.lord}:${period.start.toISOString()}`;
                const isOpen = expandedDasha[key] ?? period.isCurrent;
                return (
                  <DashaNode
                    key={key}
                    period={period}
                    chart={chart}
                    expandedKey={key}
                    expandedMap={expandedDasha}
                    setExpandedMap={setExpandedDasha}
                    isOpen={isOpen}
                  />
                );
              })}
            </div>
          </div>
        )}

        {!chart && (
          <div className="rounded-xl border border-dashed border-border/30 bg-background/40 backdrop-blur-xl p-10 text-center">
            <Moon className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-light">Enter birth details and generate your sidereal Vedic chart.</p>
          </div>
        )}
      </div>

      {/* Floating ASHER chat trigger */}
      <button
        onClick={() => setChatOpen(true)}
        disabled={!chartKey}
        className="fixed bottom-6 right-6 z-30 inline-flex items-center gap-2 rounded-full border border-foreground/25 bg-background/80 backdrop-blur-md px-4 py-2.5 text-xs uppercase tracking-[0.18em] text-foreground hover:bg-foreground/10 shadow-[0_8px_28px_rgba(0,0,0,0.5)] disabled:opacity-40 transition"
        aria-label="Open ASHER AI chat"
      >
        <MessageSquare className="h-3.5 w-3.5" /> Ask Asher
      </button>

      <AsherChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        chartKey={chartKey}
        chartLabel={chartLabel}
        chartContext={chartContext}
        onDatesExtracted={(dates) => setAsherDates((prev) => Array.from(new Set([...prev, ...dates])).sort())}
      />
    </div>
  );
};

export default VedicAstrologyView;
