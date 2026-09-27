// eagle.eye — evidence package.
//
// a capture is only useful to a human reviewer if three things travel with it:
// the untouched frame, the annotated reading of it, and an honest statement of
// what the software did and did not establish. this module builds all three.
//
// the language here is deliberate. the engine detects *observable patterns*. it
// does not establish intent, guilt, or identity, and every package says that in
// plain words so nobody downstream can mistake a score for a conclusion.

import type { CaptureContext } from "./context";
import { contextLine } from "./context";
import { FILTER_MODES, filteredCanvas, type FilterMode } from "./filters";
import { proximityBand, type BleLink } from "./cameras";
import type { PatternCategory, ThreatEvent, ThreatTier } from "./engine";


export interface EvidenceVariant {
  key: string;
  label: string;
  note: string;
  dataUrl: string;
  sha256: string;
}

export interface EvidenceRecord {
  recordId: string;
  eventId: string;
  cameraId: string;
  cameraLabel: string;
  trackId: string;
  tier: ThreatTier;
  score: number;
  patterns: PatternCategory[];
  reason: string;
  context: CaptureContext;
  variants: EvidenceVariant[];
  radio: BleLink[];
  reviewState: "unreviewed" | "confirmed" | "dismissed";
  reviewNote: string;
  reviewedAtMs: number | null;
  createdAtMs: number;
}

export const EVIDENCE_DISCLAIMER = [
  "this package records observable movement and posture patterns captured by a camera under the operator's control.",
  "it does not identify people, does not read faces or biometrics, and does not establish intent, wrongdoing, or guilt.",
  "a pattern score is a prompt for a human to look — never a conclusion, and never a substitute for one.",
  "the thermal variant is a luminance mapping of visible light, not an infrared temperature measurement.",
  "bluetooth radios listed in this package were in range of the recording device at capture time. presence in range is not proof that any person in frame is carrying that radio, and any distance figure is a coarse signal-strength estimate, not a measurement.",
  "fields recorded as unavailable or denied were genuinely not obtainable at capture time and were not estimated.",
].join(" ");

/** a printable card of the radios in range at capture time. it is rendered as
 * an image so it travels in the same package, hashes like the frames, and is
 * legible on paper. it prints what the radio said about itself and nothing
 * more — no owner, no attribution, no inference about the person in frame. */
export function renderRadioCanvas(radio: BleLink[], width: number, headerLines: string[]): HTMLCanvasElement {
  const w = Math.max(560, Math.min(1280, Math.round(width)));
  const scale = w / 900;
  const pad = Math.round(28 * scale);
  const line = Math.round(21 * scale);
  const rowLines = 4;
  const rows = Math.max(1, radio.length);
  const h = Math.round(pad * 2 + headerLines.length * line + line * 1.6 + rows * (rowLines * line + line * 0.9));

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "#08080a";
  ctx.fillRect(0, 0, w, h);
  let y = pad + line;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `${Math.round(17 * scale)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillText("bluetooth radios in range at capture", pad, y);
  y += line * 1.4;
  ctx.font = `${Math.round(13 * scale)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (const l of headerLines) { ctx.fillText(l, pad, y); y += line; }
  y += line * 0.5;

  if (radio.length === 0) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("no bluetooth radio was paired or observable from this device at capture time.", pad, y);
    y += line;
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillText("absence here means nothing was observable to a browser — not that no radio was present.", pad, y);
    return c;
  }

  for (const r of radio) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(`• ${r.name}`, pad, y);
    y += line;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText(`  make ${r.manufacturer ?? "not published"} · model ${r.model ?? "not published"} · firmware ${r.firmware ?? "not published"}`, pad, y);
    y += line;
    ctx.fillText(`  battery ${r.batteryPercent !== null ? `${r.batteryPercent}%` : "not published"} · rssi ${r.rssi !== null ? `${r.rssi} dBm` : "not reported"} · ${r.proximityMeters !== null ? `~${r.proximityMeters} m — ${proximityBand(r.proximityMeters)}` : proximityBand(null)}`, pad, y);
    y += line;
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    ctx.fillText(`  ${r.source === "scan" ? "observed from its own broadcast, never connected to" : "operator-picked device"}${r.observation ? ` · ${r.observation}` : ""}${r.fingerprint ? ` · trait hint ${r.fingerprint}` : ""}${r.packets ? ` · ${r.packets} packets` : ""}`, pad, y);
    y += line;
    ctx.fillText(`  handle ${r.id.slice(0, 24)} · last seen ${new Date(r.lastSeenMs).toISOString()} · presence only, not attribution`, pad, y);
    y += line * 1.9;
  }
  return c;
}


export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  if (!globalThis.crypto?.subtle) return "unavailable-no-subtlecrypto";
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** burn a legible provenance strip across the bottom of a frame copy. */
export function stampCanvas(src: HTMLCanvasElement, lines: string[]): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.drawImage(src, 0, 0);
  const pad = Math.max(8, Math.round(src.width * 0.008));
  const size = Math.max(11, Math.round(src.width * 0.014));
  ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const height = lines.length * (size + 4) + pad * 2;
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(0, out.height - height, out.width, height);
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  lines.forEach((l, i) => ctx.fillText(l, pad, out.height - height + pad + size + i * (size + 4)));
  return out;
}

export interface BuildEvidenceInput {
  event: ThreatEvent;
  frame: HTMLCanvasElement;
  annotatedDataUrl?: string;
  context: CaptureContext;
  cameraLabel: string;
  filters?: FilterMode[];
  radio?: BleLink[];
}

export async function buildEvidence(input: BuildEvidenceInput): Promise<EvidenceRecord> {
  const { event, frame, context, cameraLabel } = input;
  const filters = input.filters ?? ["colorized", "thermal", "spectral", "lowlight", "edge"];
  const radio = input.radio ?? [];
  const radioLine = radio.length
    ? `radios in range: ${radio.map((r) => `${r.name}${r.manufacturer ? ` (${r.manufacturer})` : ""}${r.rssi !== null ? ` ${r.rssi}dBm` : ""}`).join(" · ")} — presence only, not attribution`
    : "radios in range: none observable to this device at capture";
  const stampLines = [
    `eagle.eye · ${cameraLabel} · event ${event.eventId} · track ${event.trackId}`,
    contextLine(context),
    `pattern tier ${event.threatTier} score ${event.threatScore} · observable patterns only, not an identification or a finding of intent`,
    radioLine,
  ];

  const variants: EvidenceVariant[] = [];
  const push = async (key: string, label: string, note: string, canvas: HTMLCanvasElement) => {
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    variants.push({ key, label, note, dataUrl, sha256: await sha256Hex(dataUrl) });
  };

  await push("clean", "clean frame", "unmodified captured frame, no overlay", frame);
  await push("clean-stamped", "clean frame, stamped", "same pixels with the provenance strip burned in", stampCanvas(frame, stampLines));

  if (input.annotatedDataUrl) {
    variants.push({
      key: "annotated",
      label: "annotated frame",
      note: "bounding box, track id, tier and triggered patterns drawn over the captured frame; the radios in range are printed in the provenance strip and in the radio card",
      dataUrl: input.annotatedDataUrl,
      sha256: await sha256Hex(input.annotatedDataUrl),
    });
  }

  for (const mode of filters) {
    const meta = FILTER_MODES.find((m) => m.id === mode);
    await push(mode, meta?.label ?? mode, meta?.note ?? "", stampCanvas(filteredCanvas(frame, mode), stampLines));
  }

  await push(
    "radio",
    "bluetooth radios in range",
    "every bluetooth radio this device could observe at capture time, with whatever the radio published about itself. presence in range is not proof that a person in frame is carrying it.",
    renderRadioCanvas(radio, frame.width, [
      `${cameraLabel} · event ${event.eventId}`,
      contextLine(context),
    ]),
  );

  return {
    recordId: `evd_${event.eventId}`,
    eventId: event.eventId,
    cameraId: event.cameraId,
    cameraLabel,
    trackId: event.trackId,
    tier: event.threatTier,
    score: event.threatScore,
    patterns: event.patternsTriggered,
    reason: event.naturalLanguageReason,
    context,
    variants,
    radio,
    reviewState: "unreviewed",
    reviewNote: "",
    reviewedAtMs: null,
    createdAtMs: Date.now(),
  };
}


export function manifestFor(record: EvidenceRecord) {
  return {
    schema: "asherin.eagle.eye/evidence-manifest@1",
    recordId: record.recordId,
    eventId: record.eventId,
    generatedAtUtc: new Date(record.createdAtMs).toISOString(),
    camera: { id: record.cameraId, label: record.cameraLabel },
    subjectTrackId: record.trackId,
    subjectIdentity: "not established — this system performs no identification",
    observedPatterns: record.patterns,
    patternTier: record.tier,
    patternScore: record.score,
    machineReading: record.reason,
    capture: {
      utc: record.context.isoUtc,
      local: record.context.isoLocal,
      timezone: record.context.timezone,
      utcOffsetMinutes: record.context.utcOffsetMinutes,
      coordinates: record.context.coords,
      coordinatesStatus: record.context.coordsStatus,
      coordinatesSource: record.context.coordsSource,
      ipAddress: record.context.ipAddress,
      ipStatus: record.context.ipStatus,
      ipSource: record.context.ipSource,
    },
    radioContacts: {
      observationBasis: "web bluetooth on the recording device — broadcast advertisements observed passively, plus any device the operator explicitly picked. no device was connected to in order to be listed.",
      identifierCaveat: "a bluetooth handle is session-scoped and modern phones rotate their address roughly every fifteen minutes, so an id links packets within a session and nothing beyond it. the trait hint is a similarity heuristic, never an identity claim.",
      attribution: "none. a radio observed in range is not evidence that any person in frame owns or carries it.",
      distanceBasis: "coarse log-distance estimate from signal strength; attenuation by bodies, bags and walls changes it by metres.",
      devices: (record.radio ?? []).map((r) => ({
        handle: r.id,
        name: r.name,
        manufacturer: r.manufacturer,
        model: r.model,
        firmware: r.firmware,
        serial: r.serial,
        batteryPercent: r.batteryPercent,
        rssiDbm: r.rssi,
        txPowerDbm: r.txPower,
        estimatedMeters: r.proximityMeters,
        proximityBand: proximityBand(r.proximityMeters),
        source: r.source ?? "paired",
        signalObservation: r.observation ?? null,
        traitHint: r.fingerprint ?? null,
        advertisementPackets: r.packets ?? null,
        gattServices: r.services,
        firstSeenUtc: new Date(r.firstSeenMs).toISOString(),
        lastSeenUtc: new Date(r.lastSeenMs).toISOString(),
      })),
    },
    files: record.variants.map((v) => ({ file: `${v.key}.jpg`, label: v.label, note: v.note, sha256: v.sha256 })),

    humanReview: {
      state: record.reviewState,
      note: record.reviewNote,
      reviewedAtUtc: record.reviewedAtMs ? new Date(record.reviewedAtMs).toISOString() : null,
    },
    limitations: EVIDENCE_DISCLAIMER,
  };
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.split(",")[1] ?? "");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** a zip containing every variant, the manifest, and a printable pdf report. */
export async function exportEvidenceZip(records: EvidenceRecord[]): Promise<Blob> {
  const [{ default: JSZip }, { jsPDF }] = await Promise.all([import("jszip"), import("jspdf")]);
  const zip = new JSZip();
  const index: unknown[] = [];

  for (const record of records) {
    const folder = zip.folder(record.recordId)!;
    for (const v of record.variants) folder.file(`${v.key}.jpg`, dataUrlToBytes(v.dataUrl));
    const manifest = manifestFor(record);
    folder.file("manifest.json", JSON.stringify(manifest, null, 2));
    folder.file("report.pdf", await buildReportPdf(record, jsPDF));
    index.push(manifest);
  }

  zip.file("index.json", JSON.stringify({ schema: "asherin.eagle.eye/evidence-index@1", exportedAtUtc: new Date().toISOString(), records: index }, null, 2));
  zip.file("READ-ME-FIRST.txt", `${EVIDENCE_DISCLAIMER}\n\neach folder holds one recorded event: the clean frame, a stamped copy, the annotated reading, palette renderings, a card of the bluetooth radios in range, a manifest with sha-256 hashes of every image, and a printable report.\nverify an image by hashing the exact file bytes and comparing with the manifest entry.\n`);
  return await zip.generateAsync({ type: "blob" });
}

type JsPdfCtor = typeof import("jspdf")["jsPDF"];

export async function buildReportPdf(record: EvidenceRecord, Ctor: JsPdfCtor): Promise<ArrayBuffer> {
  const doc = new Ctor({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  let y = M;

  doc.setFont("helvetica", "bold").setFontSize(15);
  doc.text("eagle.eye — observed pattern report", M, y);
  y += 20;
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(doc.splitTextToSize(EVIDENCE_DISCLAIMER, W - M * 2), M, y);
  y += 46;

  const rows: Array<[string, string]> = [
    ["record", record.recordId],
    ["event", record.eventId],
    ["camera", `${record.cameraLabel} (${record.cameraId})`],
    ["track id", `${record.trackId} — an anonymous per-session label, not an identity`],
    ["captured (utc)", record.context.isoUtc],
    ["captured (local)", `${record.context.isoLocal} · ${record.context.timezone}`],
    ["coordinates", record.context.coords ? `${record.context.coords.lat.toFixed(6)}, ${record.context.coords.lng.toFixed(6)}${record.context.coords.accuracyM ? ` ±${Math.round(record.context.coords.accuracyM)}m` : ""}` : `${record.context.coordsStatus} — ${record.context.coordsSource}`],
    ["network address", record.context.ipAddress ? `${record.context.ipAddress} (via ${record.context.ipSource})` : `unavailable — ${record.context.ipSource}`],
    ["pattern tier", `${record.tier} · score ${record.score}`],
    ["patterns observed", record.patterns.join(", ") || "none recorded"],
    ["machine reading", record.reason],
    ["radios in range", (record.radio ?? []).length
      ? (record.radio ?? []).map((r) => `${r.name}${r.manufacturer ? ` / ${r.manufacturer}` : ""}${r.model ? ` ${r.model}` : ""}${r.batteryPercent !== null ? ` · battery ${r.batteryPercent}%` : ""}${r.rssi !== null ? ` · ${r.rssi} dBm (~${r.proximityMeters ?? "?"} m)` : " · range not reported"}${r.observation ? ` · ${r.observation}` : ""}`).join("; ") + " — presence in range only, not attribution to any person in frame"
      : "none observable to the recording device at capture time"],
    ["human review", record.reviewState + (record.reviewNote ? ` — ${record.reviewNote}` : "")],

  ];

  doc.setFontSize(10);
  for (const [k, v] of rows) {
    const wrapped = doc.splitTextToSize(v, W - M * 2 - 120) as string[];
    doc.setFont("helvetica", "bold").text(k, M, y);
    doc.setFont("helvetica", "normal").text(wrapped, M + 120, y);
    y += Math.max(14, wrapped.length * 12) + 2;
    if (y > 700) { doc.addPage(); y = M; }
  }

  for (const v of record.variants) {
    doc.addPage();
    y = M;
    doc.setFont("helvetica", "bold").setFontSize(12).text(v.label, M, y);
    y += 14;
    doc.setFont("helvetica", "normal").setFontSize(8);
    doc.text(doc.splitTextToSize(`${v.note} · sha-256 ${v.sha256}`, W - M * 2), M, y);
    y += 20;
    try {
      const props = doc.getImageProperties(v.dataUrl);
      const w = W - M * 2;
      const h = (props.height / props.width) * w;
      doc.addImage(v.dataUrl, "JPEG", M, y, w, Math.min(h, 640));
    } catch {
      doc.text("image could not be embedded in this report; the original file is in the package.", M, y);
    }
  }

  return doc.output("arraybuffer");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
