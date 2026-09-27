/**
 * AUTO TRIP MOUNT
 *
 * One app-lifetime host for the motion sentinel. It lives above the router so a
 * drive that starts while the rider is reading a blog post is still captured,
 * and it only arms for a signed-in session because a trip record has an owner.
 */

import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { autoTrip } from "@/lib/rideshare/autoTrip";

export default function AutoTripMount() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!user || pathname === "/asherin.acatalepsy") return;
    void autoTrip.start();
  }, [user]);

  return null;
}
