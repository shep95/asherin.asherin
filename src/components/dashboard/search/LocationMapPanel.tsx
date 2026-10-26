import { useEffect, useMemo, useRef, useState } from "react";
import { fetchTimeout } from "@/lib/local/search/http";
import type * as Leaflet from "leaflet";
import {
  X, MapPin, ExternalLink, Copy, Check, Loader2, Navigation, Globe,
  Car, Bike, Footprints, LocateFixed, Search, Route as RouteIcon, Clock,
} from "lucide-react";
import "leaflet/dist/leaflet.css";

interface LocationMapPanelProps {
  query: string;
  onClose: () => void;
}

interface GeocodeResult {
  lat: number;
  lon: number;
  display_name: string;
  type?: string;
  class?: string;
  address?: Record<string, string>;
}

type TravelMode = "driving" | "cycling" | "walking";

interface RouteInfo {
  distanceMeters: number;
  durationSeconds: number;
  geometry: [number, number][]; // [lat, lon][]
}

const OSRM_PROFILE: Record<TravelMode, string> = {
  driving: "car",
  cycling: "bike",
  walking: "foot",
};

const TRAVEL_LABEL: Record<TravelMode, string> = {
  driving: "Drive",
  cycling: "Bike",
  walking: "Walk",
};

const formatDistance = (m: number) => {
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
};

const formatDuration = (s: number) => {
  if (s < 60) return `${Math.round(s)} s`;
  const totalMin = Math.round(s / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};

async function geocode(q: string, limit = 5): Promise<GeocodeResult[]> {
  const resp = await fetchTimeout(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=${limit}&addressdetails=1`,
    { headers: { Accept: "application/json" }, timeoutMs: 10000 }
  );
  const raw: GeocodeResult[] = await resp.json();
  return raw.map((d) => ({ ...d, lat: parseFloat(String(d.lat)), lon: parseFloat(String(d.lon)) }));
}

async function reverseGeocode(lat: number, lon: number): Promise<GeocodeResult | null> {
  try {
    const resp = await fetchTimeout(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
      { headers: { Accept: "application/json" }, timeoutMs: 10000 }
    );
    const d = await resp.json();
    if (!d || !d.lat) return null;
    return { ...d, lat: parseFloat(String(d.lat)), lon: parseFloat(String(d.lon)) };
  } catch { return null; }
}

async function fetchRoute(from: { lat: number; lon: number }, to: { lat: number; lon: number }, mode: TravelMode): Promise<RouteInfo | null> {
  try {
    const profile = OSRM_PROFILE[mode];
    const url = `https://router.project-osrm.org/route/v1/${profile}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`;
    const resp = await fetchTimeout(url, { timeoutMs: 12000 });
    const data = await resp.json();
    if (!data?.routes?.[0]) return null;
    const r = data.routes[0];
    const coords: [number, number][] = (r.geometry?.coordinates ?? []).map(
      (c: [number, number]) => [c[1], c[0]] as [number, number],
    );
    return {
      distanceMeters: r.distance,
      durationSeconds: r.duration,
      geometry: coords,
    };
  } catch { return null; }
}

const LocationMapPanel = ({ query, onClose }: LocationMapPanelProps) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const routeLayerRef = useRef<Leaflet.Layer | null>(null);
  const originMarkerRef = useRef<Leaflet.Marker | null>(null);
  const destMarkersRef = useRef<Leaflet.LayerGroup | null>(null);

  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [active, setActive] = useState<GeocodeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Routing state
  const [origin, setOrigin] = useState<GeocodeResult | null>(null);
  const [originInput, setOriginInput] = useState("");
  const [originLoading, setOriginLoading] = useState(false);
  const [originError, setOriginError] = useState<string | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>("driving");
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  // Geocode the query (destination) — live, no API key
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const parsed = await geocode(query, 5);
        if (cancelled) return;
        setResults(parsed);
        setActive(parsed[0] ?? null);
        if (parsed.length === 0) setError("No location matches found.");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Geocoding failed.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [query]);

  // Initialize Leaflet map (dark theme via CartoDB Dark Matter tiles)
  useEffect(() => {
    if (!active || !mapContainerRef.current) return;
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled) return;

      if (mapRef.current) {
        try { mapRef.current?.remove(); } catch { /* ignore */ }
        mapRef.current = null;
      }
      const map = L.map(mapContainerRef.current!, {
        center: [active.lat, active.lon],
        zoom: 14,
        zoomControl: false,
        attributionControl: false,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 20,
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.control.attribution({ position: "bottomleft", prefix: false })
        .addAttribution('© <a href="https://openstreetmap.org">OSM</a> · © <a href="https://carto.com/attributions">CARTO</a> · routing © <a href="https://project-osrm.org">OSRM</a>')
        .addTo(map);

      destMarkersRef.current = L.layerGroup().addTo(map);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        try { mapRef.current?.remove(); } catch { /* ignore */ }
        mapRef.current = null;
      }
    };
    // intentionally only on first active to construct map; updates handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!active && !mapRef.current]);

  // Render destination markers when results / active change
  useEffect(() => {
    if (!mapRef.current || !destMarkersRef.current) return;
    (async () => {
      const L = await import("leaflet");
      const layer = destMarkersRef.current;
      if (!layer) return;
      layer.clearLayers();
      results.forEach((r) => {
        const isActive = active && r.lat === active.lat && r.lon === active.lon;
        // Golden destination pin for the active location ("on-target" marker),
        // muted monochrome teardrop for the alternates so the eye locks on the gold.
        const gold = "#f5b942";        // warm signal-amber
        const goldGlow = "#ffd166";
        const size = isActive ? 34 : 24;
        const inner = isActive ? 10 : 7;
        const html = isActive
          ? `<div style="
                position:relative;width:${size}px;height:${size}px;
                filter:drop-shadow(0 6px 14px rgba(245,185,66,0.35));
              ">
                <div style="
                  position:absolute;inset:0;border-radius:50% 50% 50% 0;
                  background:linear-gradient(135deg, ${goldGlow}, ${gold});
                  transform:rotate(-45deg);
                  border:2px solid hsl(var(--background));
                  box-shadow:0 0 0 3px rgba(245,185,66,0.18), 0 6px 16px rgba(0,0,0,0.55);
                  display:flex;align-items:center;justify-content:center;
                ">
                  <div style="
                    width:${inner}px;height:${inner}px;border-radius:50%;
                    background:hsl(var(--background));transform:rotate(45deg);
                  "></div>
                </div>
                <div style="
                  position:absolute;left:50%;top:50%;width:${size + 18}px;height:${size + 18}px;
                  margin-left:-${(size + 18) / 2}px;margin-top:-${(size + 18) / 2}px;
                  border-radius:50%;border:1px solid rgba(245,185,66,0.45);
                  animation:aureonPulse 2s ease-out infinite;pointer-events:none;
                "></div>
              </div>`
          : `<div style="
                width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;
                background:hsl(var(--foreground));
                transform:rotate(-45deg);
                border:2px solid hsl(var(--background));
                box-shadow:0 4px 14px rgba(0,0,0,0.6);
                display:flex;align-items:center;justify-content:center;
                opacity:0.55;
              ">
                <div style="width:${inner}px;height:${inner}px;border-radius:50%;background:hsl(var(--background));transform:rotate(45deg);"></div>
              </div>`;
        const icon = L.divIcon({
          className: "",
          html,
          iconSize: [size, size],
          iconAnchor: [size / 2, size],
        });
        const m = L.marker([r.lat, r.lon], { icon }).addTo(layer);
        m.bindTooltip(r.display_name, { direction: "top", offset: [0, -size], className: "leaflet-dark-tooltip" });
        m.on("click", () => setActive(r));
      });
    })();
  }, [results, active]);

  // Re-center on active change
  useEffect(() => {
    if (mapRef.current && active && !route) {
      try { mapRef.current?.flyTo([active.lat, active.lon], 15, { duration: 0.7 }); } catch { /* ignore */ }
    }
  }, [active, route]);

  // Render origin marker + route polyline whenever they change
  useEffect(() => {
    if (!mapRef.current) return;
    (async () => {
      const L = await import("leaflet");
      const map = mapRef.current;
      if (!map) return;

      // Origin marker
      if (originMarkerRef.current) {
        try { if (originMarkerRef.current) map.removeLayer(originMarkerRef.current); } catch { /* ignore */ }
        originMarkerRef.current = null;
      }
      if (origin) {
        const icon = L.divIcon({
          className: "",
          html: `<div style="
            width:22px;height:22px;border-radius:50%;
            background:hsl(var(--accent));
            border:3px solid hsl(var(--background));
            box-shadow:0 0 0 2px hsl(var(--accent) / 0.4), 0 4px 12px rgba(0,0,0,0.6);
          "></div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        const m = L.marker([origin.lat, origin.lon], { icon }).addTo(map);
        m.bindTooltip("Your location · " + origin.display_name, {
          direction: "top", offset: [0, -10], className: "leaflet-dark-tooltip",
        });
        originMarkerRef.current = m;
      }

      // Route polyline
      if (routeLayerRef.current) {
        try { if (routeLayerRef.current) map.removeLayer(routeLayerRef.current); } catch { /* ignore */ }
        routeLayerRef.current = null;
      }
      if (route && route.geometry.length > 1) {
        // Glow underline + sharp top line for premium look
        const glow = L.polyline(route.geometry, {
          color: "hsl(var(--foreground))",
          weight: 8,
          opacity: 0.18,
          lineCap: "round",
        });
        const line = L.polyline(route.geometry, {
          color: "hsl(var(--foreground))",
          weight: 3,
          opacity: 0.95,
          lineCap: "round",
        });
        const group = L.layerGroup([glow, line]).addTo(map);
        routeLayerRef.current = group;

        // Fit bounds to encompass route
        try {
          const bounds = L.latLngBounds(route.geometry.map((c) => L.latLng(c[0], c[1])));
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
        } catch { /* ignore */ }
      }
    })();
  }, [origin, route]);

  // When origin + active + travelMode change → fetch route
  useEffect(() => {
    if (!origin || !active) { setRoute(null); return; }
    let cancelled = false;
    setRouteLoading(true);
    setRouteError(null);
    (async () => {
      const r = await fetchRoute(
        { lat: origin.lat, lon: origin.lon },
        { lat: active.lat, lon: active.lon },
        travelMode,
      );
      if (cancelled) return;
      if (!r) {
        setRoute(null);
        setRouteError("Could not compute route between these points.");
      } else {
        setRoute(r);
      }
      setRouteLoading(false);
    })();
    return () => { cancelled = true; };
  }, [origin, active, travelMode]);

  const coords = useMemo(() => active ? `${active.lat.toFixed(5)}, ${active.lon.toFixed(5)}` : "", [active]);

  const copyCoords = async () => {
    if (!coords) return;
    await navigator.clipboard.writeText(coords);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setOriginError("Geolocation not supported by this browser.");
      return;
    }
    setOriginError(null);
    setOriginLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const reverse = await reverseGeocode(latitude, longitude);
        const fallback: GeocodeResult = {
          lat: latitude, lon: longitude,
          display_name: reverse?.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        };
        setOrigin(reverse ?? fallback);
        setOriginInput(reverse?.display_name ?? fallback.display_name);
        setOriginLoading(false);
      },
      (err) => {
        setOriginLoading(false);
        setOriginError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. Type an address instead."
            : "Could not get your location."
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };

  const submitOrigin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!originInput.trim()) return;
    setOriginLoading(true);
    setOriginError(null);
    try {
      const matches = await geocode(originInput, 1);
      if (matches.length === 0) {
        setOriginError("No match for that address.");
      } else {
        setOrigin(matches[0]);
      }
    } catch (e) {
      setOriginError(e instanceof Error ? e.message : "Lookup failed.");
    } finally {
      setOriginLoading(false);
    }
  };

  const clearRoute = () => {
    setOrigin(null);
    setOriginInput("");
    setRoute(null);
    setRouteError(null);
    setOriginError(null);
  };

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/* Click-outside backdrop on all viewports — closes the panel */}
      <div
        className="fixed inset-0 z-[60] bg-background/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-label="close map"
      />

      <div
        className="fixed inset-y-0 right-0 w-full sm:max-w-xl z-[61] bg-card/95 backdrop-blur-xl border-l border-border/20 shadow-2xl flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/15 shrink-0">
          <div className="min-w-0 flex-1 mr-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-foreground/70 shrink-0" />
              <h3 className="text-sm font-normal text-foreground truncate">{query}</h3>
            </div>
            {active && (
              <p className="text-[10px] text-muted-foreground/40 font-mono truncate mt-0.5">{coords}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {active && (
              <a
                href={`https://www.openstreetmap.org/?mlat=${active.lat}&mlon=${active.lon}#map=16/${active.lat}/${active.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors"
                title="open in OpenStreetMap"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="p-2 rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-foreground/10 transition-colors"
              aria-label="close map"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Routing controls */}
        {active && (
          <div className="border-b border-border/15 bg-foreground/[0.02] px-4 py-3 shrink-0 space-y-2">
            <form onSubmit={submitOrigin} className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50 pointer-events-none" />
                <input
                  type="text"
                  value={originInput}
                  onChange={(e) => setOriginInput(e.target.value)}
                  placeholder="your starting location…"
                  className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-card/50 border border-border/25 text-[11px] font-light text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-border/50 focus:bg-card/80 transition-colors"
                />
              </div>
              <button
                type="button"
                onClick={useMyLocation}
                disabled={originLoading}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-border/25 bg-card/50 hover:bg-foreground/[0.06] hover:border-border/40 text-[10px] font-light text-foreground/80 transition-colors disabled:opacity-50"
                title="use my current location"
              >
                {originLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <LocateFixed className="h-3 w-3" />}
                <span className="hidden sm:inline">me</span>
              </button>
              <button
                type="submit"
                disabled={!originInput.trim() || originLoading}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-foreground/30 bg-foreground/[0.08] hover:bg-foreground/[0.14] text-[10px] font-light text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RouteIcon className="h-3 w-3" />
                Route
              </button>
            </form>

            {/* Travel mode + meta */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex rounded-lg border border-border/25 bg-card/40 p-0.5">
                {(["driving", "cycling", "walking"] as const).map((m) => {
                  const Icon = m === "driving" ? Car : m === "cycling" ? Bike : Footprints;
                  const active = travelMode === m;
                  return (
                    <button
                      key={m}
                      onClick={() => setTravelMode(m)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-light transition-colors ${
                        active
                          ? "bg-foreground/[0.1] text-foreground"
                          : "text-muted-foreground/70 hover:text-foreground"
                      }`}
                      title={TRAVEL_LABEL[m]}
                    >
                      <Icon className="h-3 w-3" />
                      <span className="hidden sm:inline">{TRAVEL_LABEL[m]}</span>
                    </button>
                  );
                })}
              </div>

              {routeLoading && (
                <span className="inline-flex items-center gap-1 text-[10px] font-light text-muted-foreground/70">
                  <Loader2 className="h-3 w-3 animate-spin" /> Calculating route…
                </span>
              )}
              {!routeLoading && route && (
                <span className="inline-flex items-center gap-2 text-[10px] font-light">
                  <span className="inline-flex items-center gap-1 text-foreground">
                    <Clock className="h-3 w-3 text-foreground/70" />
                    {formatDuration(route.durationSeconds)}
                  </span>
                  <span className="text-border/40">·</span>
                  <span className="text-muted-foreground/80">{formatDistance(route.distanceMeters)}</span>
                </span>
              )}
              {origin && (
                <button
                  onClick={clearRoute}
                  className="ml-auto text-[10px] font-light text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {(originError || routeError) && (
              <p className="text-[10px] font-light text-destructive/90">{originError || routeError}</p>
            )}
          </div>
        )}

        {/* Map */}
        <div className="relative flex-1 bg-background min-h-[260px]">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <Loader2 className="h-5 w-5 text-foreground/60 animate-spin" />
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
              <Globe className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-light text-muted-foreground">{error}</p>
            </div>
          )}
          <div ref={mapContainerRef} className="absolute inset-0" />
        </div>

        {/* Active result details + alternates */}
        {active && (
          <div className="border-t border-border/15 bg-card/95 max-h-[34vh] overflow-y-auto shrink-0">
            <div className="px-4 py-3 border-b border-border/10">
              <p className="text-[10px] font-light text-muted-foreground/50 uppercase tracking-wider mb-1">selected location</p>
              <p className="text-xs font-light text-foreground/90 break-words">{active.display_name}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <button
                  onClick={copyCoords}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-light text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied" : coords}
                </button>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${active.lat},${active.lon}${origin ? `&origin=${origin.lat},${origin.lon}` : ""}&travelmode=${travelMode}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-light text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
                >
                  <Navigation className="h-3 w-3" /> Open in Google Maps
                </a>
              </div>
            </div>

            {results.length > 1 && (
              <div className="px-2 py-2">
                <p className="px-2 text-[10px] font-light text-muted-foreground/50 uppercase tracking-wider mb-1">other matches</p>
                {results.filter((r) => r !== active).map((r, i) => (
                  <button
                    key={`${r.lat}-${r.lon}-${i}`}
                    onClick={() => setActive(r)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-foreground/5 transition-colors"
                  >
                    <p className="text-[11px] font-light text-foreground/80 line-clamp-2">{r.display_name}</p>
                    <p className="text-[9px] font-mono text-muted-foreground/40 mt-0.5">{r.lat.toFixed(4)}, {r.lon.toFixed(4)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dark map styles */}
      <style>{`
        .leaflet-container { background: #0a0a0a; font-family: inherit; }
        .leaflet-control-zoom a {
          background: hsl(var(--card)) !important;
          color: hsl(var(--foreground)) !important;
          border-color: hsl(var(--border) / 0.3) !important;
        }
        .leaflet-control-zoom a:hover { background: hsl(var(--foreground) / 0.1) !important; }
        .leaflet-control-attribution {
          background: hsl(var(--card) / 0.8) !important;
          color: hsl(var(--muted-foreground) / 0.6) !important;
          font-size: 9px !important;
          backdrop-filter: blur(8px);
        }
        .leaflet-control-attribution a { color: hsl(var(--foreground) / 0.7) !important; }
        .leaflet-dark-tooltip {
          background: hsl(var(--card)) !important;
          color: hsl(var(--foreground)) !important;
          border: 1px solid hsl(var(--border) / 0.3) !important;
          border-radius: 8px !important;
          font-size: 10px !important;
          font-weight: 300 !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5) !important;
          padding: 6px 10px !important;
          max-width: 280px !important;
          white-space: normal !important;
        }
        .leaflet-dark-tooltip::before { display: none !important; }
      `}</style>
    </>
  );
};

export default LocationMapPanel;
