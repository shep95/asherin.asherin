// PropertyMapCard — inline satellite view of a geocoded property.
// Uses Leaflet + Esri World Imagery tiles (free, no key required). Renders
// beneath an Aureon chat message when the pipeline geocoded an address.

import { useEffect, useRef } from "react";
import { MapPin, ExternalLink } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface PropertyMapCardData {
  address: string;
  formatted: string;
  lat: number;
  lng: number;
  category?: string;
}

interface Props {
  data: PropertyMapCardData;
}

const ESRI_TILE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION =
  "Imagery &copy; <a href='https://www.esri.com/'>Esri</a>, Maxar, Earthstar Geographics";

const PropertyMapCard = ({ data }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [data.lat, data.lng],
      zoom: 18,
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false, // don't hijack chat scroll
    });

    L.tileLayer(ESRI_TILE, { attribution: ESRI_ATTRIBUTION, maxZoom: 19 }).addTo(map);

    // Custom marker so we don't need the leaflet asset URLs (which 404 in bundled builds).
    const dot = L.divIcon({
      html: '<div style="width:14px;height:14px;border-radius:50%;background:#fff;border:2px solid #000;box-shadow:0 0 0 2px rgba(255,255,255,0.6);"></div>',
      className: "",
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    L.marker([data.lat, data.lng], { icon: dot }).addTo(map);

    mapRef.current = map;
    // Recalc size once the container has finished laying out (Leaflet gotcha).
    setTimeout(() => map.invalidateSize(), 60);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [data.lat, data.lng]);

  const gmapsUrl = `https://www.google.com/maps/@${data.lat},${data.lng},19z`;

  return (
    <div className="mt-2 rounded-lg border border-border/30 bg-foreground/[0.02] overflow-hidden">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border/20">
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin className="h-3 w-3 text-foreground/70 shrink-0" />
          <span className="text-[10px] uppercase tracking-[0.18em] font-light text-muted-foreground">
            Satellite
          </span>
          <span className="text-[11px] font-light text-foreground/80 truncate">
            · {data.formatted}
          </span>
        </div>
        <a
          href={gmapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] font-light text-muted-foreground hover:text-foreground"
        >
          Open <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
      <div ref={containerRef} className="w-full h-[220px]" />
      <div className="px-2.5 py-1 text-[9px] font-light text-muted-foreground/70 tracking-wide">
        {data.lat.toFixed(6)}, {data.lng.toFixed(6)}
        {data.category ? ` · ${data.category}` : ""}
      </div>
    </div>
  );
};

export default PropertyMapCard;
