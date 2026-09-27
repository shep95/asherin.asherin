// v.2 shared page shell — one chrome for every room.
//
// Spatial constancy: the header row sits in the same 48px slot on chat,
// library, memory, vault, team, maps, ghost and ide, so moving between rooms
// is muscle memory instead of visual search. The header owns exactly one
// primary-action slot (Fitts: large, reachable, always the same corner) and
// the page body owns everything else.
//
// Views do not render their own hero in v.2; they portal their primary button
// into the shell slot with <V2Action>.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const ACTION_SLOT_ID = "v2-action-slot";

interface Props {
  /** lowercase room name — the same label the rail uses. */
  title: string;
  /** one muted sentence, max ~90 chars. Longer strings become a tooltip. */
  subtitle?: string;
  /** canvas rooms (whiteboard, maps, ide) own their own scrolling. */
  canvas?: boolean;
  children: ReactNode;
}

const V2PageShell = ({ title, subtitle, canvas = false, children }: Props) => {
  const long = !!subtitle && subtitle.length > 90;
  return (
    <div data-dashboard-ui="v2" className="flex h-full min-h-0 w-full flex-col">
      <header className="v2-room-header flex h-14 shrink-0 items-center gap-3 border-b border-border/15 px-4 sm:px-6">
        <span className="v2-room-index hidden font-mono text-[9px] text-muted-foreground/35 sm:inline" aria-hidden="true">ASH / 01</span>
        <span className="hidden h-4 w-px bg-border/25 sm:block" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h1
            className="truncate text-sm font-light lowercase text-foreground"
            title={long ? subtitle : undefined}
          >
            {title}
          </h1>
          {subtitle && !long && (
            <p className="truncate text-[11px] font-extralight text-muted-foreground/70">{subtitle}</p>
          )}
        </div>
        <div className="v2-room-signal hidden items-center gap-2 text-[9px] text-muted-foreground/45 sm:flex" aria-label="room status: active">
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--signal-live))] shadow-[0_0_12px_hsl(var(--signal-live)/0.5)]" />
          ACTIVE
        </div>
        <div id={ACTION_SLOT_ID} className="flex shrink-0 items-center gap-2" />
      </header>
      <div className={`relative min-h-0 flex-1 ${canvas ? "overflow-hidden" : "overflow-auto"}`}>{children}</div>
    </div>
  );
};

/**
 * Renders a view's single primary action into the shell header. Outside v.2
 * (no slot on the page) it renders nothing, so callers keep their own button
 * in the Current layout.
 */
export const V2Action = ({ children }: { children: ReactNode }) => {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // The slot mounts with the shell in the same commit; read it after paint.
    setSlot(document.getElementById(ACTION_SLOT_ID));
  }, []);
  if (!slot) return null;
  return createPortal(children, slot);
};

/** Shared button skin so every room's primary action looks identical. */
export const v2ActionClass =
  "inline-flex items-center gap-2 rounded-xl border border-border/25 bg-card/40 px-3.5 py-1.5 text-xs font-light text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-50";

export default V2PageShell;
