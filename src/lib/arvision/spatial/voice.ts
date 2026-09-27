// asherin.arvision — spoken guidance
// ported from Services/NavigationAudioService.swift behaviour: one phrase per
// instruction, per-instruction cooldown, force bypass, hard stop on cancel.
// The package shipped recorded clips; the web build speaks the same phrases with
// the browser speech engine and stays silent when the engine is unavailable.

import type { NavInstruction } from "./types";

const PHRASES: Record<NavInstruction, string> = {
  navigationStarted: "navigation started",
  moveForward: "move forward",
  slightLeft: "slight left",
  slightRight: "slight right",
  turnLeft: "turn left",
  turnRight: "turn right",
  turnAround: "turn around",
  recalculating: "recalculating",
  destinationReached: "destination reached",
};

const DEFAULT_COOLDOWN_MS = 4000;

export class GuidanceVoice {
  private lastSpokenAt = new Map<NavInstruction, number>();
  private lastInstruction: NavInstruction | null = null;
  private enabled = true;

  constructor(private cooldownMs = DEFAULT_COOLDOWN_MS) {}

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  isEnabled() {
    return this.enabled;
  }

  static phrase(instruction: NavInstruction): string {
    return PHRASES[instruction];
  }

  /** Returns the phrase spoken, or null when suppressed by cooldown or settings. */
  play(instruction: NavInstruction, force = false, now = Date.now()): string | null {
    if (!this.enabled) return null;
    if (!force) {
      const last = this.lastSpokenAt.get(instruction);
      // never spoken before means say it now; the cooldown only suppresses repeats
      if (last !== undefined && now - last < this.cooldownMs) return null;
    }

    this.lastSpokenAt.set(instruction, now);
    this.lastInstruction = instruction;
    const phrase = PHRASES[instruction];
    this.speak(phrase, force);
    return phrase;
  }

  resetCooldowns() {
    this.lastSpokenAt.clear();
    this.lastInstruction = null;
  }

  stop() {
    if (typeof window === "undefined") return;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* speech engine unavailable, guidance stays visual */
    }
  }

  private speak(phrase: string, force: boolean) {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    try {
      if (force) synth.cancel();
      const utterance = new SpeechSynthesisUtterance(phrase);
      utterance.rate = 1.05;
      utterance.pitch = 1;
      utterance.volume = 1;
      synth.speak(utterance);
    } catch {
      /* speech engine unavailable, guidance stays visual */
    }
  }
}
