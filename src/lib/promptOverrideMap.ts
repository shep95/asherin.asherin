// Module-level map that lets the composer submit a *hidden* model prompt
// alongside the visible user message. Keyed by the visible content string.
// The dashboard consumes and clears the entry when it builds the history
// payload for the model — so the user only ever sees their raw text while
// the model receives the LAW/NAR-wrapped directive.
const map = new Map<string, string>();

export function setModelPromptOverride(visible: string, override: string) {
  if (!visible || !override || visible === override) return;
  map.set(visible, override);
}

export function takeModelPromptOverride(visible: string): string | undefined {
  const v = map.get(visible);
  if (v !== undefined) map.delete(visible);
  return v;
}
