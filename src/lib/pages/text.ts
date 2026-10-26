// asherin.pages — the room speaks lowercase; sentences that arrive from the model
// layer ("The model provider is busy…") are lowered at their first letter only.
export function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}
