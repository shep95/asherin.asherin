// Typed cell output rendering — table, chart, error, or legacy text.
//
// The runner returns an envelope; this component never re-parses prose and
// never renders anything the runner did not explicitly mark as data.

import { useMemo } from "react";
import {
  Bar, BarChart, Line, LineChart, Area, AreaChart, Pie, PieChart, Cell as PieCell,
  CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, Clock } from "lucide-react";

export type CellRow = Record<string, string | number | null>;

export interface CellEnvelope {
  kind: "table" | "text" | "error";
  text?: string;
  columns: string[];
  rows: CellRow[];
  rowCount: number;
  scanned: number;
  truncated: boolean;
  elapsedMs: number;
  source: string | null;
  chart?: { type: "bar" | "line" | "area" | "pie"; x: string; y: string[]; title?: string } | null;
}

/** Stored output may be a JSON envelope (new) or plain text (legacy runs). */
export function parseOutput(raw: string | null): CellEnvelope | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) {
    return { kind: "text", text: raw, columns: [], rows: [], rowCount: 0, scanned: 0, truncated: false, elapsedMs: 0, source: null, chart: null };
  }
  try {
    const parsed = JSON.parse(trimmed) as Partial<CellEnvelope>;
    if (!parsed || typeof parsed !== "object" || !parsed.kind) throw new Error("shape");
    return {
      kind: parsed.kind,
      text: parsed.text,
      columns: parsed.columns ?? [],
      rows: parsed.rows ?? [],
      rowCount: parsed.rowCount ?? 0,
      scanned: parsed.scanned ?? 0,
      truncated: Boolean(parsed.truncated),
      elapsedMs: parsed.elapsedMs ?? 0,
      source: parsed.source ?? null,
      chart: parsed.chart ?? null,
    };
  } catch {
    return { kind: "text", text: raw, columns: [], rows: [], rowCount: 0, scanned: 0, truncated: false, elapsedMs: 0, source: null, chart: null };
  }
}

const SERIES_TINTS = ["hsl(var(--accent))", "#9ca3af", "#6b7280", "#d4d4d8", "#52525b"];

const ChartBody = ({ env }: { env: CellEnvelope }) => {
  const spec = env.chart!;
  const data = env.rows;
  const axis = { stroke: "hsl(var(--muted-foreground))", fontSize: 10 };
  const tooltip = (
    <Tooltip
      contentStyle={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border) / 0.3)",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 300,
      }}
    />
  );

  if (spec.type === "pie") {
    const key = spec.y[0];
    return (
      <PieChart>
        {tooltip}
        <Pie data={data} dataKey={key} nameKey={spec.x} outerRadius="75%" innerRadius="45%" paddingAngle={2}>
          {data.map((_, i) => <PieCell key={i} fill={SERIES_TINTS[i % SERIES_TINTS.length]} />)}
        </Pie>
      </PieChart>
    );
  }

  const grid = <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border) / 0.2)" vertical={false} />;
  const axes = (<><XAxis dataKey={spec.x} tick={axis} tickLine={false} axisLine={false} /><YAxis tick={axis} tickLine={false} axisLine={false} width={44} /></>);

  if (spec.type === "line") {
    return (
      <LineChart data={data}>{grid}{axes}{tooltip}
        {spec.y.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={SERIES_TINTS[i % SERIES_TINTS.length]} strokeWidth={1.5} dot={false} />)}
      </LineChart>
    );
  }
  if (spec.type === "area") {
    return (
      <AreaChart data={data}>{grid}{axes}{tooltip}
        {spec.y.map((k, i) => <Area key={k} type="monotone" dataKey={k} stroke={SERIES_TINTS[i % SERIES_TINTS.length]} fill={SERIES_TINTS[i % SERIES_TINTS.length]} fillOpacity={0.15} strokeWidth={1.5} />)}
      </AreaChart>
    );
  }
  return (
    <BarChart data={data}>{grid}{axes}{tooltip}
      {spec.y.map((k, i) => <Bar key={k} dataKey={k} fill={SERIES_TINTS[i % SERIES_TINTS.length]} radius={[4, 4, 0, 0]} />)}
    </BarChart>
  );
};

const CellOutput = ({ env }: { env: CellEnvelope }) => {
  const hasChart = Boolean(env.chart && env.rows.length > 0);
  const footer = useMemo(() => {
    const bits: string[] = [];
    if (env.rowCount) bits.push(`${env.rowCount} row${env.rowCount === 1 ? "" : "s"}`);
    if (env.scanned) bits.push(`${env.scanned} scanned`);
    if (env.source) bits.push(env.source);
    if (env.elapsedMs) bits.push(`${env.elapsedMs} ms`);
    return bits.join(" · ");
  }, [env]);

  if (env.kind === "error") {
    const timeout = /timed out/i.test(env.text ?? "");
    return (
      <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5">
        <div className="flex items-start gap-2">
          {timeout ? <Clock className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />}
          <p className="text-[11px] font-light text-red-300/90 leading-relaxed">{env.text}</p>
        </div>
      </div>
    );
  }

  if (env.kind === "text") {
    if (!env.text?.trim()) return null;
    return (
      <div className="mt-3 pt-3 border-t border-border/10">
        <pre className="text-[11px] font-mono font-light text-foreground/70 whitespace-pre-wrap">{env.text}</pre>
      </div>
    );
  }

  if (env.rows.length === 0) {
    return <p className="mt-3 pt-3 border-t border-border/10 text-[11px] font-light text-muted-foreground/60">No rows returned{env.scanned ? ` (${env.scanned} scanned)` : ""}.</p>;
  }

  return (
    <div className="mt-3 pt-3 border-t border-border/10 space-y-2">
      {hasChart && (
        <div className="rounded-xl border border-border/10 bg-background/30 p-3">
          {env.chart?.title && <p className="text-[10px] font-light tracking-widest text-muted-foreground uppercase mb-2">{env.chart.title}</p>}
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%"><ChartBody env={env} /></ResponsiveContainer>
          </div>
        </div>
      )}
      <div className="max-h-64 overflow-auto rounded-xl border border-border/10 bg-background/30">
        <table className="w-full text-[11px] font-light">
          <thead className="sticky top-0 bg-card/80 backdrop-blur">
            <tr>{env.columns.map((c) => <th key={c} className="text-left px-3 py-1.5 font-light text-muted-foreground/70 whitespace-nowrap border-b border-border/10">{c}</th>)}</tr>
          </thead>
          <tbody>
            {env.rows.map((r, i) => (
              <tr key={i} className="hover:bg-foreground/[0.03]">
                {env.columns.map((c) => (
                  <td key={c} className="px-3 py-1.5 text-foreground/80 whitespace-nowrap max-w-[280px] truncate">{r[c] === null ? <span className="text-muted-foreground/30">—</span> : String(r[c])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[9px] font-light tracking-wide text-muted-foreground/40">
        {footer}{env.truncated ? " · truncated at row cap" : ""}
      </p>
    </div>
  );
};

export default CellOutput;
