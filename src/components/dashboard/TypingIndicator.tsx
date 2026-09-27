interface TypingIndicatorProps {
  mode?: "thinking" | "searching" | "reading" | "generating";
}

const labels: Record<string, string> = {
  thinking: "Aureon is thinking",
  searching: "Searching the web",
  reading: "Reading document",
  generating: "Generating response",
};

const TypingIndicator = ({ mode = "thinking" }: TypingIndicatorProps) => {
  return (
    <div className="flex items-center gap-2.5 animate-fade-in">
      <div className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-accent/70 animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-accent/70 animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-accent/70 animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
      <span className="text-[11px] font-extralight text-muted-foreground/60 tracking-wide">
        {labels[mode] ?? labels.thinking}…
      </span>
    </div>
  );
};

export default TypingIndicator;
