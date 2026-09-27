// Asher Code — shared types
export type AsherCodeVisibility = "private" | "team" | "organization" | "public";

export interface AsherCodeProject {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  language: string;
  template: string | null;
  visibility: AsherCodeVisibility;
  org_id: string | null;
  team_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AsherCodeFile {
  id: string;
  project_id: string;
  branch_id: string | null;
  path: string;
  content: string;
  language: string;
  created_at: string;
  updated_at: string;
}

export interface AsherCodePublishedTab {
  id: string;
  project_id: string;
  owner_id: string;
  name: string;
  description: string | null;
  icon: string;
  category: string;
  entry_html: string;
  visibility: AsherCodeVisibility;
  org_id: string | null;
  team_id: string | null;
  install_count: number;
  rating: number | null;
  created_at: string;
  updated_at: string;
}

export type AiMode = "chat" | "inline" | "generate" | "explain" | "fix" | "tests" | "edit_plan" | "orchestrate";

export const ASHER_CODE_PROVIDERS = [
  { id: "google", label: "Google Gemini", models: [
    { id: "gemini-3-pro-preview", label: "Gemini 3 Pro" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ]},
  { id: "openai", label: "OpenAI", models: [
    { id: "gpt-5.5", label: "GPT-5.5" },
    { id: "gpt-5.2", label: "GPT-5.2" },
    { id: "gpt-5", label: "GPT-5" },
    { id: "gpt-5-mini", label: "GPT-5 Mini" },
  ]},
  { id: "anthropic", label: "Anthropic Claude", models: [
    { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  ]},
  { id: "xai", label: "xAI Grok", models: [
    { id: "grok-5", label: "Grok 5" },
    { id: "grok-4", label: "Grok 4" },
  ]},
  { id: "deepseek", label: "DeepSeek", models: [
    { id: "deepseek-coder-v3", label: "DeepSeek Coder V3" },
    { id: "deepseek-chat", label: "DeepSeek V3.2" },
  ]},
  { id: "mistral", label: "Mistral", models: [
    { id: "mistral-large-3", label: "Mistral Large 3" },
    { id: "codestral-latest", label: "Codestral" },
  ]},
  { id: "perplexity", label: "Perplexity", models: [
    { id: "sonar-pro", label: "Sonar Pro" },
    { id: "sonar-reasoning", label: "Sonar Reasoning" },
  ]},
  { id: "meta", label: "Meta Llama (Together)", models: [
    { id: "meta-llama/Llama-4-Behemoth", label: "Llama 4 Behemoth" },
    { id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", label: "Llama 3.3 70B" },
  ]},
  { id: "venice", label: "Venice (Uncensored)", models: [
    { id: "llama-3.3-70b", label: "Llama 3.3 70B" },
    { id: "venice-uncensored", label: "Venice Uncensored" },
  ]},
  { id: "openrouter", label: "OpenRouter", models: [
    { id: "stealth/ox-alpha", label: "OX Alpha" },
    { id: "openai/gpt-5.5", label: "GPT-5.5 (routed)" },
    { id: "anthropic/claude-opus-4.5", label: "Claude Opus 4.5 (routed)" },
    { id: "google/gemini-3-pro-preview", label: "Gemini 3 Pro (routed)" },
  ]},

] as const;
