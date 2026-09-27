// one contract for every asherin.health side panel, so the room can mount a new
// subsystem without each panel inventing its own way to speak back to the body.
import type { TerritoryHighlight } from "./systems";
import type { HealthRecord } from "./store";

export interface HealthPanelProps {
  record: HealthRecord;
  /** write the record back to device-local storage. never uploads. */
  persist: (next: HealthRecord) => void;
  /** raise the health assistant with a question written from real record content. */
  onEvent?: (question: string) => void;
  /** paint territories on the reference body. */
  onHighlights?: (highlights: TerritoryHighlight[]) => void;
  /** ask the body to look at a set of territory keys. */
  onSelectTerritories?: (keys: string[]) => void;
  /** resolve the person's own model key when they have one. */
  resolveByok?: () => Promise<Record<string, string> | undefined>;
}
