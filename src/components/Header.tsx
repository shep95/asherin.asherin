import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X, ArrowUpRight } from "lucide-react";
import ForumsDropdown from "@/components/forums/ForumsDropdown";

const Header = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 py-3 sm:py-4">
        <div className="mx-auto w-full max-w-7xl flex items-center justify-between px-4 sm:px-6">
          {/* Left: Logo + Pages dropdown */}
          <div className="hidden lg:flex items-center relative group/nav">
            {/* Aurora glow behind the cluster */}
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-6 -inset-y-3 opacity-60 blur-2xl transition-opacity duration-700 group-hover/nav:opacity-100"
              style={{ background: "hsl(0 0% 100% / 0.04)" }}
            />

            <div className="relative flex items-center rounded-full border border-foreground/15 bg-background/40 backdrop-blur-2xl shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.04)] overflow-hidden">
              {/* Golden top hairline */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-6 top-0 h-px bg-foreground/25"
              />

              <Link to="/" className="group/logo relative flex items-center gap-2.5 pl-5 pr-4 py-2.5 transition-all">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-foreground/80 shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-transform group-hover/logo:scale-125"
                />
                <span className="text-sm font-extralight tracking-[0.32em] text-foreground/95">ASHERIN</span>
                <span className="hidden md:inline text-[8px] font-mono tracking-[0.2em] text-foreground/40 translate-y-px">
                  ◊
                </span>
              </Link>

              <span
                aria-hidden
                className="h-6 w-px bg-foreground/15"
              />

              <Link
                to="/software"
                className="px-4 py-2.5 text-[11px] font-light tracking-[0.22em] uppercase text-muted-foreground transition-colors hover:text-foreground"
              >
                Software
              </Link>

              <span
                aria-hidden
                className="h-6 w-px bg-foreground/15"
              />

              <Link
                to="/for"
                className="px-4 py-2.5 text-[11px] font-light tracking-[0.22em] uppercase text-muted-foreground transition-colors hover:text-foreground"
              >
                For
              </Link>

              <span
                aria-hidden
                className="h-6 w-px bg-foreground/15"
              />

              <Link
                to="/blog"
                className="px-4 py-2.5 text-[11px] font-light tracking-[0.22em] uppercase text-muted-foreground transition-colors hover:text-foreground"
              >
                Blog
              </Link>

              <span
                aria-hidden
                className="h-6 w-px bg-foreground/15"
              />


              <span
                aria-hidden
                className="h-6 w-px bg-foreground/15"
              />

              <div className="relative">
                <ForumsDropdown />
              </div>
            </div>
          </div>

          {/* Mobile: just logo */}
          <Link
            to="/"
            className="lg:hidden rounded-xl border border-border/30 bg-card/60 backdrop-blur-md px-4 py-2 flex items-center hover:bg-card/80 transition-colors"
          >
            <span className="text-base font-extralight tracking-[0.25em] text-foreground">ASHERIN</span>
          </Link>

          {/* Right: Auth buttons */}
          <div className="hidden lg:block relative" data-header-right>
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-6 -inset-y-3 opacity-60 blur-2xl"
              style={{ background: "hsl(0 0% 100% / 0.04)" }}
            />
            <div className="relative flex items-center rounded-full border border-foreground/15 bg-background/40 backdrop-blur-2xl shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.04)] overflow-hidden">
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-6 top-0 h-px bg-foreground/25"
              />
              <Link
                to="/dashboard"
                className="group relative flex items-center gap-2 px-5 py-2.5 text-[11px] font-light tracking-[0.22em] uppercase text-foreground transition-colors overflow-hidden"
              >
                <span className="font-mono text-[8px] tracking-[0.15em] text-foreground/40 relative z-10">02</span>
                <span className="relative z-10">Dashboard</span>
                <ArrowUpRight
                  className="relative z-10 h-3.5 w-3.5 transition-transform group-hover:-translate-y-px group-hover:translate-x-px"
                  strokeWidth={1.5}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-foreground/[0.06] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                />
              </Link>
            </div>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden rounded-xl border border-border/30 bg-card/60 backdrop-blur-md p-2.5"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5 text-foreground" /> : <Menu className="h-5 w-5 text-foreground" />}
          </button>

          {mobileMenuOpen && (
            <>
              <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
              <div
                className="absolute right-4 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] max-h-[80vh] overflow-y-auto rounded-2xl border border-border/30 p-4 shadow-2xl lg:hidden animate-in slide-in-from-top-2 fade-in duration-200"
                style={{
                  backgroundImage: "url('/wallpapers/menu-abyss.webp'), url('/wallpapers/menu-abyss.thumb.webp')",
                  backgroundSize: "cover, cover",
                  backgroundPosition: "center, center",
                }}
              >
                <div className="pointer-events-none absolute inset-0 rounded-2xl bg-black/85" aria-hidden="true" />
                <div className="relative flex flex-col gap-2">
                  <Link
                    to="/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-lg bg-foreground px-4 py-3 min-h-[48px] flex items-center justify-center text-sm font-light tracking-wide text-background transition-colors hover:bg-foreground/90"
                  >
                    Open Dashboard
                  </Link>
                  <div className="my-1 border-t border-border/20 mx-4" />
                  <Link
                    to="/software"
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-lg px-4 py-3 min-h-[48px] flex items-center text-sm font-light tracking-wide text-foreground transition-colors hover:bg-foreground/10"
                  >
                    Software
                  </Link>
                  <Link
                    to="/for"
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-lg px-4 py-3 min-h-[48px] flex items-center text-sm font-light tracking-wide text-foreground transition-colors hover:bg-foreground/10"
                  >
                    For
                  </Link>
                  <Link
                    to="/blog"
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-lg px-4 py-3 min-h-[48px] flex items-center text-sm font-light tracking-wide text-foreground transition-colors hover:bg-foreground/10"
                  >
                    Blog
                  </Link>
                  <Link
                    to="/forums"
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-lg px-4 py-3 min-h-[48px] flex items-center text-sm font-light tracking-wide text-foreground transition-colors hover:bg-foreground/10"
                  >
                    Forums
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </header>

    </>
  );
};

export default Header;
