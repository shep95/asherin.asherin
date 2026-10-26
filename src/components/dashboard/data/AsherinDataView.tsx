// asherin.data — the data room.
//
// the promise: bring data, ask in plain english, get an answer with evidence,
// a visual, and what to watch next — on this device. the flaw in the naive
// build is that the model becomes the whole product: it guesses schema,
// invents totals, and draws a chart because a chart looks finished. so the
// room is ordered against that — the file is parsed and profiled here first,
// quality is shown before a question can be asked, arithmetic is computed
// deterministically on this device (src/lib/data/analyze.ts), and shepherd
// only narrates material it was handed. a chart with nothing behind it is not
// drawn; a url that cannot be reached says so.
//
// this file is the shell: workspace, tabs, and the shared load of sources and
// versions. each tab lives in its own file beside it.

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Bell, Database, FileText, Loader2, Settings2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { createWorkspace, listSources, listWorkspaceVersions, listWorkspaces, updateWorkspace, type Workspace } from "@/lib/data/store";
import { getTheme, themeStyle } from "@/lib/data/theme";
import type { DataSourceRow, DataVersionRow } from "@/lib/data/types";
import { onTableChange } from "@/lib/local/db";
import { T } from "@/lib/data/store";
import DataTab from "./DataTab";
import AskTab from "./AskTab";
import VisualsTab from "./VisualsTab";
import AlertsTab from "./AlertsTab";
import ReportsTab from "./ReportsTab";
import SettingsTab from "./SettingsTab";
import type { Room } from "./room";
import { card, chip, errorText, select } from "./ui";

type Tab = "data" | "ask" | "visuals" | "alerts" | "reports" | "settings";

const TABS: { id: Tab; label: string; icon: typeof Database }[] = [
  { id: "data", label: "data", icon: Database },
  { id: "ask", label: "ask", icon: Sparkles },
  { id: "visuals", label: "visuals", icon: BarChart3 },
  { id: "alerts", label: "alerts", icon: Bell },
  { id: "reports", label: "reports", icon: FileText },
  { id: "settings", label: "settings", icon: Settings2 },
];

const LAST_WORKSPACE_KEY = "azplen:last-workspace";

export default function AsherinDataView() {
  const [tab, setTab] = useState<Tab>("data");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [sources, setSources] = useState<DataSourceRow[]>([]);
  const [versions, setVersions] = useState<Record<string, DataVersionRow[]>>({});
  const [selectedSource, setSelectedSource] = useState<string>("");
  const [opening, setOpening] = useState(true);
  const [openError, setOpenError] = useState<string | null>(null);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState("");

  const workspace = useMemo(() => workspaces.find((w) => w.id === workspaceId) ?? null, [workspaces, workspaceId]);
  const themeId = (workspace?.theme as { id?: string } | null)?.id ?? "asherin";

  /* ── open ── */
  const open = useCallback(async () => {
    setOpening(true);
    setOpenError(null);
    try {
      let ws = await listWorkspaces();
      if (!ws.length) ws = [await createWorkspace("my workspace")];
      setWorkspaces(ws);
      let remembered: string | null = null;
      try { remembered = localStorage.getItem(LAST_WORKSPACE_KEY); } catch { /* storage may be blocked */ }
      setWorkspaceId((prev) => (ws.some((w) => w.id === prev) ? prev : ws.find((w) => w.id === remembered)?.id ?? ws[0].id));
    } catch (e) {
      setOpenError(errorText(e, "the workspace could not be opened"));
    } finally {
      setOpening(false);
    }
  }, []);
  useEffect(() => { void open(); }, [open]);

  useEffect(() => {
    if (!workspaceId) return;
    try { localStorage.setItem(LAST_WORKSPACE_KEY, workspaceId); } catch { /* fine */ }
  }, [workspaceId]);

  /* ── sources and versions ── */
  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const [rows, map] = await Promise.all([listSources(workspaceId), listWorkspaceVersions(workspaceId)]);
      setSources(rows);
      setVersions(map);
      setSourcesError(null);
      setSelectedSource((prev) => (rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? ""));
    } catch (e) {
      setSourcesError(errorText(e, "the sources could not be read"));
    }
  }, [workspaceId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // another tab of this browser may store or remove a version; follow the table
  useEffect(() => {
    const off1 = onTableChange(T.sources, () => void refresh());
    const off2 = onTableChange(T.versions, () => void refresh());
    return () => { off1(); off2(); };
  }, [refresh]);

  const patchWorkspace = useCallback((patch: Partial<Workspace>) => {
    setWorkspaces((p) => p.map((w) => (w.id === workspaceId ? { ...w, ...patch } : w)));
  }, [workspaceId]);

  const setTheme = useCallback(async (id: string) => {
    patchWorkspace({ theme: { id } });
    try { await updateWorkspace(workspaceId, { theme: { id } }); }
    catch (e) { toast.error("theme not saved", { description: errorText(e, "the theme could not be saved") }); }
  }, [workspaceId, patchWorkspace]);

  const addWorkspace = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const ws = await createWorkspace(name);
      setWorkspaces((p) => [...p, ws]);
      setWorkspaceId(ws.id);
      setNaming(false);
      setNewName("");
      setTab("data");
    } catch (e) {
      toast.error("workspace not created", { description: errorText(e, "the workspace could not be created") });
    }
  };

  /* ── render ── */
  if (opening) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-white/50" role="status">
        <Loader2 className="h-4 w-4 animate-spin" /> opening asherin.data…
      </div>
    );
  }

  if (openError || !workspace) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className={`${card} max-w-sm p-5 text-xs text-white/70`} role="alert">
          <p>{openError ?? "no workspace could be opened on this device."}</p>
          <button type="button" className={`${chip} mt-3`} onClick={() => void open()}>try again</button>
        </div>
      </div>
    );
  }

  const room: Room = { workspace, sources, versions, selectedSource, setSelectedSource, refresh, patchWorkspace };

  return (
    <div className="flex h-full flex-col text-white/85" style={themeStyle(getTheme(themeId))}>
      {/* tabs + workspace: the shell above already carries the room name */}
      <nav className="flex items-center gap-1 overflow-x-auto border-b border-white/8 px-3 py-2 sm:px-5" role="tablist" aria-label="asherin.data sections">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs transition ${
              tab === id ? "border border-white/18 bg-white/[0.07] text-white/90" : "border border-transparent text-white/50 hover:text-white/80"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
        <div className="ml-auto flex shrink-0 items-center gap-2 pl-3">
          {naming ? (
            <>
              <input
                className="w-36 rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-[11px] text-white/85 outline-none focus:border-white/30"
                placeholder="workspace name"
                value={newName}
                maxLength={120}
                autoFocus
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void addWorkspace(); if (e.key === "Escape") { setNaming(false); setNewName(""); } }}
                aria-label="new workspace name"
              />
              <button type="button" className={chip} onClick={() => void addWorkspace()} disabled={!newName.trim()}>create</button>
              <button type="button" className={chip} onClick={() => { setNaming(false); setNewName(""); }}>cancel</button>
            </>
          ) : (
            <>
              <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className={select} aria-label="workspace">
                {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <button type="button" className={chip} onClick={() => setNaming(true)}>new workspace</button>
            </>
          )}
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {sourcesError && (
          <div className={`${card} mb-4 flex flex-wrap items-center gap-3 p-4 text-xs text-rose-200/80`} role="alert">
            {sourcesError}
            <button type="button" className={chip} onClick={() => void refresh()}>try again</button>
          </div>
        )}
        {tab === "data" && <DataTab room={room} />}
        {tab === "ask" && <AskTab room={room} />}
        {tab === "visuals" && <VisualsTab room={room} themeId={themeId} onThemeChange={(id) => void setTheme(id)} />}
        {tab === "alerts" && <AlertsTab room={room} />}
        {tab === "reports" && <ReportsTab room={room} />}
        {tab === "settings" && <SettingsTab room={room} themeId={themeId} onThemeChange={(id) => void setTheme(id)} />}
      </div>
    </div>
  );
}
