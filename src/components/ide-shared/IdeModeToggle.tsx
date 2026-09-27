// Hard switch: Chat = read-only Q&A, Agent = autonomous file edits.
// The chosen mode is persisted per IDE in localStorage.
import { useEffect, useState } from "react";
import { MessageSquare, Bot } from "lucide-react";

export type IdeMode = "chat" | "agent";

interface Props {
  scope: "aureon" | "asher";
  value?: IdeMode;
  onChange?: (mode: IdeMode) => void;
}

const KEY = (scope: string) => `ide.mode.${scope}`;

export function readIdeMode(scope: "aureon" | "asher"): IdeMode {
  if (typeof window === "undefined") return "chat";
  return (localStorage.getItem(KEY(scope)) as IdeMode) || "chat";
}

export default function IdeModeToggle({ scope, value, onChange }: Props) {
  const [mode, setMode] = useState<IdeMode>(value ?? readIdeMode(scope));

  useEffect(() => { if (value) setMode(value); }, [value]);

  const set = (m: IdeMode) => {
    setMode(m);
    try { localStorage.setItem(KEY(scope), m); } catch {}
    onChange?.(m);
  };

  return (
    <div className="inline-flex items-center rounded-md border border-border/30 bg-card/40 p-0.5">
      <button
        onClick={() => set("chat")}
        title="Chat mode — AI answers questions, never edits files"
        className={`flex items-center gap-1 px-2 py-1 rounded text-[9.5px] transition-colors ${
          mode === "chat" ? "bg-foreground/15 text-foreground" : "text-muted-foreground hover:text-foreground/80"
        }`}
      >
        <MessageSquare className="size-2.5" />
        Chat
      </button>
      <button
        onClick={() => set("agent")}
        title="Agent mode — AI may read, write, and run code"
        className={`flex items-center gap-1 px-2 py-1 rounded text-[9.5px] transition-colors ${
          mode === "agent" ? "bg-foreground/15 text-foreground" : "text-muted-foreground hover:text-foreground/80"
        }`}
      >
        <Bot className="size-2.5" />
        Agent
      </button>
    </div>
  );
}
