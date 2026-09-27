/**
 * ArticleShell — the frame every long-form record is read in.
 *
 * header, breadcrumb, title, dek, byline, the status column, then one
 * measured column of prose. faq JSON-LD from a child FaqJsonLd portals into
 * #asherin-article-faq-root so the questions are on the page, not only in
 * the head. no decoration: hairlines, layered black, thin lowercase type.
 */
import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import LandingBackground from "@/components/LandingBackground";
import { getArticleDisclosure } from "@/data/blogCatalog";

interface Props {
  eyebrow: string;
  title: string;
  dek: string;
  publishedLabel?: string;
  readTime?: string;
  backTo?: { to: string; label: string };
  image?: ReactNode;
  children: ReactNode;
}

const ArticleShell = ({
  eyebrow,
  title,
  dek,
  publishedLabel,
  readTime,
  backTo = { to: "/blog", label: "notes" },
  image,
  children,
}: Props) => {
  const [progress, setProgress] = useState(0);
  const disclosure = getArticleDisclosure(typeof window === "undefined" ? "" : window.location.pathname);

  useEffect(() => {
    const update = () => {
      const root = document.documentElement;
      const available = root.scrollHeight - root.clientHeight;
      setProgress(available > 0 ? Math.min(100, (root.scrollTop / available) * 100) : 0);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const eyebrowLine = [eyebrow, publishedLabel, readTime].filter(Boolean).join(" · ");

  return (
    <LandingBackground overlayOpacity="bg-black/70">
      <div className="journal-surface landing-perf min-h-screen">
        <Header />

        {/* how far through the record you are: a hairline, nothing louder */}
        <div className="fixed inset-x-0 top-0 z-[60] h-px bg-foreground/[0.06]" aria-hidden>
          <div className="h-full bg-foreground/40 transition-[width] duration-150 ease-quiet" style={{ width: `${progress}%` }} />
        </div>

        <article className="mx-auto max-w-5xl px-5 pb-28 pt-32 sm:px-8 sm:pt-40">
          <nav
            aria-label="Breadcrumb"
            className="journal-muted arrive arrive-1 flex flex-wrap items-center gap-x-3 text-[11px] font-light lowercase tracking-[0.04em]"
          >
            <Link to="/" className="transition-colors duration-[var(--dur-quick)] ease-quiet hover:text-foreground">
              asherin
            </Link>
            <span aria-hidden className="text-foreground/20">·</span>
            <Link to={backTo.to} className="transition-colors duration-[var(--dur-quick)] ease-quiet hover:text-foreground">
              {backTo.label}
            </Link>
          </nav>

          <header className="mt-10 grid gap-10 border-b journal-rule pb-12 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-16">
            <div>
              <p className="journal-muted arrive arrive-2 text-[11px] font-light lowercase tracking-[0.12em]">{eyebrowLine}</p>
              <h1 className="arrive arrive-3 mt-6 max-w-3xl text-3xl font-extralight lowercase leading-[1.08] tracking-[-0.02em] sm:text-5xl">
                {title}
              </h1>
              <p className="journal-muted arrive arrive-4 mt-7 max-w-2xl text-base font-light leading-[1.8] sm:text-lg">{dek}</p>
              <p className="journal-muted arrive arrive-4 mt-7 text-[11px] font-light lowercase">asher newton</p>
            </div>
            <aside
              aria-label="Article status and capability boundaries"
              className="arrive arrive-4 arrive-slow border-t journal-rule pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"
            >
              <p className="journal-muted text-[11px] font-light lowercase tracking-[0.12em]">status</p>
              <p className="mt-2 text-xl font-extralight lowercase leading-tight">{disclosure.statusLabel}</p>
              <dl className="mt-6 space-y-4">
                {disclosure.boundaries.map((item) => (
                  <div key={item.label}>
                    <dt className="text-[11px] font-light lowercase text-foreground/80">{item.label}</dt>
                    <dd className="journal-muted mt-1 text-xs font-light leading-relaxed">{item.detail}</dd>
                  </div>
                ))}
              </dl>
            </aside>
          </header>

          {image && <div className="mt-12 overflow-hidden border-b journal-rule pb-12">{image}</div>}

          <div className="journal-body mx-auto mt-14 max-w-[44rem] space-y-6 text-[1.02rem] font-light leading-[1.85] [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-2 [&_code]:font-mono [&_code]:text-sm">
            {children}
          </div>

          <div id="asherin-article-faq-root" className="mx-auto max-w-[44rem]" />
          <div className="mx-auto mt-20 max-w-[44rem] border-t journal-rule pt-8">
            <Link
              to={backTo.to}
              className="journal-muted text-[12px] font-light lowercase transition-colors duration-[var(--dur-quick)] ease-quiet hover:text-foreground"
            >
              ← {backTo.label}
            </Link>
          </div>
        </article>

        <SiteFooter />
      </div>
    </LandingBackground>
  );
};

export default ArticleShell;
