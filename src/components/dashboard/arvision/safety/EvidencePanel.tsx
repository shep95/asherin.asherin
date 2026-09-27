// asherin.arvision — evidence bundles.
//
// Frames are stored as the camera produced them; overlays are kept beside them
// as data so the drawing can be reproduced or switched off. Storage is stated
// honestly: with no configured backend a bundle lives in this tab and dies with
// it, and the panel says so rather than implying an archive exists.

import { useState } from "react";
import type { EvidenceBundle } from "@/lib/arvision/safety/evidenceCapture";

const EvidencePanel = ({
  bundles,
  storage,
  bufferFrames,
  onDelete,
}: {
  bundles: EvidenceBundle[];
  storage: { configured: boolean; detail: string; retentionMs: number };
  bufferFrames: number;
  onDelete: (id: string) => void;
}) => {
  const [openId, setOpenId] = useState<string | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [showOverlay, setShowOverlay] = useState(true);
  const open = bundles.find((b) => b.id === openId) ?? null;
  const frame = open?.frames[Math.min(frameIndex, open.frames.length - 1)] ?? null;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-light text-white/85">evidence</h2>
          <p className="text-[11px] font-light text-white/40">
            the seconds before a trigger, kept continuously so an alert is never the first frame recorded
          </p>
        </div>
        <span className="text-[10px] font-light text-white/35">{bufferFrames} frames buffered</span>
      </header>

      <p
        className={`rounded-xl border p-3 text-[11px] font-light leading-relaxed ${
          storage.configured
            ? "border-emerald-300/20 bg-emerald-300/[0.05] text-emerald-100/70"
            : "border-amber-200/20 bg-amber-200/[0.05] text-amber-100/70"
        }`}
      >
        {storage.configured ? "storage configured — " : "storage not configured — "}
        {storage.detail}
        {storage.configured && storage.retentionMs > 0 && ` retention ${Math.round(storage.retentionMs / 3600000)}h.`}
      </p>

      {bundles.length === 0 ? (
        <p className="mt-3 text-[11px] font-light text-white/40">no capture has been triggered yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {bundles.map((b) => (
            <li key={b.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12px] font-light text-white/85">
                  {new Date(b.triggerAtMs).toLocaleString()} · {b.frames.length} frames
                </span>
                <span className="text-[10px] text-white/35">{b.storage === "backend" ? "stored" : "session only"}</span>
              </div>
              <p className="mt-1 text-[10px] font-light text-white/30">
                pre-roll {b.preRollMs / 1000}s · post-roll {b.postRollMs / 1000}s
                {b.digest ? ` · sha-256 ${b.digest.slice(0, 16)}…` : " · no digest: this browser exposes no crypto subtle"}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpenId(b.id === openId ? null : b.id);
                    setFrameIndex(0);
                  }}
                  className="rounded-lg border border-white/15 px-2 py-1 text-[10px] font-light text-white/70 hover:border-white/30"
                >
                  {b.id === openId ? "close" : "step frames"}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(b.id)}
                  className="rounded-lg border border-white/15 px-2 py-1 text-[10px] font-light text-white/60 hover:border-rose-300/40"
                >
                  delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && frame && (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/40 p-3">
          <div className="relative overflow-hidden rounded-lg border border-white/10">
            <img src={frame.dataUrl} alt="captured camera frame" className="w-full" />
            {showOverlay && frame.overlay ? (
              <pre className="absolute inset-x-0 bottom-0 max-h-24 overflow-y-auto bg-black/70 p-2 text-[9px] font-light text-white/60">
                {JSON.stringify(frame.overlay, null, 1)}
              </pre>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFrameIndex((i) => Math.max(0, i - 1))}
              className="rounded-lg border border-white/15 px-2 py-1 text-[10px] text-white/70"
            >
              previous
            </button>
            <span className="text-[10px] text-white/40">
              frame {frameIndex + 1} of {open.frames.length} · {new Date(frame.atMs).toLocaleTimeString()} · {frame.sourceId}
            </span>
            <button
              type="button"
              onClick={() => setFrameIndex((i) => Math.min(open.frames.length - 1, i + 1))}
              className="rounded-lg border border-white/15 px-2 py-1 text-[10px] text-white/70"
            >
              next
            </button>
            <button
              type="button"
              onClick={() => setShowOverlay((v) => !v)}
              className="rounded-lg border border-white/15 px-2 py-1 text-[10px] text-white/70"
            >
              {showOverlay ? "hide overlay data" : "show overlay data"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default EvidencePanel;
