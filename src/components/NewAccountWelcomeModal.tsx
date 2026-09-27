import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
const welcomeImg = { url: "/wallpapers/menu-abyss.webp" };

const STORAGE_PREFIX = "aureon_welcome_seen_";

/**
 * One-state welcome modal.
 *
 * A new account sees what the platform is and which rooms it opens. Shown
 * once per account.
 */

const CAPABILITIES = [
  { k: "01", t: "asherin chat", d: "Multi-model intelligence with consensus and BYOK." },
  { k: "02", t: "asherin.search", d: "Live public-engine search with credibility ranking and cited hits." },
  { k: "03", t: "asherin.eye", d: "Live public spatial layers on a globe — flights, quakes, disasters, public cameras." },
  { k: "04", t: "asherin.cyber", d: "Passive domain recon plus a public CVE index lookup. Not a credentialed scanner." },
  { k: "05", t: "asherin.defender", d: "Camera, wifi and spy-class status on your own device. Nothing about anyone else's." },
  { k: "06", t: "asherin.knowledge", d: "Your own documents embedded and cited, passage by passage." },
];

export default function NewAccountWelcomeModal() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const { state, key } = useMemo(() => {
    if (!user?.id) return { state: null as null | "welcome", key: "" };
    return { state: "welcome" as const, key: STORAGE_PREFIX + user.id };
  }, [user?.id]);

  // Reset open whenever the identity (user/state) changes — prevents lingering
  // open=true from a prior account in the same tab.
  useEffect(() => {
    if (!state || !key) {
      setOpen(false);
      return;
    }
    if (localStorage.getItem(key)) {
      setOpen(false);
      return;
    }
    setOpen(true);
  }, [state, key]);

  const dismiss = () => {
    if (key) localStorage.setItem(key, "1");
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) dismiss();
      }}
    >
      <DialogContent className="max-w-3xl border border-white/10 bg-black p-0 overflow-hidden">
        {/* Mobile: image as background wallpaper behind the panel */}
        <div className="relative sm:hidden">
          <img
            src={welcomeImg.url}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40"
            style={{ filter: "grayscale(1) brightness(0.7) contrast(1.05)" }}
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.82) 60%, #000 100%)" }}
          />
          <div className="relative">
            <WelcomePanel onBegin={dismiss} />
          </div>
        </div>

        {/* Desktop: side-by-side, image on the left, no blur */}
        <div className="hidden sm:grid sm:grid-cols-[260px_1fr]">
          <div className="relative bg-black">
            <img
              src={welcomeImg.url}
              alt="Asherin initiation silhouette"
              className="h-full w-full object-cover"
              style={{ filter: "grayscale(1) brightness(0.95) contrast(1.05)" }}
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.35) 100%)",
              }}
            />
          </div>

          <WelcomePanel onBegin={dismiss} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WelcomePanel({ onBegin }: { onBegin: () => void }) {
  return (
    <div className="p-7 space-y-5 max-h-[80vh] overflow-y-auto">
      <div>
        <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-foreground/40">asherin</p>
        <h2 className="mt-2 text-2xl font-extralight tracking-wide text-foreground">bring your own key.</h2>
      </div>

      <p className="text-sm font-extralight leading-relaxed text-muted-foreground">
        bring your own api key and asherin runs on it — you pay that vendor for inference. every room below is open
        to your account.
      </p>

      <CapabilityGrid />

      <div className="flex items-center gap-3 pt-1">
        <Button
          onClick={onBegin}
          className="bg-foreground text-background hover:bg-foreground/90 font-light tracking-wide"
        >
          Begin
        </Button>
      </div>
    </div>
  );
}

function CapabilityGrid() {
  return (
    <div>
      <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-foreground/40 mb-2">◈ Capabilities</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {CAPABILITIES.map((c) => (
          <div key={c.k} className="rounded-md border border-white/10 bg-white/[0.015] px-3 py-2">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[10px] text-foreground/40">{c.k}</span>
              <span className="text-xs font-light tracking-wide text-foreground">{c.t}</span>
            </div>
            <p className="mt-0.5 text-[11px] font-extralight leading-snug text-muted-foreground">{c.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
