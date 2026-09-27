// Entity/relationship graph. Deterministic radial layout — no physics, no
// randomness, so the same evidence always draws the same picture.

import { useMemo } from "react";
import type { GraphPayload } from "@/lib/workspace/types";

interface Props {
  graph: GraphPayload;
  selectedId?: string;
  onSelect?: (nodeId: string) => void;
}

const W = 520;
const H = 300;

const WorkspaceGraph = ({ graph, selectedId, onSelect }: Props) => {
  const positions = useMemo(() => {
    const n = graph.nodes.length || 1;
    const r = Math.min(W, H) / 2 - 40;
    const map = new Map<string, { x: number; y: number }>();
    graph.nodes.forEach((node, i) => {
      const a = (2 * Math.PI * i) / n - Math.PI / 2;
      map.set(node.id, { x: W / 2 + r * Math.cos(a), y: H / 2 + r * Math.sin(a) });
    });
    return map;
  }, [graph.nodes]);

  return (
    <div className="overflow-x-auto rounded-xl border border-border/25 bg-foreground/[0.02] p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[300px] w-full" role="img" aria-label="entity relationship graph">
        {graph.edges.map((e) => {
          const a = positions.get(e.from);
          const b = positions.get(e.to);
          if (!a || !b) return null;
          const weak = typeof e.confidence === "number" && e.confidence < 0.5;
          return (
            <g key={e.id}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="currentColor"
                className="text-muted-foreground/40"
                strokeWidth={1}
                strokeDasharray={weak ? "4 3" : undefined}
              />
              <text
                x={(a.x + b.x) / 2}
                y={(a.y + b.y) / 2 - 3}
                textAnchor="middle"
                className="fill-muted-foreground/70"
                fontSize={8}
              >
                {e.label}
                {weak ? " (weak)" : ""}
              </text>
            </g>
          );
        })}
        {graph.nodes.map((n) => {
          const p = positions.get(n.id)!;
          const active = n.id === selectedId;
          return (
            <g key={n.id} onClick={() => onSelect?.(n.id)} style={{ cursor: "pointer" }}>
              <circle
                cx={p.x}
                cy={p.y}
                r={active ? 8 : 5}
                className={active ? "fill-accent" : "fill-foreground/70"}
              />
              <text x={p.x} y={p.y - 11} textAnchor="middle" className="fill-foreground/85" fontSize={9}>
                {n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default WorkspaceGraph;
