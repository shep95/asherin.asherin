import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { updateSessionActivity } from "@/utils/sessionTracker";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tracks the user's current pathname into user_sessions on every route change,
 * AND logs page_view_events with a duration so analytics can compute
 * average time spent per page/software.
 */
export default function RouteSessionTracker() {
  const location = useLocation();
  const { user, session } = useAuth();
  const currentEvent = useRef<{ id: string; path: string; enteredAt: number } | null>(null);
  const prevPublic = useRef<string | null>(null);

  // Finalize duration when leaving a page
  const finalize = async () => {
    const ev = currentEvent.current;
    if (!ev) return;
    const seconds = Math.max(0, Math.round((Date.now() - ev.enteredAt) / 1000));
    if (seconds < 1) return;
    try {
      await supabase.from("page_view_events").update({ duration_seconds: seconds }).eq("id", ev.id);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!user || !session || location.pathname === "/asherin.acatalepsy") return;

    const sid = user.id + "_" + (session.access_token?.substring(0, 8) || "x");
    updateSessionActivity(user.id, sid, location.pathname);

    // Close out previous page event
    finalize();

    // Open a new page event
    (async () => {
      const enteredAt = Date.now();
      const { data, error } = await supabase
        .from("page_view_events")
        .insert({
          user_id: user.id,
          path: location.pathname,
          entered_at: new Date(enteredAt).toISOString(),
          duration_seconds: 0,
        })
        .select("id")
        .single();
      if (!error && data) {
        currentEvent.current = { id: data.id, path: location.pathname, enteredAt };
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, user, session]);

  // Finalize on tab close / unload
  useEffect(() => {
    const onLeave = () => {
      finalize();
    };
    window.addEventListener("beforeunload", onLeave);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) finalize();
    });
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      finalize();
    };
  }, []);

  useEffect(() => {
    const path = location.pathname || "/";
    const skipP = ["/asherin.acatalepsy", "/internal", "/dashboard", "/auth", "/ziaassets", "/asher-dashboard"];
    const skipped = skipP.some((s) => path === s || path.startsWith(s + "/"));
    let zone: string | null = null;
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone.slice(0, 80);
    } catch {
      zone = null;
    }
    let host = null as string | null;
    try {
      if (document.referrer) {
        const u = new URL(document.referrer);
        if (u.hostname !== window.location.hostname) host = u.hostname.replace(/^www\./, "").slice(0, 200);
      }
    } catch {
      /* ignore */
    }
    if (!skipped) {
      void supabase.from("site_traffic_events" as never).insert({
        kind: "pageview",
        path: path.slice(0, 300),
        referrer_host: host,
        source: "live",
        region: zone,
        sub_region: zone,
      } as never);
      const prev = prevPublic.current;
      if (prev && prev !== path) {
        void supabase.from("site_traffic_events" as never).insert({
          kind: "pageview",
          path: prev.slice(0, 300),
          dest: path.slice(0, 400),
          referrer_host: host,
          source: "live",
          region: zone,
          sub_region: zone,
        } as never);
      }
      prevPublic.current = path;
    }
    const onClick = (ev: MouseEvent) => {
      const a = (ev.target as HTMLElement | null)?.closest?.("a") as HTMLAnchorElement | null;
      if (!a?.href) return;
      try {
        const u = new URL(a.href, window.location.origin);
        if (u.hostname === window.location.hostname) return;
        const dest = (u.hostname.replace(/^www\./, "") + u.pathname).slice(0, 400);
        void supabase.from("site_traffic_events" as never).insert({
          kind: "outbound",
          path: path.slice(0, 300),
          dest,
          referrer_host: host,
          source: "live",
          region: zone,
          sub_region: zone,
        } as never);
      } catch {
        /* ignore */
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [location.pathname]);

  return null;
}
