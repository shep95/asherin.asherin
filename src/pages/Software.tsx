/**
 * /software — a short, honest catalog.
 *
 * Three jobs, then the tools that actually exist behind sign-in.
 * No competitor chart. No tile mall. If a capability is not real in HEAD,
 * it does not get a card.
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import { useAuth } from "@/contexts/AuthContext";
import {
  MessageSquare,
  Search,
  Map,
  Database,
  Layers,
  Lock,
  Shield,
  Bluetooth,
  Hammer,
  Users,
  Network,
  Eye,
  ShieldCheck,
  Globe,
  Activity,
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
    line: "asherin chat",
    detail:
      "one place to ask. it answers with sources next to the answer, reads files you attach, and says when it does not know. search, maps and the rest sit behind the chat rather than as separate apps. you pick the model, refusal behaviour is the model's, not a switch we sell.",
    icon: MessageSquare,
  },
  {
    name: "keep",
    line: "library, projects, memory, guardian vault",
    detail:
      "what you save stays with your account: notes, files, project threads, and long-term memory. the vault holds credentials and documents. data is encrypted at rest with a key scoped to your account and TLS in transit, it is not zero-knowledge end-to-end, and we do not claim it is. export or delete at any time.",
    icon: Database,
  },
   {
     name: "look at a place",
     line: "asherin eye",
     detail:
       "public geospatial context, flights, earthquakes and other sourced layers opened from chat when you name a place. it does not locate anyone's phone.",
     icon: Globe,
   },
];

const TOOLS: Tool[] = [
   {
     name: "asherin.cyber",
     line: "passive domain context",
     detail:
       "reads public dns, tls, headers and advisory indexes. it does not authenticate, exploit or scan hosts.",
     icon: Shield,
   },
  {
    name: "asherin.defender",
    line: "owned-device defence",
    detail:
      "bluetooth, wifi, and spy-software pattern checks on this device. it does not ship a keylogger and it does not remap keys consumed by apps or sites.",
    icon: ShieldCheck,
  },
  {
    name: "asherin.arvision",
    line: "camera intelligence hud",
    detail:
      "live camera overlays on this device in three modes: optical, spatial, and eagle.eye — a multi-camera wall that labels observable patterns, flashes the tile until a person acknowledges it, and writes reviewable evidence with the overlays composited onto the camera frame. it labels behaviour, never intent, guilt or a person, and it is not a face database.",
    icon: Eye,
  },
  {
    name: "asherin.sentinel",
    line: "ambient watch",
    detail:
      "separates voices on the microphone you grant it, learns each one from its own words, tags the sounds around them, and keeps every turn in one searchable timeline on your account. it listens while the room is open on the device you started it on — a browser hands the microphone back when its tab closes, so it is not a hidden system service and it never records without a visible running state.",
    icon: Eye,
  },

  {
    name: "asherin.search",
    line: "discovery-first, cited",
    detail:
      "queries public search endpoints, certificate logs, archives and open registries, then pivots on a name, email, phone or username through what those sources return. every hit is cited, and a source that is unavailable or key-gated says so instead of guessing. coverage is whatever those endpoints return that day, so we do not print a source count.",
    icon: Search,
  },
  {
    name: "asherin.health",
    line: "your own body and records",
    detail:
      "a reshaped reference body, your own records, pain interviews, labs, wearables and herbal context, held on your device. it reads photos you upload as observations. it is not a scan and it is not a diagnosis.",
    icon: Activity,
  },
  {
    name: "asherin.data",
    line: "ask your own files",
    detail:
      "upload a csv, json or sql dump, or connect a source, then ask in plain english and get charts with the numbers' provenance attached.",
    icon: Database,
  },
  {
    name: "asherin.knowledge",
    line: "your own ingested sources",
    detail: "ingest documents and links, keep them searchable next to the chat.",
    icon: Layers,
  },
  {
    name: "guardian vault",
    line: "credentials and documents",
    detail: "encrypted storage scoped to your account, with breach lookups against public indexes.",
    icon: Lock,
  },
  {
    name: "whiteboard",
    line: "infinite canvas, layers",
    detail: "pan, zoom, layer stack, sketching, for when a thread needs a picture.",
    icon: Layers,
  },
  {
    name: "connect (google)",
    line: "signed-in mesh",
    detail:
      "with your consent, asherin reads what google's apis actually give it, mail, calendar, drive, to summarise and draft. it does not locate phones or read anything google does not hand over.",
    icon: Network,
   },
   {
     name: "zanoem, design lab",
     line: "engineering briefs, no solver",
     detail:
       "material choices, assembly layouts and parametric sketches written up as a brief. it reasons about physics in text and geometry; it does not run a solver. no fea, thermal or cfd here, take the brief to a real solver before you build.",
     icon: Hammer,
   },
  {
    name: "team",
    line: "shared workspace",
    detail:
      "one workspace, members with roles, invites and shared projects. the owner runs it; members work inside it.",
    icon: Users,
  },
];

const Card = ({ t }: { t: Tool }) => (
  <div className="flex h-full flex-col gap-3 rounded-2xl border border-foreground/10 bg-foreground/[0.04] backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-6">
    <t.icon className="h-4 w-4 text-foreground/60" strokeWidth={1.4} />
    <div>
      <h3 className="text-base font-light text-foreground">{t.name}</h3>
      <p className="text-[11px] font-extralight tracking-wide text-muted-foreground/70">{t.line}</p>
    </div>
    <p className="text-sm font-extralight leading-relaxed text-muted-foreground">{t.detail}</p>
  </div>
);

const Software = () => {
  const { user } = useAuth();

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
         "rooms behind the chat: asherin.search, asherin.eye, asherin.arvision with eagle.eye, asherin.defender, asherin.sentinel, asherin.health, asherin.data, asherin.cyber, asherin.knowledge, library, projects, memory, vault.",
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
            <p className="text-[10px] font-extralight uppercase tracking-[0.35em] text-muted-foreground">software</p>
            <h1 className="text-4xl font-extralight leading-[1.1] tracking-tight sm:text-5xl">software | asherin</h1>
            <p className="text-2xl font-extralight tracking-tight text-foreground/80">three things, honestly.</p>
            <p className="text-base font-extralight leading-relaxed text-muted-foreground">
              asherin is one chat with a few rooms behind it. everything below runs after you sign in. if something is
              not listed here, it is not something we sell you today.
            </p>
          </header>

          <section className="grid gap-4 sm:grid-cols-3" aria-label="What asherin is for">
            {JOBS.map((t) => (
              <Card key={t.name} t={t} />
            ))}
          </section>

          <section className="space-y-6" aria-labelledby="rooms">
            <h2 id="rooms" className="text-2xl font-extralight tracking-tight">
              the rooms behind the chat
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {TOOLS.map((t) => (
                <Card key={t.name} t={t} />
              ))}
            </div>
          </section>

          <section className="space-y-5 rounded-2xl border border-foreground/10 bg-foreground/[0.04] backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-8">
            <h2 className="text-2xl font-extralight tracking-tight">one account opens every room.</h2>
            <p className="max-w-xl text-sm font-extralight leading-relaxed text-muted-foreground">
              an account opens chat and its rooms: search, eye, arvision with eagle.eye, defender, sentinel, health, data, cyber, knowledge and the workspace. bring your own model key or use the hosted path.
            </p>
            <div className="flex flex-wrap gap-3">
              {user ? (
                <Link
                  to="/dashboard"
                  className="rounded-full bg-foreground px-5 py-2.5 text-xs font-light uppercase tracking-[0.2em] text-background transition-colors hover:bg-foreground/90"
                >
                  go to dashboard
                </Link>
              ) : (
                <Link
                  to="/dashboard"
                  className="rounded-full bg-foreground px-5 py-2.5 text-xs font-light uppercase tracking-[0.2em] text-background transition-colors hover:bg-foreground/90"
                >
                  open the workspace
                </Link>
              )}
            </div>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
};

export default Software;
