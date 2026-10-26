// asherin.sentinel — the language table for a channel.
//
// One setting lives per channel: `sourceLang`, a hint handed to the browser's
// speech recogniser about what is being spoken. "auto" follows the browser's
// own language — the recogniser has no detection mode of its own. The local
// edition translates nothing: `NO_TRANSLATION` survives only so older stored
// rosters still parse.

export interface LanguageOption {
  /** ISO-639-1 code handed to the browser's recogniser as its language. */
  code: string;
  label: string;
}

export const AUTO_SOURCE = "auto";
export const NO_TRANSLATION = "";

export const LANGUAGES: LanguageOption[] = [
  { code: "en", label: "english" },
  { code: "es", label: "spanish" },
  { code: "fr", label: "french" },
  { code: "de", label: "german" },
  { code: "it", label: "italian" },
  { code: "pt", label: "portuguese" },
  { code: "nl", label: "dutch" },
  { code: "ru", label: "russian" },
  { code: "uk", label: "ukrainian" },
  { code: "pl", label: "polish" },
  { code: "tr", label: "turkish" },
  { code: "ar", label: "arabic" },
  { code: "he", label: "hebrew" },
  { code: "fa", label: "persian" },
  { code: "hi", label: "hindi" },
  { code: "ur", label: "urdu" },
  { code: "bn", label: "bengali" },
  { code: "ta", label: "tamil" },
  { code: "zh", label: "mandarin chinese" },
  { code: "yue", label: "cantonese" },
  { code: "ja", label: "japanese" },
  { code: "ko", label: "korean" },
  { code: "vi", label: "vietnamese" },
  { code: "th", label: "thai" },
  { code: "id", label: "indonesian" },
  { code: "sw", label: "swahili" },
  { code: "am", label: "amharic" },
  { code: "so", label: "somali" },
  { code: "el", label: "greek" },
  { code: "sv", label: "swedish" },
  { code: "no", label: "norwegian" },
  { code: "da", label: "danish" },
  { code: "fi", label: "finnish" },
  { code: "cs", label: "czech" },
  { code: "ro", label: "romanian" },
  { code: "hu", label: "hungarian" },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export const languageName = (code: string | null | undefined): string => {
  if (!code) return "not set";
  if (code === AUTO_SOURCE) return "auto-detect";
  return BY_CODE.get(code)?.label ?? code;
};

export const isLanguageCode = (v: unknown): v is string =>
  typeof v === "string" && (v === AUTO_SOURCE || BY_CODE.has(v));
