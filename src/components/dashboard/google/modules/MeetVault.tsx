// ═══════════════════════════════════════════════════════════════════════════
// MEET VAULT — recovered meeting history with playable recordings
// ---------------------------------------------------------------------------
// Playback never receives a Google token. Each artifact carries a short-lived
// signed handle; the edge function exchanges it for the file bytes server-side
// and proxies them with Range support so scrubbing works.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Video, FileText, Download, RefreshCw, Search, AlertTriangle,
  Play, Users, Clock, ExternalLink,
} from "lucide-react";

interface Artifact {
  id: string;
  kind: "recording" | "transcript" | "chat";
  name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  duration_ms: number | null;
  thumbnail_link: string | null;
  web_view_link: string | null;
  file_created_at: string | null;
  playback: string;
}

interface Session {
  id: string;
  title: string | null;
  meet_link: string | null;
  conference_code: string | null;
  organizer_email: string | null;
  participants: string[] | null;
  started_at: string | null;
  ended_at: string | null;
  source: string;
  artifacts: Artifact[];
}

const FN_BASE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/meet-vault`;

const streamUrl = (token: string, mode: "stream" | "download") =>
  `${FN_BASE}?t=${encodeURIComponent(token)}&mode=${mode}`;

function bytes(n: number | null): string {
  if (!n) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = n, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function duration(ms: number | null): string {
  if (!ms || ms < 1000) return "—";
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}h ${m}m` : `${m}m ${String(s).padStart(2, "0")}s`;
}

function when(iso: string | null): string {
  if (!iso) return "Undated";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "Undated"
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function MeetVault() {
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [unmatched, setUnmatched] = useState<Artifact[]>([]);
  const [needsGrant, setNeedsGrant] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState<Artifact | null>(null);
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);

  const call = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error: fnErr } = await supabase.functions.invoke("meet-vault", { body: payload });
    if (fnErr) throw new Error(fnErr.message);
    if (data?.error) throw new Error(String(data.error));
    return data;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await call({ action: "list", limit: 80 });
      if (!alive.current) return;
      setSessions(data.sessions ?? []);
      setUnmatched(data.unmatched ?? []);
      setNeedsGrant(data.needsGrant ?? []);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "Vault unavailable");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [call]);

  useEffect(() => { void load(); }, [load]);

  const sweep = async () => {
    setSweeping(true);
    try {
      const data = await call({ action: "sweep", days: 730, cap: 250 });
      const totals = (data.reports ?? []).reduce(
        (acc: { s: number; r: number }, r: any) => ({ s: acc.s + r.sessions, r: acc.r + r.recordings }),
        { s: 0, r: 0 },
      );
      toast.success(`${totals.s} meetings indexed · ${totals.r} recordings recovered`);
      for (const r of data.reports ?? []) {
        for (const note of r.notes ?? []) toast.warning(`${r.account}: ${note}`);
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sweep failed");
    } finally {
      if (alive.current) setSweeping(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) =>
      (s.title ?? "").toLowerCase().includes(q) ||
      (s.organizer_email ?? "").toLowerCase().includes(q) ||
      (s.participants ?? []).some((p) => p.toLowerCase().includes(q)) ||
      s.artifacts.some((a) => (a.name ?? "").toLowerCase().includes(q)),
    );
  }, [sessions, query]);

  const totalRecordings = useMemo(
    () => sessions.reduce((n, s) => n + s.artifacts.filter((a) => a.kind === "recording").length, 0)
      + unmatched.filter((a) => a.kind === "recording").length,
    [sessions, unmatched],
  );

  return (
    <div className="space-y-4">
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/25 pb-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-light uppercase tracking-[0.18em] text-foreground">
            <Video className="h-4 w-4 text-muted-foreground" aria-hidden />
            Meet Vault
          </h2>
          <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
            Meeting history reconstructed from calendar records, conference records and the Drive
            recordings folder. {sessions.length} meetings · {totalRecordings} recordings held.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Title, person, file"
              aria-label="Search meetings"
              className="h-8 w-48 pl-7 text-xs"
            />
          </div>
          <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => void sweep()} disabled={sweeping}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${sweeping ? "animate-spin" : ""}`} aria-hidden />
            {sweeping ? "Sweeping" : "Sweep Google"}
          </Button>
        </div>
      </div>

      {/* ── CONSENT GAP ────────────────────────────────────────────────── */}
      {needsGrant.length > 0 && (
        <div className="flex items-start gap-2 rounded border border-border/30 bg-muted/10 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {needsGrant.join(", ")} {needsGrant.length > 1 ? "were" : "was"} connected before file
            access was requested. Reconnect the account from Account Mesh to enable in-app playback
            and downloads — until then recordings are listed but must be opened in Drive.
          </p>
        </div>
      )}

      {/* ── STATES ─────────────────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-2" aria-live="polite">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded" />)}
        </div>
      )}

      {!loading && error && (
        <div className="rounded border border-border/30 px-3 py-4 text-center">
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button size="sm" variant="outline" className="mt-2 h-7 text-[11px]" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && unmatched.length === 0 && (
        <div className="rounded border border-dashed border-border/30 px-3 py-8 text-center">
          <p className="text-xs text-muted-foreground">
            Nothing indexed yet. Run a sweep to pull two years of meetings and recordings.
          </p>
          <Button size="sm" variant="outline" className="mt-3 h-7 text-[11px]" onClick={() => void sweep()} disabled={sweeping}>
            Sweep Google
          </Button>
        </div>
      )}

      {/* ── PLAYER ─────────────────────────────────────────────────────── */}
      {playing && (
        <div className="rounded border border-border/30 bg-muted/5 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="truncate text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {playing.name ?? "Recording"}
            </span>
            <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setPlaying(null)}>
              Close
            </Button>
          </div>
          {playing.kind === "recording" ? (
            <video
              key={playing.id}
              controls
              autoPlay
              preload="metadata"
              className="max-h-[60vh] w-full rounded bg-black"
              src={streamUrl(playing.playback, "stream")}
            />
          ) : (
            <iframe
              key={playing.id}
              title={playing.name ?? "Transcript"}
              className="h-[50vh] w-full rounded border border-border/20 bg-background"
              src={streamUrl(playing.playback, "stream")}
            />
          )}
        </div>
      )}

      {/* ── SESSIONS ───────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {filtered.map((s) => (
          <article key={s.id} className="rounded border border-border/25 bg-muted/5 px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-xs font-light text-foreground">
                  {s.title ?? s.conference_code ?? "Untitled meeting"}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" aria-hidden />{when(s.started_at)}
                  </span>
                  {(s.participants?.length ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" aria-hidden />{s.participants!.length}
                    </span>
                  )}
                  {s.meet_link && (
                    <a
                      href={s.meet_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden />{s.conference_code ?? "Meet link"}
                    </a>
                  )}
                </div>
              </div>
              <span className="shrink-0 rounded border border-border/30 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {s.source}
              </span>
            </div>

            {s.artifacts.length > 0 ? (
              <ul className="mt-2 space-y-1.5 border-t border-border/20 pt-2">
                {s.artifacts.map((a) => (
                  <ArtifactRow key={a.id} artifact={a} onPlay={setPlaying} />
                ))}
              </ul>
            ) : (
              <p className="mt-2 border-t border-border/20 pt-2 text-[11px] text-muted-foreground">
                No recording was stored for this meeting.
              </p>
            )}
          </article>
        ))}
      </div>

      {/* ── ORPHANS ────────────────────────────────────────────────────── */}
      {unmatched.length > 0 && (
        <section className="rounded border border-border/25 px-3 py-3">
          <h3 className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Recordings with no matching calendar entry
          </h3>
          <ul className="mt-2 space-y-1.5">
            {unmatched.map((a) => (
              <ArtifactRow key={a.id} artifact={a} onPlay={setPlaying} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ArtifactRow({
  artifact: a,
  onPlay,
}: { artifact: Artifact; onPlay: (a: Artifact) => void }) {
  const Icon = a.kind === "recording" ? Video : FileText;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate text-[11px] text-foreground">
          {a.name ?? (a.kind === "recording" ? "Recording" : "Transcript")}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {duration(a.duration_ms)} · {bytes(a.size_bytes)}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => onPlay(a)}>
          <Play className="mr-1 h-3 w-3" aria-hidden />
          {a.kind === "recording" ? "Play" : "Read"}
        </Button>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" asChild>
          <a href={streamUrl(a.playback, "download")} download>
            <Download className="mr-1 h-3 w-3" aria-hidden />Save
          </a>
        </Button>
      </div>
    </li>
  );
}
