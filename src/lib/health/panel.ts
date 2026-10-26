// one contract for every asherin.health side panel, so the room can mount a new
// subsystem without each panel inventing its own way to speak back to the room.
import type { TerritoryHighlight } from "./systems";
import type { HealthRecord } from "./store";

export interface HealthPanelProps {
  record: HealthRecord;
  /** write the record back to device-local storage. never uploads. */
  persist: (next: HealthRecord) => void;
  /** raise the health assistant with a question written from real record content. */
  onEvent?: (question: string) => void;
  /** list territories in the room's "looking at" panel, with the reason each one is named. */
  onHighlights?: (highlights: TerritoryHighlight[]) => void;
  /** ask the room to look at a set of territory keys: name them, read the record for them, ask shepherd. */
  onSelectTerritories?: (keys: string[]) => void;
}
