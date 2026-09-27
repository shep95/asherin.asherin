import { X, Play, Pause, Trash2, GripVertical, Clock } from "lucide-react";

export interface QueueItem {
  id: string;
  content: string;
}

interface MessageQueuePanelProps {
  items: QueueItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onProcessNow?: () => void;
  paused?: boolean;
  onTogglePause?: () => void;
}

const MessageQueuePanel = ({ items, onRemove, onClear, onProcessNow, paused, onTogglePause }: MessageQueuePanelProps) => {
  if (items.length === 0) return null;

  return (
    <div className="px-4 pb-2 lg:pb-3 animate-fade-in">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/10">
            <div className="flex items-center gap-2">
              <span className="text-xs font-light tracking-wide text-foreground">Queue</span>
              <span className="flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-accent/20 text-[10px] font-medium text-accent">
                {items.length}
              </span>
              {paused && (
                <span className="text-[10px] font-light text-amber-400/70 tracking-wide">Paused</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {onTogglePause && (
                <button
                  onClick={onTogglePause}
                  className={`p-1.5 rounded-lg transition-all ${paused ? "text-amber-400 hover:text-amber-300 hover:bg-amber-400/10" : "text-muted-foreground/50 hover:text-foreground hover:bg-foreground/5"}`}
                  title={paused ? "Resume queue" : "Pause queue"}
                >
                  {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                </button>
              )}
              {paused && onProcessNow && (
                <button
                  onClick={onProcessNow}
                  className="p-1.5 rounded-lg text-accent/70 hover:text-accent hover:bg-accent/10 transition-all"
                  title="Process all now"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                </button>
              )}
              <button
                onClick={onClear}
                className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/5 transition-all"
                title="Clear queue"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Queue items */}
          <div className="max-h-32 overflow-y-auto">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2.5 px-4 py-2 hover:bg-foreground/[0.02] transition-colors group"
              >
                <GripVertical className="h-3 w-3 text-muted-foreground/20 shrink-0" />
                <Clock className={`h-3 w-3 shrink-0 ${paused ? "text-amber-400/40" : "text-accent/40"}`} />
                <span className="flex-1 text-xs font-light text-muted-foreground truncate">
                  {item.content}
                </span>
                <button
                  onClick={() => onRemove(item.id)}
                  className="shrink-0 p-1 rounded-md text-muted-foreground/20 hover:text-destructive/70 opacity-0 group-hover:opacity-100 transition-all"
                  title="Remove from queue"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageQueuePanel;
