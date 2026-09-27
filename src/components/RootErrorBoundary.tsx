import { Component, ReactNode } from "react";

/**
 * Last-resort boundary. Without a boundary above the router, any throw during
 * render of a provider, the router shell, or a page module unmounts the entire
 * React root — the DOM empties and the user sees a black page with no way out.
 * This boundary guarantees a visible, actionable recovery screen instead.
 *
 * Styling is intentionally inline: if the failure happened before or during
 * stylesheet-dependent render, Tailwind classes may not describe anything
 * useful, so the fallback must not depend on the design system to be legible.
 */

interface Props {
  children: ReactNode;
  /** Identifies which layer caught it in logs (root vs. route). */
  scope: string;
  /** Re-mount children when this value changes (e.g. route pathname). */
  resetKey?: string;
}

interface State {
  error: Error | null;
  resetKey?: string;
}

function isChunkLoadError(error: Error): boolean {
  const msg = `${error.name} ${error.message}`.toLowerCase();
  return (
    msg.includes("dynamically imported module") ||
    msg.includes("chunkloaderror") ||
    msg.includes("importing a module script failed") ||
    (msg.includes("failed to fetch") && msg.includes(".js"))
  );
}

const RELOAD_FLAG = "aureon_chunk_reload_at";

/**
 * A stale index.html pointing at hashed chunks that no longer exist is the
 * most common cause of a post-deploy blank screen. One hard reload fixes it —
 * but only one, guarded by a timestamp, so a genuinely broken build can never
 * put the tab into a reload loop.
 */
export function attemptChunkRecovery(error: Error): boolean {
  if (!isChunkLoadError(error)) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) || 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    return false;
  }
  // Drop caches that could re-serve the same stale asset graph.
  void (async () => {
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update().catch(() => {})));
      }
    } catch {
      /* cache eviction is best-effort */
    } finally {
      window.location.reload();
    }
  })();
  return true;
}

class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // Navigating away from a broken route clears the boundary automatically.
    if (props.resetKey !== state.resetKey) {
      return { resetKey: props.resetKey, error: null };
    }
    return null;
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error(`[RootErrorBoundary:${this.props.scope}]`, error, info);
    attemptChunkRecovery(error);
  }

  private reload = () => window.location.reload();
  private goHome = () => {
    window.location.href = "/";
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const stale = isChunkLoadError(error);

    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "18px",
          padding: "32px",
          background: "#0a0a0a",
          color: "#e8e8e8",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
          textAlign: "center",
        }}
      >
        <div
          aria-hidden
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            border: "1px solid rgba(232,232,232,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            color: "rgba(232,232,232,0.6)",
          }}
        >
          ◈
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 300, margin: 0, letterSpacing: "0.02em" }}>
          {stale ? "A newer version of Asherin is available" : "This screen failed to render"}
        </h1>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            margin: 0,
            maxWidth: 460,
            color: "rgba(232,232,232,0.6)",
            fontWeight: 300,
          }}
        >
          {stale
            ? "Your browser is holding an outdated copy of the app. Reloading pulls the current build."
            : "The interface stopped instead of going blank. Your data and session are untouched."}
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={this.reload}
            style={{
              padding: "10px 18px",
              borderRadius: 12,
              border: "1px solid rgba(232,232,232,0.25)",
              background: "rgba(232,232,232,0.08)",
              color: "#e8e8e8",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          <button
            onClick={this.goHome}
            style={{
              padding: "10px 18px",
              borderRadius: 12,
              border: "1px solid rgba(232,232,232,0.14)",
              background: "transparent",
              color: "rgba(232,232,232,0.7)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Go home
          </button>
        </div>
        <pre
          style={{
            maxWidth: 620,
            maxHeight: 140,
            overflow: "auto",
            fontSize: 10,
            lineHeight: 1.5,
            color: "rgba(232,232,232,0.32)",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(232,232,232,0.08)",
            borderRadius: 10,
            padding: "10px 12px",
            textAlign: "left",
            whiteSpace: "pre-wrap",
          }}
        >
          {error.name}: {error.message}
        </pre>
      </div>
    );
  }
}

export default RootErrorBoundary;
