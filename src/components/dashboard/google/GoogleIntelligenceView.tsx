import { useState } from "react";
import {
  Mail, Calendar, HardDrive, Image, Youtube, MapPin, Users,
  Search, Activity, Globe, Shield, Network, Zap,
  Heart, CreditCard, Briefcase, Brain,
  Eye, ShieldCheck, TrendingUp, BarChart3, Clock,
  FileText, Sparkles, Database, ScrollText, ShieldAlert, Radar, MessageSquare, Video, Fingerprint, Ghost, Voicemail,
  HeartPulse,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useIsV2 } from "@/lib/dashboardUiContext";
import NexusChatPanel from "./NexusChatPanel";
import MultiAccountManager from "./MultiAccountManager";
import LocationProphet from "./modules/LocationProphet";
import EmailAssistant from "./modules/EmailAssistant";
import SubscriptionOracle from "./modules/SubscriptionOracle";
import HealthGuardian from "./modules/HealthGuardian";
import CalendarWizard from "./modules/CalendarWizard";
import ContactIntelligence from "./modules/ContactIntelligence";
import CareerPredictor from "./modules/CareerPredictor";
import AITwin from "./modules/AITwin";
import ProductivityIntelligence from "./modules/ProductivityIntelligence";
import ContentIntelligence from "./modules/ContentIntelligence";
import LifePredictions from "./modules/LifePredictions";
import AutomationSuite from "./modules/AutomationSuite";
import SecurityIntelligence from "./modules/SecurityIntelligence";
import EmailForensics from "./modules/EmailForensics";
import VoiceForensics from "./modules/VoiceForensics";
import ScenarioEngine from "./modules/ScenarioEngine";
import ConnectedAppsView from "./modules/ConnectedAppsView";
import YouTubeDataView from "./modules/YouTubeDataView";
import SearchHistoryView from "./modules/SearchHistoryView";
import ChromeDataView from "./modules/ChromeDataView";
import GoogleMeshPanel from "./modules/GoogleMeshPanel";
import SubstrateExplorer from "./modules/SubstrateExplorer";
import ContactVaultPane from "./modules/ContactVaultPane";
import RideshareGuardian from "./modules/RideshareGuardian";
import BluetoothSentinel from "./modules/BluetoothSentinel";
import PhoneMessages from "./modules/PhoneMessages";
import MeetVault from "./modules/MeetVault";
import GhostLedgerPanel from "./modules/GhostLedgerPanel";
import OverwatchTab from "./modules/OverwatchTab";
import VitalsTab from "./modules/VitalsTab";

type GoogleModule =
  | "overview" | "substrate" | "mesh" | "dossiers" | "location" | "email" | "subscriptions" | "health"
  | "calendar" | "contacts" | "career" | "twin" | "productivity" | "content" | "predictions"
  | "overwatch" | "vitals" | "automation" | "security" | "postmark" | "voiceprint" | "ghostmail" | "guardian" | "sentinel" | "messages" | "meet" | "scenarios" | "gmail" | "drive" | "photos" | "youtube"
  | "search" | "fit" | "chrome" | "connected";

/** a directorate is an analytic function, not a product category. */
type Directorate = "collection" | "analysis" | "forecast" | "counterintel";

interface ModuleDef {
  id: GoogleModule;
  label: string;
  /** the short desk name shown above the plain-language label. */
  codename: string;
  icon: React.ElementType;
  /** what the desk reads and produces when it has data — a mandate, not a sales line. */
  mandate: string;
  directorate: Directorate;
}

const DIRECTORATE_ORDER: Directorate[] = ["collection", "analysis", "forecast", "counterintel"];

const DIRECTORATE_BLURB: Record<Directorate, string> = {
  collection: "read raw account traffic into one addressable ledger",
  analysis: "resolve entities, score relationships and read behavioural pattern",
  forecast: "project forward from measured cadence — movement, spend, trajectory",
  counterintel: "exposure surface, credential threat chains and permission audit",
};

// mandates state what each desk computes from the data it is given. none of
// them promise a server, a push notification, an email or a companion app:
// on this device those paths do not exist (see ./offline.ts).
const nexusModules: ModuleDef[] = [
  { id: "substrate", codename: "substrate", label: "intelligence substrate", icon: Database, mandate: "every connected surface indexed into one searchable ledger with findings, a brief and an exportable report", directorate: "collection" },
  { id: "mesh", codename: "mesh", label: "account mesh", icon: Network, mandate: "voiceprint, place cartography, attention ledger and drafting — composes, never transmits", directorate: "collection" },
  { id: "email", codename: "courier", label: "correspondence desk", icon: Mail, mandate: "inbox counters and the most recent messages from the connected mailbox", directorate: "collection" },
  { id: "messages", codename: "signal", label: "phone message intelligence", icon: MessageSquare, mandate: "google voice texts, mms and voicemail mirrored into the mailbox, folded per correspondent and read for intent, obligation and pressure", directorate: "collection" },
  { id: "meet", codename: "vault", label: "meet records", icon: Video, mandate: "meetings reconstructed from calendar and conference records; a recording is listed only when the drive recordings folder returns one", directorate: "collection" },
  { id: "content", codename: "archive", label: "document & media intel", icon: FileText, mandate: "drive files scored for exposure, duplication, decay and subject matter", directorate: "collection" },

  { id: "vitals", codename: "organism", label: "organism vitals", icon: HeartPulse, mandate: "one shared ledger of what every collector sensed, correlated across organs, with a falsifier on every story and a grade on its own past calls", directorate: "analysis" },
  { id: "contacts", codename: "lattice", label: "contact intelligence", icon: Users, mandate: "correspondent fusion, reciprocity scoring, lexical profile and fade detection, held in a vault on this device", directorate: "analysis" },
  { id: "dossiers", codename: "sentinel", label: "correspondent dossiers", icon: ScrollText, mandate: "a standing report on every person who has mailed, called or shared a card with you, built one subject at a time", directorate: "analysis" },
  { id: "twin", codename: "effigy", label: "behavioural twin", icon: Brain, mandate: "counts of what the connected account holds — unread mail, events, contacts, steps — nothing predicted", directorate: "analysis" },
  { id: "productivity", codename: "cadence", label: "attention ledger", icon: BarChart3, mandate: "meeting distribution by hour, today's schedule and inbox load across the week", directorate: "analysis" },
  { id: "health", codename: "vitals", label: "physiological signals", icon: Heart, mandate: "steps, heart rate and calories from google fit against the operator's own rolling average", directorate: "analysis" },
  { id: "subscriptions", codename: "ledger", label: "recurring spend", icon: CreditCard, mandate: "every recurring charge reconstructed from receipt mail with cadence, drift and lapsed merchants", directorate: "analysis" },

  { id: "location", codename: "waypoint", label: "movement forecast", icon: MapPin, mandate: "venues and next-presence projection from the location strings on calendar events", directorate: "forecast" },
  { id: "calendar", codename: "horizon", label: "schedule engine", icon: Calendar, mandate: "upcoming events, attendee counts and all-day load from the connected calendar", directorate: "forecast" },
  { id: "career", codename: "ascent", label: "trajectory analysis", icon: Briefcase, mandate: "recruiter mail and résumé files found in the connected account", directorate: "forecast" },
  { id: "predictions", codename: "augur", label: "life projection", icon: Sparkles, mandate: "a seven-day projection of committed hours and inbound mail, with its failure condition attached", directorate: "forecast" },
  { id: "scenarios", codename: "wargame", label: "scenario engine", icon: Activity, mandate: "counterfactual branches across career, finance and health — only from measured inputs, never a synthetic one", directorate: "forecast" },

  { id: "overwatch", codename: "overwatch", label: "account overwatch", icon: ShieldCheck, mandate: "each browser you grant permission to reports what it can observe into one account ledger; absence is stated as a finding and confidence is capped by how many reported", directorate: "counterintel" },
  { id: "guardian", codename: "guardian", label: "rideshare & message guardian", icon: ShieldAlert, mandate: "assessment of an assigned rideshare driver before boarding, plus a forensic read of pasted phone-message threads", directorate: "counterintel" },
  { id: "sentinel", codename: "sentinel", label: "bluetooth & area sentinel", icon: Radar, mandate: "logs nearby bluetooth radios, flags the ones recurring across separate times and places, and warns on entry to areas with reported risk", directorate: "counterintel" },
  { id: "security", codename: "bulwark", label: "exposure & threat", icon: Shield, mandate: "security mail, shared files and permission audit read from the connected account", directorate: "counterintel" },
  { id: "postmark", codename: "postmark", label: "envelope forensics", icon: Fingerprint, mandate: "header-only read of inbound mail: relay chain, authentication verdicts, origin network, composing client, sender local time", directorate: "counterintel" },
  { id: "voiceprint", codename: "voiceprint", label: "voice envelope forensics", icon: Voicemail, mandate: "line attribution, authenticity of every google voice notification, and per-correspondent cadence — hours in your own timezone, envelopes only", directorate: "counterintel" },
  { id: "ghostmail", codename: "ghostmail", label: "ledger × engine", icon: Ghost, mandate: "every domain and link in your mail and phone ledger probed for origin network, tls posture, mail exchangers and concealed destinations", directorate: "counterintel" },
  { id: "automation", codename: "relay", label: "standing orders", icon: Zap, mandate: "conditional handling rules — triage, scheduling and location triggers", directorate: "counterintel" },
];

interface FeedDef { id: GoogleModule; label: string; icon: React.ElementType; note: string }

const dataModules: FeedDef[] = [
  { id: "gmail", label: "mail", icon: Mail, note: "message corpus" },
  { id: "drive", label: "drive", icon: HardDrive, note: "file custody" },
  { id: "photos", label: "photos", icon: Image, note: "image content" },
  { id: "youtube", label: "youtube", icon: Youtube, note: "watch pattern" },
  { id: "search", label: "query log", icon: Search, note: "interest profile" },
  { id: "fit", label: "fitness", icon: Activity, note: "biometric feed" },
  { id: "chrome", label: "browser", icon: Globe, note: "navigation trace" },
  { id: "connected", label: "oauth grants", icon: Network, note: "permission audit" },
];

const CAPABILITIES = [
  { icon: Eye, title: "entity resolution", desc: "one human, many identifiers — addresses, handles and numbers folded into a single resolved record" },
  { icon: Network, title: "relationship lattice", desc: "contact graph inferred from correspondence volume, reciprocity and shared calendar presence" },
  { icon: TrendingUp, title: "behavioural baseline", desc: "a 168-cell weekly histogram per subject; anomalies are measured against it, never asserted" },
  { icon: MapPin, title: "place cartography", desc: "frequented locations, routes and dwell time reconstructed from the location field on calendar events" },
  { icon: Shield, title: "permission audit", desc: "third-party oauth grants enumerated with scope breadth and revocation posture" },
  { icon: Clock, title: "reads on request", desc: "a desk reads only while it is open and you ask; nothing runs when this tab is closed and nothing is scheduled elsewhere" },
];

const GoogleIntelligenceView = () => {
  const v2 = useIsV2();
  const [activeModule, setActiveModule] = useState<GoogleModule>("overview");
  // the directorate is stored, not derived, so the sub-strip survives jumping
  // to a raw data feed (which belongs to no directorate) and returning.
  const [directorate, setDirectorate] = useState<Directorate>("collection");
  // a desk selected from the overview grid must pull its directorate with it,
  // otherwise the sub-strip would show a group the open desk is not in.
  const activeDirectorate =
    nexusModules.find((m) => m.id === activeModule)?.directorate ?? directorate;

  const activeLabel = activeModule === "overview"
    ? "station overview"
    : nexusModules.find((m) => m.id === activeModule)?.label
      ?? dataModules.find((m) => m.id === activeModule)?.label
      ?? activeModule;

  const renderModule = () => {
    switch (activeModule) {
      case "substrate": return <SubstrateExplorer />;
      case "mesh": return <GoogleMeshPanel />;
      case "dossiers": return <ContactVaultPane />;
      case "location": return <LocationProphet />;
      case "email": case "gmail": return <EmailAssistant />;
      case "subscriptions": return <SubscriptionOracle />;
      case "health": case "fit": return <HealthGuardian />;
      case "calendar": return <CalendarWizard />;
      case "contacts": return <ContactIntelligence />;
      case "career": return <CareerPredictor />;
      case "twin": return <AITwin />;
      case "productivity": return <ProductivityIntelligence />;
      case "content": case "drive": case "photos": return <ContentIntelligence />;
      case "predictions": return <LifePredictions />;
      case "automation": return <AutomationSuite />;
      case "security": return <SecurityIntelligence />;
      case "postmark": return <EmailForensics />;
      case "voiceprint": return <VoiceForensics />;
      case "ghostmail": return <GhostLedgerPanel />;
      case "overwatch": return <OverwatchTab />;
      case "vitals": return <VitalsTab />;
      case "guardian": return <RideshareGuardian />;
      case "sentinel": return <BluetoothSentinel />;
      case "messages": return <PhoneMessages />;
      case "meet": return <MeetVault />;
      case "scenarios": return <ScenarioEngine />;
      case "connected": return <ConnectedAppsView />;
      case "youtube": return <YouTubeDataView />;
      case "search": return <SearchHistoryView />;
      case "chrome": return <ChromeDataView />;
      default: return null;
    }
  };

  const tabClass = (on: boolean) =>
    `rounded-none border-b px-3 py-2 font-mono text-[10px] tracking-[0.12em] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-foreground/40 ${
      on ? "border-foreground/60 text-foreground" : "border-transparent text-muted-foreground/70 hover:text-foreground/80"
    }`;

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden">
      {/* ── station header ─────────────────────────────────────────────── */}
      <header className="flex-shrink-0 border-b border-border/20 bg-card/20 backdrop-blur-md">
        {/* the standing rule: where the data lives. truncates at phone width
            rather than pushing the page wider than the screen. */}
        <div className="flex items-center justify-between gap-4 border-b border-border/10 px-4 sm:px-6 py-1.5 min-w-0">
          <span className="min-w-0 truncate font-mono text-[9px] tracking-[0.2em] sm:tracking-[0.32em] text-muted-foreground/50">
            held on this device · read only when you ask
          </span>
          <span className="hidden sm:inline font-mono text-[9px] tracking-[0.32em] text-muted-foreground/40">
            nothing leaves unasked
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 sm:px-6 py-3 sm:py-4 min-w-0">
          {/* under the v.2 shell the room title is already in the shell header;
              the room keeps only its count line so the title is not said twice. */}
          <div className="flex min-w-0 items-center gap-3.5">
            {!v2 && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/30 bg-foreground/[0.04]">
                <span className="text-sm text-foreground/70" aria-hidden="true">◈</span>
              </div>
            )}
            <div className="min-w-0 space-y-0.5">
              {!v2 && (
                <h1 className="truncate text-base font-light tracking-tight text-foreground">asherin.google</h1>
              )}
              <p className="truncate font-mono text-[10px] tracking-[0.16em] text-muted-foreground/60">
                {nexusModules.length} desks · {dataModules.length} feeds
              </p>
            </div>
          </div>

          {/* no authorize button: the exchange it used to start has no device
              answer. the status is a real control — it opens the overview,
              where the gap is explained. */}
          <button
            type="button"
            onClick={() => setActiveModule("overview")}
            aria-label="collection offline on this device — open the overview for why"
            className="flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-border/30 bg-foreground/[0.03] px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-foreground/40"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden="true" />
            <span className="truncate">collection offline · no account connected</span>
          </button>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 space-y-8">
          <Tabs value={activeModule} onValueChange={(v) => setActiveModule(v as GoogleModule)}>
            {/* two-level desk selector: the four directorates, then only the
                selected directorate's desks underneath — the same grouping the
                overview publishes, so the two surfaces agree. */}
            <div className="space-y-0 border-b border-border/20">
              <div role="tablist" aria-label="directorate" className="flex flex-wrap gap-x-1 gap-y-1">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeModule === "overview"}
                  onClick={() => setActiveModule("overview")}
                  className={tabClass(activeModule === "overview")}
                >
                  overview
                </button>
                {DIRECTORATE_ORDER.map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    role="tab"
                    aria-selected={activeDirectorate === dir && activeModule !== "overview"}
                    title={DIRECTORATE_BLURB[dir]}
                    onClick={() => {
                      const first = nexusModules.find((m) => m.directorate === dir);
                      setDirectorate(dir);
                      if (first) setActiveModule(first.id);
                    }}
                    className={tabClass(activeDirectorate === dir && activeModule !== "overview")}
                  >
                    {dir}
                  </button>
                ))}
              </div>

              {activeModule !== "overview" && (
                <div className="flex flex-wrap gap-x-1 gap-y-1 border-t border-border/10 py-1">
                  {nexusModules
                    .filter((m) => m.directorate === activeDirectorate)
                    .map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        title={`${m.label} — ${m.mandate}`}
                        onClick={() => setActiveModule(m.id)}
                        className={`rounded px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-foreground/40 ${
                          activeModule === m.id
                            ? "bg-foreground/[0.10] text-foreground"
                            : "text-muted-foreground/60 hover:text-foreground/80"
                        }`}
                      >
                        {m.codename}
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* ── overview ─────────────────────────────────────────────── */}
            <TabsContent value="overview" className="mt-6 space-y-8">
              <MultiAccountManager />

              {/* desk directory, grouped by analytic function. */}
              {DIRECTORATE_ORDER.map((dir) => {
                const desks = nexusModules.filter((m) => m.directorate === dir);
                if (!desks.length) return null;
                return (
                  <section key={dir} className="space-y-3">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/15 pb-2">
                      <h2 className="font-mono text-[10px] tracking-[0.22em] text-foreground/80">{dir}</h2>
                      <p className="text-[11px] font-extralight text-muted-foreground/60 leading-relaxed">
                        {DIRECTORATE_BLURB[dir]}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-border/15 rounded-lg overflow-hidden border border-border/15">
                      {desks.map((m, i) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setActiveModule(m.id)}
                          className="group flex items-start gap-4 bg-card/30 p-4 text-left transition-colors hover:bg-foreground/[0.05] focus-visible:outline focus-visible:outline-1 focus-visible:outline-foreground/40"
                        >
                          <span className="font-mono text-[10px] tabular-nums text-muted-foreground/35 pt-0.5 w-5 shrink-0">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <m.icon className="h-4 w-4 shrink-0 text-foreground/45 mt-0.5 group-hover:text-foreground/75 transition-colors" aria-hidden />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-baseline gap-x-2">
                              <span className="font-mono text-[10px] tracking-[0.16em] text-foreground">{m.codename}</span>
                              <span className="text-[11px] font-extralight text-muted-foreground/70">{m.label}</span>
                            </div>
                            <p className="text-xs font-extralight leading-relaxed text-muted-foreground">{m.mandate}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}

              {/* raw feeds. */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/15 pb-2">
                  <h2 className="font-mono text-[10px] tracking-[0.22em] text-foreground/80">feeds</h2>
                  <p className="text-[11px] font-extralight text-muted-foreground/60">raw collection surfaces behind the desks</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-border/15 rounded-lg overflow-hidden border border-border/15">
                  {dataModules.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setActiveModule(m.id)}
                      className="flex items-center gap-2.5 bg-card/30 px-3 py-3 text-left transition-colors hover:bg-foreground/[0.05] focus-visible:outline focus-visible:outline-1 focus-visible:outline-foreground/40"
                    >
                      <m.icon className="h-3.5 w-3.5 shrink-0 text-foreground/45" aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-[10px] tracking-[0.12em] text-foreground">{m.label}</span>
                        <span className="block truncate text-[10px] font-extralight text-muted-foreground/60">{m.note}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {/* method — how a conclusion is reached, stated plainly. */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/15 pb-2">
                  <h2 className="font-mono text-[10px] tracking-[0.22em] text-foreground/80">method</h2>
                  <p className="text-[11px] font-extralight text-muted-foreground/60">how the station reaches a conclusion</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {CAPABILITIES.map((c) => (
                    <div key={c.title} className="rounded-lg border border-border/20 bg-card/25 backdrop-blur-md p-4 space-y-2.5">
                      <div className="flex items-center gap-2.5">
                        <c.icon className="h-3.5 w-3.5 text-foreground/50" aria-hidden />
                        <span className="font-mono text-[10px] tracking-[0.14em] text-foreground">{c.title}</span>
                      </div>
                      <p className="text-xs font-extralight leading-relaxed text-muted-foreground">{c.desc}</p>
                    </div>
                  ))}
                </div>
              </section>
            </TabsContent>

            {/* ── desk panels ──────────────────────────────────────────── */}
            {nexusModules.map((m) => (
              <TabsContent key={m.id} value={m.id} className="mt-6 space-y-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/15 pb-2">
                  <span className="font-mono text-[10px] tracking-[0.22em] text-foreground">{m.codename}</span>
                  <span className="text-[11px] font-extralight text-muted-foreground/70">{m.label}</span>
                  <span className="ml-auto font-mono text-[9px] tracking-[0.16em] text-muted-foreground/40">{m.directorate}</span>
                </div>
                {renderModule()}
              </TabsContent>
            ))}

            {dataModules.map((m) => (
              <TabsContent key={m.id} value={m.id} className="mt-6 space-y-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/15 pb-2">
                  <span className="font-mono text-[10px] tracking-[0.22em] text-foreground">{m.label}</span>
                  <span className="text-[11px] font-extralight text-muted-foreground/70">{m.note}</span>
                  <span className="ml-auto font-mono text-[9px] tracking-[0.16em] text-muted-foreground/40">feed</span>
                </div>
                {renderModule()}
              </TabsContent>
            ))}
          </Tabs>

          {/* station analyst — reads whichever desk is open. */}
          <NexusChatPanel activeModule={activeModule} moduleLabel={activeLabel} />
        </div>
      </ScrollArea>
    </div>
  );
};

export default GoogleIntelligenceView;
