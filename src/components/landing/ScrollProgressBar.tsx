import { useEffect, useState } from "react";

/**
 * Thin fixed reading-progress bar across the top of the viewport.
 * Fills as the visitor scrolls — psychological completion cue.
 */
const ScrollProgressBar = () => {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const total = h.scrollHeight - h.clientHeight;
      const p = total > 0 ? (h.scrollTop / total) * 100 : 0;
      setPct(p);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 z-[60] h-[2px] bg-transparent pointer-events-none"
    >
      <div
        className="h-full bg-foreground/80 transition-[width] duration-100 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};

export default ScrollProgressBar;
