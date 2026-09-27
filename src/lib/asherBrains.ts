// Asher Brains — admin-curated personality + knowledge files for ASHER AI.
// Loaded into the asher-ai edge function via the `brainContext` payload.
import { supabase } from "@/integrations/supabase/client";

export type AsherBrainCategory =
  | "general"
  | "map"
  | "coding"
  | "personality"
  | "azplen"
  | "zali";

export interface AsherBrain {
  id: string;
  name: string;
  description: string;
  category: AsherBrainCategory;
  content: string;
  file_name: string;
  file_path: string | null;
  file_size: number;
  is_active: boolean;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export const BRAIN_CATEGORIES: { id: AsherBrainCategory; label: string; sub: string }[] = [
  { id: "personality", label: "Personality",  sub: "Voice, tone, identity" },
  { id: "general",     label: "General",      sub: "Core knowledge" },
  { id: "map",         label: "Map / GEOINT", sub: "Maps, recon, OSINT" },
  { id: "coding",      label: "Coding",       sub: "IDE / engineering" },
  { id: "azplen",      label: "Azplen",       sub: "Intel synthesis" },
  { id: "zali",        label: "ZANOEM",       sub: "Design / simulation" },
];

const ACCEPT_EXT = [".txt", ".md", ".json", ".csv", ".pdf", ".log", ".yml", ".yaml"];

export const isSupportedBrainFile = (name: string): boolean => {
  const lower = name.toLowerCase();
  return ACCEPT_EXT.some((ext) => lower.endsWith(ext));
};

const extractTextFromPdf = async (file: File): Promise<string> => {
  const buf = await file.arrayBuffer();
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(new Uint8Array(buf));
  let text = "";
  const m = raw.match(/\(([^)]*)\)/g);
  if (m) {
    text = m.map((s) => s.slice(1, -1)).filter((s) => s.length > 1 && /[a-zA-Z]/.test(s)).join(" ");
  }
  const readable = raw.match(/[\x20-\x7E\n\r\t]{20,}/g);
  if (readable) {
    const extra = readable.filter((s) => /[a-zA-Z]{3,}/.test(s) && !/^[%/\[\]<>{}]+$/.test(s.trim())).join("\n");
    if (extra.length > text.length) text = extra;
  }
  if (!text && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("brain:pdf-extraction-failed", {
      detail: { fileName: file.name },
    }));
  }
  return text || `[PDF: ${file.name} — extraction failed. Re-upload as .txt/.md for reliable AI context]`;
};

// Hard cap PDF extraction at 5MB to prevent main-thread freezes on huge files.
export const MAX_PDF_BRAIN_BYTES = 5 * 1024 * 1024;


export const readBrainFile = async (file: File): Promise<string> => {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return extractTextFromPdf(file);
  return file.text();
};

/** Loads ACTIVE brains for the current operator. Returns [] for non-admins. */
export const loadActiveBrains = async (
  categories?: AsherBrainCategory[],
): Promise<Pick<AsherBrain, "name" | "category" | "content">[]> => {
  let q = supabase
    .from("asher_brains")
    .select("name, category, content")
    .eq("is_active", true);
  if (categories && categories.length) q = q.in("category", categories);
  const { data, error } = await q.order("category", { ascending: true }).limit(50);
  if (error || !data) return [];
  return data as Pick<AsherBrain, "name" | "category" | "content">[];
};

export const buildBrainContext = async (
  categories?: AsherBrainCategory[],
): Promise<{ brains: { name: string; category: string; content: string }[] } | null> => {
  const brains = await loadActiveBrains(categories);
  if (!brains.length) return null;
  return { brains };
};
