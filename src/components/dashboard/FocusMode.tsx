import { useEffect } from "react";

interface FocusModeProps {
  active: boolean;
  onExit: () => void;
}

const FocusMode = ({ active, onExit }: FocusModeProps) => {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, onExit]);

  if (!active) return null;

  return (
    <>
      {/* Vignette overlay */}
      <div
        className="fixed inset-0 z-20 pointer-events-none transition-opacity duration-700"
        style={{
          background: "radial-gradient(ellipse at center, transparent 40%, hsl(var(--background) / 0.6) 100%)",
        }}
      />
      {/* Exit hint */}
      <div className="fixed top-3 right-3 z-30 animate-fade-in">
        <button
          onClick={onExit}
          className="rounded-lg border border-border/20 bg-card/60 backdrop-blur-md px-3 py-1.5 text-[10px] font-light text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          ESC to exit focus
        </button>
      </div>
    </>
  );
};

export default FocusMode;
