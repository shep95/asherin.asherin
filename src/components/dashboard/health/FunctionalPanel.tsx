// functional layer panel: overlays (inflammation/stress/circadian/posture), the interdependency
// network, causal chains for a chosen finding, and the reverse symptom map. every number here
// restates its inputs and confidence; nothing is a diagnosis.
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { HealthPanelProps } from "@/lib/health/panel";
import { computeInflammation } from "@/lib/health/functional/inflammation";
import { computeStress } from "@/lib/health/functional/stress";
import { computeCircadian } from "@/lib/health/functional/circadian";
import { computePosture } from "@/lib/health/functional/posture";
import { NODES, EDGES, propagate } from "@/lib/health/functional/interdependency";
import { buildCausalChains, reverseSymptomMap } from "@/lib/health/functional/causal";
import { findingHighlights } from "@/lib/health/model";
import { SYMPTOMS } from "@/lib/health/symptoms";

type SubTab = "overlays" | "network" | "causes" | "symptom";
type Overlay = "inflammation" | "stress" | "circadian" | "posture";

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "overlays", label: "overlays" },
  { id: "network", label: "network" },
  { id: "causes", label: "causes" },
  { id: "symptom", label: "symptom" },
];

function LoadBar({ value, confidence }: { value: number; confidence: number }) {
  return (
    <div className="space-y-0.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-amber-400/70" style={{ width: `${Math.round(Math.max(0.03, value) * 100)}%` }} />
      </div>
      <p className="text-[9px] font-light text-foreground/35">confidence {Math.round(confidence * 100)}%</p>
    </div>
  );
}

export default function FunctionalPanel({ record, onHighlights, onSelectTerritories }: HealthPanelProps) {
  const [sub, setSub] = useState<SubTab>("overlays");
  const [overlay, setOverlay] = useState<Overlay>("inflammation");
  const [seedTerritory, setSeedTerritory] = useState("liver");
  const [symptomKey, setSymptomKey] = useState(SYMPTOMS[0]?.key ?? "");

  const inflammation = useMemo(() => computeInflammation(record), [record]);
  const stress = useMemo(() => computeStress(record), [record]);
  const circadian = useMemo(() => computeCircadian(record), [record]);
  const posture = useMemo(() => computePosture(record), [record]);

  const activeFindings = useMemo(() => {
    if (overlay === "inflammation") return inflammation.findings;
    if (overlay === "stress") return stress.findings;
    if (overlay === "circadian") return circadian.findings;
    return posture.findings;
  }, [overlay, inflammation, stress, circadian, posture]);

  const pushOverlay = (next: Overlay) => {
    setOverlay(next);
    onHighlights?.(findingHighlights(
      next === "inflammation" ? inflammation.findings : next === "stress" ? stress.findings : next === "circadian" ? circadian.findings : posture.findings,
    ));
  };

  const propagated = useMemo(() => propagate([seedTerritory], record), [seedTerritory, record]);
  const chains = useMemo(() => buildCausalChains(record, seedTerritory), [record, seedTerritory]);
  const reverse = useMemo(() => reverseSymptomMap(symptomKey, record), [symptomKey, record]);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={cn(
              "flex-1 rounded-lg px-2 py-1.5 text-[10px] font-light tracking-wide transition-colors",
              sub === t.id ? "bg-amber-400/15 text-amber-200" : "text-foreground/45 hover:text-foreground/70",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === "overlays" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {(["inflammation", "stress", "circadian", "posture"] as Overlay[]).map((o) => (
              <button
                key={o}
                onClick={() => pushOverlay(o)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[10px] font-light",
                  overlay === o ? "border-amber-400/40 bg-amber-400/10 text-amber-200" : "border-white/[0.08] text-foreground/50 hover:text-foreground/80",
                )}
              >
                {o}
              </button>
            ))}
          </div>

          {overlay === "inflammation" && (
            <div className="space-y-2">
              <p className="text-[10px] font-light leading-relaxed text-foreground/40">{inflammation.territories.length === 0 ? "not enough in your record yet to estimate inflammatory load." : "inflammatory load estimated per territory from labs, symptoms, pain pattern, exposures and wearables."}</p>
              {inflammation.territories.map((t) => (
                <div key={t.territoryKey} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                  <p className="text-[11px] font-light text-foreground/80">{t.territoryKey.replace(/-/g, " ")}</p>
                  <LoadBar value={t.load} confidence={t.confidence} />
                  <p className="mt-1 text-[10px] font-light leading-relaxed text-foreground/40">inputs: {t.inputs.join("; ")}</p>
                </div>
              ))}
            </div>
          )}

          {overlay === "stress" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                  <p className="text-[9px] uppercase tracking-widest text-foreground/30">acute</p>
                  <LoadBar value={stress.acute} confidence={stress.confidence} />
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                  <p className="text-[9px] uppercase tracking-widest text-foreground/30">chronic</p>
                  <LoadBar value={stress.chronic} confidence={stress.confidence} />
                </div>
              </div>
              {stress.notes.map((n, i) => (
                <p key={i} className="text-[10px] font-light leading-relaxed text-foreground/40">{n}</p>
              ))}
              {stress.territories.map((t) => (
                <div key={t.territoryKey} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                  <p className="text-[11px] font-light text-foreground/80">{t.territoryKey.replace(/-/g, " ")}</p>
                  <LoadBar value={t.load} confidence={stress.confidence} />
                  <p className="mt-1 text-[10px] font-light leading-relaxed text-foreground/40">inputs: {t.inputs.join("; ")}</p>
                </div>
              ))}
            </div>
          )}

          {overlay === "circadian" && (
            <div className="space-y-2">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                <p className="text-[11px] font-light text-foreground/80">phase: {circadian.phaseEstimate}</p>
                {circadian.regularity !== null && <LoadBar value={1 - circadian.regularity} confidence={circadian.confidence} />}
                {circadian.socialJetlagHours !== null && <p className="mt-1 text-[10px] font-light text-foreground/40">social jetlag ≈ {circadian.socialJetlagHours}h</p>}
              </div>
              {circadian.notes.map((n, i) => (
                <p key={i} className="text-[10px] font-light leading-relaxed text-foreground/40">{n}</p>
              ))}
            </div>
          )}

          {overlay === "posture" && (
            <div className="space-y-2">
              {posture.notes.map((n, i) => (
                <p key={i} className="text-[10px] font-light leading-relaxed text-foreground/40">{n}</p>
              ))}
              {posture.chain.filter((c) => c.load > 0).map((c) => (
                <div key={c.segmentId} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                  <p className="text-[11px] font-light text-foreground/80">{c.label}</p>
                  <LoadBar value={c.load} confidence={posture.confidence} />
                  <p className="mt-1 text-[10px] font-light leading-relaxed text-foreground/40">{c.compensationNote}</p>
                </div>
              ))}
            </div>
          )}

          {activeFindings.length === 0 && <p className="text-[10px] font-light text-foreground/35">not enough in your record yet to paint this overlay on the body.</p>}
        </div>
      )}

      {sub === "network" && (
        <div className="space-y-2">
          <p className="text-[10px] font-light leading-relaxed text-foreground/40">
            a qualitative map of organ/system interdependency. select a node to see what feeds into it and to look at it on the body.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {NODES.map((n) => (
              <button
                key={n.id}
                onClick={() => onSelectTerritories?.(n.territoryKeys)}
                className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] font-light text-foreground/55 hover:border-amber-400/40 hover:text-amber-200"
              >
                {n.label}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            {EDGES.map((e, i) => (
              <p key={i} className="text-[10px] font-light leading-relaxed text-foreground/40">
                {NODES.find((n) => n.id === e.from)?.label} → {NODES.find((n) => n.id === e.to)?.label}
                <span className="ml-1 text-foreground/25">(strength {e.strength})</span> — {e.mechanism}
              </p>
            ))}
          </div>
        </div>
      )}

      {sub === "causes" && (
        <div className="space-y-3">
          <select
            value={seedTerritory}
            onChange={(e) => setSeedTerritory(e.target.value)}
            className="h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] text-foreground/80"
          >
            {NODES.flatMap((n) => n.territoryKeys).map((t) => (
              <option key={t} value={t}>{t.replace(/-/g, " ")}</option>
            ))}
          </select>
          {chains.length === 0 && <p className="text-[10px] font-light text-foreground/35">not enough in your record yet to build a causal chain toward this territory.</p>}
          {chains.map((c, i) => (
            <div key={i} className="space-y-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
              {c.steps.map((s, j) => (
                <div key={j} className="border-l border-white/[0.08] pl-2">
                  <p className="text-[11px] font-light text-foreground/80">{s.label}</p>
                  <p className="text-[10px] font-light leading-relaxed text-foreground/40">{s.detail}</p>
                  <p className="text-[9px] text-foreground/25">{s.source} · confidence {Math.round(s.confidence * 100)}%</p>
                </div>
              ))}
              <p className="text-[10px] font-light text-amber-200/80">{c.conclusion}</p>
              <p className="text-[9px] text-foreground/30">overall confidence {Math.round(c.confidence * 100)}%</p>
              {c.uncertainties.map((u, k) => (
                <p key={k} className="text-[9px] font-light leading-relaxed text-foreground/30">· {u}</p>
              ))}
            </div>
          ))}
          {propagated.length > 0 && (
            <div className="space-y-1 border-t border-white/[0.06] pt-2">
              <p className="text-[9px] uppercase tracking-widest text-foreground/30">network reach from this territory</p>
              {propagated.slice(0, 6).map((p) => (
                <p key={p.nodeId} className="text-[10px] font-light text-foreground/40">{p.label} · strength {p.strength.toFixed(2)}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {sub === "symptom" && (
        <div className="space-y-3">
          <select
            value={symptomKey}
            onChange={(e) => setSymptomKey(e.target.value)}
            className="h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] text-foreground/80"
          >
            {SYMPTOMS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          <p className="text-[10px] font-light leading-relaxed text-foreground/40">{reverse.note}</p>
          {reverse.candidates.map((c) => (
            <div key={c.territoryKey} className="space-y-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-light text-foreground/80">{c.territoryKey.replace(/-/g, " ")}</p>
                <button onClick={() => onSelectTerritories?.([c.territoryKey])} className="text-[9px] text-amber-300/70 hover:text-amber-200">look at this</button>
              </div>
              <p className="text-[10px] font-light text-foreground/40">{c.likelihood}</p>
              <p className="text-[10px] font-light leading-relaxed text-foreground/35">{c.mechanism}</p>
              {c.supportingInputs.length > 0 && <p className="text-[9px] font-light text-foreground/30">supporting: {c.supportingInputs.join("; ")}</p>}
              <p className="text-[9px] font-light text-foreground/30">would raise: {c.wouldRaise.join("; ") || "no specific pathway mapped."}</p>
              <p className="text-[9px] font-light text-foreground/30">would lower: {c.wouldLower.join("; ")}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
