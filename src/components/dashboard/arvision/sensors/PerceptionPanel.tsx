// asherin.arvision — perception and predictive events.
//
// Two honest boundaries stated in the room. First: detections and tracks come
// from an inference service; when none answers, the panel says the backend is
// unavailable rather than showing an empty scene as if nothing were there.
// Second: prediction here is event based. it watches observable developing
// situations — an object left behind, entry into a restricted zone, a fall, a
// collision, smoke. it does not read intent, character, dangerousness or
// identity off a face, a body or a demographic, and it never will.

import type { ServiceHealth, TrackedObject } from "@/lib/arvision/sensors/types";

interface Props {
  services: ServiceHealth[];
  tracks: TrackedObject[];
}

const EVENT_CLASSES = [
  "intrusion or restricted zone entry",
  "abandoned or removed object",
  "fall",
  "collision",
  "fire or smoke",
  "crowd surge",
  "aggression from observable interaction dynamics",
];

const PerceptionPanel = ({ services, tracks }: Props) => {
  const inference = services.find((s) => s.id === "inference");
  const prediction = services.find((s) => s.id === "prediction");
  const recording = services.find((s) => s.id === "recording");

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <header className="mb-3">
        <h2 className="text-[13px] font-light text-white/85">perception and events</h2>
        <p className="text-[11px] font-light text-white/40">
          tracks, developing events and recorded history — each one present only when its service answers
        </p>
      </header>

      <div className="mb-3 rounded-xl border border-white/10 bg-black/30 p-3">
        <p className="text-[12px] font-light text-white/80">
          {inference?.online ? `${tracks.length} tracked object${tracks.length === 1 ? "" : "s"}` : "detection backend unavailable"}
        </p>
        <p className="mt-1 text-[11px] font-light leading-relaxed text-white/45">
          {inference?.online
            ? "persistent track ids, trajectories, velocity and occlusion state are reported by the inference service; fields it cannot measure stay unavailable."
            : "no inference service is reachable. this is a backend outage, not an empty scene — nothing is being detected right now."}
        </p>
      </div>

      <div className="mb-3 rounded-xl border border-white/10 bg-black/30 p-3">
        <p className="text-[12px] font-light text-white/80">
          {prediction?.online ? "predictive event service online" : "predictive event intelligence unavailable"}
        </p>
        <p className="mt-1 text-[11px] font-light leading-relaxed text-white/45">
          {prediction?.online
            ? "probability, severity, imminence, evidence and alternative outcomes come from the service; no figure is produced locally."
            : "no predictive service is reachable, so no risk score is produced. a fabricated number here would be worse than none."}
        </p>
        <ul className="mt-2 space-y-0.5">
          {EVENT_CLASSES.map((e) => (
            <li key={e} className="text-[11px] font-light text-white/35">· {e}</li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] font-light leading-relaxed text-white/35">
          events only. this room does not infer criminality, intent, dangerousness, identity or any protected trait from a
          face, a body or an appearance.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/30 p-3">
        <p className="text-[12px] font-light text-white/80">
          {recording?.online ? "recording and index online" : "recording and search unavailable"}
        </p>
        <p className="mt-1 text-[11px] font-light leading-relaxed text-white/45">
          {recording?.online
            ? "an authorized operator can rewind, search the event index and see which authorized cameras observed a track."
            : "no recording or storage service is connected, so nothing is being retained and there is no history to search."}
        </p>
      </div>
    </section>
  );
};

export default PerceptionPanel;
