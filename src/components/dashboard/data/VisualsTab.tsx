// asherin.data — draw from the stored rows. the intent picks the chart
// family; a combination the data cannot support says so instead of drawing.

import { useEffect, useMemo, useState } from "react";
import { buildChart } from "@/lib/data/charts";
import { DATA_THEMES, getTheme, themeStyle } from "@/lib/data/theme";
import type { ChartSpec } from "@/lib/data/types";
import ChartRender from "./ChartRender";
import { latestOf, profileOf, qualityOf, type Room } from "./room";
import { useVersionRows } from "./useVersionRows";
import { card, select } from "./ui";

const INTENTS: ChartSpec["intent"][] = ["comparison", "trend", "distribution", "relationship", "part-to-whole", "anomaly", "summary"];

export default function VisualsTab({ room, themeId, onThemeChange }: { room: Room; themeId: string; onThemeChange: (id: string) => void }) {
  const tables = useMemo(() => room.sources.filter((s) => (latestOf(room, s.id)?.row_count ?? 0) > 0), [room]);
  const [sourceId, setSourceId] = useState(() => (tables.some((s) => s.id === room.selectedSource) ? room.selectedSource : tables[0]?.id ?? ""));
  useEffect(() => { if (!tables.some((s) => s.id === sourceId)) setSourceId(tables[0]?.id ?? ""); }, [tables, sourceId]);

  const version = latestOf(room, sourceId);
  const profile = profileOf(version);
  const { rows, loading, error } = useVersionRows(version?.id ?? null);

  const [intent, setIntent] = useState<ChartSpec["intent"]>("comparison");
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [y2, setY2] = useState("");

  // defaults follow the profile: first date (or dimension) across, first measure up
  useEffect(() => {
    if (!profile) return;
    const names = new Set(profile.columns.map((c) => c.name));
    if (!x || !names.has(x)) setX(profile.dateColumns[0] ?? profile.dimensions[0] ?? "");
    if (!y || !names.has(y)) setY(profile.measures[0] ?? "");
    if (y2 && !names.has(y2)) setY2("");
  }, [profile, x, y, y2]);

  const spec = useMemo(() => {
    if (!rows.length || !profile) return null;
    const ys = [y, intent === "relationship" ? y2 : ""].filter(Boolean);
    return buildChart(
      {
        intent,
        x: x || undefined,
        y: ys.length ? ys : undefined,
        title: intent === "relationship" && ys.length === 2 ? `${ys[1]} against ${ys[0]}` : `${y || "count"} by ${x || "row"}`,
        insight: `${intent} · drawn from ${rows.length.toLocaleString()} stored rows on this device`,
        sourceTag: `${room.sources.find((s) => s.id === sourceId)?.name ?? "source"} · v${version?.version ?? "?"}`,
      },
      rows,
      profile,
    );
  }, [rows, profile, intent, x, y, y2, room.sources, sourceId, version]);

  return (
    <div className="space-y-4" style={themeStyle(getTheme(themeId))}>
      <section className={`${card} flex flex-wrap items-center gap-2 p-4`}>
        <select className={select} value={sourceId} onChange={(e) => setSourceId(e.target.value)} aria-label="source" disabled={!tables.length}>
          {!tables.length && <option value="">no table yet</option>}
          {tables.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className={select} value={intent} onChange={(e) => setIntent(e.target.value as ChartSpec["intent"])} aria-label="what the chart should show">
          {INTENTS.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        {intent !== "relationship" && intent !== "distribution" && intent !== "summary" && (
          <select className={select} value={x} onChange={(e) => setX(e.target.value)} aria-label="group by">
            <option value="">group by…</option>
            {(profile?.columns ?? []).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        )}
        <select className={select} value={y} onChange={(e) => setY(e.target.value)} aria-label="measure">
          {intent !== "relationship" && intent !== "distribution" && intent !== "summary" && <option value="">count rows</option>}
          {(profile?.measures ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {intent === "relationship" && (
          <select className={select} value={y2} onChange={(e) => setY2(e.target.value)} aria-label="second measure">
            <option value="">against…</option>
            {(profile?.measures ?? []).filter((m) => m !== y).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        <select className={`${select} ml-auto`} value={themeId} onChange={(e) => onThemeChange(e.target.value)} aria-label="visual theme">
          {DATA_THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </section>

      {!tables.length && <div className={`${card} p-6 text-xs text-white/45`}>add a table first — a document has no rows to draw.</div>}
      {loading && <div className={`${card} p-6 text-xs text-white/45`}>reading the stored rows…</div>}
      {error && <div className={`${card} p-6 text-xs text-rose-200/70`}>{error}</div>}
      {!loading && !error && tables.length > 0 && rows.length > 0 && !spec && (
        <div className={`${card} p-6 text-xs text-white/45`}>
          this combination has nothing behind it — {intent === "relationship" ? "pick two numeric columns" : intent === "distribution" || intent === "summary" ? "pick a numeric column" : "pick a different grouping or measure"}.
        </div>
      )}
      {!loading && spec && <ChartRender spec={{ ...spec, quality: qualityOf(version)?.score }} />}
    </div>
  );
}
