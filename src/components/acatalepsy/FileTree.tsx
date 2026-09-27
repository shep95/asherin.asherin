import { ChevronDown, Download, Eye, File, Folder, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LocalDataset } from "@/lib/acatalepsy/engine";

const ext = (name: string) => name.split(".").pop()?.toLowerCase() ?? "file";

export function FileTree({ datasets, activeId, onSelect, onRemove, onDownload }: { datasets: LocalDataset[]; activeId?: string; onSelect: (id:string)=>void; onRemove:(id:string)=>void; onDownload:(id:string)=>void }) {
  const grouped = datasets.reduce<Record<string, LocalDataset[]>>((acc, dataset) => {
    const key = ext(dataset.file.name);
    (acc[key] ??= []).push(dataset);
    return acc;
  }, {});
  const groups = Object.entries(grouped);
  return <div className="space-y-4" aria-label="local file tree">
    {groups.map(([group, items]) => <section key={group}>
      <div className="mb-1 flex items-center gap-2 px-2 text-[10px] uppercase text-muted-foreground"><ChevronDown className="size-3"/><Folder className="size-3"/>{group}<span className="ml-auto">{items?.length ?? 0}</span></div>
      <div className="space-y-1">{items?.map((item) => <div key={item.id} className={`group flex items-center gap-2 border px-2 py-2 ${activeId===item.id?"border-signal-live/40 bg-signal-live/10":"border-transparent hover:border-border/50 hover:bg-muted/40"}`}>
        <File className="size-3 shrink-0 text-muted-foreground"/><button onClick={()=>onSelect(item.id)} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"><span className="block truncate text-xs text-foreground">{item.file.name}</span><span className="block text-[9px] text-muted-foreground">{item.status}{item.status==="reading"?` ${item.progress}%`:""} · {(item.file.size/1024).toFixed(1)} kb</span></button>
        {item.status==="ready"&&<Button variant="ghost" size="icon" className="size-7 opacity-70 md:opacity-0 md:group-hover:opacity-100" onClick={()=>onSelect(item.id)} aria-label={`view ${item.file.name}`}><Eye/></Button>}
        <Button variant="ghost" size="icon" className="size-7 opacity-70 md:opacity-0 md:group-hover:opacity-100" onClick={()=>onDownload(item.id)} aria-label={`download ${item.file.name}`}><Download/></Button>
        <Button variant="ghost" size="icon" className="size-7 opacity-70 md:opacity-0 md:group-hover:opacity-100" onClick={()=>onRemove(item.id)} aria-label={`remove ${item.file.name}`}><Trash2/></Button>
      </div>)}</div>
    </section>)}
  </div>;
}