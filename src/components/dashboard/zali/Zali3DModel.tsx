import { useState, useMemo } from "react";
import { Atom } from "lucide-react";
import type { ZaliProject } from "./types";
import { useIsMobile } from "@/hooks/use-mobile";
import { specList } from "./zaliPrompt";

// The viewport. CSS and SVG, no WebGL: every item the spec records —
// materials, components, key features — orbits a core, colour-coded by
// kind. It shows what is on record and nothing else.

export type ViewMode = "assembled" | "exploded";

interface Props {
  project: ZaliProject;
  viewMode: ViewMode;
}

const KIND_COLOR = { material: "#3b82f6", component: "#8b5cf6", feature: "#10b981" } as const;
type Kind = keyof typeof KIND_COLOR;

const MAX_ITEMS = 12;

const Zali3DModel = ({ project, viewMode }: Props) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const isMobile = useIsMobile();

  const specs = project.specifications;
  const items = useMemo(() => {
    const out: { label: string; kind: Kind }[] = [];
    for (const m of specList(specs, "materials")) out.push({ label: m, kind: "material" });
    for (const c of specList(specs, "components")) out.push({ label: c, kind: "component" });
    for (const f of specList(specs, "key_features")) out.push({ label: f, kind: "feature" });
    return out;
  }, [specs]);
  const shown = items.slice(0, MAX_ITEMS);
  const hidden = items.length - shown.length;

  const exploded = viewMode === "exploded";
  const radius = exploded ? (isMobile ? 95 : 150) : (isMobile ? 68 : 105);
  const svgSize = radius * 2 + 40;

  if (shown.length === 0) {
    return (
      <div className="w-full h-full min-h-[280px] flex items-center justify-center px-6">
        <p className="text-[10px] text-muted-foreground/50 text-center max-w-xs leading-relaxed">
          the spec has no materials, components or key features yet, so there is nothing to lay out. the figures on record are listed below.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[280px] sm:min-h-[350px] relative overflow-hidden select-none touch-manipulation">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
        <div className="w-40 sm:w-64 h-40 sm:h-64 rounded-full bg-accent/5 blur-3xl" />
      </div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
        <div className="w-36 sm:w-56 h-36 sm:h-56 rounded-full border border-accent/10 motion-safe:animate-[spin_20s_linear_infinite]" />
        <div className="absolute w-48 sm:w-72 h-48 sm:h-72 rounded-full border border-border/10 motion-safe:animate-[spin_30s_linear_infinite_reverse]" />
      </div>

      {/* Connection lines, drawn in px around the true centre */}
      <svg
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        width={svgSize}
        height={svgSize}
        viewBox={`0 0 ${svgSize} ${svgSize}`}
        style={{ opacity: 0.12 }}
        aria-hidden="true"
      >
        {shown.map((it, i) => {
          const angle = (i / shown.length) * Math.PI * 2 - Math.PI / 2;
          const c = svgSize / 2;
          return (
            <line
              key={i}
              x1={c}
              y1={c}
              x2={c + Math.cos(angle) * radius}
              y2={c + Math.sin(angle) * radius}
              stroke={KIND_COLOR[it.kind]}
              strokeWidth="1"
            />
          );
        })}
      </svg>

      {/* Core */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
        <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl border border-accent/30 bg-accent/10 backdrop-blur-sm flex items-center justify-center" style={{ boxShadow: "0 0 30px hsl(var(--accent) / 0.1)" }}>
          <Atom className="h-5 w-5 sm:h-7 sm:w-7 text-accent/70 motion-safe:animate-[spin_8s_linear_infinite]" />
        </div>
      </div>

      {/* Orbiting items */}
      <ul className="contents" aria-label="items on record">
        {shown.map((it, i) => {
          const angle = (i / shown.length) * 360 - 90;
          const isHovered = hoveredIndex === i;
          const size = isMobile ? 22 : 30;
          const color = KIND_COLOR[it.kind];
          return (
            <li
              key={`${it.kind}-${it.label}`}
              className="absolute left-1/2 top-1/2 transition-transform duration-700 ease-out list-none"
              style={{ transform: `translate(-50%, -50%) rotate(${angle}deg) translateX(${radius}px) rotate(-${angle}deg)` }}
            >
              <button
                type="button"
                className="relative block cursor-pointer transition-transform duration-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded-lg"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                onFocus={() => setHoveredIndex(i)}
                onBlur={() => setHoveredIndex(null)}
                aria-label={`${it.kind}: ${it.label}`}
                style={{ width: size, height: size, transform: isHovered ? "scale(1.3)" : "scale(1)" }}
              >
                <span
                  className="block w-full h-full rounded-lg border transition-colors duration-300"
                  style={{
                    borderColor: isHovered ? color : color + "55",
                    backgroundColor: isHovered ? color + "30" : color + "15",
                    boxShadow: isHovered ? `0 0 20px ${color}30` : `0 0 10px ${color}10`,
                  }}
                />
                {isHovered && (
                  <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md bg-background/90 border border-border/30 backdrop-blur-sm whitespace-nowrap z-10 max-w-[200px] truncate">
                    <span className="text-[10px] font-light text-foreground">{it.label}</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Legend */}
      <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-muted-foreground/60">
        {(Object.keys(KIND_COLOR) as Kind[]).map((k) => {
          const n = shown.filter((x) => x.kind === k).length;
          if (!n) return null;
          return (
            <span key={k} className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: KIND_COLOR[k] + "99" }} aria-hidden="true" />
              {n} {k}{n === 1 ? "" : "s"}
            </span>
          );
        })}
        {hidden > 0 && <span>+{hidden} more in the list below</span>}
      </div>
    </div>
  );
};

export default Zali3DModel;
