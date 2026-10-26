import { describe, expect, it } from "vitest";
import { DEFAULT_TAB, KEYBOARD_SHORTCUTS, resolveSettingsTab, SETTINGS_TABS, TAB_HINT_KEY, takeTabHint } from "../tabs";
import { GATED_TOOLS, spendRooms } from "../spendRooms";
import type { ToolSwitch, UsageEvent } from "@/lib/usage/ledger";
import { NAV_INTENTS } from "@/lib/navIntents";
import fs from "node:fs";
import path from "node:path";

describe("settings tabs", () => {
  it("opens on the device tab by default and honours a known hint", () => {
    expect(resolveSettingsTab(null)).toBe(DEFAULT_TAB);
    expect(resolveSettingsTab("nonsense")).toBe(DEFAULT_TAB);
    expect(resolveSettingsTab("privacy")).toBe("privacy");
    expect(resolveSettingsTab("intelligence")).toBe("intelligence");
    // the old first tab was called "you"; a hint written for it still lands
    expect(resolveSettingsTab("you")).toBe("device");
  });

  it("reads the hint once and clears it", () => {
    const store = new Map<string, string>([[TAB_HINT_KEY, "privacy"]]);
    const storage = { getItem: (k: string) => store.get(k) ?? null, removeItem: (k: string) => void store.delete(k) };
    expect(takeTabHint(storage)).toBe("privacy");
    expect(store.has(TAB_HINT_KEY)).toBe(false);
    expect(takeTabHint(storage)).toBe(DEFAULT_TAB);
  });

  it("a refusing storage means the default tab, never a throw", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
    };
    expect(takeTabHint(storage)).toBe(DEFAULT_TAB);
    expect(takeTabHint(null)).toBe(DEFAULT_TAB);
  });

  it("every tab label is lowercase", () => {
    for (const t of SETTINGS_TABS) expect(t.label).toBe(t.label.toLowerCase());
  });

  it("lists only shortcuts that have a handler in code", () => {
    const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
    const dashboard = read("src/pages/Dashboard.tsx");
    const input = read("src/components/dashboard/AdaptiveInputBar.tsx");
    const palette = read("src/components/dashboard/CommandPalette.tsx");
    expect(dashboard).toMatch(/e\.key === "k"/);
    for (const n of ["1", "2", "3", "4"]) expect(dashboard).toMatch(new RegExp(`e\\.key === "${n}"`));
    expect(input).toMatch(/e\.key === "Enter" && !e\.shiftKey/);
    expect(palette).toMatch(/ArrowDown/);
    expect(palette).toMatch(/Escape/);
    for (const s of KEYBOARD_SHORTCUTS) expect(s.desc).toBe(s.desc.toLowerCase());
    // ctrl+n (new conversation) and tab (accept autocomplete) have no handler and are not listed
    expect(KEYBOARD_SHORTCUTS.some((s) => /ctrl\/⌘ n/.test(s.keys))).toBe(false);
    expect(KEYBOARD_SHORTCUTS.some((s) => s.keys === "tab")).toBe(false);
  });
});

const ev = (tool: string): UsageEvent => ({
  id: tool + Math.random(),
  tool,
  provider: null,
  model: null,
  function_name: null,
  prompt_tokens: null,
  completion_tokens: null,
  total_tokens: null,
  estimated_cost_usd: null,
  status: "error",
  created_at: new Date().toISOString(),
});

describe("settings → spend rooms", () => {
  it("every gated tool is a real room id the rail can label", () => {
    for (const t of GATED_TOOLS) expect(NAV_INTENTS.some((n) => n.view === t)).toBe(true);
  });

  it("gated tools match the ids the code passes to the gate", () => {
    const root = process.cwd();
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name !== "node_modules" && ent.name !== "__tests__") walk(p);
        } else if (/\.(ts|tsx)$/.test(ent.name) && !/\.test\./.test(ent.name)) files.push(p);
      }
    };
    walk(path.join(root, "src"));
    const found = new Set<string>();
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      if (!/\binvokeWithByokRetry\b/.test(src)) continue;
      for (const m of src.matchAll(/\btool:\s*(?:\(req as \{ tool\?: string \}\)\.tool \?\? )?"([a-z][a-z0-9-]*)"/g)) found.add(m[1]);
    }
    expect([...found].sort()).toEqual([...GATED_TOOLS].sort());
  });

  it("lists gated rooms first, then any room with a switch row or a recorded call, once each", () => {
    const switches = new Map<string, ToolSwitch>([["search", { tool: "search", enabled: false, monthly_budget_usd: null }]]);
    const events = [ev("asherin-sentinel"), ev("zerlal"), ev("zerlal")];
    expect(spendRooms(["chat", "asherin-sentinel"], switches, events)).toEqual(["chat", "asherin-sentinel", "search", "zerlal"]);
  });
});
