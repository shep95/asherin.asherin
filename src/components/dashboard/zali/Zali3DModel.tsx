import { useState, useMemo } from "react";
import { Box, Atom, Layers, Cpu } from "lucide-react";
import type { ZaliProject } from "./types";

// ── Holographic CSS-based 3D visualization ───────────────────────────────────
interface Props {
  project: ZaliProject;
  viewMode: string;
}

const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#14b8a6"];

const Zali3DModel = ({ project, viewMode }: Props) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const specs = project.specifications as Record<string, any>;
  const materials: string[] = specs?.materials || [];
  const features: string[] = specs?.key_features || [];

  const equipment = useMemo(() => {
    const items: { label: string; color: string }[] = [];
    materials.forEach((m, i) => items.push({ label: m, color: COLORS[i % COLORS.length] }));
    features.forEach((f, i) => items.push({ label: f, color: COLORS[(i + materials.length) % COLORS.length] }));
    if (items.length === 0) {
      items.push(
        { label: "Core Module", color: "#3b82f6" },
        { label: "Power Unit", color: "#ef4444" },
        { label: "Interface Layer", color: "#10b981" },
        { label: "Sensor Array", color: "#f59e0b" },
      );
    }
    return items.slice(0, 12);
  }, [materials, features]);

  const exploded = viewMode === "exploded";

  return (
    <div className="w-full h-full min-h-[280px] sm:min-h-[350px] relative overflow-hidden select-none touch-manipulation">
      {/* Radial background glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-40 sm:w-64 h-40 sm:h-64 rounded-full bg-accent/5 blur-3xl" />
      </div>

      {/* Rotating ring */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="w-36 sm:w-56 h-36 sm:h-56 rounded-full border border-accent/10"
          style={{ animation: "spin 20s linear infinite" }}
        />
        <div
          className="absolute w-48 sm:w-72 h-48 sm:h-72 rounded-full border border-border/10"
          style={{ animation: "spin 30s linear infinite reverse" }}
        />
      </div>

      {/* Central core */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative">
          <div
            className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl border border-accent/30 bg-accent/10 backdrop-blur-sm flex items-center justify-center"
            style={{
              animation: "pulse 3s ease-in-out infinite",
              boxShadow: "0 0 30px rgba(0, 255, 204, 0.1)",
            }}
          >
            <Atom className="h-5 w-5 sm:h-7 sm:w-7 text-accent/70" style={{ animation: "spin 8s linear infinite" }} />
          </div>
          {/* Core glow */}
          <div className="absolute inset-0 w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-accent/5 blur-md" />
        </div>
      </div>

      {/* Orbiting equipment blocks */}
      {equipment.map((eq, i) => {
        const count = equipment.length;
        const angle = (i / count) * 360;
        const isMobileView = typeof window !== "undefined" && window.innerWidth < 640;
        const radius = exploded ? (isMobileView ? 90 : 140) : (isMobileView ? 65 : 100);
        const isHovered = hoveredIndex === i;
        const size = isMobileView ? 20 + ((i * 5 + 2) % 8) : 28 + ((i * 7 + 3) % 10);
        const delay = i * 0.3;

        return (
          <div
            key={i}
            className="absolute left-1/2 top-1/2 transition-all duration-700 ease-out"
            style={{
              transform: `translate(-50%, -50%) rotate(${angle}deg) translateX(${radius}px) rotate(-${angle}deg)`,
            }}
          >
            <div
              className="relative cursor-pointer transition-all duration-300"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{
                width: size,
                height: size,
                animation: `float ${3 + (i % 3)}s ease-in-out ${delay}s infinite`,
              }}
            >
              {/* Block */}
              <div
                className="w-full h-full rounded-lg border transition-all duration-300"
                style={{
                  borderColor: isHovered ? "#00ffcc" : eq.color + "40",
                  backgroundColor: isHovered ? eq.color + "30" : eq.color + "15",
                  boxShadow: isHovered
                    ? `0 0 20px ${eq.color}30, 0 0 40px ${eq.color}10`
                    : `0 0 10px ${eq.color}10`,
                  transform: isHovered ? "scale(1.3)" : "scale(1)",
                }}
              />
              {/* Wireframe overlay */}
              <div
                className="absolute inset-0 rounded-lg border border-dashed transition-opacity duration-300"
                style={{
                  borderColor: "#00ffcc",
                  opacity: isHovered ? 0.3 : 0.05,
                }}
              />
              {/* Tooltip */}
              {isHovered && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md bg-background/90 border border-accent/30 backdrop-blur-sm whitespace-nowrap z-10">
                  <p className="text-[10px] font-light text-accent">{eq.label}</p>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Connection lines from core to blocks */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.08 }}>
        {equipment.map((_, i) => {
          const count = equipment.length;
          const angle = (i / count) * Math.PI * 2;
          const radius = exploded ? 140 : 100;
          const cx = 50; // percent
          const cy = 50;
          return (
            <line
              key={i}
              x1="50%"
              y1="50%"
              x2={`calc(50% + ${Math.cos(angle) * radius}px)`}
              y2={`calc(50% + ${Math.sin(angle) * radius}px)`}
              stroke="#00ffcc"
              strokeWidth="1"
            />
          );
        })}
      </svg>

      {/* Platform base */}
      <div className="absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 w-40 sm:w-64 h-3 sm:h-4 rounded-full bg-gradient-to-r from-transparent via-accent/10 to-transparent blur-sm" />

      {/* Float animation keyframes */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
};

export default Zali3DModel;
