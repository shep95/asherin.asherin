import { useEffect } from "react";
import FounderPhotoCarousel from "@/components/founder/FounderPhotoCarousel";
import Header from "@/components/Header";
import { Link } from "react-router-dom";
import { ArrowLeft, Instagram, Linkedin, MessageCircle, ShieldAlert } from "lucide-react";
import ScrollProgressBar from "@/components/landing/ScrollProgressBar";
import SiteFooter from "@/components/SiteFooter";
import LandingBackground from "@/components/LandingBackground";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const SOCIALS = [
  {
    href: "https://www.instagram.com/asher_united/",
    Icon: Instagram,
    label: "instagram",
    handle: "@asher_united",
  },
  {
    href: "https://www.linkedin.com/in/shepnewton/",
    Icon: Linkedin,
    label: "linkedin",
    handle: "shepnewton",
  },
  {
    href: "https://discord.gg/TzTdY8BfMx",
    Icon: MessageCircle,
    label: "discord",
    handle: "join community",
  },
] as const;

const Founder = () => {
  // SEO head (title, description, canonical, og:*, WebPage JSON-LD) is owned by
  // <RouteSeo />. Only the Person schema specific to this page is added here.
  useEffect(() => {
    const ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.id = "founder-jsonld";
    ld.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Person",
      name: "Asher Newton",
      jobTitle: "Founder of Asherin",
      url: "https://asherin.com/founder",
      description: "Asher Newton, founder of Asherin.",
      sameAs: SOCIALS.map((s) => s.href),
    });
    document.head.appendChild(ld);
    return () => {
      document.getElementById("founder-jsonld")?.remove();
    };
  }, []);

  return (
    <LandingBackground overlayOpacity="bg-background/75">
      <div className="landing-perf min-h-screen text-foreground">
      <ScrollProgressBar />
      <Header />

      <main id="top" className="relative z-10 min-h-[calc(100vh-4rem)] overflow-hidden px-6 pb-20 pt-28 sm:pt-32 scroll-mt-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden opacity-[0.025]">
          <span className="select-none whitespace-nowrap font-display text-[28vw] font-semibold leading-none text-foreground">
            asherin
          </span>
        </div>

        <div className="relative mx-auto max-w-6xl">
          <Link
            to="/"
            className="mb-12 inline-flex items-center gap-2 text-[10px] font-extralight tracking-[0.32em] text-muted-foreground/70 transition-colors hover:text-foreground uppercase"
          >
            <ArrowLeft className="h-3 w-3" />
            back to home
          </Link>

          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="group relative order-2 lg:order-1 lg:col-span-6">
              <div className="pointer-events-none absolute -inset-4 rounded-full bg-foreground/[0.04] opacity-0 blur-2xl transition-opacity duration-700 group-hover:opacity-100" />
              <div className="relative aspect-video w-full overflow-hidden rounded-sm border border-border/50 bg-card/40 shadow-2xl backdrop-blur-sm">
                <FounderPhotoCarousel />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent" />
              </div>
              <div className="absolute -bottom-4 right-4 border border-border/50 bg-background/90 px-5 py-3 shadow-xl backdrop-blur-xl sm:-right-4">
                <p className="text-[9px] font-medium tracking-[0.35em] text-foreground uppercase">founder · asherin</p>
              </div>
            </div>

            <div className="order-1 text-left lg:order-2 lg:col-span-6">
              <div className="mb-6 flex items-center gap-4">
                <span className="h-px w-8 bg-border" />
                <span className="text-[10px] font-medium tracking-[0.45em] text-muted-foreground uppercase">founder &amp; builder</span>
              </div>

              <h1 className="font-display text-6xl font-light leading-[0.86] text-foreground sm:text-7xl md:text-8xl lg:text-9xl">
                asher
                <br />
                <span className="italic font-light text-muted-foreground">newton</span>
              </h1>

              <p className="mt-5 text-[10px] font-light tracking-[0.42em] text-muted-foreground uppercase">
                prompt engineer
              </p>

              <p className="mt-8 max-w-xl border-l border-border/70 pl-6 text-lg font-extralight leading-relaxed text-foreground/75 sm:text-xl">
                i build asherin. it is a small project made with care, and it is
                still learning.
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
                {SOCIALS.map(({ href, Icon, label, handle }) => (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-2.5 border-b border-border/50 py-2 text-xs font-light text-foreground/85 transition-colors hover:border-foreground hover:text-foreground"
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.5} />
                    <span className="tracking-[0.12em] uppercase">{label}</span>
                    <span className="text-[10px] text-muted-foreground/70">{handle}</span>
                  </a>
                ))}

                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" className="h-auto rounded-none border-b border-border/50 px-0 py-2 text-xs font-light text-muted-foreground hover:border-foreground hover:bg-transparent hover:text-foreground">
                      <ShieldAlert className="h-4 w-4" strokeWidth={1.5} />
                      <span className="tracking-[0.12em] uppercase">twitter notice</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md rounded-sm border-border/50 bg-background/95 backdrop-blur-2xl">
                    <DialogHeader>
                      <DialogTitle className="font-display text-3xl font-light">twitter account status</DialogTitle>
                      <DialogDescription className="pt-4 text-left leading-relaxed text-foreground/75">
                        asher’s twitter account was suspended after he defended a woman who was being sexually harassed and bullied through images posted online. according to asher, the large account involved appealed to people who supported its actions, after which twitter issued an identity and device ban.
                      </DialogDescription>
                    </DialogHeader>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
      </div>
    </LandingBackground>
  );
};

export default Founder;
