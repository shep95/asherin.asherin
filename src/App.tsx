import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import ByokRequiredDialog from "@/components/ByokRequiredDialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { StepUpProvider } from "@/components/auth/StepUpProvider";
import React, { Suspense } from "react";
import RootErrorBoundary from "@/components/RootErrorBoundary";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";

import ProtectedRoute from "./components/ProtectedRoute";
import CommandPalette from "./components/CommandPalette";
import RouteSessionTracker from "./components/RouteSessionTracker";
import VisitLedgerTracker from "./components/VisitLedgerTracker";
import AutoTripMount from "./components/AutoTripMount";
import SentinelDaemon from "./components/dashboard/SentinelDaemon";
import RouteSeo from "./components/RouteSeo";
import HumbleTypography from "./components/HumbleTypography";

/*
 * Public surface, on purpose small:
 *   /            landing (also /auth, the sign-in overlay)
 *   /founder     who builds this
 *   /blog/*      the journal, exactly what the /blog index lists
 *   /terms /privacy /security-policy
 *   /software /for /forums /asherin.acatalepsy /asherin.analytics  (linked from the landing page)
 * Everything signed-in lives under /dashboard. Retired public pages redirect to
 * the closest live surface instead of falling into the 404 catch-all.
 */

const Index = lazy(() => import("./pages/Index"));
const AsherinAnalytics = lazy(() => import("./pages/AsherinAnalytics"));
const AsherinAcatalepsy = lazy(() => import("./pages/AsherinAcatalepsy"));
const NotFound = lazy(() => import("./pages/NotFound"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const SecurityPolicy = lazy(() => import("./pages/SecurityPolicy"));
const Founder = lazy(() => import("./pages/Founder"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Forums = lazy(() => import("./pages/Forums"));
const Software = lazy(() => import("./pages/Software"));
const ForHub = lazy(() => import("./pages/ForHub"));
const WhiteboardPage = lazy(() => import("./pages/WhiteboardPage"));

const Blog = lazy(() => import("./pages/Blog"));
const BlogAsherFoldMemory = lazy(() => import("./pages/blog/AsherFoldMemory"));
const BlogWhatIsAiOsint = lazy(() => import("./pages/blog/WhatIsAiOsint"));
const BlogSovereignAiPlatforms = lazy(() => import("./pages/blog/SovereignAiPlatforms"));
const BlogAiWithoutRestrictions = lazy(() => import("./pages/blog/AiWithoutRestrictions"));
const BlogTheTruthAndRealityOfWars = lazy(() => import("./pages/blog/TheTruthAndRealityOfWars"));
const BlogZaxinTacticalBleIntelligence = lazy(() => import("./pages/blog/ZaxinTacticalBleIntelligence"));
const BlogCodeNarrativeQuantumCollapse = lazy(() => import("./pages/blog/CodeNarrativeQuantumCollapse"));
const BlogAureonLegalAdvisor = lazy(() => import("./pages/blog/AureonLegalAdvisor"));
const BlogAsherinEngineDeepTime = lazy(() => import("./pages/blog/AsherinEngineDeepTime"));
const BlogCloudIntelligenceSuite = lazy(() => import("./pages/blog/CloudIntelligenceSuite"));
const BlogAsherinMapsFindMy = lazy(() => import("./pages/blog/AsherinMapsFindMy"));
const BlogTransitGuardian = lazy(() => import("./pages/blog/TransitGuardian"));
const BlogBulwarkCounterSurveillance = lazy(() => import("./pages/blog/BulwarkCounterSurveillance"));
const BlogAutonomousIntelligenceLoop = lazy(() => import("./pages/blog/AutonomousIntelligenceLoop"));
const BlogEliteCorporationsAlgorithmsVsAxrlen = lazy(() => import("./pages/blog/EliteCorporationsAlgorithmsVsAxrlen"));
const BlogAiVulnerabilityScanningExplained = lazy(() => import("./pages/blog/AiVulnerabilityScanningExplained"));
const BlogVulnerabilityChainingExplained = lazy(() => import("./pages/blog/VulnerabilityChainingExplained"));
const BlogHowAiPredictiveForecastingWorks = lazy(() => import("./pages/blog/HowAiPredictiveForecastingWorks"));
const BlogHowAureonUsesCseoResearch = lazy(() => import("./pages/blog/HowAureonUsesCseoResearch"));
const BlogHowWeMakeAureonSoundHuman = lazy(() => import("./pages/blog/HowWeMakeAureonSoundHuman"));
const BlogAiStackForIndianStartups = lazy(() => import("./pages/blog/AiStackForIndianStartups"));
const BlogPersonalitiesToThinkingPatterns = lazy(() => import("./pages/blog/PersonalitiesToThinkingPatterns"));

const BLOG_ROUTES: [string, React.LazyExoticComponent<React.ComponentType>][] = [
  ["asher-fold-memory", BlogAsherFoldMemory],
  ["what-is-ai-osint", BlogWhatIsAiOsint],
  ["sovereign-ai-platforms", BlogSovereignAiPlatforms],
  ["ai-without-restrictions", BlogAiWithoutRestrictions],
  ["the-truth-and-reality-of-wars", BlogTheTruthAndRealityOfWars],
  ["zaxin-tactical-ble-intelligence", BlogZaxinTacticalBleIntelligence],
  ["code-narrative-quantum-collapse", BlogCodeNarrativeQuantumCollapse],
  ["aureon-legal-advisor-multi-jurisdictional", BlogAureonLegalAdvisor],
  ["asherin-engine-deep-time", BlogAsherinEngineDeepTime],
  ["cloud-intelligence-suite", BlogCloudIntelligenceSuite],
  ["asherin-maps-find-my", BlogAsherinMapsFindMy],
  ["transit-guardian", BlogTransitGuardian],
  ["bulwark-counter-surveillance", BlogBulwarkCounterSurveillance],
  ["autonomous-intelligence-loop", BlogAutonomousIntelligenceLoop],
  ["elite-corporations-algorithms-vs-axrlen", BlogEliteCorporationsAlgorithmsVsAxrlen],
  ["ai-vulnerability-scanning-explained", BlogAiVulnerabilityScanningExplained],
  ["vulnerability-chaining-explained", BlogVulnerabilityChainingExplained],
  ["how-ai-predictive-forecasting-works", BlogHowAiPredictiveForecastingWorks],
  ["how-aureon-uses-c-seo-research", BlogHowAureonUsesCseoResearch],
  ["how-we-make-aureon-sound-human", BlogHowWeMakeAureonSoundHuman],
  ["ai-stack-for-indian-startups", BlogAiStackForIndianStartups],
  ["personalities-are-not-thinking-patterns", BlogPersonalitiesToThinkingPatterns],
];

/** Old public paths → the live surface that replaced them. */
const REDIRECTS: [string, string][] = [
  ["/pricing", "/software"],
  ["/features", "/software"],
  ["/benchmark", "/software"],
  ["/investors", "/software"],
  ["/valuation", "/software"],
  ["/updates", "/blog"],
  ["/sources", "/blog"],
  ["/asher", "/"],
  ["/asher-dashboard", "/dashboard"],
  ["/zophiel", "/dashboard/search"],
  ["/search", "/dashboard/search"],
  ["/glossary", "/blog"],
  ["/glossary/*", "/blog"],
  ["/feature/*", "/software"],
  ["/blog/comparison", "/software"],
  ["/blog/paid-seat-free-door", "/blog"],
  ["/blog/aureon-pricing-explained", "/blog"],
  ["/blog/asherin-pricing-explained", "/blog"],
  ["/blog/predictions/*", "/blog"],
  ["/blog/asherin-legal-advisor-multi-jurisdictional", "/blog/aureon-legal-advisor-multi-jurisdictional"],
  ["/blog/how-asherin-uses-c-seo-research", "/blog/how-aureon-uses-c-seo-research"],
  ["/blog/how-we-make-asherin-sound-human", "/blog/how-we-make-aureon-sound-human"],
  ["/asherin.gov/*", "/software"],
  ["/asherin-gov/*", "/software"],
  ["/houseofasher/*", "/software"],
  ["/zaxin/*", "/software"],
  ["/hosrad", "/software"],
  ["/HOSRAD", "/software"],
  ["/symbols-of-the-bible", "/software"],
];

/** Retired dashboard modules — deep links collapse onto chat. */
const RETIRED_DASHBOARD = [
  "nomad", "cipher", "plugins", "video-intelligence", "vibe-video", "cross", "bulwark", "geo-audit",
  "media2code", "elion", "tracker", "predictive", "lavba", "zaplen", "self-learning", "self-access",
  "imagine-intelligence", "security", "persona-store", "subscription",
];

const PageLoader = () => (
  <div className="flex h-screen w-full items-center justify-center bg-background">
    <div className="text-sm font-extralight tracking-[0.2em] text-muted-foreground animate-pulse">asherin</div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A tab return must never blank a mounted surface.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

/**
 * Route-scoped recovery. A throw inside any page module is contained to the
 * routed view and clears itself as soon as the pathname changes.
 */
const RouteBoundary = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();
  return (
    <RootErrorBoundary scope="route" resetKey={pathname}>
      {children}
    </RootErrorBoundary>
  );
};

const AppShell = () => {
  const { pathname } = useLocation();
  if (pathname === "/asherin.acatalepsy") {
    return (
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <RouteSeo />
        <RouteBoundary>
          <Suspense fallback={<PageLoader />}>
            <main>
              <AsherinAcatalepsy />
            </main>
          </Suspense>
        </RouteBoundary>
      </TooltipProvider>
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StepUpProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <CommandPalette />
            <RouteSessionTracker />
            <VisitLedgerTracker />
            <AutoTripMount />
            <SentinelDaemon />
            <RouteSeo />
            <HumbleTypography />
            <ByokRequiredDialog />

            <RouteBoundary>
              <Suspense fallback={<PageLoader />}>
                <main>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    {/* there is no sign-in: the old /auth door opens the workspace. */}
                    <Route path="/auth" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/asherin.acatalepsy" element={<AsherinAcatalepsy />} />
                    <Route path="/asherin.analytics" element={<AsherinAnalytics />} />
                    <Route path="/terms" element={<TermsOfService />} />
                    <Route path="/privacy" element={<PrivacyPolicy />} />
                    <Route path="/security-policy" element={<SecurityPolicy />} />
                    <Route path="/founder" element={<Founder />} />
                    <Route path="/forums" element={<Forums />} />
                    <Route path="/software" element={<Software />} />
                    <Route path="/for" element={<ForHub />} />
                    <Route path="/for/:slug" element={<ForHub />} />
                    <Route path="/blog" element={<Blog />} />
                    {BLOG_ROUTES.map(([slug, Page]) => (
                      <Route key={slug} path={`/blog/${slug}`} element={<Page />} />
                    ))}
                    {REDIRECTS.map(([from, to]) => (
                      <Route key={from} path={from} element={<Navigate to={to} replace />} />
                    ))}
                    <Route
                      path="/whiteboard"
                      element={
                        <ProtectedRoute>
                          <WhiteboardPage />
                        </ProtectedRoute>
                      }
                    />
                    {RETIRED_DASHBOARD.map((retired) => (
                      <Route key={retired} path={`/dashboard/${retired}`} element={<Navigate to="/dashboard" replace />} />
                    ))}
                    <Route
                      path="/dashboard/:view?"
                      element={
                        <ProtectedRoute>
                          <Dashboard />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </main>
              </Suspense>
            </RouteBoundary>
          </TooltipProvider>
        </StepUpProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

const isElectronFileProtocol = typeof window !== "undefined" && window.location.protocol === "file:";
const App = () => {
  const Router = isElectronFileProtocol ? HashRouter : BrowserRouter;
  return (
    <Router>
      <AppShell />
    </Router>
  );
};

export default App;
