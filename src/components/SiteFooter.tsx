import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import houseOfAsherLogo from "@/assets/HouseOfAsher_Flag.png";

interface SiteFooterProps {
  variant?: "full" | "compact";
}

const LINKS = [
  { to: "/", label: "asherin" },
  { to: "/forums", label: "forums" },
  { to: "/founder", label: "founder" },
  { to: "/blog", label: "blog" },
  { to: "/asherin.analytics", label: "analytics" },
  { to: "/privacy", label: "privacy" },
  { to: "/terms", label: "terms" },
  { to: "/security-policy", label: "security" },
];

const SOCIALS = [
  { href: "https://www.instagram.com/asher_united", label: "instagram" },
  { href: "https://www.linkedin.com/in/shepnewton/", label: "linkedin" },
  { href: "https://discord.gg/TzTdY8BfMx", label: "discord" },
];

const SiteFooter = ({ variant = "full" }: SiteFooterProps) => {
  const [showHouseLogo, setShowHouseLogo] = useState(false);
  const year = new Date().getFullYear();

  useEffect(() => {
    if (!showHouseLogo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowHouseLogo(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showHouseLogo]);

  return (
    <footer className={`relative z-10 px-6 pb-10 ${variant === "compact" ? "pt-6" : "pt-16"}`}>
      <div className="mx-auto max-w-5xl">
        <div className="h-px w-full bg-border/40" />

        <div className="flex flex-col gap-6 pt-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-3">
            <p className="text-sm font-extralight tracking-[0.28em] text-foreground">asherin</p>
            <p className="max-w-xs text-xs font-extralight leading-relaxed text-muted-foreground">
              a small independent project. chat with sources, files, maps, and a vault, and
              honest about what it does not know.
            </p>
            <button
              type="button"
              onClick={() => setShowHouseLogo(true)}
              className="mt-1 flex items-center gap-2.5 self-start text-[10px] font-light tracking-[0.25em] uppercase text-muted-foreground transition-colors hover:text-foreground"
              aria-label="View House of Asher note"
            >
              <span className="h-6 w-6 overflow-hidden rounded-md border border-border/30 bg-black">
                <img src={houseOfAsherLogo} alt="House of Asher emblem" className="h-full w-full object-cover" />
              </span>
              #houseofasher
            </button>
          </div>

          <nav className="flex flex-wrap gap-x-5 gap-y-2 sm:max-w-sm sm:justify-end" aria-label="Footer">
            {LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="text-xs font-extralight tracking-wide text-muted-foreground transition-colors hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-border/15 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {SOCIALS.map((s) => (
              <a
                key={s.href}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-extralight tracking-[0.2em] uppercase text-muted-foreground/70 transition-colors hover:text-foreground"
              >
                {s.label}
              </a>
            ))}
          </div>
          <p className="text-[10px] font-extralight tracking-[0.2em] uppercase text-muted-foreground/50">
            © {year} zorak corp
          </p>
        </div>
      </div>

      {showHouseLogo && (
        <div
          className="fixed inset-0 z-[100] animate-fade-in bg-background/70 backdrop-blur-sm"
          onClick={() => setShowHouseLogo(false)}
          role="dialog"
          aria-modal="true"
          aria-label="House of Asher note"
        >
          {/* Half-screen sheet rising from the footer button */}
          <div
            className="absolute inset-x-0 bottom-0 flex h-[52vh] min-h-[340px] flex-col overflow-hidden rounded-t-3xl border-t border-foreground/15 bg-background/70 backdrop-blur-2xl shadow-[0_-30px_80px_-20px_rgba(0,0,0,0.9)] animate-sheet-up"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowHouseLogo(false)}
              className="absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-foreground/15 bg-foreground/5 backdrop-blur-md text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              aria-label="Close"
            >
              <span className="text-lg leading-none">×</span>
            </button>

            <div className="mx-auto grid h-full w-full max-w-5xl grid-cols-1 items-center gap-6 px-6 py-8 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-10 sm:px-10">
              <div className="hidden h-full items-center justify-center overflow-hidden rounded-2xl border border-foreground/10 bg-black sm:flex">
                <img
                  src={houseOfAsherLogo}
                  alt="House of Asher flag"
                  className="h-full w-full select-none object-cover"
                  draggable={false}
                />
              </div>

              <div className="flex flex-col items-start gap-4 overflow-y-auto pr-2 text-left">
                <span className="text-[10px] font-light tracking-[0.4em] uppercase text-muted-foreground/70">
                  a small independent project
                </span>

                <h2 className="text-2xl font-extralight uppercase tracking-[0.2em] text-foreground sm:text-3xl">
                  #houseofasher
                </h2>

                <p className="max-w-xl text-sm font-light leading-relaxed text-muted-foreground">
                  founded by <span className="text-foreground">asher newton</span>, #houseofasher is an
                  independent group built around software, research, and shared ideas. our aim is
                  to make useful tools, explain the thinking behind them, and keep learning from
                  the people who use them.
                </p>

                <p className="max-w-xl text-sm font-light leading-relaxed text-muted-foreground">
                  anyone is welcome to follow the work, regardless of origin, status, or
                  background. participation does not require a title, pledge, or symbol, only
                  curiosity and respect for others.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
};

export default SiteFooter;
