import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import Header from "@/components/Header";
import LandingBackground from "@/components/LandingBackground";
import SiteFooter from "@/components/SiteFooter";

/**
 * /for and /for/:slug — who asherin is for. One page, five desks, and a single
 * public-index look (wikipedia + wayback) that works logged out.
 */
export default function ForHub() {
  const { slug } = useParams();
  const [q, setQ] = useState("asherin");
  const [hits, setHits] = useState<{ title: string; url: string; via: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const desks = [
    {
      slug: "research",
      h1: "people who already chat with a model",
      description:
        "you already talk to a model. this seat keeps sources next to the answer — public-index search, a map, a vault, memory.",
    },
    {
      slug: "journalists",
      h1: "journalists",
      description: "sourced chat and a logged-out public-index look. first click is look, not a paywall.",
    },
    {
      slug: "companies",
      h1: "companies",
      description: "one seat for a desk: chat, public-index search, a map, a vault, memory, and a team workspace.",
    },
    {
      slug: "investigators",
      h1: "private investigators",
      description: "public-index look first. wikipedia + wayback.",
    },
    {
      slug: "analysts",
      h1: "data analytics people",
      description: "same seat as the other four desks. bring your own key and asherin runs on it.",
    },
  ];
  const runLook = async () => {
    setBusy(true);
    try {
      const s = q.trim().slice(0, 80);
      const out: { title: string; url: string; via: string }[] = [];
      const seen = new Set<string>();
      if (s) {
        try {
          const cdxRes = await fetch(
            "https://web.archive.org/cdx/search/cdx?output=json&fl=original,timestamp,statuscode&filter=statuscode:200&limit=5&url=" +
              encodeURIComponent(s),
          );
          if (cdxRes.ok) {
            const j = (await cdxRes.json()) as string[][];
            if (Array.isArray(j)) {
              for (const rec of j.slice(1, 6)) {
                const original = rec[0];
                if (!original || seen.has(original)) continue;
                seen.add(original);
                out.push({
                  title: original,
                  url: "https://web.archive.org/web/" + (rec[1] || "") + "/" + original,
                  via: "wayback",
                });
              }
            }
          }
        } catch {
          /* index quiet */
        }
        try {
          const wikiRes = await fetch(
            "https://en.wikipedia.org/w/api.php?action=opensearch&limit=5&namespace=0&format=json&origin=*&search=" +
              encodeURIComponent(s),
          );
          if (wikiRes.status === 200) {
            const j = (await wikiRes.json()) as [string, string[], string[], string[]];
            const titles = j[1] || [];
            const urls = j[3] || [];
            for (let i = 0; i < titles.length; i++) {
              if (!urls[i] || seen.has(urls[i])) continue;
              seen.add(urls[i]);
              out.push({ title: titles[i], url: urls[i], via: "wikipedia" });
            }
          }
        } catch {
          /* index quiet */
        }
      }
      setHits(out);
    } catch {
      setHits([]);
    } finally {
      setBusy(false);
    }
  };
  if (typeof document !== "undefined") document.title = "who asherin is for";
  return (
    <LandingBackground>
      <Header />
      <section className="relative z-10 flex min-h-[88vh] flex-col justify-center px-6 pt-32 pb-20">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="font-display text-4xl sm:text-5xl font-light tracking-[-0.025em] leading-[1.05] text-foreground">
            who asherin is for
          </h1>
          <p className="mt-6 max-w-xl text-base font-extralight leading-relaxed text-muted-foreground">
            five desks. same seat: sourced chat, public-index search, a map, a vault, memory. bring your own key
            and asherin runs on it.
          </p>
          <p className="mt-4 max-w-xl text-base font-extralight leading-relaxed text-muted-foreground">
            this page is the look, not a spa-empty homepage. people who already chat with a model, journalists,
            companies, private investigators, and data analytics people share one seat. the first click is look —
            wikipedia + wayback — not a paywall.
          </p>
          <div className="mt-10 rounded-2xl border border-border/20 bg-card/25 backdrop-blur-md px-6 py-5">
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-foreground/40">one public-index look</p>
            <p className="mt-2 text-sm font-extralight leading-relaxed text-muted-foreground">
              no signup. wikipedia + wayback.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full rounded-lg border border-border/30 bg-background/40 px-3 py-2 text-sm font-light text-foreground"
                aria-label="public index query"
              />
              <button
                type="button"
                onClick={runLook}
                disabled={busy}
                className="shrink-0 rounded-lg bg-foreground px-4 py-2 text-sm font-light text-background disabled:opacity-50"
              >
                {busy ? "looking…" : "look"}
              </button>
            </div>
            {hits && (
              <ul className="mt-4 space-y-2">
                {hits.length === 0 ? (
                  <li className="text-sm font-extralight text-muted-foreground">
                    no public-index hit. this is unsure if the index was quiet.
                  </li>
                ) : (
                  hits.map((h) => (
                    <li key={h.url} className="text-sm font-extralight">
                      <a
                        href={h.url}
                        className="text-foreground underline-offset-2 hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {h.title}
                      </a>
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-foreground/40">{h.via}</span>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
          <ul className="mt-12 space-y-4">
            {desks.map((a) => (
              <li key={a.slug}>
                <Link
                  to={"/for/" + a.slug}
                  className={`block rounded-2xl border bg-card/25 backdrop-blur-md px-6 py-5 transition-colors hover:border-foreground/25 ${
                    slug === a.slug ? "border-foreground/40" : "border-border/20"
                  }`}
                >
                  <p className="text-base font-light tracking-tight text-foreground">{a.h1}</p>
                  <p className="mt-2 text-sm font-extralight leading-relaxed text-muted-foreground">{a.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <SiteFooter />
    </LandingBackground>
  );
}
