// Workspace map surface — Leaflet over free Esri imagery. Plots only markers
// and tracks that carried real coordinates; everything else is listed as
// unplotted with the reason it could not be placed.

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapPayload } from "@/lib/workspace/types";

const ESRI_TILE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION = "Imagery &copy; <a href='https://www.esri.com/'>Esri</a>, Maxar, Earthstar Geographics";

const COLOR: Record<string, string> = {
  camera: "#7dd3fc",
  location: "#ffffff",
  entity: "#fcd34d",
  event: "#fca5a5",
  zone: "#a7f3d0",
};

interface Props {
  map: MapPayload;
  selectedId?: string;
  onSelect?: (id: string) => void;
}

const WorkspaceMap = ({ map, selectedId, onSelect }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const center = map.center ?? { lat: 0, lng: 0 };
    const m = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom: map.zoom,
      zoomControl: true,
      scrollWheelZoom: false,
    });
    L.tileLayer(ESRI_TILE, { attribution: ESRI_ATTRIBUTION, maxZoom: 19 }).addTo(m);
    layerRef.current = L.layerGroup().addTo(m);
    mapRef.current = m;
    setTimeout(() => m.invalidateSize(), 60);
    return () => {
      m.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = mapRef.current;
    const layer = layerRef.current;
    if (!m || !layer) return;
    layer.clearLayers();

    const bounds: L.LatLngExpression[] = [];

    for (const mk of map.markers) {
      const color = COLOR[mk.kind] || "#ffffff";
      const size = mk.id === selectedId ? 18 : 12;
      const icon = L.divIcon({
        html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid rgba(0,0,0,.7);box-shadow:0 0 0 2px rgba(255,255,255,.45);"></div>`,
        className: "",
        iconSize: [size + 4, size + 4],
        iconAnchor: [(size + 4) / 2, (size + 4) / 2],
      });
      const marker = L.marker([mk.lat, mk.lng], { icon, title: mk.label }).addTo(layer);
      marker.bindTooltip(`${mk.kind} · ${mk.label}`, { direction: "top", offset: [0, -8] });
      marker.on("click", () => onSelect?.(mk.id));
      bounds.push([mk.lat, mk.lng]);
    }

    for (const t of map.tracks) {
      const pts = t.points.map((p) => [p.lat, p.lng] as L.LatLngExpression);
      L.polyline(pts, { color: "#fcd34d", weight: 2, opacity: 0.85 }).addTo(layer).bindTooltip(t.label);
      bounds.push(...pts);
    }

    if (bounds.length > 1) m.fitBounds(L.latLngBounds(bounds).pad(0.25), { maxZoom: 18 });
    else if (bounds.length === 1) m.setView(bounds[0], map.zoom);
    setTimeout(() => m.invalidateSize(), 40);
  }, [map, selectedId, onSelect]);

  return (
    <div className="overflow-hidden rounded-xl border border-border/25">
      <div ref={containerRef} className="h-[280px] w-full bg-background/60" />
      {map.unplotted.length > 0 && (
        <div className="border-t border-border/20 px-3 py-2 text-[10px] font-light text-muted-foreground/80">
          <div className="uppercase tracking-[0.2em] text-muted-foreground/60">not plotted</div>
          <ul className="mt-1 space-y-0.5">
            {map.unplotted.map((u, i) => (
              <li key={i}>
                {u.label} — {u.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default WorkspaceMap;
