// The station analyst's tool table.
//
// The analyst panel used to be a costume: a system prompt that described what
// each module "knows" and let the model narrate an answer — including a 95%
// location prediction it had no way to compute. That is roleplay, and it is
// exactly the failure this file removes.
//
// Here an operator question is mapped to one real `google-mesh` action. The
// function runs against accounts the operator owns, the payload becomes the
// only evidence the model is allowed to speak from, and Connect gets a row
// whether it succeeded or failed. If no action matches, the analyst answers
// from the transcript alone and says so — it never invents a reading.

export type StationAction =
  | "status"
  | "harvest"
  | "daily_digest"
  | "search_mail"
  | "commitments"
  | "relationship_graph"
  | "pattern_map"
  | "attention_ledger"
  | "meet_vault"
  | "sentinel"
  | "location_signals"
  | "fit_location"
  | "audit_log";

export interface StationCall {
  action: StationAction;
  payload: Record<string, unknown>;
  /** Operator-facing label for the tool row. Lowercase — output conduct. */
  label: string;
}

/**
 * The default read for a module tab. Opening a tab does not fire anything;
 * this is only the fallback when the operator's question is a bare "analyse
 * this" with no verb of its own.
 */
const MODULE_DEFAULT: Record<string, StationAction> = {
  overview: "status",
  twin: "daily_digest",
  location: "location_signals",
  email: "search_mail",
  gmail: "search_mail",
  subscriptions: "search_mail",
  health: "fit_location",
  fit: "fit_location",
  calendar: "attention_ledger",
  contacts: "relationship_graph",
  career: "search_mail",
  drive: "meet_vault",
  connected: "audit_log",
};

/**
 * Bounded, linear patterns — no nested quantifiers, so a long paste cannot
 * push this into catastrophic backtracking on the main thread.
 */
const RULES: Array<[StationAction, RegExp]> = [
  ["harvest", /\b(harvest|collect|sweep|re-?sync|pull\s+in)\b/i],
  ["daily_digest", /\b(digest|catch\s+me\s+up|what'?s\s+on\s+my\s+plate|brief\s+me)\b/i],
  ["commitments", /\b(commitments?|promised?|owe|overdue|obligations?)\b/i],
  ["relationship_graph", /\b(relationship|going\s+quiet|dormant|lost\s+touch|who\s+matters)\b/i],
  ["meet_vault", /\b(meet\s+(recording|transcript|vault)|recordings?)\b/i],
  ["sentinel", /\b(alerts?|sentinel|anything\s+new)\b/i],
  ["location_signals", /\b(where\s+(will|am|do)\s+i|find\s+my\s+(phone|device)|where\s+is\s+my\s+(phone|device)|location)\b/i],
  ["fit_location", /\b(fit|steps|heart\s+rate|sleep|workout)\b/i],
  ["attention_ledger", /\b(meeting\s+load|how\s+much\s+time|focus\s+hours?|attention)\b/i],
  ["pattern_map", /\b(pattern\s+map|place\s+rhythm|where\s+do\s+i\s+(go|spend))\b/i],
  ["audit_log", /\b(audit|what\s+has\s+asherin\s+done|activity\s+log)\b/i],
  ["status", /\b(which\s+accounts?|connected\s+accounts?|status)\b/i],
];

const LABEL: Record<StationAction, string> = {
  status: "google · accounts",
  harvest: "google · harvest",
  daily_digest: "google · digest",
  search_mail: "google · mail search",
  commitments: "google · commitments",
  relationship_graph: "google · relationships",
  pattern_map: "google · place rhythm",
  attention_ledger: "google · attention",
  meet_vault: "google · meet records",
  sentinel: "google · sentinel",
  location_signals: "google · location signals",
  fit_location: "google · fit location",
  audit_log: "google · audit log",
};

export function planStationCall(prompt: string, activeModule: string): StationCall | null {
  const raw = String(prompt || "").slice(0, 2000);
  if (!raw.trim()) return null;

  // An explicit mail search wins over the module default: the operator named
  // the subject, and searching their own mailbox is cheaper and more truthful
  // than any derived read.
  const search = raw.match(/\b(?:search|find|look\s+for|any\s+mail\s+about)\s+(?:my\s+)?(?:mail|inbox|e-?mails?)?\s*(?:for|about)?\s+(.{2,120})$/i);
  if (search) {
    return { action: "search_mail", payload: { query: search[1].trim().slice(0, 200) }, label: LABEL.search_mail };
  }

  for (const [action, re] of RULES) {
    if (re.test(raw)) return { action, payload: {}, label: LABEL[action] };
  }

  const fallback = MODULE_DEFAULT[activeModule];
  if (!fallback) return null;
  if (fallback === "search_mail") {
    return { action: "search_mail", payload: { query: raw.replace(/[^\w@.\s-]/g, " ").trim().slice(0, 120) }, label: LABEL.search_mail };
  }
  return { action: fallback, payload: {}, label: LABEL[fallback] };
}

export function stationLabel(action: StationAction): string {
  return LABEL[action];
}
