import { useMemo } from "react";

/**
 * Deterministic relationship graph. No physics simulation — a force layout
 * re-renders on every frame and thrashes the main thread for no analytical
 * gain. Nodes are placed on concentric rings by tier, ordered by community, so
 * the same dataset always produces the same picture and clusters read at a
 * glance.
 */

export interface GraphNode {
  id: string;
  label: string;
  /** 0 = ego, 1 = inner, 2 = active, 3 = periphery. */
  ring: number;
  /** Community index — colours grouping by shared co-occurrence. */
  cluster: number;
  weight: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  weight: number;
}

const RING_RADIUS = [0, 58, 100, 138];

const RelationGraph = ({
  nodes,
  edges,
  clusterNames,
  onSelect,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusterNames?: string[];
  onSelect?: (id: string) => void;
}) => {
  const placed = useMemo(() => {
    const byRing = new Map<number, GraphNode[]>();
    for (const n of nodes) {
      const r = Math.max(0, Math.min(3, n.ring));
      if (!byRing.has(r)) byRing.set(r, []);
      byRing.get(r)!.push(n);
    }
    const pos = new Map<string, { x: number; y: number; n: GraphNode }>();
    for (const [ring, group] of byRing) {
      // Sort by cluster so members of a community sit adjacent on the ring —
      // this is what makes a cluster visually legible without a simulation.
      group.sort((a, b) => a.cluster - b.cluster || b.weight - a.weight);
      group.forEach((n, i) => {
        if (ring === 0) {
          pos.set(n.id, { x: 0, y: 0, n });
          return;
        }
        const angle = (i / group.length) * Math.PI * 2 - Math.PI / 2;
        pos.set(n.id, {
          x: Math.cos(angle) * RING_RADIUS[ring],
          y: Math.sin(angle) * RING_RADIUS[ring],
          n,
        });
      });
    }
    return pos;
  }, [nodes]);

  const maxEdge = Math.max(1, ...edges.map((e) => e.weight));
  const clusters = Array.from(new Set(nodes.map((n) => n.cluster))).sort((a, b) => a - b);

  if (!nodes.length) return null;

  return (
    <div className="space-y-2">
      <svg viewBox="-165 -165 330 330" className="w-full max-w-[440px] mx-auto" role="img" aria-label="Relationship graph">
        {RING_RADIUS.slice(1).map((r) => (
          <circle key={r} cx={0} cy={0} r={r} className="fill-none stroke-foreground/[0.06]" strokeWidth={0.5} />
        ))}
        {edges.map((e, i) => {
          const a = placed.get(e.from);
          const b = placed.get(e.to);
          if (!a || !b) return null;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className="stroke-foreground"
              strokeOpacity={0.06 + (e.weight / maxEdge) * 0.22}
              strokeWidth={0.4 + (e.weight / maxEdge) * 1.2}
            />
          );
        })}
        {Array.from(placed.values()).map(({ x, y, n }) => {
          const r = n.ring === 0 ? 7 : 2.4 + Math.min(4, n.weight / 4);
          return (
            <g
              key={n.id}
              transform={`translate(${x},${y})`}
              onClick={() => onSelect?.(n.id)}
              className={onSelect ? "cursor-pointer" : undefined}
            >
              <title>{`${n.label} — ${n.weight} exchanges`}</title>
              <circle
                r={r}
                className="fill-foreground"
                fillOpacity={n.ring === 0 ? 0.9 : 0.28 + (3 - n.ring) * 0.18}
                stroke="hsl(var(--background))"
                strokeWidth={0.8}
              />
              {(n.ring <= 1 || n.weight > 20) && (
                <text
                  y={-r - 3}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  style={{ fontSize: 6, fontWeight: 300 }}
                >
                  {n.label.length > 16 ? `${n.label.slice(0, 15)}…` : n.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {clusterNames && clusters.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center">
          {clusters.map((c) => (
            <span key={c} className="text-[9px] font-extralight text-muted-foreground/50">
              Cluster {c + 1}: {clusterNames[c] || "unlabelled"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default RelationGraph;
