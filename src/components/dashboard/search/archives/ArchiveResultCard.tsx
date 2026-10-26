import { ExternalLink, Star, Download, BookOpen, Code, MessageSquare, BarChart3, Shield, AlertTriangle, CheckCircle, Clock, FileText } from "lucide-react";

export type ResultType = "cve" | "exploit" | "research" | "forum" | "historical";

export interface ArchiveResult {
  id: string;
  type: ResultType;
  title: string;
  subtitle: string;
  source: string;
  date: string;
  verified: boolean;
  confidence: number;
  summary: string;
  tags: string[];
  url: string;
  archiveUrl?: string;
  // CVE-specific
  cvss?: number;
  attackVector?: string;
  exploitCount?: number;
  patchAvailable?: boolean;
  activeExploit?: boolean;
  // Exploit-specific
  language?: string;
  successRate?: number;
  testedSystems?: number;
  codePreview?: string;
  // Research-specific
  authors?: string[];
  journal?: string;
  pages?: number;
  citations?: number;
  citedBy?: number;
  // Forum-specific
  forum?: string;
  replies?: number;
  siteStatus?: string;
  participants?: number;
  keyInsights?: string[];
  // Historical
  synthesizedFrom?: { label: string; count: number }[];
  eras?: { label: string; period: string; cvesDiscovered: number; description: string; severity: string }[];
}

const ConfBadge = ({ v }: { v: number }) => (
  <span className={`text-[9px] tabular-nums px-1.5 py-0.5 rounded-full border ${v >= 90 ? "border-green-500/30 text-green-400" : v >= 70 ? "border-yellow-500/30 text-yellow-400" : "border-muted-foreground/30 text-muted-foreground"}`}>{v}%</span>
);

const Tag = ({ t }: { t: string }) => (
  <span className="text-[9px] text-accent/70 bg-accent/5 border border-accent/10 px-1.5 py-0.5 rounded-md">#{t}</span>
);

const ResultCardWrapper = ({ children, type }: { children: React.ReactNode; type: ResultType }) => {
  const border = {
    cve: "border-red-500/20",
    exploit: "border-orange-500/20",
    research: "border-blue-500/20",
    forum: "border-yellow-500/20",
    historical: "border-accent/20",
  }[type];
  return <div className={`rounded-xl border ${border} bg-card/30 backdrop-blur-sm overflow-hidden`}>{children}</div>;
};

const CardHeader = ({ r }: { r: ArchiveResult }) => {
  const icon = { cve: Shield, exploit: Code, research: FileText, forum: MessageSquare, historical: BarChart3 }[r.type];
  const Icon = icon;
  const typeLabel = { cve: "CVE database", exploit: "Exploit-DB", research: "security research", forum: "Internet Archive", historical: "archive synthesis" }[r.type];
  return (
    <div className="px-4 py-3 border-b border-border/10">
      <p className="text-[12px] font-light text-foreground leading-snug">{r.title}</p>
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        <Icon className="h-3 w-3 text-muted-foreground/60" />
        <span className="text-[10px] text-muted-foreground/60">{typeLabel}</span>
        <span className="text-[10px] text-muted-foreground/40">·</span>
        <span className="text-[10px] text-muted-foreground/60">{r.date}</span>
        {r.verified && <span className="text-[9px] text-green-400 flex items-center gap-0.5"><CheckCircle className="h-2.5 w-2.5" /> verified</span>}
        {r.type === "forum" && r.siteStatus === "offline" && <span className="text-[9px] text-yellow-400 flex items-center gap-0.5"><AlertTriangle className="h-2.5 w-2.5" /> ARCHIVED</span>}
        <ConfBadge v={r.confidence} />
      </div>
    </div>
  );
};

const CveBody = ({ r }: { r: ArchiveResult }) => (
  <div className="px-4 py-3 space-y-3">
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">summary</p>
      <p className="text-[11px] font-extralight text-muted-foreground/80 leading-relaxed">{r.summary}</p>
    </div>
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
      {r.cvss !== undefined && <div><span className="text-muted-foreground/50">CVSS:</span> <span className={r.cvss >= 9 ? "text-red-400 font-medium" : "text-foreground"}>{r.cvss}/10</span></div>}
      {r.attackVector && <div><span className="text-muted-foreground/50">vector:</span> <span className="text-foreground">{r.attackVector}</span></div>}
      {r.exploitCount !== undefined && <div><span className="text-muted-foreground/50">exploits:</span> <span className="text-foreground">{r.exploitCount} POCs</span></div>}
    </div>
    <div className="flex items-center gap-3 flex-wrap">
      {r.activeExploit && <span className="text-[9px] text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle className="h-2.5 w-2.5" /> ACTIVELY EXPLOITED</span>}
      {r.patchAvailable && <span className="text-[9px] text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle className="h-2.5 w-2.5" /> PATCH AVAILABLE</span>}
    </div>
  </div>
);

const ExploitBody = ({ r }: { r: ArchiveResult }) => (
  <div className="px-4 py-3 space-y-3">
    <p className="text-[11px] font-extralight text-muted-foreground/80 leading-relaxed">{r.summary}</p>
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
      {r.language && <div><span className="text-muted-foreground/50">language:</span> <span className="text-foreground">{r.language}</span></div>}
      {r.successRate !== undefined && <div><span className="text-muted-foreground/50">success rate:</span> <span className="text-foreground">{r.successRate}%</span></div>}
      {r.testedSystems !== undefined && <div><span className="text-muted-foreground/50">tested:</span> <span className="text-foreground">{r.testedSystems} systems</span></div>}
    </div>
    {r.codePreview && (
      <pre className="text-[10px] font-mono bg-background/60 border border-border/20 rounded-lg px-3 py-2 overflow-x-auto text-muted-foreground/80 max-h-32">{r.codePreview}</pre>
    )}
    <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-3 py-2">
      <p className="text-[9px] text-yellow-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> FOR EDUCATIONAL / DEFENSIVE RESEARCH ONLY</p>
    </div>
  </div>
);

const ResearchBody = ({ r }: { r: ArchiveResult }) => (
  <div className="px-4 py-3 space-y-3">
    {r.authors && r.authors.length > 0 && (
      <p className="text-[10px] text-muted-foreground/60">{r.authors.join(", ")}</p>
    )}
    <p className="text-[11px] font-extralight text-muted-foreground/80 leading-relaxed">{r.summary}</p>
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
      {r.journal && <div><span className="text-muted-foreground/50">journal:</span> <span className="text-foreground">{r.journal}</span></div>}
      {r.pages !== undefined && <div><span className="text-muted-foreground/50">pages:</span> <span className="text-foreground">{r.pages}</span></div>}
      {r.citations !== undefined && <div><span className="text-muted-foreground/50">references:</span> <span className="text-foreground">{r.citations}</span></div>}
      {r.citedBy !== undefined && <div><span className="text-muted-foreground/50">cited by:</span> <span className="text-foreground">{r.citedBy}</span></div>}
    </div>
  </div>
);

const ForumBody = ({ r }: { r: ArchiveResult }) => (
  <div className="px-4 py-3 space-y-3">
    {r.forum && (
      <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-3 py-2">
        <p className="text-[9px] text-yellow-400">◈ ARCHIVE NOTE: This content is ONLY available in Asher Archives. Original site {r.siteStatus || "offline"}.</p>
      </div>
    )}
    <p className="text-[11px] font-extralight text-muted-foreground/80 leading-relaxed">{r.summary}</p>
    {r.keyInsights && r.keyInsights.length > 0 && (
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">key insights</p>
        <ul className="space-y-0.5">
          {r.keyInsights.map((ins, i) => <li key={i} className="text-[10px] text-muted-foreground/70 font-extralight">• {ins}</li>)}
        </ul>
      </div>
    )}
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
      {r.replies !== undefined && <div><span className="text-muted-foreground/50">replies:</span> <span className="text-foreground">{r.replies}</span></div>}
      {r.participants !== undefined && <div><span className="text-muted-foreground/50">participants:</span> <span className="text-foreground">{r.participants}</span></div>}
    </div>
  </div>
);

const HistoricalBody = ({ r }: { r: ArchiveResult }) => (
  <div className="px-4 py-3 space-y-3">
    {r.synthesizedFrom && (
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">synthesized from</p>
        <div className="flex flex-wrap gap-2">
          {r.synthesizedFrom.map((s, i) => <span key={i} className="text-[10px] text-muted-foreground/70 bg-card/50 border border-border/20 px-2 py-0.5 rounded">{s.count.toLocaleString()} {s.label}</span>)}
        </div>
      </div>
    )}
    {r.eras && r.eras.length > 0 && (
      <div className="space-y-2">
        {r.eras.map((era, i) => (
          <div key={i} className="border border-border/15 rounded-lg px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-light text-foreground">{era.label}</span>
              <span className="text-[9px] text-muted-foreground/50">{era.period}</span>
            </div>
            <p className="text-[10px] font-extralight text-muted-foreground/70 mt-0.5">{era.description}</p>
            <div className="flex items-center gap-3 mt-1 text-[9px] text-muted-foreground/50">
              <span>{era.cvesDiscovered} CVEs</span>
              <span>Severity: {era.severity}</span>
            </div>
          </div>
        ))}
      </div>
    )}
    <p className="text-[11px] font-extralight text-muted-foreground/80 leading-relaxed">{r.summary}</p>
  </div>
);

const CardFooter = ({ r, onSave }: { r: ArchiveResult; onSave?: (id: string) => void }) => (
  <div className="px-4 py-2.5 border-t border-border/10 flex items-center gap-3 flex-wrap">
    <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors">
      <ExternalLink className="h-3 w-3" /> view original
    </a>
    {r.archiveUrl && (
      <a href={r.archiveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors">
        <Clock className="h-3 w-3" /> Snapshots
      </a>
    )}
    {(r.type === "exploit" || r.type === "research") && (
      <button className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors">
        <Download className="h-3 w-3" /> {r.type === "exploit" ? "download code" : "download PDF"}
      </button>
    )}
    {r.type === "research" && (
      <button className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors">
        <BookOpen className="h-3 w-3" /> read online
      </button>
    )}
    {onSave && (
      <button onClick={() => onSave(r.id)} className="inline-flex items-center gap-1 text-[10px] text-accent/60 hover:text-accent transition-colors ml-auto">
        <Star className="h-3 w-3" /> save
      </button>
    )}
  </div>
);

interface ArchiveResultCardProps {
  result: ArchiveResult;
  index: number;
  onSave?: (id: string) => void;
}

const ArchiveResultCard = ({ result: r, index, onSave }: ArchiveResultCardProps) => {
  return (
    <ResultCardWrapper type={r.type}>
      <div className="flex items-center gap-2 px-4 pt-2.5">
        <span className="text-[10px] tabular-nums text-muted-foreground/40">{index + 1}.</span>
      </div>
      <CardHeader r={r} />
      {r.type === "cve" && <CveBody r={r} />}
      {r.type === "exploit" && <ExploitBody r={r} />}
      {r.type === "research" && <ResearchBody r={r} />}
      {r.type === "forum" && <ForumBody r={r} />}
      {r.type === "historical" && <HistoricalBody r={r} />}
      {r.tags.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1">{r.tags.map(t => <Tag key={t} t={t} />)}</div>
      )}
      <CardFooter r={r} onSave={onSave} />
    </ResultCardWrapper>
  );
};

export default ArchiveResultCard;
