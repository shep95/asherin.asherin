// asherin.data — standing directions, the visual theme, live urls, and where
// the data lives. there is no account, no plan and no key to generate here.

import { useEffect, useRef, useState } from "react";
import { Plug, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { DATA_THEMES, checkThemeContrast, getTheme } from "@/lib/data/theme";
import { buildDatasetProfile, buildQualityReport } from "@/lib/data/validate";
import { checkLiveUrl, pullLiveUrl } from "@/lib/data/live";
import { ingest, markSyncError, updateWorkspace } from "@/lib/data/store";
import { latestOf, type Room } from "./room";
import { card, chip, errorText, field, fmtWhen } from "./ui";

export default function SettingsTab({ room, themeId, onThemeChange }: { room: Room; themeId: string; onThemeChange: (id: string) => void }) {
  const [instructions, setInstructions] = useState(room.workspace.instructions ?? "");
  const [savingDirections, setSavingDirections] = useState(false);
  useEffect(() => { setInstructions(room.workspace.instructions ?? ""); }, [room.workspace.id, room.workspace.instructions]);

  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [pulling, setPulling] = useState<string | null>(null);
  const [pullError, setPullError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const live = room.sources.filter((s) => s.connector === "url");
  const theme = getTheme(themeId);
  const contrast = checkThemeContrast(theme);

  const pull = async (target: { url: string; sourceId?: string; name?: string }) => {
    const checked = checkLiveUrl(target.url);
    if ("error" in checked) { setPullError(checked.error); return; }
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setPulling(target.sourceId ?? "new");
    setPullError(null);
    try {
      const pulled = await pullLiveUrl(checked.url, ctrl.signal);
      const profile = buildDatasetProfile(pulled.parsed.columns, pulled.parsed.rows);
      const quality = buildQualityReport(pulled.parsed.columns, pulled.parsed.rows, profile.columns);
      const res = await ingest({
        workspace_id: room.workspace.id,
        source_id: target.sourceId,
        source_name: target.name?.trim() || new URL(checked.url).hostname,
        kind: "table",
        file_name: pulled.fileName,
        mime: pulled.mime,
        byte_size: pulled.byteSize,
        columns: pulled.parsed.columns,
        rows: pulled.parsed.rows,
        quality,
        profile,
        note: [`pulled ${fmtWhen(pulled.pulledAt)}`, ...pulled.parsed.warnings].join("; ").slice(0, 500),
        connector: "url",
        config: { url: checked.url },
      });
      toast.success(`version ${res.version} pulled`, { description: `${res.rows_stored.toLocaleString()} rows from ${new URL(checked.url).hostname}` });
      if (!target.sourceId) { setUrl(""); setName(""); }
      await room.refresh();
      room.setSelectedSource(res.source_id);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const m = errorText(e, "the pull failed");
      setPullError(m);
      if (target.sourceId) { await markSyncError(target.sourceId, m).catch(() => undefined); await room.refresh(); }
    } finally {
      if (!ctrl.signal.aborted) setPulling(null);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={`${card} p-5`}>
        <h2 className="mb-2 text-sm text-white/85">standing directions</h2>
        <p className="mb-2 text-[11px] text-white/45">context every answer in this workspace is given — what the data is about, what a good month looks like, what to ignore.</p>
        <textarea
          className={`${field} min-h-[140px]`}
          maxLength={8000}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          aria-label="standing directions"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            className={chip}
            disabled={savingDirections || instructions === (room.workspace.instructions ?? "")}
            onClick={async () => {
              setSavingDirections(true);
              try {
                await updateWorkspace(room.workspace.id, { instructions });
                room.patchWorkspace({ instructions });
                toast.success("directions saved");
              } catch (e) { toast.error("not saved", { description: errorText(e, "the directions could not be saved") }); }
              finally { setSavingDirections(false); }
            }}
          >
            {savingDirections ? "saving…" : "save directions"}
          </button>
          <span className="text-[10px] text-white/35">{instructions.length.toLocaleString()} / 8,000</span>
        </div>
      </section>

      <section className={`${card} p-5`}>
        <h2 className="mb-2 text-sm text-white/85">visual theme</h2>
        <div className="flex flex-wrap gap-2">
          {DATA_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={themeId === t.id}
              onClick={() => onThemeChange(t.id)}
              className={`rounded-xl border px-3 py-2 text-[11px] ${themeId === t.id ? "border-white/25 bg-white/[0.07]" : "border-white/10"}`}
            >
              <span className="text-white/75">{t.label}</span>
              <span className="mt-1 flex gap-1">
                {t.series.slice(0, 6).map((s, i) => <span key={i} className="h-3 w-3 rounded-full" style={{ background: `hsl(${s})` }} />)}
              </span>
            </button>
          ))}
        </div>
        <ul className="mt-3 text-[10px] text-white/40">
          {contrast.filter((c) => !c.passes).map((c) => (
            <li key={c.series} className="text-amber-200/70">series {c.series} sits at {c.ratio}:1 against the background, below the 3:1 legibility floor</li>
          ))}
          {contrast.every((c) => c.passes) && <li>every series clears the 3:1 legibility floor on this background</li>}
        </ul>
      </section>

      <section className={`${card} p-5 lg:col-span-2`}>
        <h2 className="mb-1 flex items-center gap-2 text-sm text-white/85"><Plug className="h-4 w-4 text-white/50" /> live urls</h2>
        <p className="mb-3 text-[11px] text-white/45">
          a public csv, tsv or json url this browser fetches itself — it must allow cross-origin reads (a published google sheet csv link works). each pull stores a new version; pulls happen only when you press pull.
        </p>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_auto]">
          <input className={field} placeholder="https://example.org/data.csv" value={url} onChange={(e) => { setUrl(e.target.value); setPullError(null); }} aria-label="url" inputMode="url" autoComplete="off" />
          <input className={field} placeholder="name (optional)" value={name} onChange={(e) => setName(e.target.value)} aria-label="source name" maxLength={120} />
          <button type="button" className={chip} disabled={pulling !== null || !url.trim()} onClick={() => void pull({ url, name })}>
            {pulling === "new" ? <><RefreshCw className="mr-1 inline h-3 w-3 animate-spin" />pulling…</> : "pull and keep"}
          </button>
        </div>
        {pullError && <p className="mt-2 text-[11px] text-rose-200/70" role="alert">{pullError}</p>}
        {live.length > 0 && (
          <ul className="mt-4 space-y-2">
            {live.map((s) => {
              const v = latestOf(room, s.id);
              const u = String((s.config as { url?: string })?.url ?? "");
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-[11px]">
                  <span className="mr-auto min-w-0 basis-full sm:basis-auto">
                    <span className="block truncate text-white/75">{s.name}</span>
                    <span className="block truncate text-white/35">{u} · {v ? `v${v.version} · ${v.row_count.toLocaleString()} rows · ${fmtWhen(s.last_sync_at)}` : "never pulled"}{s.last_sync_error ? ` · last pull failed: ${s.last_sync_error}` : ""}</span>
                  </span>
                  <button type="button" className={chip} disabled={pulling !== null} onClick={() => void pull({ url: u, sourceId: s.id })}>
                    {pulling === s.id ? <><RefreshCw className="mr-1 inline h-3 w-3 animate-spin" />pulling…</> : "pull again"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={`${card} p-5 lg:col-span-2`}>
        <h2 className="mb-2 text-sm text-white/85">where this lives</h2>
        <p className="text-[11px] leading-relaxed text-white/45">
          every workspace, source, version, row, rule, report and answer in this room sits in this browser's storage on this device. nothing is uploaded. a question sends column names, statistics and up to 20 sample rows to the model provider whose key you saved in settings → ai keys; a report's commentary sends the report text. clearing site data removes everything here.
        </p>
      </section>
    </div>
  );
}
