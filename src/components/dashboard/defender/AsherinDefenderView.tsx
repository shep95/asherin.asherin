// asherin.defender — the device, not the tab.
//
// NARRATIVE (old → flaw → new)
// The old room was a tab guarding itself. It froze this origin's beacons,
// counted the hid grants this origin had been given, and printed "this is
// unsure" over everything else. The operator did not buy a tab guard. They
// bought a device guard. A web page physically cannot read most of a machine,
// and faking it would be the worst outcome of all: a green screen over a
// compromised device. So defender is one honest measuring surface against one
// register of named protections (PROTECTION_COUNT of them):
//
//   posture  — the register, merged from whatever actually looked.
//   browser  — what this page can genuinely measure and genuinely control.
//
// A protection nothing measured shows `unmeasured`. Never green. The score is
// computed over measured protections only and is labelled as such; coverage
// is the separate number that says how much of the register was measured.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { emitPull } from "@/lib/connect/emitPull";
import {
  BUNKER_NEVER,
  BUNKER_TARGETS,
  RESIDUAL_BLIND_SPOTS,
  applyBunker,
  bunkerBlockedCount,
  pickBluetooth,
  pickHid,
  restoreBunker,
} from "@/lib/defender/signals";
import { readCameraState, setCovertEnforcement, watchCamera, type CameraState } from "@/lib/defender/covertCamera";
import { probeBrowser } from "@/lib/defender/browserProbe";
import {
  buildPosture,
  exportEvidence,
  groupPosture,
  scorePosture,
  triage,
  type Finding,
  type FindingState,
  type PostureRow,
} from "@/lib/defender/posture";
import { CATEGORY_LABEL, CATEGORY_ORDER, PROTECTION_COUNT } from "@/lib/defender/protections";

const STATE_DOT: Record<FindingState, string> = {
  pass: "bg-emerald-400/70",
  warn: "bg-amber-300/70",
  fail: "bg-red-400/80",
  unmeasured: "bg-foreground/20",
};

type Tab = "posture" | "browser";

const AsherinDefenderView = () => {
  const [tab, setTab] = useState<Tab>("posture");
  const [browserFindings, setBrowserFindings] = useState<Finding[]>([]);
  const [scanning, setScanning] = useState(true);
  const [scanFailed, setScanFailed] = useState(false);
  const [camera, setCamera] = useState<CameraState>(() => readCameraState());
  const [bunker, setBunker] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [only, setOnly] = useState<"all" | "attention">("attention");

  const scan = useCallback(async () => {
    setScanning(true);
    setScanFailed(false);
    const started = performance.now();
    try {
      const next = await probeBrowser();
      setBrowserFindings(next);
      void emitPull({
        organ: "defender",
        capability: "device-scan",
        fromSurface: "asherin-defender",
        status: "ok",
        latencyMs: Math.round(performance.now() - started),
        quote: `${next.length} browser readings · ${next.filter((f) => f.state === "fail").length} failing`,
      });
    } catch {
      setScanFailed(true);
      void emitPull({ organ: "defender", capability: "device-scan", fromSurface: "asherin-defender", status: "fail", quote: "scan refused" });
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => watchCamera(setCamera), []);

  // the bunker is applied only when it is on AND not rehearsing. covert-camera
  // enforcement follows the same switch, so "dry-run" really applies nothing.
  const armed = bunker && !dryRun;
  useEffect(() => {
    setCovertEnforcement(armed);
    if (armed) applyBunker();
    else restoreBunker();
  }, [armed]);

  const rows = useMemo(() => buildPosture(browserFindings), [browserFindings]);
  const score = useMemo(() => scorePosture(rows), [rows]);
  const grouped = useMemo(() => groupPosture(rows), [rows]);
  const attention = useMemo(() => triage(rows).filter((r) => r.finding.state === "fail" || r.finding.state === "warn"), [rows]);
  const firstScan = scanning && browserFindings.length === 0;

  const exportNow = useCallback(() => {
    const blob = new Blob([exportEvidence(rows, { surface: "browser", bunker: armed ? "applied" : bunker ? "dry-run" : "off" })], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `asherin-defender-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, armed, bunker]);

  const toggleBunker = useCallback(() => {
    const next = !bunker;
    setBunker(next);
    void emitPull({
      organ: "defender",
      capability: next ? "bunker-on" : "bunker-off",
      fromSurface: "asherin-defender",
      status: "ok",
      quote: next ? `${dryRun ? "dry-run" : "apply"} · blocked ${bunkerBlockedCount()}` : "restore",
    });
  }, [bunker, dryRun]);

  // first scan on mount; the bunker switch changes what the probe reads, so every change rescans.
  useEffect(() => {
    void scan();
  }, [armed, scan]);

  const grantBluetooth = useCallback(async () => {
    try {
      const d = await pickBluetooth();
      setNote(d ? `bluetooth device granted to this origin · ${d.name || d.id.slice(0, 8)}` : "web bluetooth is not exposed in this browser, so nothing could be granted.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setNote(/cancel|abort/i.test(msg) ? "no device was chosen." : `the bluetooth picker refused: ${msg.slice(0, 80).toLowerCase()}`);
    }
    void scan();
  }, [scan]);

  const grantHid = useCallback(async () => {
    try {
      const n = await pickHid();
      setNote(n ? `${n} hid device${n > 1 ? "s" : ""} granted to this origin` : "no hid device was granted.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setNote(/cancel|abort/i.test(msg) ? "no device was chosen." : `the hid picker refused: ${msg.slice(0, 80).toLowerCase()}`);
    }
    void scan();
  }, [scan]);

  const row = (r: PostureRow) => (
    <li key={r.id} className="flex gap-2.5 py-1.5">
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${STATE_DOT[r.finding.state]}`} />
      <div className="min-w-0">
        <p className="text-sm font-extralight leading-relaxed text-foreground/85">
          {r.title} — {r.finding.observed}
          <span className="ml-1 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/35">
            {r.finding.source === "none" ? "no reading" : r.finding.state === "unmeasured" ? "browser · no reading" : r.finding.source}
          </span>
        </p>
        {r.finding.action && (
          <p className="mt-0.5 text-[11px] font-extralight text-muted-foreground/75">— {r.finding.action}</p>
        )}
        {r.finding.state === "unmeasured" && (
          <p className="mt-0.5 text-[11px] font-extralight text-muted-foreground/55">— why it matters: {r.why}</p>
        )}
      </div>
    </li>
  );

  const headline = firstScan
    ? "measuring what this browser can see."
    : scanFailed && browserFindings.length === 0
      ? "the browser refused the scan, so nothing here is measured."
      : score.fail
        ? `${score.fail} protection${score.fail > 1 ? "s" : ""} failing.`
        : score.coverage < 30
          ? "this device is mostly unmeasured."
          : "nothing measured is failing right now.";

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
        {/* HEADER — posture in one glance. */}
        <section className="rounded-3xl border border-foreground/12 bg-foreground/[0.03] p-5 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/40">◈ asherin.defender</p>
              <h2 className="mt-1 text-2xl font-extralight tracking-wide text-foreground">{headline}</h2>
              <p className="mt-1 text-sm font-extralight leading-relaxed text-muted-foreground">
                {PROTECTION_COUNT} named protections. {score.measured} of them have a reading from this browser ({score.coverage}%)
                {score.unmeasured ? ` — the other ${score.unmeasured} are outside what a browser tab can read, and stay unmeasured rather than green.` : "."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-4 sm:text-right">
              <div>
                <p className="font-mono text-3xl font-extralight text-foreground">{score.measured ? score.score : "—"}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/40">
                  {score.measured ? `/ 1000 · across the ${score.measured} measured` : "no score without a reading"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                ["failing", score.fail, "bg-red-400/80"],
                ["watch", score.warn, "bg-amber-300/70"],
                ["holding", score.pass, "bg-emerald-400/70"],
                ["unmeasured", score.unmeasured, "bg-foreground/20"],
              ] as const
            ).map(([label, n, dot]) => (
              <span key={label} className="flex items-center gap-2 rounded-full border border-foreground/12 bg-foreground/[0.03] px-3 py-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/55">{label}</span>
                <span className="text-[11px] font-extralight text-muted-foreground">{n}</span>
              </span>
            ))}
            <button
              type="button"
              onClick={() => void scan()}
              disabled={scanning}
              className="flex min-h-[36px] items-center gap-2 rounded-full border border-foreground/12 px-3 text-[11px] font-extralight text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} {scanning ? "measuring" : "rescan browser"}
            </button>
            <button
              type="button"
              onClick={exportNow}
              className="flex min-h-[36px] items-center gap-2 rounded-full border border-foreground/12 px-3 text-[11px] font-extralight text-muted-foreground hover:text-foreground"
            >
              <Download className="h-3 w-3" /> export evidence
            </button>
          </div>
          {scanFailed && (
            <p className="mt-3 text-[11px] font-extralight text-amber-200/80">
              the last scan was refused by the browser. what you see is the previous reading; rescan to try again.
            </p>
          )}
        </section>

        {/* TABS */}
        <div className="mt-5 flex flex-wrap gap-2">
          {(
            [
              ["posture", `posture · ${PROTECTION_COUNT}`],
              ["browser", "this browser"],
            ] as Array<[Tab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={`min-h-[36px] rounded-full border px-4 text-[11px] font-extralight tracking-wide transition-colors ${
                tab === id
                  ? "border-foreground/25 bg-foreground/[0.08] text-foreground"
                  : "border-foreground/12 text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {note && <p className="mt-3 text-[11px] font-extralight text-muted-foreground/80">{note}</p>}

        {/* POSTURE */}
        {tab === "posture" && (
          <section className="mt-5 space-y-4">
            <div className="flex flex-wrap gap-2">
              {(["attention", "all"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setOnly(k)}
                  aria-pressed={only === k}
                  className={`min-h-[32px] rounded-full border px-3 text-[11px] font-extralight ${
                    only === k ? "border-foreground/25 bg-foreground/[0.06] text-foreground" : "border-foreground/12 text-muted-foreground"
                  }`}
                >
                  {k === "attention" ? `needs attention · ${attention.length}` : `full register · ${rows.length}`}
                </button>
              ))}
            </div>

            {only === "attention" ? (
              <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4">
                {attention.length ? (
                  <ul className="divide-y divide-foreground/5">{attention.map(row)}</ul>
                ) : (
                  <p className="text-sm font-extralight text-muted-foreground">
                    {firstScan
                      ? "measuring — the first reading takes a few seconds."
                      : `nothing measured is failing or on watch. ${score.unmeasured} protections are still unmeasured — that is a gap, not a pass.`}
                  </p>
                )}
              </div>
            ) : (
              CATEGORY_ORDER.map((cat) => {
                const list = grouped.get(cat) ?? [];
                if (!list.length) return null;
                const measured = list.filter((r) => r.finding.state !== "unmeasured").length;
                return (
                  <div key={cat} className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/40">{CATEGORY_LABEL[cat]}</p>
                      <p className="font-mono text-[10px] text-foreground/30">
                        {measured}/{list.length} measured
                      </p>
                    </div>
                    <ul className="mt-2 divide-y divide-foreground/5">{triage(list).map(row)}</ul>
                  </div>
                );
              })
            )}
          </section>
        )}

        {/* BROWSER */}
        {tab === "browser" && (
          <section className="mt-5 space-y-4">
            <div className="rounded-3xl border border-foreground/12 bg-foreground/[0.03] p-5">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/40">◈ bunker</p>
                  <h3 className="mt-1 text-lg font-extralight tracking-wide text-foreground">
                    {armed
                      ? "tracker beacons are frozen on this origin."
                      : bunker
                        ? "bunker is rehearsing — nothing is frozen yet."
                        : "tracker beacons are not frozen on this origin."}
                  </h3>
                  <p className="mt-1 text-sm font-extralight leading-relaxed text-muted-foreground">
                    freezes {BUNKER_TARGETS.join(", ")}. {BUNKER_NEVER.join(" and ")} are never frozen. asherin itself sends no
                    beacons, so on a clean page this blocks nothing — it is there for what an extension or an injected script
                    tries. this control reaches this page only; other tabs, other browsers and other apps are outside its reach.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleBunker}
                  aria-pressed={bunker}
                  className={`flex min-h-[56px] min-w-[168px] items-center justify-center gap-2 rounded-full border px-6 text-sm font-light tracking-wide transition-colors ${
                    bunker
                      ? "border-amber-300/40 bg-amber-300/10 text-amber-100"
                      : "border-foreground/20 bg-foreground/[0.05] text-foreground/80 hover:bg-foreground/[0.09]"
                  }`}
                >
                  {bunker ? <ShieldCheck className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
                  {bunker ? "bunker on" : "bunker off"}
                </button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDryRun((v) => !v)}
                  aria-pressed={!dryRun}
                  className="min-h-[36px] rounded-full border border-foreground/12 px-3 text-[11px] font-extralight text-muted-foreground hover:text-foreground"
                >
                  {dryRun ? "dry-run — nothing is applied" : "apply — explicit, this page only"}
                </button>
                {armed && (
                  <span className="text-[11px] font-extralight text-muted-foreground/70">
                    {bunkerBlockedCount()} request{bunkerBlockedCount() === 1 ? "" : "s"} frozen this session · covert camera use in this page is stopped on sight.
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-foreground/12 bg-foreground/[0.02] p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/40">◈ grant a device to measure it</p>
              <p className="mt-2 text-sm font-extralight leading-relaxed text-muted-foreground">
                a tab only sees the bluetooth and hid devices this origin has been granted. granting one here is what lets the
                paired-inventory and duplicate-keyboard checks read something real. the grant stays in the browser's site
                settings, not in asherin.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void grantBluetooth()}
                  className="min-h-[36px] rounded-full border border-foreground/20 px-3 text-[11px] font-extralight text-foreground/80 hover:bg-foreground/[0.06]"
                >
                  grant a bluetooth device
                </button>
                <button
                  type="button"
                  onClick={() => void grantHid()}
                  className="min-h-[36px] rounded-full border border-foreground/20 px-3 text-[11px] font-extralight text-foreground/80 hover:bg-foreground/[0.06]"
                >
                  grant a hid device
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-foreground/12 bg-foreground/[0.02] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/40">◈ covert-camera law</p>
                  <p className="mt-2 text-sm font-extralight text-foreground/85">{camera.detail}</p>
                  <p className="mt-1 text-[11px] font-extralight text-muted-foreground/70">
                    {armed
                      ? "enforcing: a track this page opens with no visible preview is stopped."
                      : "watching only: turn bunker on and set it to apply to stop covert tracks in this page."}
                  </p>
                </div>
                {camera.verdict === "covert-blocked" && (
                  <span className="shrink-0 rounded-full border border-red-400/40 bg-red-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-red-200">
                    covert
                  </span>
                )}
              </div>
              <ul className="mt-3 space-y-1">
                {camera.uncovered.map((u) => (
                  <li key={u} className="text-[11px] font-extralight text-muted-foreground/70">
                    — not covered: {u}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/40">
                measured in this page · {score.measured}
              </p>
              <ul className="mt-2 divide-y divide-foreground/5">
                {triage(rows.filter((r) => r.finding.source === "browser")).map(row)}
              </ul>
            </div>

            <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/40">
                ◈ a browser tab can never see this
              </p>
              <ul className="mt-2 space-y-1">
                {RESIDUAL_BLIND_SPOTS.map((b) => (
                  <li key={b} className="text-[11px] font-extralight text-muted-foreground/70">
                    — {b}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] font-extralight text-muted-foreground/60">
                counter-measures run in this page, default to dry-run, and never reach another person's machine.
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default AsherinDefenderView;
