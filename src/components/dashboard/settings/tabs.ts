// settings — the sections, the one-shot tab hint, and the shortcuts that are
// really wired. pure data and pure functions so the room can be tested without
// a dom.

export const SETTINGS_TABS = [
  { key: "device", label: "this device" },
  { key: "look", label: "look" },
  { key: "intelligence", label: "intelligence" },
  { key: "spend", label: "spend" },
  { key: "connections", label: "connections" },
  { key: "privacy", label: "privacy & data" },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]["key"];

export const DEFAULT_TAB: SettingsTab = "device";

/** another room may open settings on one section; the hint is read once. */
export const TAB_HINT_KEY = "asherin:settings-tab";

export function isSettingsTab(value: unknown): value is SettingsTab {
  return SETTINGS_TABS.some((t) => t.key === value);
}

/**
 * resolve the tab to open from a hint. the legacy "you" hint lands on the
 * device tab, which replaced it; anything unknown lands on the default.
 */
export function resolveSettingsTab(hint: string | null | undefined): SettingsTab {
  if (hint === "you") return "device";
  return isSettingsTab(hint) ? hint : DEFAULT_TAB;
}

/** read and clear the one-shot hint. storage refusal means the default tab. */
export function takeTabHint(storage: Pick<Storage, "getItem" | "removeItem"> | null | undefined): SettingsTab {
  try {
    if (!storage) return DEFAULT_TAB;
    const hint = storage.getItem(TAB_HINT_KEY);
    storage.removeItem(TAB_HINT_KEY);
    return resolveSettingsTab(hint);
  } catch {
    return DEFAULT_TAB;
  }
}

/**
 * every shortcut listed here has a handler in code: ctrl/cmd+k and ctrl/cmd+1–4
 * in src/pages/Dashboard.tsx (the global keydown listener), enter / shift+enter
 * in src/components/dashboard/AdaptiveInputBar.tsx, arrows and escape in
 * src/components/dashboard/CommandPalette.tsx.
 */
export const KEYBOARD_SHORTCUTS: ReadonlyArray<{ keys: string; desc: string }> = [
  { keys: "ctrl/⌘ k", desc: "open the command palette" },
  { keys: "↑ ↓ · esc", desc: "move in the palette · close it" },
  { keys: "enter", desc: "send the message (desktop)" },
  { keys: "shift+enter", desc: "new line" },
  { keys: "ctrl/⌘ 1", desc: "chat mode" },
  { keys: "ctrl/⌘ 2", desc: "code mode" },
  { keys: "ctrl/⌘ 3", desc: "research mode" },
  { keys: "ctrl/⌘ 4", desc: "truth mode" },
];
