import { Zap, ExternalLink } from "lucide-react";
import type { InstantAnswer } from "./types";

interface InstantAnswerCardProps {
  answer: InstantAnswer;
}

const InstantAnswerCard = ({ answer }: InstantAnswerCardProps) => {
  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 backdrop-blur-sm p-4 mb-4 animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-accent/20 p-2 shrink-0">
          <Zap className="h-4 w-4 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[10px] font-medium tracking-wider text-accent uppercase">
              {answer.type === 'definition' ? 'definition' : answer.type === 'answer' ? 'quick answer' : 'instant answer'}
            </p>
            {answer.source && (
              <span className="text-[10px] text-muted-foreground/40">via {answer.source}</span>
            )}
          </div>
          <h4 className="text-sm font-medium text-foreground mb-1">{answer.title}</h4>
          <p className="text-sm font-light text-foreground/80 leading-relaxed">{answer.value}</p>
          {answer.details?.url && (
            <a href={answer.details.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-[11px] text-accent hover:underline">
              read more <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default InstantAnswerCard;
