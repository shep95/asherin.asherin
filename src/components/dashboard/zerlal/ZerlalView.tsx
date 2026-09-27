import { useState, lazy, Suspense } from "react";
import { Shield, Bell, Plus } from "lucide-react";
import ZerlalNav from "./ZerlalNav";
import { useZerlalFindings } from "./useZerlalData";
import type { ZerlalScreen } from "./types";
import { ScanProvider } from "./scanContext";

// Every screen is lazy-loaded so opening Zerlal only pulls the active screen's
// bundle instead of dragging in ScanModal (746 LOC), ProjectView (543 LOC),
// IntelligenceModule, DomainRecon, etc. on first paint.
const DashboardScreen        = lazy(() => import("./DashboardScreen"));
const ProjectView            = lazy(() => import("./ProjectView"));
const FindingDetail          = lazy(() => import("./FindingDetail"));
const ReportsScreen          = lazy(() => import("./ReportsScreen"));
const IntegrationsScreen     = lazy(() => import("./IntegrationsScreen"));
const IntelligenceModule     = lazy(() => import("./IntelligenceModule"));
const DeviceSecurityScanner  = lazy(() => import("./DeviceSecurityScanner"));
const DomainReconScreen      = lazy(() => import("./DomainReconScreen"));
const PathMapScreen          = lazy(() => import("./PathMapScreen"));
const ScanModal              = lazy(() => import("./ScanModal"));
const SigmaRuleEngine        = lazy(() => import("./SigmaRuleEngine"));
const StixTaxiiFeed          = lazy(() => import("./StixTaxiiFeed"));
const LogCorrelationEngine   = lazy(() => import("./LogCorrelationEngine"));
const CertTransparencyMonitor = lazy(() => import("./CertTransparencyMonitor"));
const CodeVulnScanner        = lazy(() => import("./CodeVulnScanner"));
const PortScannerUI          = lazy(() => import("./PortScannerUI"));
const WhoisTimeline          = lazy(() => import("./WhoisTimeline"));
const TorExitNodeChecker     = lazy(() => import("./TorExitNodeChecker"));
const TeamScreen             = lazy(() => import("./TeamScreen"));
const SettingsScreen         = lazy(() => import("./SettingsScreen"));
const GhostChainScanner      = lazy(() => import("./GhostChainScanner"));

const intelligenceScreens: ZerlalScreen[] = [
  "compliance", "supply-chain", "quantum", "ai-security", "zero-trust",
  "ot-ics", "incident", "threat-intel", "dark-web", "ueba", "red-team",
  "exec-risk", "cvd-pipeline", "device-security", "governance", "deployment", "workforce", "pattern-engine"
];

const ScreenFallback = () => (
  <div className="flex-1 flex items-center justify-center">
    <div className="text-[10px] text-muted-foreground/30 tracking-[0.18em] uppercase">Loading…</div>
  </div>
);

const ZerlalView = () => {
  const [activeScreen, setActiveScreen] = useState<ZerlalScreen>("dashboard");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanModalMounted, setScanModalMounted] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { findings } = useZerlalFindings();
  const criticalCount = findings.filter(f => f.severity === "critical" && f.status === "open").length;

  const openScan = () => { setScanModalMounted(true); setScanModalOpen(true); };

  const handleNavigate = (screen: ZerlalScreen) => {
    setActiveScreen(screen);
    if (screen !== "project") setSelectedProjectId(null);
    if (screen !== "finding") setSelectedFindingId(null);
  };

  const handleSelectProject = (id: string) => {
    setSelectedProjectId(id);
    setActiveScreen("project");
  };

  const handleSelectFinding = (id: string) => {
    setSelectedFindingId(id);
    setActiveScreen("finding");
  };

  const handleBackFromProject = () => {
    setSelectedProjectId(null);
    setActiveScreen("dashboard");
  };

  const handleBackFromFinding = () => {
    setSelectedFindingId(null);
    setActiveScreen(selectedProjectId ? "project" : "dashboard");
  };

  const handleScanComplete = () => {
    setRefreshKey(k => k + 1);
  };

  const handleScanStarted = (projectId: string) => {
    setSelectedProjectId(projectId);
    setActiveScreen("project");
    setScanModalOpen(false);
    setRefreshKey(k => k + 1);
  };

  const renderScreen = () => {
    const toolScreens: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
      "sigma-rules": SigmaRuleEngine,
      "stix-feed": StixTaxiiFeed,
      "log-correlation": LogCorrelationEngine,
      "cert-transparency": CertTransparencyMonitor,
      "code-scanner": CodeVulnScanner,
      "port-scanner": PortScannerUI,
      "whois-timeline": WhoisTimeline,
      "tor-checker": TorExitNodeChecker,
      "ghostchain": GhostChainScanner,
    };

    if (activeScreen in toolScreens) {
      const Component = toolScreens[activeScreen];
      return <Component />;
    }

    if (activeScreen === "path-map")        return <PathMapScreen />;
    if (activeScreen === "domain-recon")    return <DomainReconScreen onSelectFinding={handleSelectFinding} />;
    if (activeScreen === "device-security") return <DeviceSecurityScanner />;
    if (intelligenceScreens.includes(activeScreen)) return <IntelligenceModule screen={activeScreen} />;

    switch (activeScreen) {
      case "dashboard":
        return (
          <DashboardScreen
            key={refreshKey}
            onNavigate={handleNavigate}
            onSelectProject={handleSelectProject}
            onSelectFinding={handleSelectFinding}
            onOpenScan={openScan}
          />
        );
      case "project":
        return (
          <ProjectView
            key={`${selectedProjectId}-${refreshKey}`}
            projectId={selectedProjectId}
            onSelectProject={handleSelectProject}
            onSelectFinding={handleSelectFinding}
            onBack={handleBackFromProject}
            onRetryScan={openScan}
          />
        );
      case "finding":
        return selectedFindingId ? (
          <FindingDetail key={selectedFindingId} findingId={selectedFindingId} onBack={handleBackFromFinding} />
        ) : (
          <ProjectView projectId={null} onSelectProject={handleSelectProject} onSelectFinding={handleSelectFinding} onBack={handleBackFromProject} onRetryScan={openScan} />
        );
      case "reports":      return <ReportsScreen />;
      case "integrations": return <IntegrationsScreen />;
      case "team":         return <TeamScreen />;
      case "settings":     return <SettingsScreen />;
      default:             return null;
    }
  };

  return (
    <ScanProvider>
      <div className="h-full flex flex-col">
        {/* Top Bar */}
        <div className="shrink-0 border-b border-border/[0.06] px-5 py-2.5 flex items-center justify-between backdrop-blur-md bg-background/40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-foreground/[0.04] border border-border/[0.08] flex items-center justify-center">
              <Shield className="h-3.5 w-3.5 text-foreground/60" />
            </div>
            <div>
              <h1 className="text-[11px] font-light text-foreground/90">asherin.cyber</h1>
              <p className="text-[8px] text-muted-foreground/30 uppercase">infrastructure intelligence</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openScan}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground/[0.06] text-[10px] text-foreground/60 hover:bg-foreground/[0.1] transition-colors"
            >
              <Plus className="h-3 w-3" /> Scan Now
            </button>
            <button className="p-2 rounded-lg hover:bg-foreground/[0.03] transition-colors relative">
              <Bell className="h-3.5 w-3.5 text-muted-foreground/30" />
              {criticalCount > 0 && <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-400" />}
            </button>
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          <ZerlalNav activeScreen={activeScreen} onNavigate={handleNavigate} criticalCount={criticalCount} />
          <Suspense fallback={<ScreenFallback />}>{renderScreen()}</Suspense>
        </div>

        {scanModalMounted && (
          <Suspense fallback={null}>
            <ScanModal
              open={scanModalOpen}
              onClose={() => setScanModalOpen(false)}
              onScanComplete={handleScanComplete}
              onScanStarted={handleScanStarted}
            />
          </Suspense>
        )}
      </div>
    </ScanProvider>
  );
};

export default ZerlalView;
