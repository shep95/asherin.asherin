export interface ZanoemCodeFile {
  filename: string;
  language: string;
  content: string;
}

const CONTROL_FENCE_LANGS = new Set(["code_output", "design_output", "options"]);

const EXT_BY_LANGUAGE: Record<string, string> = {
  typescript: "ts",
  ts: "ts",
  tsx: "tsx",
  javascript: "js",
  js: "js",
  jsx: "jsx",
  python: "py",
  py: "py",
  html: "html",
  css: "css",
  json: "json",
  sql: "sql",
  bash: "sh",
  shell: "sh",
  sh: "sh",
};

function normalizeLanguage(language = ""): string {
  const lang = language.trim().toLowerCase();
  if (lang === "ts") return "typescript";
  if (lang === "js") return "javascript";
  if (lang === "py") return "python";
  if (lang === "shell" || lang === "sh") return "bash";
  return lang || "text";
}

function safeParseCodeOutput(raw: string): ZanoemCodeFile[] {
  try {
    const parsed = JSON.parse(raw.trim());
    if (!Array.isArray(parsed.files)) return [];
    return parsed.files
      .filter((file: Partial<ZanoemCodeFile>) => file?.content && file?.filename)
      .map((file: ZanoemCodeFile) => ({
        filename: file.filename,
        language: normalizeLanguage(file.language || file.filename.split(".").pop() || "text"),
        content: String(file.content),
      }));
  } catch {
    return [];
  }
}

function looksLikeCode(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  return /^(import|export|const|let|var|function|class|interface|type|def |from |package |fn |pub |#include|<\w+|SELECT |CREATE |INSERT |UPDATE |DELETE )/im.test(text)
    || /[{};()=>]/.test(text)
    || text.split("\n").length >= 4;
}

export function extractZanoemCodeFiles(content: string): ZanoemCodeFile[] {
  const files: ZanoemCodeFile[] = [];

  for (const match of content.matchAll(/```code_output\s*\n?([\s\S]*?)```/g)) {
    files.push(...safeParseCodeOutput(match[1]));
  }

  if (files.length > 0) return files;

  let index = 1;
  for (const match of content.matchAll(/```([\w.+-]*)\s*\n([\s\S]*?)```/g)) {
    const lang = normalizeLanguage(match[1]);
    if (CONTROL_FENCE_LANGS.has(lang)) continue;
    const code = match[2].trimEnd();
    if (!looksLikeCode(code)) continue;
    const before = content.slice(Math.max(0, match.index - 220), match.index);
    const pathMatch = before.match(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:file|path|filename)?\s*[:`*\- ]*([\w@./-]+\.(?:tsx?|jsx?|css|html|json|md|sql|py|rs|go|vue|svelte|astro|yml|yaml|toml|sh))\s*[:`*\- ]*$/i);
    const ext = EXT_BY_LANGUAGE[lang] || lang || "txt";
    const filename = pathMatch?.[1] || `snippet-${index}.${ext}`;
    files.push({ filename, language: lang, content: code });
    index += 1;
  }

  return files;
}

export function sanitizeZanoemAssistantContent(content: string): { text: string; codeCount: number } {
  let codeCount = extractZanoemCodeFiles(content).length;
  let stripped = content.replace(/```[\w.+-]*\s*\n?[\s\S]*?```/g, () => {
    codeCount += codeCount ? 0 : 1;
    return "";
  });

  const danglingFence = stripped.indexOf("```");
  if (danglingFence !== -1) {
    stripped = stripped.slice(0, danglingFence);
    codeCount += codeCount ? 0 : 1;
  }

  const jsonPayloadIndex = stripped.search(/\{\s*"files"\s*:\s*\[/);
  if (jsonPayloadIndex !== -1) {
    stripped = stripped.slice(0, jsonPayloadIndex);
    codeCount += codeCount ? 0 : 1;
  }

  const leakedFileIndex = stripped.search(/`?(?:src\/|app\/|components\/|pages\/|lib\/|public\/|server\.|main\.|index\.|App\.)[\w./-]+`?[,\s]*(?:demonstrating|containing|with|\{|'|"|\\n)/i);
  if (leakedFileIndex !== -1) {
    stripped = stripped.slice(0, leakedFileIndex);
    codeCount += codeCount ? 0 : 1;
  }

  const escapedCodeIndex = stripped.search(/(?:\\n|\n)(?:import|export|const|let|function|class|def |from |bash\s|npm\s|yarn\s|pnpm\s)/i);
  if (escapedCodeIndex !== -1) {
    stripped = stripped.slice(0, escapedCodeIndex);
    codeCount += codeCount ? 0 : 1;
  }

  stripped = stripped
    .replace(/\b(?:code_output|design_output)\b:?/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text: stripped, codeCount };
}