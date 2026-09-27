// asherin.sentinel — the language table for a channel.
//
// Two settings live per channel and they are not the same thing. `sourceLang`
// is a hint handed to the transcriber about what is being spoken; leaving it on
// auto is usually right and is never a failure. `translateTo` is the language
// the turn is rendered in afterwards; leaving it empty means the turn stays in
// whatever was said, which the room shows as an untranslated lane rather than
// silently passing raw audio off as a finished translation.

export interface LanguageOption {
  /** BCP-47 / ISO-639-1 code sent to the transcriber and the translator. */
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
