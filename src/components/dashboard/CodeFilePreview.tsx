import { useState } from "react";
import { FileCode, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";

interface CodeFilePreviewProps {
  code: string;
  language?: string;
  fileName?: string;
}

function detectLanguage(code: string): string {
  if (/^import .+ from\s+['"]|^export\s+(default|const|function)|=>\s*{|React\./m.test(code)) return "tsx";
  if (/^def |^class |^import |print\(|:\s*$/m.test(code)) return "py";
  if (/^package |func\s+\w+\(|fmt\./m.test(code)) return "go";
  if (/^#include|std::|int main/m.test(code)) return "cpp";
  if (/^<\?php|->|=>/m.test(code)) return "php";
  if (/^fn |let mut |impl |pub fn/m.test(code)) return "rs";
  if (/<\w+>|<\/\w+>/m.test(code)) return "html";
  if (/\{[\s\S]*:\s*[\w#]/m.test(code) && !code.includes("function")) return "css";
  if (/SELECT |INSERT |CREATE TABLE/i.test(code)) return "sql";
  if (/^\s*\{[\s\S]*"[\w]+":/m.test(code)) return "json";
  if (/^const |^let |^var |function\s+\w+/m.test(code)) return "js";
  return "code";
}

function getExtension(lang: string): string {
  const map: Record<string, string> = {
    tsx: ".tsx", ts: ".ts", jsx: ".jsx", js: ".js",
    py: ".py", go: ".go", cpp: ".cpp", rs: ".rs",
    php: ".php", html: ".html", css: ".css", sql: ".sql",
    json: ".json", code: ".txt",
  };
  return map[lang] ?? ".txt";
}

const CodeFilePreview = ({ code, language, fileName }: CodeFilePreviewProps) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const lang = language || detectLanguage(code);
  const ext = getExtension(lang);
  const name = fileName || `snippet${ext}`;
  const lines = code.split("\n");
  const previewLines = expanded ? lines : lines.slice(0, 6);
  const hasMore = lines.length > 6;

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-border/30 bg-card/30 backdrop-blur-sm overflow-hidden my-1.5 max-w-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/20 bg-card/20">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode className="h-3.5 w-3.5 text-accent shrink-0" />
          <span className="text-[11px] font-light text-foreground truncate">{name}</span>
          <span className="text-[9px] font-extralight text-muted-foreground/50 uppercase tracking-wider">{lang}</span>
        </div>
        <button
          onClick={handleCopy}
          className="p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>

      {/* Code preview */}
      <div className="px-3 py-2 overflow-x-auto">
        <pre className="text-[11px] font-mono font-light text-muted-foreground leading-relaxed">
          {previewLines.map((line, i) => (
            <div key={i} className="flex">
              <span className="text-muted-foreground/30 select-none w-6 text-right mr-3 shrink-0">{i + 1}</span>
              <span className="whitespace-pre">{line}</span>
            </div>
          ))}
        </pre>
      </div>

      {/* Expand/collapse */}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-center gap-1 py-1.5 border-t border-border/20 text-[10px] font-light text-muted-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Collapse ({lines.length} lines)
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              Expand ({lines.length} lines)
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default CodeFilePreview;
