import { useMemo } from "react";

/**
 * Squarified treemap. Used for topic and mime-class composition — a corpus
 * shown as a ranked list hides proportion, and proportion is the finding.
 */

export interface TreeItem {
  label: string;
  value: number;
  sub?: string;
}

interface Rect { x: number; y: number; w: number; h: number; item: TreeItem }

function squarify(items: TreeItem[], width: number, height: number): Rect[] {
  const total = items.reduce((a, i) => a + i.value, 0);
  if (!total) return [];
  const scale = (width * height) / total;
  const queue = [...items].sort((a, b) => b.value - a.value).map((i) => ({ ...i, area: i.value * scale }));
  const out: Rect[] = [];
  let x = 0, y = 0, w = width, h = height;

  const worst = (row: number[], side: number) => {
    const sum = row.reduce((a, b) => a + b, 0);
    const max = Math.max(...row);
    const min = Math.min(...row);
    const s2 = sum * sum;
    return Math.max((side * side * max) / s2, s2 / (side * side * min));
  };

  let row: typeof queue = [];
  while (queue.length) {
    const side = Math.min(w, h);
    const next = queue[0];
    const areas = row.map((r) => r.area);
    if (!row.length || worst([...areas, next.area], side) <= worst(areas, side)) {
      row.push(queue.shift()!);
      continue;
    }
    // Lay the current row out and reset.
    const sum = row.reduce((a, r) => a + r.area, 0);
    const thickness = sum / side;
    let off = 0;
    for (const r of row) {
      const len = r.area / thickness;
      if (w >= h) out.push({ x, y: y + off, w: thickness, h: len, item: r });
      else out.push({ x: x + off, y, w: len, h: thickness, item: r });
      off += len;
    }
    if (w >= h) { x += thickness; w -= thickness; } else { y += thickness; h -= thickness; }
    row = [];
  }
  if (row.length) {
    const side = Math.min(w, h);
    const sum = row.reduce((a, r) => a + r.area, 0);
    const thickness = side ? sum / side : 0;
    let off = 0;
    for (const r of row) {
      const len = thickness ? r.area / thickness : 0;
      if (w >= h) out.push({ x, y: y + off, w: thickness, h: len, item: r });
      else out.push({ x: x + off, y, w: len, h: thickness, item: r });
      off += len;
    }
  }
  return out;
}

const Treemap = ({ items, height = 180 }: { items: TreeItem[]; height?: number }) => {
  const rects = useMemo(() => squarify(items.filter((i) => i.value > 0), 100, height), [items, height]);
  const total = items.reduce((a, i) => a + i.value, 0);
  if (!rects.length) return null;

  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label="Composition treemap">
      {rects.map((r, i) => {
        const share = total ? r.item.value / total : 0;
        return (
          <g key={`${r.item.label}-${i}`}>
            <title>{`${r.item.label} — ${r.item.value} (${Math.round(share * 100)}%)${r.item.sub ? ` · ${r.item.sub}` : ""}`}</title>
            <rect
              x={r.x + 0.3}
              y={r.y + 0.3}
              width={Math.max(0, r.w - 0.6)}
              height={Math.max(0, r.h - 0.6)}
              rx={1}
              className="fill-foreground"
              fillOpacity={0.08 + share * 0.5}
              stroke="hsl(var(--background))"
              strokeWidth={0.4}
            />
            {r.w > 16 && r.h > 12 && (
              <text
                x={r.x + 2}
                y={r.y + 7}
                className="fill-foreground"
                style={{ fontSize: 3.2, fontWeight: 300 }}
              >
                {r.item.label.length > 22 ? `${r.item.label.slice(0, 21)}…` : r.item.label}
              </text>
            )}
            {r.w > 16 && r.h > 20 && (
              <text x={r.x + 2} y={r.y + 12} className="fill-muted-foreground" style={{ fontSize: 2.8, fontWeight: 300 }}>
                {Math.round(share * 100)}%
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

export default Treemap;
