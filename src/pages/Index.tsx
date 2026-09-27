import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";

import Header from "@/components/Header";
import LandingBackground from "@/components/LandingBackground";
import SiteFooter from "@/components/SiteFooter";
import ScrollProgressBar from "@/components/landing/ScrollProgressBar";
import { useScrollFadeIn } from "@/hooks/useScrollFadeIn";
import { streamChat } from "@/lib/ai";

/**
 * Homepage narrative (LANDING-KEEP-GO-REPLACE)
 * ------------------------------------------------------------------
 * A stranger lands here with no context. Five screens, in order:
 *   1. what this is           — headline + one true sentence + create account
 *   2. one live question      — a real call to the sourced chat path, not a mock
 *   3. what stays private     — only claims the server can actually honour
 *   4. close                  — create account, one quiet origin line
 *
 * Everything removed from this file was either costume (HUD ticker, NODE /
 * ASHERIN-01, "intelligence OS"), unverifiable (named testimonials, ranks,
 * AUM figures), crawler-facing prose rendered at humans (GeoBlock), or a
 * simulation presented as a product (fake source cards, fake veracity score,
 * fake video-analysis frames). Structured data for "/" still ships from
 * RouteSeo plus the JSON-LD effect below; none of it is visible chrome.
 */

const Section = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => {
  const { ref, isVisible } = useScrollFadeIn();
  return (
    <section
      ref={ref}
      className={`relative z-10 transition-[opacity,transform] duration-[var(--dur-slow)] ease-quiet ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      } ${className}`}
    >
      {children}
    </section>
  );
};


const Index = () => {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // An in-flight stream must not outlive the page.
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    // Title / description / canonical / og for "/" belong to RouteSeo. Only
    // page-specific structured data is added here, and only to the head.
    const faqs = [
      {
        q: "what does an asherin account include?",
        a: "Chat with sources beside the answer, asherin.cyber, asherin.eye, asherin.defender, asherin.arvision, asherin.pages, a private vault, and memory that persists between sessions.",
      },
      {
        q: "can i leave?",
        a: "Yes. Your data can be exported or deleted at any time from the dashboard.",
      },
      {
        q: "is my work used to train asherin?",
        a: "No. Your conversations and files are account-scoped and encrypted at rest. They are not sold and are not used as training data.",
      },
    ];

    const schemas = [
      {
        id: "home-website-jsonld",
        data: {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Asherin",
          url: "https://asherin.com",
           description:
             "asherin is a sourced research workspace: chat, asherin.cyber, asherin.eye, asherin.defender, asherin.arvision, asherin.pages. honest about what it does not know.",
        },
      },
      {
        id: "home-faq-jsonld",
        data: {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        },
      },
    ];

    schemas.forEach(({ id, data }) => {
      let el = document.getElementById(id) as HTMLScriptElement | null;
      if (!el) {
        el = document.createElement("script");
        el.id = id;
        el.type = "application/ld+json";
        document.head.appendChild(el);
      }
      el.textContent = JSON.stringify(data);
    });

    return () => schemas.forEach(({ id }) => document.getElementById(id)?.remove());
  }, []);

  /**
   * The same answering path the workspace uses: the model the operator
   * connected, called from this device. No key yet → say so and point at the
   * dashboard. The page never fabricates an answer.
   */
  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = question.trim();
    if (!query || asking) return;
    setQuestion("");
    setAnswer("");
    setAskError("");
    setAsking(true);
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    let full = "";
    try {
      await streamChat({
        messages: [{ role: "user", content: query }],
        mode: "research",
        depth: "standard",
        signal: controller.signal,
        onDelta: (t) => {
          full += t;
          setAnswer(full);
        },
        onDone: () => undefined,
      });
      if (!full) setAskError("no answer came back. try a different question.");
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setAskError((err as Error)?.message || "that request did not come back. open the dashboard and connect a model key.");
      }
    } finally {
      setAsking(false);
    }
  };



  const button =
    "group inline-flex min-h-[48px] items-center gap-3 rounded-sm border border-foreground/20 px-7 text-sm font-light lowercase text-foreground transition-colors duration-[var(--dur-settle)] ease-quiet hover:border-foreground/60";
  const quietLink =
    "inline-flex min-h-[44px] items-center text-[12px] font-light lowercase text-foreground/50 transition-colors duration-[var(--dur-quick)] ease-quiet hover:text-foreground";

  return (
    <LandingBackground overlayOpacity="bg-black/75">
      <ScrollProgressBar />
      <Header />

      {/* ───────────── 1 · hero: two lines, arriving one after the other ───────────── */}
      <Section className="flex min-h-[88vh] flex-col justify-center px-6 pb-24 pt-32">
        <div className="mx-auto w-full max-w-5xl">
          <h1 className="text-5xl font-extralight lowercase leading-[1.02] tracking-[-0.03em] text-foreground sm:text-7xl md:text-8xl">
            <span className="arrive arrive-1 block">asherin.</span>
            <span className="arrive arrive-2 block text-foreground/45">look a little closer.</span>
          </h1>

          <p className="arrive arrive-3 mt-10 max-w-xl text-base font-light leading-[1.8] text-foreground/70 sm:text-lg">
            asherin tries to give you the fuller picture, sourced, and honest about what it does not know.
          </p>

          <div className="arrive arrive-4 mt-12 flex flex-wrap items-center gap-8">
            <Link to="/dashboard" className={button}>
              open the workspace
              <span aria-hidden className="transition-transform duration-[var(--dur-settle)] ease-quiet group-hover:translate-x-1">→</span>
            </Link>
            <p className="text-[12px] font-light lowercase text-foreground/40">no account. runs on this device.</p>
          </div>

          <p className="arrive arrive-4 arrive-slow mt-24 max-w-2xl text-[12px] font-light lowercase leading-relaxed text-foreground/35">
            rooms behind the chat · asherin.cyber · asherin.eye · asherin.defender · asherin.arvision · asherin.pages
          </p>
        </div>
      </Section>

      {/* ───────────── open access ───────────── */}
      <Section className="px-6 py-24 sm:py-32">
        <div className="mx-auto w-full max-w-5xl border-t border-foreground/10 pt-10">
          <div className="grid gap-10 lg:grid-cols-[14rem_1fr] lg:gap-20">
            <p className="text-[11px] font-light lowercase tracking-[0.12em] text-foreground/40">open access</p>
            <div className="max-w-2xl">
              <h2 className="text-2xl font-extralight lowercase leading-tight text-foreground sm:text-3xl">free to use software.</h2>
              <p className="mt-4 text-sm font-light leading-[1.8] text-foreground/55">
                a workspace you can open immediately. no account required.
              </p>
              <Link to="/asherin.acatalepsy" className="group mt-10 block border-t border-foreground/10 pt-6">
                <p className="text-[11px] font-light lowercase text-foreground/40">data workspace</p>
                <p className="mt-2 text-xl font-extralight lowercase text-foreground transition-colors duration-[var(--dur-settle)] ease-quiet group-hover:text-foreground/65">
                  asherin.acatalepsy
                </p>
                <p className="mt-3 max-w-md text-sm font-light leading-[1.8] text-foreground/55">
                  upload data, detect its structure, and turn it into useful visualizations with local deterministic software. your files remain in the browser session.
                </p>
                <p className="mt-4 text-[11px] font-light lowercase text-foreground/40">no login · no ai · local only</p>
              </Link>
            </div>
          </div>
        </div>
      </Section>

      {/* ───────────── 2 · one live question ───────────── */}
      <Section className="px-6 py-24 sm:py-32">
        <div className="mx-auto w-full max-w-5xl border-t border-foreground/10 pt-10">
          <div className="grid gap-10 lg:grid-cols-[14rem_1fr] lg:gap-20">
            <p className="text-[11px] font-light lowercase tracking-[0.12em] text-foreground/40">one question</p>
            <div className="max-w-2xl">
              <h2 className="text-2xl font-extralight lowercase leading-tight text-foreground sm:text-3xl">ask one question.</h2>
              <p className="mt-4 max-w-xl text-sm font-light leading-[1.8] text-foreground/55">
                this field runs the same answering path the workspace uses, with the model key you connected on this
                device. no key yet? open the workspace and add one under settings → ai keys.
              </p>

              <form onSubmit={handleAsk} className="mt-10 flex items-end gap-4 border-b border-foreground/20 pb-3 transition-colors duration-[var(--dur-settle)] ease-quiet focus-within:border-foreground/60">
                <label htmlFor="home-ask" className="sr-only">
                  ask asherin a question
                </label>
                <input
                  id="home-ask"
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="ask something you would want sources for"
                  className="flex-1 bg-transparent text-base font-light text-foreground placeholder:text-foreground/30 outline-none"
                />
                <button
                  type="submit"
                  disabled={asking || !question.trim()}
                  className="text-[12px] font-light lowercase text-foreground/50 transition-colors duration-[var(--dur-quick)] ease-quiet hover:text-foreground disabled:opacity-30"
                >
                  ask →
                </button>
              </form>

              {asking && !answer && <p className="mt-6 text-[12px] font-light lowercase text-foreground/40">working</p>}

              {askError && <p className="mt-6 text-sm font-light text-foreground/55">{askError}</p>}

              {/* an answer arriving is the one trust state on this page; the accent appears here and nowhere else */}
              {answer && (
                <div className="arrive mt-8 max-h-[52vh] overflow-y-auto border-l border-accent/70 pl-5">
                  <div className="prose prose-invert prose-sm max-w-none font-light [&_p]:text-sm [&_p]:leading-[1.8] [&_p]:text-foreground/85 [&_li]:text-sm [&_a]:text-foreground [&_a]:underline [&_a]:break-words">
                    <ReactMarkdown>{answer}</ReactMarkdown>
                  </div>
                </div>
              )}

              <dl className="mt-16 border-t border-foreground/10">
                {[
                  { k: "ask", d: "a question with sources beside the answer." },
                  { k: "keep", d: "files and memory you can return to." },
                  { k: "look at a place", d: "a map, when the question is about somewhere." },
                ].map(({ k, d }) => (
                  <div key={k} className="grid gap-1 border-b border-foreground/10 py-5 sm:grid-cols-[10rem_1fr]">
                    <dt className="text-sm font-light lowercase text-foreground/85">{k}</dt>
                    <dd className="text-sm font-light leading-relaxed text-foreground/50">{d}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-8 text-sm font-light leading-[1.8] text-foreground/45">
                for people who need sources next to an answer. chat is the mouth. files, maps, and a vault sit behind it.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ───────────── 3 · what stays private ───────────── */}
      <Section className="px-6 py-24 sm:py-32">
        <div className="mx-auto w-full max-w-5xl border-t border-foreground/10 pt-10">
          <div className="grid gap-10 lg:grid-cols-[14rem_1fr] lg:gap-20">
            <p className="text-[11px] font-light lowercase tracking-[0.12em] text-foreground/40">what stays private</p>
            <div className="max-w-2xl">
              <h2 className="text-2xl font-extralight lowercase leading-tight text-foreground sm:text-3xl">what stays private.</h2>
              <ul className="mt-8 space-y-4 text-sm font-light leading-[1.8] text-foreground/55">
                <li>your conversations, files, and vault entries live on this device, encrypted at rest.</li>
                <li>
                  answering a question means sending it to the model you connected, so it is not a sealed room. asherin
                  will not claim otherwise.
                </li>
                <li>your work is not sold, and it is not used to train asherin.</li>
                <li>you can export everything, or wipe it, whenever you want.</li>
              </ul>
              <Link to="/privacy" className={`${quietLink} mt-6`}>
                read the privacy policy →
              </Link>
            </div>
          </div>
        </div>
      </Section>

      {/* ───────────── 4 · close ───────────── */}
      <Section className="px-6 py-24 sm:py-32">
        <div className="mx-auto w-full max-w-5xl border-t border-foreground/10 pt-10">
          <div className="grid gap-10 lg:grid-cols-[14rem_1fr] lg:gap-20">
            <p className="text-[11px] font-light lowercase tracking-[0.12em] text-foreground/40">begin</p>
            <div className="max-w-2xl">
              <h2 className="text-2xl font-extralight lowercase leading-tight text-foreground sm:text-3xl">start with one question.</h2>
              <p className="mt-5 max-w-xl text-sm font-light leading-[1.8] text-foreground/55">
                asherin exists because an answer without its sources is just a rumour with good posture. it will show
                you where something came from, and it will say when it does not know.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-8">
                <Link to="/dashboard" className={button}>
                  open the workspace
                  <span aria-hidden className="transition-transform duration-[var(--dur-settle)] ease-quiet group-hover:translate-x-1">→</span>
                </Link>
                <Link to="/for" className={quietLink}>
                  who it's for
                </Link>
                <Link to="/founder" className={quietLink}>
                  why it exists
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <SiteFooter />
    </LandingBackground>
  );
};

export default Index;
