import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ClipboardPaste, Eraser, FileDown, FolderOpen, Globe2, Link2, Search, ShieldCheck, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileTree } from "./FileTree";
import { VisualCanvas } from "./VisualCanvas";
import { analyzeParsed, filterRows, findMergeKeys, safeCell, type LocalDataset } from "@/lib/acatalepsy/engine";
import { ACATALEPSY_EXTENSIONS, FORMAT_GROUPS, parseLocalFile, parsePastedTable } from "@/lib/acatalepsy/parser";

const MAX_FILES = 50;

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function escapeCsv(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function buildExample() {
  const content = ["date,region,revenue,orders,cost", "2026-01-01,north,18200,142,11700", "2026-02-01,north,17400,131,11200", "2026-03-01,south,22100,169,13900", "2026-04-01,west,25800,190,15400", "2026-05-01,south,24600,181,15100", "2026-06-01,north,29700,214,17200"].join("\n");
  return new File([content], "local-revenue-example.csv", { type: "text/csv", lastModified: Date.now() });
}

export default function AcatalepsyWorkspace() {
  const [datasets, setDatasets] = useState<LocalDataset[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const [search, setSearch] = useState("");
  const [fileSearch, setFileSearch] = useState("");
  const [activeVisual, setActiveVisual] = useState(0);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [urlBusy, setUrlBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const active = datasets.find((d) => d.id === activeId) ?? datasets.find((d) => d.status === "ready");
  const filteredRows = useMemo(() => active?.parsed ? filterRows(active.parsed.rows, search) : [], [active, search]);
  const visibleDatasets = useMemo(() => datasets.filter((d) => d.file.name.toLowerCase().includes(fileSearch.toLowerCase())), [datasets, fileSearch]);
  const mergeKeys = useMemo(() => active?.analysis ? datasets.filter((d) => d.id !== active.id && d.analysis).flatMap((d) => findMergeKeys(active.analysis as NonNullable<LocalDataset["analysis"]>, d.analysis as NonNullable<LocalDataset["analysis"]>).map((k) => ({ ...k, file: d.file.name }))) : [], [active, datasets]);

  const ingest = useCallback(async (incoming: File[]) => {
    const available = Math.max(0, MAX_FILES - datasets.length);
    const files = incoming.slice(0, available);
    if (!files.length) { toast.error(`this session can hold ${MAX_FILES} files at once`); return; }
    if (incoming.length > available) toast.warning(`${incoming.length - available} file(s) were left out because this session is full`);
    const batch = new Date().toISOString();
    const queued = files.map((file, i): LocalDataset => ({ id: `${Date.now()}-${i}-${file.name}`, file, path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name, batch, status: "queued", progress: 0 }));
    setDatasets((old) => [...old, ...queued]);
    if (!activeId && queued[0]) setActiveId(queued[0].id);
    const workers = [...queued];
    const run = async () => {
      while (workers.length) {
        const item = workers.shift(); if (!item) return;
        setDatasets((old) => old.map((d) => d.id === item.id ? { ...d, status: "reading" } : d));
        try {
          const parsed = await parseLocalFile(item.file, (progress) => setDatasets((old) => old.map((d) => d.id === item.id ? { ...d, progress } : d)));
          const analysis = analyzeParsed(parsed, queued.length);
          setDatasets((old) => old.map((d) => d.id === item.id ? { ...d, parsed, analysis, status: "ready", progress: 100 } : d));
        } catch (error) {
          const message = error instanceof Error ? error.message.toLowerCase() : "this file could not be read";
          setDatasets((old) => old.map((d) => d.id === item.id ? { ...d, status: "error", error: message } : d));
        }
      }
    };
    await Promise.all([run(), run(), run()]);
  }, [activeId, datasets.length]);

  useEffect(() => {
    const enter = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) { e.preventDefault(); setDragging(true); } };
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDragging(false); };
    const drop = (e: DragEvent) => { if (!e.dataTransfer?.files.length) return; e.preventDefault(); setDragging(false); void ingest([...e.dataTransfer.files]); };
    window.addEventListener("dragenter", enter); window.addEventListener("dragover", over); window.addEventListener("dragleave", leave); window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragenter", enter); window.removeEventListener("dragover", over); window.removeEventListener("dragleave", leave); window.removeEventListener("drop", drop); };
  }, [ingest]);

  const remove = (id: string) => { setDatasets((old) => old.filter((d) => d.id !== id)); if (activeId === id) setActiveId(undefined); };
  const clear = () => { setDatasets([]); setActiveId(undefined); setSearch(""); setActiveVisual(0); };
  const downloadOriginal = (id: string) => { const d = datasets.find((x) => x.id === id); if (d) downloadBlob(d.file.name, d.file); };
  const exportCsv = () => { if (!active?.parsed) return; const text = [active.parsed.columns.join(","), ...filteredRows.map((r) => active.parsed?.columns.map((c) => escapeCsv(r[c])).join(","))].join("\n"); downloadBlob(`${active.file.name.replace(/\.[^.]+$/, "")}-filtered.csv`, new Blob([text], { type: "text/csv" })); };
  const exportSvg = () => { const svg = document.querySelector("[data-chart-export] svg"); if (!svg || !active) { toast.error("this visual does not provide a vector export"); return; } downloadBlob(`${active.file.name}-visual.svg`, new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" })); };
  const exportPng = async () => { const node = document.querySelector("[data-chart-export]") as HTMLElement | null; if (!node || !active) return; const canvas = await (await import("html2canvas")).default(node, { backgroundColor: null, scale: 2 }); canvas.toBlob((blob) => { if (blob) downloadBlob(`${active.file.name}-visual.png`, blob); }); };
  const exportPdf = async () => { const node = document.querySelector("[data-chart-export]") as HTMLElement | null; if (!node || !active) return; const canvas = await (await import("html2canvas")).default(node, { backgroundColor: null, scale: 1.5 }); const { jsPDF } = await import("jspdf"); const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width, canvas.height] }); pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height); pdf.save(`${active.file.name}-visual.pdf`); };
  const exportZip = async () => { const JSZip = (await import("jszip")).default; const zip = new JSZip(); const manifest = datasets.map((d) => ({ name: d.file.name, path: d.path, bytes: d.file.size, status: d.status, parser: d.parsed?.method, rows: d.parsed?.rows.length ?? 0, domains: d.analysis?.domains.map((x) => x.domain) ?? [], rank: d.analysis?.rank })); for (const d of datasets) zip.file(`files/${d.path.replace(/\.\./g, "_")}`, d.file); zip.file("manifest.json", JSON.stringify({ created: new Date().toISOString(), localOnly: true, files: manifest }, null, 2)); downloadBlob("asherin-acatalepsy-session.zip", await zip.generateAsync({ type: "blob" })); };
  const importUrl = async () => { let parsed: URL; try { parsed = new URL(url); } catch { toast.error("enter a complete https url"); return; } if (parsed.protocol !== "https:") { toast.error("only https urls are accepted"); return; } setUrlBusy(true); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15_000); try { const response = await fetch(parsed.href, { signal: controller.signal }); if (!response.ok) throw new Error(`the source returned ${response.status}`); const blob = await response.blob(); const name = decodeURIComponent(parsed.pathname.split("/").pop() || "remote-data.csv"); await ingest([new File([blob], name, { type: blob.type })]); setUrlOpen(false); setUrl(""); } catch (error) { toast.error(error instanceof Error && error.name === "AbortError" ? "the url took longer than 15 seconds" : "the browser could not read that url. the source may block cross-origin access."); } finally { clearTimeout(timeout); setUrlBusy(false); } };

  const visual = active?.analysis?.visuals[activeVisual] ?? active?.analysis?.visuals[0];
  const selectedColumn = active?.analysis?.profile.columns[0];

  return <div className="min-h-screen text-foreground">
    {dragging && <div className="fixed inset-0 z-[100] flex items-center justify-center border-2 border-signal-live bg-background/90 text-center"><div><Upload className="mx-auto size-10 text-signal-live"/><p className="mt-4 text-xl font-extralight">release to read locally</p><p className="mt-2 text-xs text-muted-foreground">nothing leaves this device</p></div></div>}
    <header className="sticky top-0 z-40 px-3 pt-3 md:px-6 md:pt-4">
      <div className="mx-auto max-w-[1800px] overflow-hidden rounded-2xl border border-foreground/15 bg-background/80 shadow-2xl backdrop-blur-2xl">
        <div className="flex min-h-16 items-center gap-3 px-3 md:px-5">
          <a href="https://asherin.com" className="group flex shrink-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="visit asherin.com">
            <span className="flex size-8 items-center justify-center rounded-full border border-foreground/20 bg-foreground/5"><span className="size-1.5 rounded-full bg-foreground shadow-[0_0_8px_hsl(var(--foreground)/0.8)]" /></span>
            <span className="flex min-w-0 flex-col leading-none"><span className="text-sm font-extralight uppercase tracking-[0.25em] text-foreground">asherin</span><span className="mt-1 truncate font-mono text-[8px] text-muted-foreground">asherin.com</span></span>
          </a>
          <span className="hidden h-5 w-px bg-border/70 lg:block" aria-hidden />
          <span className="hidden text-[10px] uppercase text-muted-foreground lg:inline">acatalepsy · local deterministic workspace</span>
          <div className="ml-auto flex items-center gap-1">
            <span className="mr-2 hidden items-center gap-2 border-r border-border/70 pr-4 text-[10px] text-muted-foreground xl:flex"><ShieldCheck className="size-3 text-primary"/>private session · no account · no ai</span>
            <Button variant="ghost" size="sm" onClick={()=>inputRef.current?.click()} aria-label="choose files"><Upload/><span className="hidden sm:inline">files</span></Button>
            <Button variant="ghost" size="sm" onClick={()=>folderRef.current?.click()} aria-label="choose folder"><FolderOpen/><span className="hidden sm:inline">folder</span></Button>
            <Button variant="ghost" size="sm" onClick={()=>setPasteOpen(true)} aria-label="paste table"><ClipboardPaste/><span className="hidden md:inline">paste</span></Button>
            <Button variant="ghost" size="sm" onClick={()=>setUrlOpen(true)} aria-label="read public url"><Link2/><span className="hidden md:inline">url</span></Button>
            {datasets.length>0&&<><span className="mx-1 h-5 w-px bg-border/70" aria-hidden/><Button variant="ghost" size="icon" onClick={clear} aria-label="clear all local files"><Eraser/></Button></>}
          </div>
        </div>
        <div className="flex h-8 items-center border-t border-border/40 px-3 text-[9px] uppercase text-muted-foreground md:px-5">
          <span className="text-foreground">asherin.acatalepsy</span><span className="mx-2 text-border">/</span><span>{datasets.length ? `${datasets.length} local file${datasets.length === 1 ? "" : "s"}` : "ready for local data"}</span><span className="ml-auto flex items-center gap-1.5 xl:hidden"><ShieldCheck className="size-3 text-primary"/>private session</span>
        </div>
      </div>
      <input ref={inputRef} hidden type="file" multiple accept={ACATALEPSY_EXTENSIONS.join(",")} onChange={(e)=>{void ingest([...e.target.files??[]]); e.currentTarget.value="";}}/>
      <input ref={folderRef} hidden type="file" multiple {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)} onChange={(e)=>{void ingest([...e.target.files??[]]); e.currentTarget.value="";}}/>
    </header>
    <main className="mx-auto max-w-[1800px] p-3 md:p-6">
      {!datasets.length ? <section className="flex min-h-[calc(100vh-92px)] flex-col items-center justify-center py-12 text-center">
        <p className="text-[10px] uppercase text-signal-live">session memory only</p><h1 className="mt-4 max-w-4xl font-display text-5xl font-light leading-none md:text-7xl">your data becomes visible.<br/>nothing else learns it.</h1><p className="mt-6 max-w-xl text-sm leading-7 text-muted-foreground">drop files, folders or pasted tables. deterministic rules inspect structure, score evidence and choose visuals inside this browser tab.</p>
        <button onClick={()=>inputRef.current?.click()} className="mt-10 flex min-h-48 w-full max-w-3xl flex-col items-center justify-center border border-dashed border-border/70 bg-card/55 px-8 hover:border-signal-live/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Upload className="size-7 text-muted-foreground"/><span className="mt-4 text-base font-extralight">drop data anywhere or choose files</span><span className="mt-2 text-[11px] text-muted-foreground">up to 50 files · 100 mb each · processed locally</span></button>
        <div className="mt-5 flex flex-wrap justify-center gap-2"><Button variant="outline" size="sm" onClick={()=>void ingest([buildExample()])}>open local example</Button><Button variant="ghost" size="sm" onClick={()=>setPasteOpen(true)}>paste a table</Button><Button variant="ghost" size="sm" onClick={()=>setUrlOpen(true)}>read public url</Button></div>
        <div className="mt-14 grid w-full max-w-5xl grid-cols-1 gap-px border border-border/40 bg-border/40 text-left md:grid-cols-3">{[["compare","dates + measures become trends, distributions and correlations"],["locate","coordinate fields become a local point map without external tiles"],["trace","source + destination fields become visible flows and relationship paths"]].map(([a,b])=><div key={a} className="bg-background/75 p-5"><p className="text-xs text-foreground">{a}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{b}</p></div>)}</div>
        <details className="mt-8 w-full max-w-5xl border-t border-border/40 pt-4 text-left"><summary className="cursor-pointer text-xs text-muted-foreground">format availability</summary><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{Object.entries(FORMAT_GROUPS).map(([group,formats])=><div key={group}><p className="text-[10px] uppercase text-muted-foreground">{group}</p><p className="mt-1 text-xs text-foreground">{formats.join(" · ")}</p></div>)}</div></details>
      </section> : <div className="grid min-h-[calc(100vh-110px)] gap-3 lg:grid-cols-[minmax(250px,30%)_minmax(0,70%)]">
        <aside className="border border-border/40 bg-card/70 p-3"><div className="flex items-center gap-2"><Search className="size-3 text-muted-foreground"/><Input value={fileSearch} onChange={(e)=>setFileSearch(e.target.value)} placeholder="find a local file" className="h-8 border-0 bg-transparent px-0 text-xs focus-visible:ring-0"/><span className="text-[10px] text-muted-foreground">{datasets.length}/{MAX_FILES}</span></div><div className="my-3 border-t border-border/40"/><FileTree datasets={visibleDatasets} activeId={active?.id} onSelect={(id)=>{setActiveId(id);setActiveVisual(0);setSearch("");}} onRemove={remove} onDownload={downloadOriginal}/>{datasets.some(d=>d.status==="error")&&<div className="mt-4 space-y-2">{datasets.filter(d=>d.status==="error").map(d=><div key={d.id} className="border border-destructive/30 bg-destructive/5 p-3 text-xs"><p className="text-foreground">{d.file.name}</p><p className="mt-1 leading-5 text-muted-foreground">{d.error}</p></div>)}</div>}
          <div className="mt-5 flex gap-2"><Button variant="outline" size="sm" className="flex-1" onClick={exportZip}><Archive/>download all</Button><Button variant="ghost" size="sm" onClick={()=>inputRef.current?.click()}><Upload/></Button></div>
        </aside>
        <section className="min-w-0 border border-border/40 bg-background/80">
          {!active?.parsed || !active.analysis ? <div className="flex min-h-[520px] items-center justify-center text-sm text-muted-foreground">{active?.status==="error"?active.error:"reading locally…"}</div> : <>
            <div className="border-b border-border/40 p-4 md:p-6"><div className="flex flex-wrap items-start gap-4"><div className="min-w-0 flex-1"><p className="truncate text-xl font-extralight">{active.file.name}</p><p className="mt-1 text-[11px] text-muted-foreground">{active.parsed.method} · {active.parsed.rows.length.toLocaleString()} rows · {active.parsed.columns.length} columns · quality {active.analysis.quality.score}/100</p></div><span className="border border-signal-live/30 bg-signal-live/10 px-3 py-1 text-[10px] text-signal-live">{active.analysis.rank}</span><Button variant="outline" size="sm" onClick={exportCsv}><FileDown/>filtered csv</Button></div>
              <div className="mt-5 grid gap-px bg-border/40 sm:grid-cols-3">{active.analysis.domains.slice(0,3).map(d=><div key={d.domain} className="bg-card/70 p-3"><p className="text-[10px] uppercase text-muted-foreground">{d.domain}</p><p className="mt-1 text-lg font-extralight">{d.score}%</p><p className="truncate text-[10px] text-muted-foreground">{d.evidence.join(" · ")||"value-shape evidence"}</p></div>)}</div>
            </div>
            <Tabs defaultValue="visuals" className="p-4 md:p-6"><TabsList className="h-auto w-full justify-start overflow-x-auto bg-muted/60"><TabsTrigger value="visuals">visuals</TabsTrigger><TabsTrigger value="preview">preview</TabsTrigger><TabsTrigger value="evidence">evidence</TabsTrigger><TabsTrigger value="quality">quality</TabsTrigger></TabsList>
              <TabsContent value="visuals" className="mt-5"><div className="mb-4 flex gap-2 overflow-x-auto pb-2">{active.analysis.visuals.map((v,i)=><Button key={v.id} variant={i===activeVisual?"secondary":"ghost"} size="sm" onClick={()=>setActiveVisual(i)} className="shrink-0">{v.kind}</Button>)}</div>{visual?<><VisualCanvas rows={filteredRows} columns={active.parsed.columns} rule={visual}/><div className="mt-4 grid gap-3 border-t border-border/40 pt-4 md:grid-cols-[1fr_auto]"><div><p className="text-xs text-foreground">{visual.name}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">why this visual: {visual.reason}. required evidence: {visual.required.join(", ")}.</p></div><div className="flex flex-wrap gap-1"><Button variant="ghost" size="sm" onClick={()=>void exportPng()}>png</Button><Button variant="ghost" size="sm" onClick={exportSvg}>svg</Button><Button variant="ghost" size="sm" onClick={()=>void exportPdf()}>pdf</Button></div></div></>:<div className="border border-border/40 p-8 text-center text-sm text-muted-foreground">this file contains text, but no tabular fields that support a chart.</div>}
                <div className="mt-5"><Input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="filter every visible row" aria-label="filter rows"/><p className="mt-2 text-[10px] text-muted-foreground">{filteredRows.length.toLocaleString()} of {active.parsed.rows.length.toLocaleString()} rows in view</p></div></TabsContent>
              <TabsContent value="preview" className="mt-5"><div className="overflow-auto border border-border/40"><table className="w-full min-w-[720px] text-left text-xs"><thead className="sticky top-0 bg-card"><tr><th className="px-3 py-2 text-muted-foreground">#</th>{active.parsed.columns.map(c=><th key={c} className="px-3 py-2 font-normal text-foreground">{c}<span className="ml-2 text-[9px] text-muted-foreground">{active.analysis?.profile.columns.find(p=>p.name===c)?.type}</span></th>)}</tr></thead><tbody>{filteredRows.slice(0,100).map((r,i)=><tr key={i} className="border-t border-border/30"><td className="px-3 py-2 text-muted-foreground">{i+1}</td>{active.parsed?.columns.map(c=><td key={c} className="max-w-[240px] truncate px-3 py-2 text-foreground/80">{safeCell(r[c])}</td>)}</tr>)}</tbody></table></div><p className="mt-2 text-[10px] text-muted-foreground">showing the first 100 matching rows</p></TabsContent>
              <TabsContent value="evidence" className="mt-5 space-y-3"><div className="border border-border/40 p-4"><p className="text-[10px] uppercase text-muted-foreground">what was detected</p><p className="mt-2 text-sm leading-6">{active.analysis.domains[0]?.domain ?? "general tabular"} data at {active.analysis.rank} complexity.</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{active.analysis.rankReason}. labels describe visual complexity, not access to outside systems.</p></div>{active.analysis.evidence.map((e,i)=><blockquote key={i} className="border-l border-signal-live px-4 py-2 text-xs leading-5 text-muted-foreground">{e}</blockquote>)}{mergeKeys.length>0&&<div className="border border-border/40 p-4"><p className="text-[10px] uppercase text-muted-foreground">safe combination candidates</p>{mergeKeys.slice(0,8).map((m,i)=><p key={i} className="mt-2 text-xs text-foreground">{m.left} ↔ {m.file}:{m.right} <span className="text-muted-foreground">({m.type})</span></p>)}</div>}</TabsContent>
              <TabsContent value="quality" className="mt-5"><div className="grid gap-px bg-border/40 sm:grid-cols-4">{[["score",active.analysis.quality.score],["complete",`${active.analysis.quality.completeness}%`],["duplicates",active.analysis.quality.duplicateCount],["outliers",active.analysis.quality.outlierCount]].map(([k,v])=><div key={k} className="bg-card/80 p-4"><p className="text-[10px] uppercase text-muted-foreground">{k}</p><p className="mt-2 text-2xl font-extralight">{v}</p></div>)}</div><div className="mt-5 grid gap-3 md:grid-cols-2">{active.analysis.profile.columns.map(c=><div key={c.name} className="border border-border/40 p-4"><div className="flex justify-between"><p className="text-xs text-foreground">{c.name}</p><span className="text-[10px] text-muted-foreground">{c.type}</span></div><div className="mt-3 grid grid-cols-3 gap-3 text-[10px] text-muted-foreground"><span>missing<br/><b className="font-normal text-foreground">{c.missing}</b></span><span>unique<br/><b className="font-normal text-foreground">{c.distinct}</b></span><span>complete<br/><b className="font-normal text-foreground">{c.completeness}%</b></span>{c.mean!==undefined&&<><span>mean<br/><b className="font-normal text-foreground">{c.mean.toFixed(2)}</b></span><span>median<br/><b className="font-normal text-foreground">{c.median?.toFixed(2)}</b></span><span>std dev<br/><b className="font-normal text-foreground">{c.stdDev?.toFixed(2)}</b></span></>}</div></div>)}</div>{selectedColumn&&active.analysis.quality.issues.length>0&&<div className="mt-5 space-y-2">{active.analysis.quality.issues.map((issue,i)=><p key={i} className="border-l border-border px-3 text-xs text-muted-foreground">{issue.message}</p>)}</div>}</TabsContent>
            </Tabs>
          </>}
        </section>
      </div>}
    </main>
    {(pasteOpen||urlOpen)&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-xl border border-border bg-card p-5"><div className="flex items-center"><h2 className="text-base font-extralight">{pasteOpen?"paste a table":"read a public file"}</h2><Button className="ml-auto" variant="ghost" size="icon" onClick={()=>{setPasteOpen(false);setUrlOpen(false)}} aria-label="close"><X/></Button></div>{pasteOpen?<><textarea value={pasteText} onChange={(e)=>setPasteText(e.target.value)} className="mt-4 min-h-48 w-full resize-y border border-input bg-background p-3 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="date, value&#10;2026-01-01, 42"/><Button className="mt-3 w-full" disabled={!pasteText.trim()} onClick={()=>{void ingest([parsePastedTable(pasteText)]);setPasteOpen(false);setPasteText("")}}><ClipboardPaste/>read pasted data</Button></>:<><Input className="mt-4" value={url} onChange={(e)=>setUrl(e.target.value)} placeholder="https://example.org/data.csv"/><p className="mt-2 text-[10px] leading-4 text-muted-foreground">the browser contacts this address directly. the file is not relayed through asherin. cross-origin restrictions may prevent reading it.</p><Button className="mt-3 w-full" disabled={!url||urlBusy} onClick={()=>void importUrl()}><Globe2/>{urlBusy?"reading…":"read url"}</Button></>}</div></div>}
  </div>;
}