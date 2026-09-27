import { Sparkles, Check } from "lucide-react";

interface QuestionOption {
  text: string;
  description: string;
  isRecommended: boolean;
}

interface ZaliQuestionOptionsProps {
  options: QuestionOption[];
  onSelect: (option: string) => void;
}

/** Parse ```options blocks from assistant messages */
export function parseQuestionOptions(content: string): { cleanContent: string; options: QuestionOption[] } {
  // Remove design_output blocks from display
  let cleaned = content.replace(/```design_output\n[\s\S]*?```/g, "").trim();

  const optionsRegex = /```options\n([\s\S]*?)```/;
  const match = cleaned.match(optionsRegex);
  if (!match) return { cleanContent: cleaned, options: [] };

  const cleanContent = cleaned.replace(optionsRegex, "").trim();
  const lines = match[1].trim().split("\n").filter(Boolean);

  const options: QuestionOption[] = lines.map((line) => {
    const isRecommended = line.startsWith("[RECOMMENDED]");
    const raw = isRecommended ? line.replace("[RECOMMENDED]", "").trim() : line.trim();
    const dashIdx = raw.indexOf("—");
    const emIdx = raw.indexOf(" — ");
    const splitIdx = emIdx !== -1 ? emIdx : dashIdx;

    if (splitIdx > 0) {
      return {
        text: raw.slice(0, splitIdx).trim(),
        description: raw.slice(splitIdx + (emIdx !== -1 ? 3 : 1)).trim(),
        isRecommended,
      };
    }
    return { text: raw, description: "", isRecommended };
  });

  return { cleanContent, options };
}

const ZaliQuestionOptions = ({ options, onSelect }: ZaliQuestionOptionsProps) => {
  if (options.length === 0) return null;

  return (
    <div className="mt-3 space-y-1.5">
      {options.map((opt, i) => (
        <button
          key={i}
          onClick={() => onSelect(opt.text)}
          className={`w-full text-left rounded-xl border px-3 py-2.5 transition-all group ${
            opt.isRecommended
              ? "border-accent/30 bg-accent/5 hover:bg-accent/10 hover:border-accent/50"
              : "border-border/20 bg-card/30 hover:bg-foreground/5 hover:border-border/40"
          }`}
        >
          <div className="flex items-start gap-2">
            <div className={`mt-0.5 flex-shrink-0 h-4 w-4 rounded-full border flex items-center justify-center ${
              opt.isRecommended ? "border-accent/50 bg-accent/20" : "border-border/30"
            }`}>
              {opt.isRecommended && <Check className="h-2.5 w-2.5 text-accent" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-light text-foreground">{opt.text}</span>
                {opt.isRecommended && (
                  <span className="flex items-center gap-0.5 text-[9px] font-light text-accent bg-accent/10 rounded-full px-1.5 py-0.5">
                    <Sparkles className="h-2.5 w-2.5" />
                    Recommended
                  </span>
                )}
              </div>
              {opt.description && (
                <p className="text-[10px] font-light text-muted-foreground/60 mt-0.5 leading-relaxed">{opt.description}</p>
              )}
            </div>
          </div>
        </button>
      ))}
      <p className="text-[9px] text-muted-foreground/40 text-center pt-1">Or type your own answer below</p>
    </div>
  );
};

export default ZaliQuestionOptions;
