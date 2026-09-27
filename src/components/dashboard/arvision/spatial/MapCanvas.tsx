// asherin.arvision — plan view of the loaded map.
// Draws the walkable graph, building outlines, indoor spaces, points of
// interest, the active route, the viewer and every peer in the session.
//
// The base projection fits the whole map to the canvas. On top of that sits a
// view transform the operator controls: wheel or pinch to zoom about the point
// under the pointer, drag to pan, and a follow mode that keeps the live fix
// centred. Labels are drawn at a fixed size so a deep zoom stays readable
// rather than turning into wall-sized text.
//
// Tapping the canvas still places the viewer by hand, which is the honest
// fallback when camera positioning is not configured — but only on a tap, never
// at the end of a pan, or every drag would teleport the operator.

import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, LocateFixed, Minus, Plus } from "lucide-react";
import { MapTransform } from "@/lib/arvision/spatial/mapTransform";
import type { NavigationGraph } from "@/lib/arvision/spatial/navData";
import type { PeerState, Vec3 } from "@/lib/arvision/spatial/types";
import type { BuildingFix, Ring } from "@/lib/arvision/spatial/building";

interface MapCanvasProps {
  graph: NavigationGraph;
  position: Vec3 | null;
  headingRad: number | null;
  path: number[] | null;
  destinationId: number | null;
  peers: PeerState[];
  onPlace: (position: Vec3) => void;
  building?: BuildingFix | null;
  neighbours?: { ring: Ring; name: string | null }[];
  /** Indoor spaces are only drawn for the level the operator is reading. */
  activeLevel?: number;
  /** Accuracy circle radius in metres, drawn when the fix reports one. */
  accuracyM?: number | null;
}

const COLORS = {
  edge: "rgba(255,255,255,0.10)",
  waypoint: "rgba(255,255,255,0.28)",
  route: "rgba(212,175,110,0.85)",
  poi: "rgba(255,255,255,0.55)",
  poiActive: "rgba(212,175,110,1)",
  viewer: "#ffffff",
  peer: "#9ad0ff",
  neighbour: "rgba(255,255,255,0.16)",
  neighbourFill: "rgba(255,255,255,0.035)",
  hostFill: "rgba(212,175,110,0.13)",
  host: "rgba(212,175,110,0.75)",
  room: "rgba(154,208,255,0.65)",
  roomFill: "rgba(154,208,255,0.10)",
  roomHere: "rgba(154,208,255,1)",
  accuracy: "rgba(255,255,255,0.10)",
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 400;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

const MapCanvas = ({
  graph,
  position,
  headingRad,
  path,
  destinationId,
  peers,
  onPlace,
  building = null,
  neighbours = [],
  activeLevel = 0,
  accuracyM = null,
}: MapCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const transformRef = useRef<MapTransform | null>(null);
  const viewRef = useRef({ zoom: 1, panX: 0, panY: 0 });
  const followRef = useRef(true);
  const sizeRef = useRef({ width: 0, height: 0 });
  const drawRef = useRef<() => void>(() => {});
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; centre: { x: number; y: number } } | null>(null);
  const dragRef = useRef<{ x: number; y: number; moved: number } | null>(null);

  const [zoomLabel, setZoomLabel] = useState(1);
  const [follow, setFollow] = useState(true);

  useEffect(() => {
    followRef.current = follow;
  }, [follow]);

  const project = useCallback((point: Vec3) => {
    const base = transformRef.current;
    const view = viewRef.current;
    if (!base) return { x: 0, y: 0 };
    const p = base.toScreen(point);
    return { x: p.x * view.zoom + view.panX, y: p.y * view.zoom + view.panY };
  }, []);

  const unproject = useCallback((screen: { x: number; y: number }): Vec3 | null => {
    const base = transformRef.current;
    const view = viewRef.current;
    if (!base) return null;
    return base.toMap({ x: (screen.x - view.panX) / view.zoom, y: (screen.y - view.panY) / view.zoom });
  }, []);

  /** Centre the view on a map point without changing zoom. */
  const centreOn = useCallback((point: Vec3) => {
    const base = transformRef.current;
    const { width, height } = sizeRef.current;
    if (!base || width === 0) return;
    const view = viewRef.current;
    const p = base.toScreen(point);
    view.panX = width / 2 - p.x * view.zoom;
    view.panY = height / 2 - p.y * view.zoom;
  }, []);

  const strokeRing = useCallback(
    (ctx: CanvasRenderingContext2D, ring: Ring, stroke: string, fill: string | null, width: number) => {
      if (ring.points.length < 3) return;
      ctx.beginPath();
      ring.points.forEach((point, index) => {
        const p = project(point);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.stroke();
    },
    [project],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    if (width < 8 || height < 8) return;

    const resized = sizeRef.current.width !== width || sizeRef.current.height !== height;
    sizeRef.current = { width, height };

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const base = new MapTransform(graph.data.bounds, { width, height }, 24);
    transformRef.current = base;

    if (followRef.current && position) centreOn(position);
    else if (resized) {
      // keep the middle of the view where it was rather than snapping to origin
      const view = viewRef.current;
      if (view.zoom === 1 && view.panX === 0 && view.panY === 0) {
        // untouched view: leave the plain fitted projection
      }
    }

    const view = viewRef.current;
    const metres = (m: number) => base.toScreenDistance(m) * view.zoom;

    // context buildings first, so everything else sits over them
    for (const neighbour of neighbours) {
      if (building && neighbour.ring === building.ring) continue;
      strokeRing(ctx, neighbour.ring, COLORS.neighbour, COLORS.neighbourFill, 1);
    }

    // walkable graph
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.edge;
    ctx.beginPath();
    for (const wp of graph.data.waypoints) {
      const a = project(wp.position);
      for (const neighbourId of wp.connectedWaypoints) {
        if (neighbourId < wp.id) continue;
        const neighbour = graph.getWaypoint(neighbourId);
        if (!neighbour) continue;
        const b = project(neighbour.position);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
    }
    ctx.stroke();

    if (view.zoom < 24) {
      ctx.fillStyle = COLORS.waypoint;
      for (const wp of graph.data.waypoints) {
        const p = project(wp.position);
        if (p.x < -20 || p.y < -20 || p.x > width + 20 || p.y > height + 20) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // the building the operator is standing in, plus its indoor spaces
    if (building) {
      strokeRing(ctx, building.ring, COLORS.host, COLORS.hostFill, 1.75);
      for (const room of building.rooms) {
        if (room.levels.length > 0 && !room.levels.includes(activeLevel)) continue;
        strokeRing(ctx, room.ring, room.contains ? COLORS.roomHere : COLORS.room, COLORS.roomFill, room.contains ? 2 : 1);
      }
      ctx.fillStyle = "rgba(212,175,110,0.9)";
      for (const entrance of building.entrances) {
        const p = project(entrance);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // active route
    if (path && path.length > 1) {
      ctx.strokeStyle = COLORS.route;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.beginPath();
      path.forEach((id, index) => {
        const wp = graph.getWaypoint(id);
        if (!wp) return;
        const p = project(wp.position);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }

    // points of interest
    ctx.font = "300 11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    for (const poi of graph.getPOIs()) {
      const p = project(poi.position);
      if (p.x < -80 || p.y < -40 || p.x > width + 80 || p.y > height + 40) continue;
      const active = poi.id === destinationId;
      ctx.fillStyle = active ? COLORS.poiActive : COLORS.poi;
      ctx.beginPath();
      ctx.arc(p.x, p.y, active ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = active ? COLORS.poiActive : "rgba(255,255,255,0.65)";
      ctx.fillText(poi.name, p.x, p.y - 10);
    }

    // indoor space labels once the zoom makes them meaningful
    if (building && view.zoom >= 6) {
      ctx.fillStyle = "rgba(154,208,255,0.9)";
      for (const room of building.rooms) {
        if (room.levels.length > 0 && !room.levels.includes(activeLevel)) continue;
        const centre = room.ring.points.reduce(
          (acc, p) => ({ x: acc.x + p.x / room.ring.points.length, y: 0, z: acc.z + p.z / room.ring.points.length }),
          { x: 0, y: 0, z: 0 } as Vec3,
        );
        const p = project(centre);
        if (p.x < 0 || p.y < 0 || p.x > width || p.y > height) continue;
        ctx.fillText(room.name, p.x, p.y);
      }
    }

    // peers
    for (const peer of peers) {
      if (!peer.pose) continue;
      const p = project(peer.pose.position);
      const color = `rgb(${Math.round(peer.colorR * 255)},${Math.round(peer.colorG * 255)},${Math.round(peer.colorB * 255)})`;
      ctx.fillStyle = peer.pose.isLocalized ? color : COLORS.peer;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText(peer.playerName, p.x, p.y + 18);
    }

    // viewer, with the reported accuracy drawn honestly around it
    if (position) {
      const p = project(position);
      if (accuracyM && accuracyM > 0) {
        const r = metres(accuracyM);
        if (r > 2) {
          ctx.fillStyle = COLORS.accuracy;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.22)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      if (headingRad !== null) ctx.rotate(headingRad);
      ctx.fillStyle = COLORS.viewer;
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(7.5, 8);
      ctx.lineTo(0, 4);
      ctx.lineTo(-7.5, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // scale bar, because a zoomed plan without one lies about size
    const targets = [1, 2, 5, 10, 20, 50, 100, 200, 500];
    const barMetres = targets.find((t) => metres(t) > 60) ?? 1000;
    const barPx = metres(barMetres);
    if (Number.isFinite(barPx) && barPx > 10) {
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(14, height - 16);
      ctx.lineTo(14 + Math.min(barPx, width - 40), height - 16);
      ctx.stroke();
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText(`${barMetres} m · ${Math.round(barMetres * 3.28084)} ft`, 14, height - 22);
    }
  }, [graph, position, headingRad, path, destinationId, peers, building, neighbours, activeLevel, accuracyM, project, strokeRing, centreOn]);

  useEffect(() => {
    drawRef.current = draw;
    draw();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(() => drawRef.current());
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  const zoomAbout = useCallback((factor: number, anchorPoint: { x: number; y: number }) => {
    const view = viewRef.current;
    const next = clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const k = next / view.zoom;
    view.panX = anchorPoint.x - (anchorPoint.x - view.panX) * k;
    view.panY = anchorPoint.y - (anchorPoint.y - view.panY) * k;
    view.zoom = next;
    setZoomLabel(next);
    drawRef.current();
  }, []);

  // React's onWheel is passive, so the page would scroll behind the plan.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const dy = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
      const rect = canvas.getBoundingClientRect();
      zoomAbout(Math.exp(-dy * 0.0018), { x: event.clientX - rect.left, y: event.clientY - rect.top });
      setFollow(false);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [zoomAbout]);

  const pointerLocal = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointerLocal(event);
    pointersRef.current.set(event.pointerId, point);
    if (pointersRef.current.size === 1) dragRef.current = { ...point, moved: 0 };
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        centre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      dragRef.current = null;
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    const point = pointerLocal(event);
    const previous = pointersRef.current.get(event.pointerId)!;
    pointersRef.current.set(event.pointerId, point);

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinchRef.current.distance > 0 && distance > 0) {
        setFollow(false);
        zoomAbout(distance / pinchRef.current.distance, centre);
        const view = viewRef.current;
        view.panX += centre.x - pinchRef.current.centre.x;
        view.panY += centre.y - pinchRef.current.centre.y;
        drawRef.current();
      }
      pinchRef.current = { distance, centre };
      return;
    }

    if (!dragRef.current) return;
    const dx = point.x - previous.x;
    const dy = point.y - previous.y;
    dragRef.current.moved += Math.hypot(dx, dy);
    if (dragRef.current.moved > 4) {
      setFollow(false);
      const view = viewRef.current;
      view.panX += dx;
      view.panY += dy;
      drawRef.current();
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size > 0) return;
    dragRef.current = null;
    if (!drag || drag.moved > 4) return; // a pan is not a placement
    const mapPoint = unproject(pointerLocal(event));
    if (!mapPoint) return;
    const nearest = graph.findNearestWaypoint(mapPoint);
    const snapped = nearest ? { ...nearest.position } : mapPoint;
    // at deep zoom the operator means the exact spot, not the nearest waypoint
    const useExact =
      viewRef.current.zoom > 8 || !nearest || Math.hypot(nearest.position.x - mapPoint.x, nearest.position.z - mapPoint.z) > 12;
    onPlace(useExact ? mapPoint : snapped);
  };

  const recentre = () => {
    if (!position) return;
    setFollow(true);
    followRef.current = true;
    const view = viewRef.current;
    if (view.zoom < 12) {
      view.zoom = 24;
      setZoomLabel(24);
    }
    centreOn(position);
    drawRef.current();
  };

  const button =
    "grid h-8 w-8 place-items-center rounded-full border border-white/12 bg-black/45 text-white/75 backdrop-blur transition hover:border-white/30 hover:text-white disabled:opacity-35";

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="h-full w-full cursor-crosshair rounded-2xl"
        style={{ touchAction: "none" }}
        aria-label="map plan view. drag to pan, pinch or scroll to zoom, tap to place your position"
      />
      <div className="pointer-events-auto absolute right-2 top-2 flex flex-col gap-1.5">
        <button
          type="button"
          className={button}
          aria-label="zoom in"
          onClick={() => zoomAbout(1.6, { x: sizeRef.current.width / 2, y: sizeRef.current.height / 2 })}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={button}
          aria-label="zoom out"
          onClick={() => zoomAbout(1 / 1.6, { x: sizeRef.current.width / 2, y: sizeRef.current.height / 2 })}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={`${button} ${follow ? "border-white/45 text-white" : ""}`}
          aria-label="centre on my position"
          onClick={recentre}
          disabled={!position}
        >
          {follow ? <LocateFixed className="h-3.5 w-3.5" /> : <Crosshair className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className="pointer-events-none absolute left-3 top-2 text-[10px] font-light text-white/45">
        {zoomLabel >= 10 ? `${Math.round(zoomLabel)}x` : `${zoomLabel.toFixed(1)}x`}
        {follow ? " · following you" : ""}
      </div>
    </div>
  );
};

export default MapCanvas;
