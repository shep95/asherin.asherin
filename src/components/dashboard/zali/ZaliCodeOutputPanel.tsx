import { useState } from "react";
import { Code2, Copy, Check, Download, FileCode, Terminal, Layers, Package } from "lucide-react";
import DOMPurify from "dompurify";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CodeFile {
  filename: string;
  language: string;
  content: string;
}

interface Props {
  codeFiles: CodeFile[];
  projectName: string;
  projectType: string;
}

const LANG_ICON: Record<string, string> = {
  typescript: "TS",
  javascript: "JS",
  python: "PY",
  rust: "RS",
  go: "GO",
  css: "CSS",
  html: "HTML",
  json: "JSON",
  sql: "SQL",
  bash: "SH",
  yaml: "YML",
  default: "</>",
};

const LANG_COLOR: Record<string, string> = {
  typescript: "text-blue-400",
  javascript: "text-yellow-400",
  python: "text-emerald-400",
  rust: "text-orange-400",
  go: "text-cyan-400",
  css: "text-pink-400",
  html: "text-orange-300",
  json: "text-amber-400",
  sql: "text-purple-400",
  bash: "text-green-400",
  default: "text-accent",
};

const getLangTag = (lang: string) => LANG_ICON[lang] ?? LANG_ICON.default;
const getLangColor = (lang: string) => LANG_COLOR[lang] ?? LANG_COLOR.default;

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] text-muted-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors active:scale-95"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
};

// Simple syntax highlighting via regex — no external deps
function highlight(code: string, lang: string): string {
  // escape HTML
  let html = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  if (["typescript", "javascript"].includes(lang)) {
    // strings
    html = html.replace(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, '<span style="color:#a8ff78">$&</span>');
    // keywords
    html = html.replace(
      /\b(import|export|from|const|let|var|function|return|if|else|for|while|class|interface|type|async|await|new|true|false|null|undefined|default|extends|implements|of|in|typeof|void|throw|try|catch|finally|switch|case|break|continue|delete|this|super|static|public|private|protected|readonly|enum|namespace|declare|abstract|override)\b/g,
      '<span style="color:#bd93f9">$1</span>'
    );
    // comments
    html = html.replace(/(\/\/[^\n]*)/g, '<span style="color:#6272a4">$1</span>');
    // numbers
    html = html.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#ff79c6">$1</span>');
    // function names
    html = html.replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*\()/g, '<span style="color:#50fa7b">$1</span>');
  } else if (lang === "python") {
    html = html.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, '<span style="color:#a8ff78">$&</span>');
    html = html.replace(/\b(import|from|as|def|class|return|if|elif|else|for|while|with|try|except|finally|raise|pass|break|continue|lambda|yield|global|nonlocal|and|or|not|in|is|True|False|None|async|await)\b/g, '<span style="color:#bd93f9">$1</span>');
    html = html.replace(/(#[^\n]*)/g, '<span style="color:#6272a4">$1</span>');
    html = html.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#ff79c6">$1</span>');
  } else if (lang === "sql") {
    html = html.replace(/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AS|AND|OR|NOT|IN|EXISTS|CREATE|TABLE|INDEX|VIEW|DROP|ALTER|ADD|COLUMN|PRIMARY|KEY|FOREIGN|REFERENCES|UNIQUE|DEFAULT|NULL|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|WITH|UNION|ALL|DISTINCT|IS|LIKE|BETWEEN|SET|VALUES|INTO|RETURNING)\b/gi, '<span style="color:#bd93f9">$1</span>');
    html = html.replace(/(--[^\n]*)/g, '<span style="color:#6272a4">$1</span>');
    html = html.replace(/('(?:[^'\\]|\\.)*')/g, '<span style="color:#a8ff78">$1</span>');
  }

  return html;
}

const ZaliCodeOutputPanel = ({ codeFiles, projectName, projectType }: Props) => {
  const [activeFile, setActiveFile] = useState(0);

  if (!codeFiles || codeFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border border-accent/20 flex items-center justify-center bg-accent/5">
            <Terminal className="h-7 w-7 text-accent/40 animate-pulse" />
          </div>
          <div className="absolute inset-0 h-16 w-16 rounded-full border border-accent/10 animate-ping" style={{ animationDuration: "3s" }} />
        </div>
        <div className="text-center">
          <p className="text-xs font-light text-foreground">Code generation ready</p>
          <p className="text-[10px] text-muted-foreground/40 mt-1">Answer ZANOEM's questions to generate your software architecture</p>
        </div>
      </div>
    );
  }

  const active = codeFiles[activeFile];

  const downloadAll = () => {
    codeFiles.forEach((f) => {
      const blob = new Blob([f.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-3 sm:px-4 py-2 border-b border-border/20 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Code2 className="h-3.5 w-3.5 text-accent" />
          <span className="text-[10px] font-light tracking-[0.15em] text-foreground uppercase">Code Output</span>
          <span className="text-[9px] text-muted-foreground/40">· {projectType}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground/40">{codeFiles.length} file{codeFiles.length !== 1 ? "s" : ""}</span>
          <button
            onClick={downloadAll}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] text-muted-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors active:scale-95 ml-1"
          >
            <Download className="h-3 w-3" />
            Download All
          </button>
        </div>
      </div>

      {/* File tabs */}
      <div className="flex-shrink-0 flex items-center gap-0.5 px-2 py-1.5 border-b border-border/10 overflow-x-auto scrollbar-none bg-card/10">
        {codeFiles.map((f, i) => (
          <button
            key={i}
            onClick={() => setActiveFile(i)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] sm:text-[10px] whitespace-nowrap transition-all active:scale-95 flex-shrink-0 ${
              activeFile === i
                ? "bg-accent/15 text-accent border border-accent/20"
                : "text-muted-foreground/40 hover:text-foreground hover:bg-foreground/5 border border-transparent"
            }`}
          >
            <span className={`font-mono text-[8px] font-bold ${getLangColor(f.language)}`}>
              {getLangTag(f.language)}
            </span>
            <span>{f.filename}</span>
          </button>
        ))}
      </div>

      {/* Code view */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="relative">
          {/* File header bar */}
          <div className="sticky top-0 z-10 flex items-center justify-between px-3 sm:px-4 py-1.5 bg-card/80 backdrop-blur-sm border-b border-border/10">
            <div className="flex items-center gap-2">
              <FileCode className="h-3 w-3 text-muted-foreground/40" />
              <span className="text-[10px] font-mono text-muted-foreground/60">{active.filename}</span>
              <span className={`text-[8px] font-mono px-1 py-0.5 rounded bg-foreground/5 ${getLangColor(active.language)}`}>
                {active.language}
              </span>
            </div>
            <CopyButton text={active.content} />
          </div>

          {/* Code block */}
          <div className="flex text-[11px] sm:text-xs font-mono leading-relaxed overflow-x-auto">
            {/* Line numbers */}
            <div className="flex-shrink-0 select-none px-2 sm:px-3 pt-3 pb-4 text-right text-muted-foreground/20 border-r border-border/10 bg-card/5 min-w-[2.5rem] sm:min-w-[3rem]">
              {active.content.split("\n").map((_, i) => (
                <div key={i} className="leading-[1.75]">{i + 1}</div>
              ))}
            </div>
            {/* Code */}
            <pre
              className="flex-1 px-3 sm:px-4 pt-3 pb-4 text-muted-foreground overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(highlight(active.content, active.language)) }}
              style={{ lineHeight: "1.75", tabSize: 2 }}
            />
          </div>
        </div>
      </ScrollArea>

      {/* Stats footer */}
      <div className="flex-shrink-0 px-3 sm:px-4 py-1.5 border-t border-border/10 flex items-center gap-3 text-[9px] text-muted-foreground/30">
        <span className="flex items-center gap-1">
          <Layers className="h-2.5 w-2.5" />
          {active.content.split("\n").length} lines
        </span>
        <span className="flex items-center gap-1">
          <Package className="h-2.5 w-2.5" />
          {(new TextEncoder().encode(active.content).length / 1024).toFixed(1)} KB
        </span>
        <span>{active.language}</span>
      </div>
    </div>
  );
};

export default ZaliCodeOutputPanel;
