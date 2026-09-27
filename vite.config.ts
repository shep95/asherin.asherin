import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { seoPrerenderPlugin } from "./scripts/seoPrerenderPlugin";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), seoPrerenderPlugin()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    // Local edition: nothing talks to a hosted backend. Any stray call to the
    // old function base fails immediately and quietly instead of hitting the
    // page's own origin.
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("http://127.0.0.1:1/local"),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("local"),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify("local"),
  },
  optimizeDeps: {
    exclude: ["sweph-wasm"],
  },
  esbuild:
    mode === "production"
      ? {
          // Nothing diagnostic ships to a visitor's console: no internal
          // hostnames, no request shapes, no state dumps. Errors still surface
          // through the boundaries, which render them rather than log them.
          drop: ["console", "debugger"],
          legalComments: "none",
        }
      : undefined,
  build: {
    sourcemap: false,
    target: "es2020",
    chunkSizeWarningLimit: 1500,
  },
}));
