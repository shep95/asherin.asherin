// Renders a published Asher Code tab as a sandboxed iframe.
import { useMemo } from "react";

interface Props {
  name: string;
  entryHtml: string;
}

export default function AsherPublishedTabRenderer({ name, entryHtml }: Props) {
  const srcDoc = useMemo(() => entryHtml || "<html><body style='font-family:sans-serif;padding:2rem;color:#888'>No content published.</body></html>", [entryHtml]);

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="border-b border-border/15 bg-card/20 px-4 py-2 backdrop-blur-md">
        <p className="text-[10px] font-light tracking-[0.3em] text-foreground/80 uppercase">
          ◈ {name} · Published Tab
        </p>
      </div>
      <iframe
        title={name}
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-forms allow-popups allow-modals"
        className="flex-1 w-full border-0 bg-white"
      />
    </div>
  );
}
