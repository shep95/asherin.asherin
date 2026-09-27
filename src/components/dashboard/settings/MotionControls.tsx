import { useEffect, useState } from "react";
import { Activity, MousePointerClick, Sparkles } from "lucide-react";
import {
  readMotionPrefs,
  writeMotionPrefs,
  systemPrefersReducedMotion,
  type MotionLevel,
  type MotionPrefs,
} from "@/lib/motionPrefs";

const LEVELS: Array<{ key: MotionLevel; label: string; detail: string }> = [
  { key: "full", label: "Full", detail: "everything moves as designed" },
  { key: "calm", label: "Calm", detail: "decorative motion shortened, feedback kept" },
  { key: "still", label: "Still", detail: "no decorative motion at all" },
];

const MotionControls = () => {
  const [prefs, setPrefs] = useState<MotionPrefs>(() => readMotionPrefs());
  const [systemReduced, setSystemReduced] = useState(false);

  useEffect(() => {
    setSystemReduced(systemPrefersReducedMotion());
  }, []);

  const update = (next: Partial<MotionPrefs>) => setPrefs(writeMotionPrefs(next));
  const stillSelected = prefs.level === "still";

  return (
    <div className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Activity className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-sm font-light text-foreground">Motion</h3>
      </div>
      <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
        How much the interface moves. Motion is used to show state and progress — turning it down
        never removes information.
        {systemReduced && " Your device asks for reduced motion, so Still was chosen for you until you change it."}
      </p>

      <div className="grid grid-cols-3 gap-3">
        {LEVELS.map((lvl) => {
          const active = prefs.level === lvl.key;
          return (
            <button
              key={lvl.key}
              onClick={() => update({ level: lvl.key })}
              className={`rounded-xl border p-3 text-left transition-all ${
                active
                  ? "border-foreground/40 bg-foreground/[0.04] ring-1 ring-foreground/10"
                  : "border-border/20 hover:border-foreground/25"
              }`}
            >
              <span className="block text-xs font-light text-foreground">{lvl.label}</span>
              <span className="block text-[9px] text-muted-foreground/45 mt-1 leading-relaxed">{lvl.detail}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2 pt-1">
        {[
          {
            key: "ripple" as const,
            icon: MousePointerClick,
            label: "Click ripple",
            detail: "the water-like wave that follows a click",
            value: prefs.ripple,
          },
          {
            key: "shimmer" as const,
            icon: Sparkles,
            label: "Background shimmer",
            detail: "slow ambient movement behind the interface",
            value: prefs.shimmer,
          },
        ].map((row) => (
          <button
            key={row.key}
            onClick={() => update({ [row.key]: !row.value })}
            disabled={stillSelected}
            className="w-full flex items-center justify-between rounded-lg border border-border/15 bg-card/5 px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.03] disabled:opacity-40"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <row.icon className="h-3.5 w-3.5 text-muted-foreground/55 shrink-0" />
              <span className="min-w-0">
                <span className="block text-[11px] font-light text-foreground">{row.label}</span>
                <span className="block text-[9px] text-muted-foreground/45">{row.detail}</span>
              </span>
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-light border ${
                row.value && !stillSelected
                  ? "border-foreground/25 text-foreground/80 bg-foreground/[0.06]"
                  : "border-border/20 text-muted-foreground/45"
              }`}
            >
              {stillSelected ? "off (still)" : row.value ? "on" : "off"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default MotionControls;
