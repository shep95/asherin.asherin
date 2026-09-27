import { Sparkles } from "lucide-react";

interface FollowUpSuggestionsProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
}

const FollowUpSuggestions = ({ suggestions, onSelect }: FollowUpSuggestionsProps) => {
  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSelect(s)}
          className="flex items-center gap-1.5 rounded-xl border border-border/20 bg-card/30 backdrop-blur-sm px-3 py-1.5 text-xs font-light text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-all"
        >
          <Sparkles className="h-3 w-3" />
          {s}
        </button>
      ))}
    </div>
  );
};

export default FollowUpSuggestions;
