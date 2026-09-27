import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowDown } from "lucide-react";

interface ScrollIntelligenceProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isStreaming: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

const ScrollIntelligence = ({ containerRef, isStreaming, messagesEndRef }: ScrollIntelligenceProps) => {
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const isAutoScrolling = useRef(false);

  // Detect user scrolling up
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (isAutoScrolling.current) return;
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      setUserScrolledUp(distanceFromBottom > 100);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [containerRef]);

  // Auto-scroll when streaming and user hasn't scrolled up
  useEffect(() => {
    if (!isStreaming || userScrolledUp) return;
    const el = messagesEndRef.current;
    if (!el) return;
    isAutoScrolling.current = true;
    el.scrollIntoView({ behavior: "smooth" });
    requestAnimationFrame(() => {
      isAutoScrolling.current = false;
    });
  });

  const jumpToLatest = useCallback(() => {
    setUserScrolledUp(false);
    isAutoScrolling.current = true;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    requestAnimationFrame(() => {
      isAutoScrolling.current = false;
    });
  }, [messagesEndRef]);

  if (!userScrolledUp) return null;

  return (
    <div className="sticky bottom-4 flex justify-center z-30 pointer-events-none">
      <button
        onClick={jumpToLatest}
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/30 bg-card/90 backdrop-blur-xl px-4 py-2 text-xs font-light text-muted-foreground hover:text-foreground shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] animate-fade-in"
      >
        <ArrowDown className="h-3 w-3" />
        {isStreaming ? "Aureon is still writing — Jump to latest" : "Jump to present"}
      </button>
    </div>
  );
};

export default ScrollIntelligence;
