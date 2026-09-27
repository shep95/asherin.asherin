/**
 * BYOK (Bring Your Own Key) for the Zophiel Intel Map.
 *
 * Stored ONLY in localStorage on the user's device. Never persisted to our DB.
 * When active, the IntelMap edge function bypasses our Gemini key and the
 * concurrency queue entirely — the user's own key + chosen model do the work.
 */

export type IntelMapByokProvider =
  | "google"
  | "openai"
  | "anthropic"
  | "xai"
  | "deepseek"
  | "mistral"
  | "perplexity";

export interface IntelMapByok {
  provider: IntelMapByokProvider;
  model: string;
  apiKey: string;
}

export interface IntelMapProviderSpec {
  id: IntelMapByokProvider;
  name: string;
  placeholder: string;
  helpUrl: string;
  helpText: string;
  models: { id: string; name: string }[];
  /** Free-form model id input also allowed (true = show "custom model" input) */
  allowCustomModel?: boolean;
}

export const INTEL_MAP_PROVIDERS: IntelMapProviderSpec[] = [
  {
    id: "google",
    name: "Google AI (Gemini)",
    placeholder: "AIzaSy...",
    helpUrl: "https://aistudio.google.com/app/apikey",
    helpText: "Get a free key from Google AI Studio.",
    models: [
      // Newest first
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview (newest)" },
      { id: "gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash Image (Nano Banana 2)" },
      { id: "gemini-3-pro-preview", name: "Gemini 3 Pro" },
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro (best quality)" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (recommended)" },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite (cheapest)" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
      { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite" },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro (legacy)" },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash (legacy)" },
      { id: "gemini-1.5-flash-8b", name: "Gemini 1.5 Flash 8B (legacy)" },
      { id: "gemini-1.0-pro", name: "Gemini 1.0 Pro (oldest)" },
    ],
    allowCustomModel: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    placeholder: "sk-...",
    helpUrl: "https://platform.openai.com/api-keys",
    helpText: "Create a key in OpenAI Platform → API keys.",
    models: [
      { id: "gpt-5.5", name: "GPT-5.5 (newest flagship)" },
      { id: "gpt-5.4-pro", name: "GPT-5.4 Pro" },
      { id: "gpt-5.4", name: "GPT-5.4" },
      { id: "gpt-5.4-mini", name: "GPT-5.4 Mini" },
      { id: "gpt-5.4-nano", name: "GPT-5.4 Nano" },
      { id: "gpt-5.2", name: "GPT-5.2" },
      { id: "gpt-5", name: "GPT-5" },
      { id: "gpt-5-mini", name: "GPT-5 Mini" },
      { id: "gpt-5-nano", name: "GPT-5 Nano" },
      { id: "gpt-5-codex", name: "GPT-5 Codex" },
      { id: "o4-mini", name: "o4-mini (reasoning)" },
      { id: "o3-pro", name: "o3 Pro (reasoning)" },
      { id: "o3-mini", name: "o3 Mini" },
      { id: "o1", name: "o1" },
      { id: "o1-mini", name: "o1 Mini" },
      { id: "gpt-4.1", name: "GPT-4.1" },
      { id: "gpt-4.1-mini", name: "GPT-4.1 Mini" },
      { id: "gpt-4.1-nano", name: "GPT-4.1 Nano" },
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo (legacy)" },
      { id: "gpt-4", name: "GPT-4 (legacy)" },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo (oldest)" },
    ],
    allowCustomModel: true,
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    placeholder: "sk-ant-...",
    helpUrl: "https://console.anthropic.com/settings/keys",
    helpText: "Create a key in the Anthropic Console.",
    models: [
      { id: "claude-opus-4-5", name: "Claude Opus 4.5 (newest flagship)" },
      { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
      { id: "claude-opus-4-1", name: "Claude Opus 4.1" },
      { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
      { id: "claude-3-7-sonnet-latest", name: "Claude 3.7 Sonnet" },
      { id: "claude-3-5-sonnet-latest", name: "Claude 3.5 Sonnet" },
      { id: "claude-3-5-haiku-latest", name: "Claude 3.5 Haiku" },
      { id: "claude-3-opus-latest", name: "Claude 3 Opus (legacy)" },
      { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet (legacy)" },
      { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku (oldest)" },
    ],
    allowCustomModel: true,
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    placeholder: "xai-...",
    helpUrl: "https://console.x.ai/",
    helpText: "Create a key in the xAI Console.",
    models: [
      { id: "grok-5", name: "Grok 5 (newest)" },
      { id: "grok-4-1", name: "Grok 4.1" },
      { id: "grok-4-fast", name: "Grok 4 Fast" },
      { id: "grok-4-heavy", name: "Grok 4 Heavy" },
      { id: "grok-code-fast-1", name: "Grok Code Fast" },
      { id: "grok-3", name: "Grok 3" },
      { id: "grok-2-vision-latest", name: "Grok 2 Vision" },
      { id: "grok-2-latest", name: "Grok 2" },
      { id: "grok-beta", name: "Grok Beta (legacy)" },
    ],
    allowCustomModel: true,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    placeholder: "sk-...",
    helpUrl: "https://platform.deepseek.com/api_keys",
    helpText: "Create a key on platform.deepseek.com.",
    models: [
      { id: "deepseek-v3.2", name: "DeepSeek V3.2 (newest)" },
      { id: "deepseek-r1", name: "DeepSeek R1 (reasoning)" },
      { id: "deepseek-reasoner", name: "DeepSeek Reasoner" },
      { id: "deepseek-chat", name: "DeepSeek V3 Chat" },
      { id: "deepseek-coder", name: "DeepSeek Coder" },
      { id: "deepseek-v2", name: "DeepSeek V2 (legacy)" },
    ],
    allowCustomModel: true,
  },
  {
    id: "mistral",
    name: "Mistral AI",
    placeholder: "Your Mistral API key...",
    helpUrl: "https://console.mistral.ai/api-keys/",
    helpText: "Create a key in the Mistral Console.",
    models: [
      { id: "mistral-large-3", name: "Mistral Large 3 (newest)" },
      { id: "magistral-medium", name: "Magistral Medium (reasoning)" },
      { id: "mistral-medium-3-1", name: "Mistral Medium 3.1" },
      { id: "codestral-25", name: "Codestral 25" },
      { id: "pixtral-large", name: "Pixtral Large (vision)" },
      { id: "mistral-large-latest", name: "Mistral Large" },
      { id: "mistral-small-latest", name: "Mistral Small" },
      { id: "ministral-8b", name: "Ministral 8B" },
      { id: "ministral-3b", name: "Ministral 3B" },
      { id: "open-mistral-nemo", name: "Mistral Nemo (legacy)" },
      { id: "open-mixtral-8x22b", name: "Mixtral 8x22B (oldest)" },
    ],
    allowCustomModel: true,
  },
  {
    id: "perplexity",
    name: "Perplexity AI",
    placeholder: "pplx-...",
    helpUrl: "https://www.perplexity.ai/settings/api",
    helpText: "Create a key in Perplexity Settings → API.",
    models: [
      { id: "sonar-pro", name: "Sonar Pro (newest)" },
      { id: "sonar-reasoning-pro", name: "Sonar Reasoning Pro" },
      { id: "sonar-reasoning", name: "Sonar Reasoning" },
      { id: "sonar-deep-research", name: "Sonar Deep Research" },
      { id: "sonar", name: "Sonar" },
      { id: "llama-3.1-sonar-large-128k-online", name: "Llama 3.1 Sonar Large (legacy)" },
      { id: "llama-3.1-sonar-small-128k-online", name: "Llama 3.1 Sonar Small (oldest)" },
    ],
    allowCustomModel: true,
  },
];

const STORAGE_KEY = "aureon_intelmap_byok_v1";
const ENABLED_KEY = "aureon_intelmap_byok_enabled_v1";

export function getIntelMapByok(): IntelMapByok | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.provider || !parsed?.model || !parsed?.apiKey) return null;
    return parsed as IntelMapByok;
  } catch {
    return null;
  }
}

export function saveIntelMapByok(cfg: IntelMapByok) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function clearIntelMapByok() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ENABLED_KEY);
}

export function isIntelMapByokEnabled(): boolean {
  return localStorage.getItem(ENABLED_KEY) === "1" && !!getIntelMapByok();
}

export function setIntelMapByokEnabled(enabled: boolean) {
  if (enabled) localStorage.setItem(ENABLED_KEY, "1");
  else localStorage.removeItem(ENABLED_KEY);
}

/** The active config to send to the edge function (null if BYOK disabled or missing). */
export function getActiveIntelMapByok(): IntelMapByok | null {
  if (!isIntelMapByokEnabled()) return null;
  return getIntelMapByok();
}

export function getProviderSpec(id: IntelMapByokProvider): IntelMapProviderSpec | undefined {
  return INTEL_MAP_PROVIDERS.find((p) => p.id === id);
}
