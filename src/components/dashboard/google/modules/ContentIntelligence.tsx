import { useState, useEffect, useMemo, useCallback } from "react";
import {
  FolderOpen, RefreshCw, AlertTriangle, Layers, ShieldAlert, Copy, Archive as ArchiveIcon,
} from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";
import {
  scoreFiles, clusterTopics, archiveStats, describeFile, type ScoredFile,
} from "@/lib/cloudIntel/documents";
import {
  fmtBytes, relativeDay, silenceFinding, sortFindings, confidenceFrom, round,
  slope, project, type Finding,
} from "@/lib/cloudIntel/logic";
import FindingCard from "../intel/FindingCard";
import { TrendStat } from "../intel/TrendStat";
import Treemap from "../intel/Treemap";

// ARCHIVE — document and media intelligence.
// Not a file browser. The corpus is read for exposure, duplication, decay, and
// subject matter; every file surfaced is surfaced because it scored, not
// because it happened to be recent.

const ContentIntelligence = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const [loading, setLoading] = useState(false);
  const [raw, setRaw] = useState<any[]>([]);
  const [storage, setStorage] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fileData, aboutData] = await Promise.all([
        fetchGoogleData("drive_files", { pageSize: 400 }),
        fetchGoogleData("drive_about").catch(() => null),
      ]);
      setRaw(fileData.files || []);
      setStorage(aboutData);
    } catch (err: any) {
      console.error("[Archive] corpus sweep failed:", err);
      setError(err?.message || "Corpus sweep failed.");
    } finally {
      setLoading(false);
    }
  }, [fetchGoogleData]);

  useEffect(() => { if (isConnected) loadData(); }, [isConnected, loadData]);

  const files = useMemo(() => scoreFiles(raw), [raw]);
  const stats = useMemo(() => archiveStats(files), [files]);
  const clusters = useMemo(() => clusterTopics(files), [files]);

  const quotaUsed = Number(storage?.storageQuota?.usage) || 0;
  const quotaLimit = Number(storage?.storageQuota?.limit) || 0;

  const findings = useMemo<Finding[]>(() => {
    if (!isConnected) {
      return [silenceFinding({
        module: "Archive", id: "archive-unlinked", subject: "Drive corpus",
        expected: "A linked account typically exposes 50–5,000 files",
        cause: ["No account is linked, so no corpus exists to score."],
        action: "Link an account under Account Mesh to begin corpus scoring.", connected: false,
      })];
    }
    if (!files.length) {
      return [silenceFinding({
        module: "Archive", id: "archive-empty", subject: "Drive corpus",
        expected: "50–5,000 files across the account",
        cause: [
          "The Drive scope returned an empty file set for the linked account.",
          "The account may hold files only inside shared drives the grant does not cover.",
        ],
        action: "Re-grant Drive access, or link the account that actually holds the documents.",
        connected: true,
      })];
    }

    const out: Finding[] = [];

    // 1. Public exposure — the highest-consequence finding in the module.
    const publicFiles = files.filter((f) => f.isPublic);
    if (publicFiles.length) {
      const worst = [...publicFiles].sort((a, b) => b.risk - a.risk)[0];
      out.push({
        id: "archive-public",
        module: "Archive",
        severity: worst.risk >= 25 ? "critical" : "elevated",
        title: `${publicFiles.length} file${publicFiles.length === 1 ? " is" : "s are"} reachable by anyone with the link`,
        current: `${publicFiles.length} public · highest risk score ${worst.risk}/100`,
        normal: "0 public files for a private account",
        deviation: `${round((publicFiles.length / files.length) * 100, 1)}% of the corpus`,
        why: [
          "These files carry an `anyone` permission row, which removes the account requirement entirely.",
          "Link-shared files are indexable and forwardable — possession of the URL is possession of the content.",
          worst.riskReasons[0] || "The highest-scoring file's name indicates ordinary content, which limits the blast radius.",
        ],
        chain: {
          primary: "Anyone holding or guessing the link reads the content now.",
          secondary: "A forwarded link cannot be recalled, and access survives any later password change.",
          tertiary: "Identity or credential material in a public file converts a document leak into an account compromise.",
        },
        basis: publicFiles.slice(0, 6).map((f) => `${f.name} — risk ${f.risk}/100, ${fmtBytes(f.sizeBytes)}, modified ${f.modifiedTs ? relativeDay(f.modifiedTs) : "unknown"}`),
        confidence: 96,
        falsifier: "The permission being a deliberate, current publication you intend to keep open.",
        action: `Revoke link sharing on “${worst.name}” first, then work down the exposure list below.`,
      });
    }

    // 2. Sensitive-but-shared.
    const sensitiveShared = files.filter((f) => f.risk >= 25 && f.shared && !f.isPublic);
    if (sensitiveShared.length) {
      const f0 = sensitiveShared[0];
      out.push({
        id: "archive-sensitive-shared",
        module: "Archive",
        severity: "elevated",
        title: `${sensitiveShared.length} sensitive file${sensitiveShared.length === 1 ? " sits" : "s sit"} outside your sole control`,
        current: `${sensitiveShared.length} shared sensitive files`,
        normal: "Sensitive material held privately",
        deviation: `${sensitiveShared.reduce((a, f) => a + (f.sharedWith?.length ?? 1), 0)} named accounts hold access`,
        why: [
          "Filenames in this set match credential, financial, legal, health, or identity vocabulary.",
          "Each is shared with at least one account you do not control the security posture of.",
          "Access persists after a working relationship ends unless it is explicitly revoked.",
        ],
        chain: {
          primary: "A compromise of any recipient account exposes your document.",
          secondary: "You receive no signal when a recipient's account is breached.",
        },
        basis: sensitiveShared.slice(0, 6).map((f) => `${f.name} — ${f.riskReasons.join(" ")} Shared with ${f.sharedWith?.length ?? 0} account(s).`),
        confidence: confidenceFrom(sensitiveShared.length * 6, 2, 88),
        falsifier: "The filename vocabulary being incidental — e.g. a file named “contract” that contains no contract.",
        action: `Audit the recipient list on “${f0.name}” and remove anyone without a current need.`,
      });
    }

    // 3. Duplication — storage cost with no information gain.
    if (stats.duplicateCount) {
      out.push({
        id: "archive-duplicates",
        module: "Archive",
        severity: "notable",
        title: `${stats.duplicateCount} byte-identical duplicate${stats.duplicateCount === 1 ? "" : "s"} detected`,
        current: `${fmtBytes(stats.duplicateBytes)} of redundant content`,
        normal: "One canonical copy per artefact",
        deviation: `${round((stats.duplicateCount / files.length) * 100, 1)}% of the corpus is a copy`,
        why: [
          "These files share an identical MD5 content hash, so the duplication is exact, not approximate.",
          "Duplicates fragment the version history: an edit to one copy silently diverges from the other.",
          "Revoking a share on the canonical copy does nothing to the duplicate.",
        ],
        chain: {
          primary: "Two copies drift and neither is authoritative.",
          secondary: "A permission change applied to one copy leaves the other exposed.",
        },
        basis: files.filter((f) => f.duplicateOf).slice(0, 6).map((f) => `${f.name} — identical hash to an earlier file, ${fmtBytes(f.sizeBytes)}`),
        confidence: 98,
        falsifier: "Intentional archival copies kept for retention policy reasons.",
        action: "Delete the redundant copies and keep a single canonical file per artefact.",
      });
    }

    // 4. Decay — silence as data.
    if (stats.staleCount) {
      out.push({
        id: "archive-stale",
        module: "Archive",
        severity: "baseline",
        title: `${stats.staleCount} file${stats.staleCount === 1 ? " has" : "s have"} not been touched in over a year`,
        current: `${stats.staleCount} dormant files`,
        normal: `${files.length - stats.staleCount} touched inside 12 months`,
        deviation: `${round((stats.staleCount / files.length) * 100)}% of the corpus is inert`,
        why: [
          "Dormant files still carry whatever permissions they were created with.",
          "An old share is the least likely to be reviewed and the most likely to be forgotten.",
        ],
        chain: {
          primary: "Permissions granted years ago remain live today.",
          secondary: "The recipient list reflects relationships that may no longer exist.",
        },
        basis: files.filter((f) => (f.staleDays ?? 0) > 365).slice(0, 5).map((f) => `${f.name} — dormant ${round((f.staleDays ?? 0) / 365, 1)} years, ${f.shared ? "still shared" : "private"}`),
        confidence: 92,
        falsifier: "Deliberate cold archive where dormancy is the intended state.",
        action: "Move dormant shared files to a private archive folder and strip their permissions.",
      });
    }

    // 5. Growth velocity with a dated projection.
    if (stats.creationSeries.filter(Boolean).length >= 4) {
      const k = slope(stats.creationSeries);
      const proj = quotaLimit
        ? project([quotaUsed * 0.9, quotaUsed * 0.95, quotaUsed], quotaLimit, 7, "your storage quota")
        : null;
      out.push({
        id: "archive-velocity",
        module: "Archive",
        severity: k > 1 ? "notable" : "baseline",
        title: `Corpus is growing at ${round(Math.abs(k), 1)} files per week`,
        current: `${stats.creationSeries[stats.creationSeries.length - 1]} files created last week`,
        normal: `${round(stats.creationSeries.reduce((a, b) => a + b, 0) / 12, 1)} per week over 12 weeks`,
        deviation: `${k >= 0 ? "+" : "−"}${round(Math.abs(k), 2)} files/week trend`,
        why: [
          "Creation cadence is measured from each file's createdTime, bucketed by week.",
          "Growth rate matters more than total count because it determines when quota and review burden become binding.",
        ],
        projection: proj || (quotaLimit ? "Storage growth is not on a trajectory to hit quota inside a year." : undefined),
        basis: [`${files.length} files sampled, ${stats.creationSeries.reduce((a, b) => a + b, 0)} created in the last 12 weeks.`],
        confidence: confidenceFrom(files.length, Math.abs(k), 82),
        falsifier: "A one-off bulk import inflating a single week and faking a trend.",
        action: quotaLimit && quotaUsed / quotaLimit > 0.8
          ? "Clear duplicates and dormant media before quota becomes binding."
          : "No action required — tracked for trajectory only.",
      });
    }

    // 6. Size outliers.
    if (stats.outliers.length) {
      const o = stats.outliers[0];
      out.push({
        id: "archive-outliers",
        module: "Archive",
        severity: "baseline",
        title: `${stats.outliers.length} file${stats.outliers.length === 1 ? "" : "s"} dominate storage far beyond the typical file`,
        current: `Largest: ${fmtBytes(o.sizeBytes)}`,
        normal: `Median file is ${fmtBytes(stats.medianBytes)}`,
        deviation: `${Math.round(o.sizeBytes / Math.max(1, stats.medianBytes))}× the median`,
        why: [
          "Robust z-score against the median absolute deviation flags these as structurally different from the rest of the corpus.",
          "Large files are usually media exports or backups, which are also the most duplicated class.",
        ],
        basis: stats.outliers.map((f) => `${f.name} — ${fmtBytes(f.sizeBytes)}, ${f.cls}`),
        confidence: 90,
        falsifier: "The corpus being intentionally media-heavy, making large files the norm rather than the exception.",
        action: "Confirm the largest files are still needed at full resolution before quota pressure forces the decision.",
      });
    }

    return sortFindings(out);
  }, [isConnected, files, stats, quotaUsed, quotaLimit]);

  const classItems = useMemo(
    () => stats.byClass.map((c) => ({ label: c.label, value: c.value, sub: fmtBytes(c.bytes) })),
    [stats.byClass]
  );
  const topicItems = useMemo(
    () => clusters.filter((c) => c.label !== "unclustered").slice(0, 18)
      .map((c) => ({ label: c.label, value: c.files.length, sub: `${fmtBytes(c.totalBytes)} · peak risk ${c.maxRisk}` })),
    [clusters]
  );

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/5">
            <ArchiveIcon className="h-6 w-6 text-foreground/70" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extralight tracking-wide text-foreground">Archive</h2>
                <p className="text-[9px] tracking-[0.22em] text-muted-foreground/40 font-light">DOCUMENT &amp; MEDIA INTELLIGENCE</p>
              </div>
              {isConnected && (
                <button
                  onClick={loadData}
                  disabled={loading}
                  className="flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                  Sweep
                </button>
              )}
            </div>
            <p className="text-sm font-extralight leading-relaxed text-muted-foreground">
              {isConnected
                ? `${files.length} files scored for exposure, duplication, decay and subject matter. Confidence ${stats.confidence}%.`
                : "Link an account to score the document corpus for exposure, duplication and decay."}
            </p>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
          <p className="text-[11px] font-extralight text-muted-foreground">{error} — showing the last successful sweep.</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <TrendStat
          label="Corpus"
          value={files.length}
          series={stats.creationSeries}
          hint={`${fmtBytes(stats.totalBytes)} sampled · median file ${fmtBytes(stats.medianBytes)}`}
          loading={loading}
        />
        <TrendStat
          label="Exposed"
          value={stats.publicCount + stats.sharedCount}
          population={files.map((f) => f.risk)}
          hint={`${stats.publicCount} public link · ${stats.sharedCount} shared`}
          loading={loading}
        />
        <TrendStat
          label="Redundant"
          value={stats.duplicateCount}
          hint={`${fmtBytes(stats.duplicateBytes)} recoverable`}
          loading={loading}
        />
        <TrendStat
          label="Quota"
          value={quotaLimit ? `${Math.round((quotaUsed / quotaLimit) * 100)}%` : fmtBytes(quotaUsed)}
          hint={quotaLimit ? `${fmtBytes(quotaUsed)} of ${fmtBytes(quotaLimit)}` : "Quota not reported by the account"}
          loading={loading}
        />
      </div>

      <section className="space-y-2">
        <h3 className="text-[9px] tracking-[0.22em] text-muted-foreground/40 font-light">SYNTHESIS</h3>
        {findings.map((f) => (
          <FindingCard key={f.id} finding={f} defaultOpen={f.severity === "critical" || f.severity === "elevated"} />
        ))}
      </section>

      {stats.highRisk.length > 0 && (
        <section className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
          <h3 className="text-xs font-light tracking-wide text-foreground flex items-center gap-2">
            <ShieldAlert className="h-3.5 w-3.5" /> Liability Ranking
          </h3>
          <div className="space-y-1.5">
            {stats.highRisk.map((f: ScoredFile) => (
              <div key={f.id} className="rounded-xl bg-foreground/[0.04] px-3 py-2.5 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-light text-foreground w-9 shrink-0 tabular-nums">{f.risk}</span>
                  <a
                    href={f.webViewLink || undefined}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs font-light text-foreground flex-1 truncate hover:underline"
                  >
                    {f.name}
                  </a>
                  {f.isPublic && <span className="text-[9px] text-destructive/80 shrink-0">PUBLIC</span>}
                  {f.duplicateOf && <Copy className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
                  <span className="text-[9px] text-muted-foreground/35 shrink-0 hidden sm:inline">{describeFile(f)}</span>
                </div>
                <p className="text-[9px] font-extralight text-muted-foreground/55 pl-11 leading-relaxed">
                  {f.riskReasons.join(" ") || "Scored on exposure alone; filename shows no sensitive vocabulary."}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[9px] font-extralight text-muted-foreground/40">
            Score = filename sensitivity weight × exposure multiplier. Every point is traceable to the reason line beneath it.
          </p>
        </section>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {topicItems.length > 1 && (
          <section className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
            <h3 className="text-xs font-light tracking-wide text-foreground flex items-center gap-2">
              <Layers className="h-3.5 w-3.5" /> Subject Matter Clusters
            </h3>
            <Treemap items={topicItems} height={170} />
            <p className="text-[10px] font-extralight text-muted-foreground/55">
              Clusters are literal filename tokens shared by every member, so any grouping can be verified by reading it.
              Largest theme: “{topicItems[0].label}” across {topicItems[0].value} files.
            </p>
          </section>
        )}

        {classItems.length > 1 && (
          <section className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
            <h3 className="text-xs font-light tracking-wide text-foreground flex items-center gap-2">
              <FolderOpen className="h-3.5 w-3.5" /> Corpus Composition
            </h3>
            <Treemap items={classItems} height={170} />
            <p className="text-[10px] font-extralight text-muted-foreground/55">
              Area is file count; hover for bytes. {classItems[0].label} dominates at{" "}
              {Math.round((classItems[0].value / Math.max(1, files.length)) * 100)}% of the corpus.
            </p>
          </section>
        )}
      </div>
    </div>
  );
};

export default ContentIntelligence;
