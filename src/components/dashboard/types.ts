export interface FileAttachment {
  name: string;
  type: string;
  size: number;
  base64: string;
  previewUrl?: string;
}

export interface ConsensusData {
  consensus: boolean;
  confidence: {
    overallConfidence: number;
    level: "high" | "medium" | "low" | "critical_divergence";
    needsHumanReview: boolean;
    reasons: string[];
    jaccardSimilarity: number;
  };
  crossValidation: {
    provider: string;
    model: string;
    totalClaims: number;
    validatedClaims: number;
    unvalidatedClaims: string[];
    validationRate: number;
  }[];
  ensemble: {
    agreedFacts: string[];
    contestedFacts: string[];
    agreementRatio: number;
  };
  verdict: { index: number; provider: string; model: string } | null;
  responses: { provider: string; model: string; content: string; error: string | null; latencyMs: number }[];
  timing: { parallelMs: number; totalMs: number };
  // Legacy compat
  similarity?: number;
  modelCount?: number;
  successCount?: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  truthScore?: "high" | "medium" | "low";
  sources?: { title: string; url: string }[];
  attachments?: FileAttachment[];
  consensusData?: ConsensusData;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  pinned?: boolean;
  mode?: ChatMode;
  projectId?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  conversationIds: string[];
  files: string[];
  createdAt: Date;
}

export interface MemoryEntry {
  id: string;
  content: string;
  category: string;
  createdAt: Date;
}

export interface SavedPrompt {
  id: string;
  title: string;
  content: string;
  tags: string[];
  starred: boolean;
  usageCount: number;
  createdAt: Date;
}

export type ChatMode = "research" | "chat" | "code" | "truth";
export type DashboardView =
  | "chat"
  | "library"
  | "projects"
  | "memory"
  | "stats"
  | "settings"
  | "api-keys"
  | "connect"
  | "search"
  | "azplen"
  | "nomad"
  | "briefing"
  | "snippets"
  | "teams"
  | "notebooks"
  | "geospatial"
  | "plugins"
  | "timeseries"
  | "audit"
  | "zali"
  | "community"
  | "predictive"
  | "security"
  | "elion"
  | "tracker"
  | "google"
  | "ide"
  | "pdf-generator"
  | "pattern-analysis"
  | "slideshow"
  | "self-learning"
  | "self-access"
  | "imagine-intelligence"
  | "video-intelligence"
  | "bug-reports"
  | "ebook"
  | "lavba"
  | "cross"
  | "guardian-vault"
  | "knowledge-vault"
  | "zaplen"
  | "zeeion"
  | "axrlen"
  | "zerlal"
  | "zaxin"
  | "zacoon"
  | "file-scrapper"
  | "cipher"
  | "vedic-astrology"
  | "zahten"
  | "media2code"
  | "whiteboard"
  | "gematria"
  | "vibe-video"
  | "bulwark"
  | "geo-audit"
  | "ghost-engine"
  | "asherin-defender"
  | "asherin-arvision"
  | "asherin-eye"
  | "asherin-sentinel"
  | "asherin-health"
  | "investigations"
  | "shepherd";
