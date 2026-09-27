// Pain Point #10: Semantic-ish search — finds code by meaning, not just text.
// Pure client-side: groups results by category (function definitions, calls, imports,
// SQL/queries, cache, comments) and ranks by token overlap + identifier matching.

export type SearchHit = {
  fileId: string;
  filePath: string;
  line: number;
  snippet: string;
  category: "definition" | "call" | "import" | "query" | "cache" | "comment" | "other";
  score: number;
};

export type SearchGroup = { category: SearchHit["category"]; label: string; hits: SearchHit[] };

const STOP = new Set(["the","a","an","of","to","in","do","does","where","what","which","is","are","we","our","my","this","that","by","for","on","with","i","you"]);

function tokenize(q: string): string[] {
  return q.toLowerCase().replace(/[^a-z0-9_\s]/g, " ").split(/\s+/).filter(t => t && !STOP.has(t));
}

function categorize(line: string): SearchHit["category"] {
  const l = line.trim();
  if (/^(function|const|let|var|class|export\s+(?:default\s+)?(?:function|class|const))/.test(l)) return "definition";
  if (/^import\s|^from\s.*import/.test(l)) return "import";
  if (/(SELECT|INSERT|UPDATE|DELETE)\s/i.test(l) || /\.from\(['"`]/.test(l) || /supabase\.\w+\(/.test(l)) return "query";
  if (/cache|redis|memo|localStorage|sessionStorage/i.test(l)) return "cache";
  if (/^\s*(\/\/|\/\*|\*|#)/.test(l)) return "comment";
  if (/\b\w+\s*\(/.test(l)) return "call";
  return "other";
}

const CAT_LABEL: Record<SearchHit["category"], string> = {
  definition: "Definitions",
  call: "Calls / Usages",
  import: "Imports",
  query: "Database Queries",
  cache: "Cache / Storage",
  comment: "Comments",
  other: "Other Matches",
};

export interface FileBlob { id: string; path: string; content: string }

export function semanticSearch(query: string, files: FileBlob[], limit = 80): SearchGroup[] {
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  const hits: SearchHit[] = [];
  for (const f of files) {
    const lines = f.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (lower.includes(t)) score += t.length >= 4 ? 2 : 1;
        // identifier-style match: "fetchUser" matches "fetch user"
        const camel = lower.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
        if (camel.includes(t)) score += 1;
      }
      if (score >= Math.min(2, tokens.length)) {
        hits.push({
          fileId: f.id,
          filePath: f.path,
          line: i + 1,
          snippet: line.trim().slice(0, 220),
          category: categorize(line),
          score,
        });
      }
    }
  }

  hits.sort((a, b) => b.score - a.score);
  const top = hits.slice(0, limit);
  const groups = new Map<SearchHit["category"], SearchHit[]>();
  for (const h of top) {
    if (!groups.has(h.category)) groups.set(h.category, []);
    groups.get(h.category)!.push(h);
  }
  // Stable group order by category importance
  const order: SearchHit["category"][] = ["definition", "call", "query", "cache", "import", "comment", "other"];
  return order
    .filter(c => groups.has(c))
    .map(c => ({ category: c, label: CAT_LABEL[c], hits: groups.get(c)! }));
}
