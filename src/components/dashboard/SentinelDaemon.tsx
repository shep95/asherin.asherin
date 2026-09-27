import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { bootSentinel } from "@/lib/sentinel/alwaysOn";
import { bootOpLayer } from "@/lib/op/opDaemon";
import { bootSentinelFabric } from "@/lib/fabric/bridges/sentinelFabric";

/**
 * Mounts once inside the app shell and hands control to the always-on sentinel
 * daemon. Renders nothing, sits above the router, and boots the moment a session
 * exists: protection must not depend on which page is open, which tab is
 * selected, or on the user remembering to press anything.
 *
 * Gated on an authenticated session so an anonymous visitor on the marketing
 * site is never asked for location or notification permission.
 */
const SentinelDaemon = () => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  useEffect(() => {
    if (!user || pathname === "/asherin.acatalepsy") return;
    bootSentinel();
    // Normalizing sentinel's own lanes into the shared fabric costs nothing
    // when nothing is capturing, and means eagle.eye can name this account's
    // microphones and receivers without the sentinel room ever being opened.
    bootSentinelFabric();
    // The OP layer arms itself the moment a session exists on ANY device:
    // protection is scoped to the account, so it must not wait for the
    // operator to open the panel that reports it.
    bootOpLayer();
  }, [user]);
  return null;
};

export default SentinelDaemon;
