/**
 * a published agent tab — the page asherin.agents wrote, in a frame that can
 * reach nothing but asherin itself.
 *
 * the frame is sandboxed to scripts only and every page gets a
 * content-security-policy that forbids network, so neither a model-written
 * page nor an operator-edited one can call out. the one bridge is
 * postMessage: the page asks {type:"zahten:run"}, asherin runs the agent on
 * this device with shepherd and posts the result back. no key, no row and no
 * identifier crosses into the frame — only the run's log and output.
 */
import { useEffect, useMemo, useRef } from "react";
import { ensureCsp, readTabAgentId } from "@/lib/zahten/parse";
import { listRuns, resolveRunnable, runAgent } from "@/lib/zahten/runtime";

interface Props {
  name: string;
  entryHtml: string;
  /** the forge agent id; when absent it is read from the page's own meta tag. */
  agentId?: string;
}

const EMPTY_PAGE =
  "<!doctype html><html><body style='margin:0;padding:2rem;font-family:ui-sans-serif,system-ui;background:#0b0b0c;color:#8a8a8a;font-size:14px'>this tab has no page yet. open asherin.agents and publish it again.</body></html>";

const RUNS_SHOWN = 10;

export function TabFrame({ html, agentId, title, className }: { html: string; agentId?: string | null; title: string; className?: string }) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const id = agentId ?? readTabAgentId(html || "");
  const srcDoc = useMemo(() => ensureCsp(html?.trim() ? html : EMPTY_PAGE), [html]);

  useEffect(() => {
    const post = (msg: unknown) => {
      try {
        ref.current?.contentWindow?.postMessage(msg, "*");
      } catch {
        /* frame gone */
      }
    };
    const onMessage = async (e: MessageEvent) => {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const d = e.data as { type?: string; input?: unknown } | null;
      if (!d || typeof d !== "object" || typeof d.type !== "string") return;
      if (d.type === "zahten:ready") {
        if (!id) {
          post({ type: "zahten:error", message: "this page carries no agent id. publish it again from asherin.agents." });
          return;
        }
        post({ type: "zahten:runs", runs: await listRuns(id, RUNS_SHOWN) });
        return;
      }
      if (d.type === "zahten:run") {
        if (!id) {
          post({ type: "zahten:error", message: "this page carries no agent id. publish it again from asherin.agents." });
          return;
        }
        const agent = await resolveRunnable(id);
        if (!agent) {
          post({ type: "zahten:error", message: "the agent behind this tab is gone. rebuild it in asherin.agents and publish again." });
          return;
        }
        try {
          const run = await runAgent(agent, typeof d.input === "string" ? d.input : "", "tab");
          if (run.status === "failed") {
            post({ type: "zahten:error", message: run.error || "the run failed." });
          } else {
            post({ type: "zahten:result", run, runs: await listRuns(id, RUNS_SHOWN) });
          }
        } catch (err) {
          post({ type: "zahten:error", message: err instanceof Error ? err.message : String(err) });
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [id]);

  return (
    <iframe
      ref={ref}
      title={title}
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      className={className ?? "h-full w-full border-0 bg-background"}
    />
  );
}

export default function AsherPublishedTabRenderer({ name, entryHtml, agentId }: Props) {
  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="border-b border-border/15 bg-card/20 px-4 py-2 backdrop-blur-md">
        <p className="truncate text-[11px] font-light text-muted-foreground/80">
          <span className="text-foreground/80">{name.toLowerCase()}</span> · published from asherin.agents · runs on this device
        </p>
      </div>
      <TabFrame html={entryHtml} agentId={agentId} title={name} className="min-h-0 w-full flex-1 border-0 bg-background" />
    </div>
  );
}
