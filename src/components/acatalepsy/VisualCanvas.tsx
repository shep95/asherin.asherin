import { useMemo } from "react";
import type { DataRow } from "@/lib/data/types";
import { toNumber } from "@/lib/data/validate";
import { pearson, type VisualRule } from "@/lib/acatalepsy/engine";

const W = 900;
const H = 420;
const pad = 48;

const num = (rows: DataRow[], key: string) => rows.map((r) => toNumber(r[key] ?? null)).filter((n): n is number => n !== null);
const scale = (v: number, min: number, max: number, a: number, b: number) => max === min ? (a + b) / 2 : a + ((v - min) / (max - min)) * (b - a);

function Empty({ text }: { text: string }) {
  return <div className="flex h-[360px] items-center justify-center border border-border/40 bg-background/40 px-8 text-center text-sm text-muted-foreground">{text}</div>;
}

function Matrix({ rows, columns }: { rows: DataRow[]; columns: string[] }) {
  const size = Math.min(7, columns.length);
  const cols = columns.slice(0, size);
  const cell = Math.min(54, 300 / size);
  return <div className="flex min-h-[360px] items-center justify-center overflow-auto p-4"><div className="grid gap-1" style={{ gridTemplateColumns: `120px repeat(${size}, ${cell}px)` }}>
    <span />{cols.map((c) => <span key={c} className="truncate text-center text-[9px] text-muted-foreground">{c}</span>)}
    {cols.flatMap((a) => [<span key={`${a}-label`} className="truncate pr-2 text-right text-[10px] text-muted-foreground">{a}</span>, ...cols.map((b) => {
      const value = a === b ? 1 : pearson(rows, a, b);
      return <span key={`${a}-${b}`} className="flex aspect-square items-center justify-center border border-border/30 text-[10px] text-foreground" style={{ backgroundColor: `hsl(var(--signal-live) / ${0.08 + Math.abs(value) * 0.52})` }}>{value.toFixed(2)}</span>;
    })])}
  </div></div>;
}

function Coordinates({ rows, lat, lon }: { rows: DataRow[]; lat: string; lon: string }) {
  const pts = rows.map((r) => ({ lat: toNumber(r[lat] ?? null), lon: toNumber(r[lon] ?? null) })).filter((p): p is { lat: number; lon: number } => p.lat !== null && p.lon !== null && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180).slice(0, 1200);
  if (!pts.length) return <Empty text="the latitude and longitude fields contain no valid coordinate pairs." />;
  return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${pts.length} uploaded coordinate points`} className="h-[360px] w-full bg-background/30">
    {[-120,-60,0,60,120].map((x) => <line key={`x${x}`} x1={scale(x,-180,180,pad,W-pad)} x2={scale(x,-180,180,pad,W-pad)} y1={pad} y2={H-pad} className="stroke-border" strokeDasharray="3 8" />)}
    {[-60,-30,0,30,60].map((y) => <line key={`y${y}`} x1={pad} x2={W-pad} y1={scale(y,-90,90,H-pad,pad)} y2={scale(y,-90,90,H-pad,pad)} className="stroke-border" strokeDasharray="3 8" />)}
    {pts.map((p, i) => <circle key={i} cx={scale(p.lon,-180,180,pad,W-pad)} cy={scale(p.lat,-90,90,H-pad,pad)} r="4" className="fill-signal-live" fillOpacity=".65" />)}
  </svg>;
}

function Flow({ rows, source, target }: { rows: DataRow[]; source: string; target: string }) {
  const links = rows.slice(0, 80).map((r) => ({ a: String(r[source] ?? ""), b: String(r[target] ?? "") })).filter((x) => x.a && x.b);
  const left = [...new Set(links.map((x) => x.a))].slice(0, 12);
  const right = [...new Set(links.map((x) => x.b))].slice(0, 12);
  if (!links.length) return <Empty text="the source and destination fields contain no connected records." />;
  return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="uploaded relationship flow" className="h-[360px] w-full bg-background/30">
    {links.map((l, i) => { const ai = left.indexOf(l.a); const bi = right.indexOf(l.b); if (ai < 0 || bi < 0) return null; const y1 = 35 + ai * 29; const y2 = 35 + bi * 29; return <path key={i} d={`M 180 ${y1} C 390 ${y1}, 510 ${y2}, 720 ${y2}`} fill="none" className="stroke-signal-live" strokeOpacity=".18" strokeWidth="2" />; })}
    {left.map((n,i) => <g key={n}><circle cx="170" cy={35+i*29} r="5" className="fill-foreground"/><text x="158" y={39+i*29} textAnchor="end" className="fill-muted-foreground text-[10px]">{n.slice(0,20)}</text></g>)}
    {right.map((n,i) => <g key={n}><circle cx="730" cy={35+i*29} r="5" className="fill-signal-live"/><text x="742" y={39+i*29} className="fill-muted-foreground text-[10px]">{n.slice(0,20)}</text></g>)}
  </svg>;
}

function Plot({ rows, rule, columns }: { rows: DataRow[]; rule: VisualRule; columns: string[] }) {
  const xKey = rule.required[0] ?? columns[0];
  const yKey = rule.required[1] ?? columns[1];
  const values = num(rows, yKey || xKey);
  if (!values.length && rule.kind !== "donut" && rule.kind !== "bar") return <Empty text="the selected visual has no usable numeric values after filtering." />;
  const min = Math.min(...values, 0), max = Math.max(...values, 1);
  const points = rows.slice(0, 500).map((r, i) => ({ x: i, y: toNumber(r[yKey] ?? r[xKey] ?? null), label: String(r[xKey] ?? i) })).filter((p): p is { x:number;y:number;label:string } => p.y !== null);
  const path = points.map((p,i) => `${i ? "L" : "M"}${scale(i,0,Math.max(1,points.length-1),pad,W-pad)},${scale(p.y,min,max,H-pad,pad)}`).join(" ");
  if (rule.kind === "kpi") {
    const total = values.reduce((a,b)=>a+b,0); const mean = values.length ? total/values.length : 0;
    return <div className="grid min-h-[360px] grid-cols-2 content-center gap-px bg-border/30 md:grid-cols-4">{[["rows",rows.length],["total",total.toLocaleString(undefined,{maximumFractionDigits:2})],["mean",mean.toLocaleString(undefined,{maximumFractionDigits:2})],["missing",rows.length-values.length]].map(([k,v])=><div key={k} className="bg-background/80 p-6"><div className="text-[10px] uppercase text-muted-foreground">{k}</div><div className="mt-2 text-2xl font-extralight text-foreground">{v}</div></div>)}</div>;
  }
  if (rule.kind === "box") {
    const s=[...values].sort((a,b)=>a-b); const q=(p:number)=>s[Math.floor((s.length-1)*p)] ?? 0;
    return <svg viewBox={`0 0 ${W} ${H}`} className="h-[360px] w-full bg-background/30" role="img" aria-label="box plot"><line x1={scale(s[0],min,max,pad,W-pad)} x2={scale(s[s.length-1],min,max,pad,W-pad)} y1="210" y2="210" className="stroke-muted-foreground"/><rect x={scale(q(.25),min,max,pad,W-pad)} y="145" width={Math.max(2,scale(q(.75),min,max,pad,W-pad)-scale(q(.25),min,max,pad,W-pad))} height="130" className="fill-signal-live" fillOpacity=".25" stroke="hsl(var(--signal-live))"/><line x1={scale(q(.5),min,max,pad,W-pad)} x2={scale(q(.5),min,max,pad,W-pad)} y1="145" y2="275" className="stroke-foreground" strokeWidth="3"/><text x={pad} y="330" className="fill-muted-foreground text-xs">min {s[0]?.toFixed(2)}</text><text x={W-pad} y="330" textAnchor="end" className="fill-muted-foreground text-xs">max {s[s.length-1]?.toFixed(2)}</text></svg>;
  }
  if (rule.kind === "histogram") {
    const bins=12, width=(max-min||1)/bins, counts=new Array(bins).fill(0); values.forEach(v=>counts[Math.min(bins-1,Math.floor((v-min)/width))]++); const high=Math.max(...counts,1);
    return <svg viewBox={`0 0 ${W} ${H}`} className="h-[360px] w-full bg-background/30" role="img" aria-label="histogram">{counts.map((c,i)=><rect key={i} x={pad+i*((W-pad*2)/bins)+2} y={scale(c,0,high,H-pad,pad)} width={(W-pad*2)/bins-4} height={H-pad-scale(c,0,high,H-pad,pad)} className="fill-signal-live" fillOpacity={.2+i*.035}/>)}</svg>;
  }
  if (rule.kind === "bar" || rule.kind === "donut" || rule.kind === "funnel") {
    const counts = new Map<string,number>(); rows.forEach(r=>{const k=String(r[xKey]??"(blank)"); counts.set(k,(counts.get(k)??0)+(toNumber(r[yKey]??null)??1));}); const data=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,12); const high=Math.max(...data.map(d=>d[1]),1);
    return <div className="flex min-h-[360px] flex-col justify-center gap-3 p-6">{data.map(([label,value],i)=><div key={label} className="grid grid-cols-[minmax(80px,150px)_1fr_70px] items-center gap-3 text-xs"><span className="truncate text-muted-foreground">{label}</span><span className="h-3 bg-muted"><span className="block h-full bg-signal-live" style={{width:`${Math.max(2,value/high*100)}%`,opacity:.25+(i===0?.55:.25)}}/></span><span className="text-right text-foreground">{value.toLocaleString()}</span></div>)}</div>;
  }
  if (rule.kind === "candlestick") {
    const find=(re:RegExp)=>columns.find(c=>re.test(c)); const o=find(/^open$/i),h=find(/^high$/i),l=find(/^low$/i),c=find(/^close$/i); if(!o||!h||!l||!c)return <Empty text="open, high, low and close are required."/>; const sampled=rows.slice(0,80); const all=sampled.flatMap(r=>[toNumber(r[h]??null),toNumber(r[l]??null)]).filter((n):n is number=>n!==null); const lo=Math.min(...all),hi=Math.max(...all);
    return <svg viewBox={`0 0 ${W} ${H}`} className="h-[360px] w-full bg-background/30" role="img" aria-label="candlestick chart">{sampled.map((r,i)=>{const ov=toNumber(r[o]??null),hv=toNumber(r[h]??null),lv=toNumber(r[l]??null),cv=toNumber(r[c]??null);if(ov===null||hv===null||lv===null||cv===null)return null;const x=pad+i*((W-pad*2)/sampled.length),up=cv>=ov;return <g key={i}><line x1={x} x2={x} y1={scale(hv,lo,hi,H-pad,pad)} y2={scale(lv,lo,hi,H-pad,pad)} className={up?"stroke-signal-live":"stroke-muted-foreground"}/><rect x={x-3} y={Math.min(scale(ov,lo,hi,H-pad,pad),scale(cv,lo,hi,H-pad,pad))} width="6" height={Math.max(2,Math.abs(scale(ov,lo,hi,H-pad,pad)-scale(cv,lo,hi,H-pad,pad)))} className={up?"fill-signal-live":"fill-muted-foreground"}/></g>})}</svg>;
  }
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-[360px] w-full bg-background/30" role="img" aria-label={`${rule.kind} chart`}><path d={path} fill="none" className="stroke-signal-live" strokeWidth="2"/>{points.map((p,i)=><circle key={i} cx={scale(i,0,Math.max(1,points.length-1),pad,W-pad)} cy={scale(p.y,min,max,H-pad,pad)} r={rule.kind==="scatter"?4:2} className="fill-foreground" fillOpacity=".7"/>)}</svg>;
}

export function VisualCanvas({ rows, columns, rule }: { rows: DataRow[]; columns: string[]; rule: VisualRule }) {
  const rendered = useMemo(() => {
    if (rule.kind === "heatmap") return <Matrix rows={rows} columns={rule.required} />;
    if (rule.kind === "map") return <Coordinates rows={rows} lat={rule.required[0]} lon={rule.required[1]} />;
    if (rule.kind === "sankey" || rule.kind === "network") return <Flow rows={rows} source={rule.required[0]} target={rule.required[1]} />;
    return <Plot rows={rows} rule={rule} columns={columns} />;
  }, [rows, columns, rule]);
  return <div data-chart-export className="overflow-hidden border border-border/50 bg-card/70">{rendered}</div>;
}