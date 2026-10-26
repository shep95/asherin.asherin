/**
 * /software — a short, honest catalog of the local edition.
 *
 * Three jobs, then the rooms that actually exist behind the chat. No
 * competitor chart, no tile mall, no account. If a capability is not real in
 * HEAD, it does not get a card, and every card says what the room cannot do.
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import {
  MessageSquare,
  Search,
  Database,
  Layers,
  Lock,
  Shield,
  Hammer,
  Network,
  Eye,
  ShieldCheck,
  Globe,
  Activity,
  Mic,
  FileText,
  BookOpen,
  Bot,
  PenTool,
  Code,
  Newspaper,
  Moon,
  Brain,
} from "lucide-react";

type Tool = {
  name: string;
  line: string;
  detail: string;
  icon: React.ElementType;
};

const JOBS: Tool[] = [
  {
    name: "ask",
    line: "chat with shepherd",
    detail:
      "one place to ask. shepherd answers with sources beside the answer, reads the files you attach, and says when it does not know. the rooms sit behind the chat rather than as separate apps. you choose the model and bring its key; the key stays on this device.",
    icon: MessageSquare,
  },
  {
    name: "keep",
    line: "library, projects, vault, guardian vault",
    detail:
      "what you save stays in this browser, on this device: files, project threads, what shepherd has learned about you, sealed items. conversation text, sealed items and boards are encrypted at rest under a device key; there is no copy on a server because there is no server. export or wipe at any time.",
    icon: Database,
  },
  {
    name: "look at a place",
    line: "asherin.adam",
    detail:
      "a live globe on this device: imagery, terrain, earthquakes and recent satellite passes. what leaves is map tiles, and only the places and weather you ask for. it does not locate anyone's phone.",
    icon: Globe,
  },
];

const TOOLS: Tool[] = [
  {
    name: "asherin.search",
    line: "sourced search with credibility tiers",
    detail:
      "web, news, academic, code, data, docs, deep and archive modes over open indexes, scholarly registries, code hosts, filings, advisories and the internet archive, asked from this device. every hit is cited and tiered; a source that did not answer says so. deep search has shepherd write a cited briefing from the pages it read.",
    icon: Search,
  },
  {
    name: "asherin.cyber",
    line: "domain and infrastructure context",
    detail:
      "a code scanner, a log correlator, a device scanner and a sigma converter that run here. anything that would need a kernel to probe a host says so in place; nothing is invented.",
    icon: Shield,
  },
  {
    name: "asherin.google",
    line: "your own google account, read by your browser",
    detail:
      "with your consent, the browser reads what google's apis hand over — mail, calendar, drive — and keeps the read on this device to summarise and draft. it does not locate phones or read anything google does not give.",
    icon: Network,
  },
  {
    name: "asherin.extract",
    line: "text out of documents",
    detail:
      "pdfs through their text layer, scanned pages and photos through on-device ocr, .docx through its xml, plain files as they are — one downloadable .txt per session.",
    icon: FileText,
  },
  {
    name: "asherin.briefing",
    line: "a written briefing, on request",
    detail:
      "tell shepherd what you watch, press write now, read a sectioned briefing with its limits stated. nothing is scheduled, because a closed tab cannot write.",
    icon: Newspaper,
  },
  {
    name: "asherin.data",
    line: "ask your own files",
    detail: "upload a csv, json or similar file, see its shape, ask in plain english, get an answer with the rows behind it and a chart drawn from the real values.",
    icon: Database,
  },
  {
    name: "asherin.knowledge",
    line: "your own sources, cited",
    detail: "ingest text, files and pages you can reach, retrieve passages on this device, and ask shepherd for an answer that points at the passage it came from.",
    icon: Brain,
  },
  {
    name: "asherin.arvision",
    line: "camera intelligence hud",
    detail:
      "live camera overlays on this device in optical, spatial and eagle.eye modes. it labels observable patterns, never intent, guilt or a person, and it is not a face database.",
    icon: Eye,
  },
  {
    name: "asherin.sentinel",
    line: "ambient watch, held here",
    detail:
      "separates voices on the microphone you grant it, names them only from their own words, tags the sounds around them, and keeps every turn in one searchable timeline on this device. it listens while the tab is open and says what a browser cannot do.",
    icon: Mic,
  },
  {
    name: "asherin.defender",
    line: "this device, read honestly",
    detail:
      "what a browser tab can measure about this machine, named protection by protection. anything nothing looked at reads unmeasured, never green.",
    icon: ShieldCheck,
  },
  {
    name: "asherin.health",
    line: "your own body and records",
    detail:
      "your records, pain interviews, labs, wearables and herbal context, held on this device, with shepherd in the room. it is not a scan and it is not a diagnosis.",
    icon: Activity,
  },
  {
    name: "asherin.vedic",
    line: "a sidereal chart, computed here",
    detail: "swiss ephemeris in the browser: natal, transits, dashas, saved charts, and shepherd to read them with.",
    icon: Moon,
  },
  {
    name: "notebooks · pages · snippets",
    line: "writing that stays",
    detail:
      "cells of notes, code and questions for shepherd with versions; pages, decks and books compiled to pdf; code snippets in folders with search and export.",
    icon: BookOpen,
  },
  {
    name: "asherin.design",
    line: "design projects with shepherd",
    detail:
      "projects, specs, materials and components, a viewport that lays them out, and estimates labelled as estimates. it is not a solver; take the brief to one before you build.",
    icon: Hammer,
  },
  {
    name: "asherin.agents",
    line: "an agent forge on this device",
    detail:
      "describe an agent, let shepherd draft its spec and code, review, run it now or on an interval while the tab is open, publish it as a tab. no cron, no webhook, no cloud worker.",
    icon: Bot,
  },
  {
    name: "whiteboard",
    line: "infinite canvas, layers",
    detail: "pan, zoom, a layer stack and sketching, for when a thread needs a picture. send an answer from chat straight onto a board.",
    icon: PenTool,
  },
  {
    name: "guardian vault",
    line: "device security",
    detail:
      "the key vault's state, what is sealed at rest, sealed items, authenticator codes, an opt-in exposure check that sends only a hash prefix, and the device trail.",
    icon: Lock,
  },
  {
    name: "free editor",
    line: "noah.asherin.com",
    detail: "a free code editor in the browser, from asherin. separate software, nothing to install.",
    icon: Code,
  },
];

const Card = ({ t }: { t: Tool }) => (
  <div className="flex h-full flex-col gap-3 rounded-2xl border border-foreground/10 bg-foreground/[0.04] backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-6">
    <t.icon className="h-4 w-4 text-foreground/60" strokeWidth={1.4} />
    <div>
      <h3 className="text-base font-light lowercase text-foreground">{t.name}</h3>
      <p className="text-[11px] font-extralight tracking-wide text-muted-foreground/70">{t.line}</p>
    </div>
    <p className="text-sm font-extralight leading-relaxed text-muted-foreground">{t.detail}</p>
  </div>
);

const Software = () => {
  useEffect(() => {
    const id = "software-collection-jsonld";
    document.getElementById(id)?.remove();
    const el = document.createElement("script");
    el.id = id;
    el.type = "application/ld+json";
    el.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "asherin, software",
      description:
        "rooms behind the chat, all on this device: asherin.search, asherin.adam, asherin.cyber, asherin.google, asherin.extract, asherin.briefing, asherin.data, asherin.knowledge, asherin.arvision, asherin.sentinel, asherin.defender, asherin.health, asherin.vedic, notebooks, pages, snippets, design, agents, whiteboard, library, projects, the vault and guardian vault.",
      url: "https://asherin.com/software",
    });
    document.head.appendChild(el);
    return () => {
      document.getElementById(id)?.remove();
    };
  }, []);

  return (
    <div className="landing-perf min-h-screen bg-background text-foreground">
      <Header />

      <main className="px-6 pt-32 pb-20">
        <div className="mx-auto max-w-5xl space-y-20">
          <header className="max-w-2xl space-y-5">
            <p className="text-[10px] font-extralight lowercase tracking-[0.35em] text-muted-foreground">software</p>
            <h1 className="text-4xl font-extralight lowercase leading-[1.1] tracking-tight sm:text-5xl">software | asherin</h1>
            <p className="text-2xl font-extralight tracking-tight text-foreground/80">three things, honestly.</p>
            <p className="text-base font-extralight leading-relaxed text-muted-foreground">
              asherin is one chat with rooms behind it, and all of it runs in your browser on this device. no account, no
              server of ours. if something is not listed here, it is not something asherin does today.
            </p>
          </header>

          <section className="grid gap-4 sm:grid-cols-3" aria-label="what asherin is for">
            {JOBS.map((t) => (
              <Card key={t.name} t={t} />
            ))}
          </section>

          <section className="space-y-6" aria-labelledby="rooms">
            <h2 id="rooms" className="text-2xl font-extralight lowercase tracking-tight">
              the rooms behind the chat
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {TOOLS.map((t) => (
                <Card key={t.name} t={t} />
              ))}
            </div>
          </section>

          <section className="space-y-5 rounded-2xl border border-foreground/10 bg-foreground/[0.04] backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-8">
            <h2 className="text-2xl font-extralight lowercase tracking-tight">open it. every room is already yours.</h2>
            <p className="max-w-xl text-sm font-extralight leading-relaxed text-muted-foreground">
              the workspace opens in this browser with nothing to create. connect a model key under settings → intelligence,
              or point shepherd at a local runtime, and start with one question.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/dashboard"
                className="rounded-full bg-foreground px-5 py-2.5 text-xs font-light lowercase tracking-[0.2em] text-background transition-colors hover:bg-foreground/90"
              >
                open the workspace
              </Link>
            </div>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
};

export default Software;
