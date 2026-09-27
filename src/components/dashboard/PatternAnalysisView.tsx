import { useState, useRef, useCallback } from "react";
import { TrendingUp, Upload, Sparkles, Loader2, Trash2, FileText, Image, BarChart3, ArrowRight } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ScatterChart, Scatter, ZAxis } from "recharts";
import { streamChat } from "@/lib/ai";
import { useAuth } from "@/contexts/AuthContext";

interface DataSource {
  id: string;
  name: string;
  type: "text" | "image";
  content: string;
  previewUrl?: string;
}

interface PatternResult {
  id: string;
  title: string;
  description: string;
  confidence: number;
  chartData: { label: string; value: number; predicted?: number }[];
  chartType: "line" | "area" | "scatter";
  insights: string[];
}

const PatternAnalysisView = () => {
  const { user } = useAuth();
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [analysisPrompt, setAnalysisPrompt] = useState("");
  const [results, setResults] = useState<PatternResult[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleTextUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setDataSources(prev => [...prev, {
        id: crypto.randomUUID(),
        name: file.name,
        type: "text",
        content: ev.target?.result as string,
      }]);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      setDataSources(prev => [...prev, {
        id: crypto.randomUUID(),
        name: file.name,
        type: "image",
        content: base64,
        previewUrl: base64,
      }]);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const removeSource = (id: string) => {
    setDataSources(prev => prev.filter(s => s.id !== id));
  };

  const runAnalysis = useCallback(async () => {
    if (dataSources.length === 0) return;
    setAnalyzing(true);
    setProgress("Ingesting data sources with Azplen Intelligence…");
    let result = "";

    const textData = dataSources.filter(d => d.type === "text").map(d => `[${d.name}]:\n${d.content.slice(0, 4000)}`).join("\n\n");
    const imageDescriptions = dataSources.filter(d => d.type === "image").map(d => `[Image: ${d.name}]`).join(", ");

    const prompt = `You are Azplen + Aureon Pattern Intelligence. Analyze the following data sources to find patterns, trends, and make future predictions.

${analysisPrompt ? `User context: ${analysisPrompt}` : ""}

Data sources:
${textData}
${imageDescriptions ? `Visual data uploaded: ${imageDescriptions}` : ""}

Instructions:
1. Identify 2-3 distinct patterns in the data
2. For each pattern, create a prediction chart with historical and forecasted values
3. Return ONLY a valid JSON array of pattern objects with this structure:
[{
  "title": "Pattern name",
  "description": "What was found and what it predicts",
  "confidence": 0.85,
  "chartData": [{"label": "2020", "value": 45}, {"label": "2021", "value": 52}, {"label": "2025", "value": null, "predicted": 78}],
  "chartType": "line",
  "insights": ["Key insight 1", "Key insight 2"]
}]

Return ONLY the JSON array.`;

    try {
      setProgress("Running asherin pattern recognition…");
      await streamChat({
        messages: [{ role: "user", content: prompt }],
        mode: "research",
        onDelta: (chunk) => { result += chunk; },
        onReplace: (text) => { result = text; },
        onDone: () => {
          try {
            const jsonMatch = result.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]) as PatternResult[];
              setResults(parsed.map((p, i) => ({ ...p, id: `p-${i}-${Date.now()}` })));
            }
          } catch {
            setResults([{
              id: `p-0-${Date.now()}`,
              title: "Analysis Result",
              description: result.slice(0, 500),
              confidence: 0.7,
              chartData: [],
              chartType: "line",
              insights: [result.slice(0, 200)],
            }]);
          }
          setAnalyzing(false);
          setProgress("");
        },
      });
    } catch {
      setAnalyzing(false);
      setProgress("");
    }
  }, [dataSources, analysisPrompt]);

  const renderChart = (pattern: PatternResult) => {
    if (!pattern.chartData || pattern.chartData.length === 0) return null;
    const hasForecasted = pattern.chartData.some(d => d.predicted != null);

    if (pattern.chartType === "area") {
      return (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={pattern.chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
            <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
            <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} />
            <Area type="monotone" dataKey="value" stroke="hsl(var(--accent))" fill="hsl(var(--accent))" fillOpacity={0.1} strokeWidth={2} />
            {hasForecasted && <Area type="monotone" dataKey="predicted" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.05} strokeDasharray="5 5" strokeWidth={2} />}
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    if (pattern.chartType === "scatter") {
      return (
        <ResponsiveContainer width="100%" height={200}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
            <YAxis dataKey="value" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
            <ZAxis range={[40, 200]} />
            <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} />
            <Scatter data={pattern.chartData.filter(d => d.value != null)} fill="hsl(var(--accent))" />
            {hasForecasted && <Scatter data={pattern.chartData.filter(d => d.predicted != null)} fill="#f59e0b" />}
          </ScatterChart>
        </ResponsiveContainer>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={pattern.chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
          <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
          <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} />
          <Line type="monotone" dataKey="value" stroke="hsl(var(--accent))" strokeWidth={2} dot={{ r: 3 }} />
          {hasForecasted && <Line type="monotone" dataKey="predicted" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: "#f59e0b" }} />}
        </LineChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border/20 bg-card/20 backdrop-blur-sm px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-accent" />
            <div>
              <h1 className="text-lg font-extralight tracking-wide text-foreground">Pattern Analysis</h1>
              <p className="text-[10px] font-extralight tracking-[0.15em] text-muted-foreground/60 uppercase hidden sm:block">Azplen + asherin Predictive Pattern Engine</p>
            </div>
          </div>
          <button onClick={runAnalysis} disabled={dataSources.length === 0 || analyzing}
            className="flex items-center gap-2 rounded-lg bg-accent/20 px-4 py-2 text-xs text-accent hover:bg-accent/30 transition-colors disabled:opacity-40">
            {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Analyze Patterns
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Data Upload Section */}
        <div className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-4 sm:p-6">
          <p className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/60 uppercase mb-3">Data Sources</p>
          
          <div className="flex gap-2 mb-4">
            <button onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-border/20 px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:border-border/40 transition-colors">
              <FileText className="h-3.5 w-3.5" /> Upload Data File
            </button>
            <button onClick={() => imageInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-border/20 px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:border-border/40 transition-colors">
              <Image className="h-3.5 w-3.5" /> Upload Visual Pattern
            </button>
            <input ref={fileInputRef} type="file" className="hidden" accept=".txt,.csv,.json,.md,.xml" onChange={handleTextUpload} />
            <input ref={imageInputRef} type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
          </div>

          {dataSources.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {dataSources.map(src => (
                <div key={src.id} className="rounded-xl border border-border/20 bg-card/30 p-3 group">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {src.type === "image" ? <Image className="h-3.5 w-3.5 text-accent shrink-0" /> : <FileText className="h-3.5 w-3.5 text-accent shrink-0" />}
                      <span className="text-xs font-light text-foreground truncate">{src.name}</span>
                    </div>
                    <button onClick={() => removeSource(src.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive transition-all">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  {src.type === "image" && src.previewUrl && (
                    <img src={src.previewUrl} alt={src.name} className="w-full h-20 object-cover rounded-lg border border-border/10" />
                  )}
                  {src.type === "text" && (
                    <p className="text-[10px] text-muted-foreground/40 line-clamp-2">{src.content.slice(0, 120)}…</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground/20 text-xs font-light">
              Upload historical data files and visual patterns to analyze
            </div>
          )}

          {/* Analysis Context */}
          <div className="mt-4">
            <textarea value={analysisPrompt} onChange={e => setAnalysisPrompt(e.target.value)}
              placeholder="Describe what patterns you're looking for… e.g., 'Find hurricane frequency patterns on the East Coast of Florida and predict the next 5 years'"
              className="w-full bg-card/30 border border-border/20 rounded-xl p-3 text-xs font-light text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-accent/30 resize-none h-20" />
          </div>
        </div>

        {/* Progress */}
        {analyzing && (
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 flex items-center gap-3">
            <Loader2 className="h-4 w-4 text-accent animate-spin" />
            <span className="text-xs font-light text-accent">{progress}</span>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-4">
            <p className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/60 uppercase">Detected Patterns & Forecasts</p>
            {results.map(pattern => (
              <div key={pattern.id} className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-4 sm:p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-light text-foreground">{pattern.title}</h3>
                    <p className="text-xs font-light text-muted-foreground mt-1">{pattern.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-2.5 py-1">
                    <BarChart3 className="h-3 w-3 text-accent" />
                    <span className="text-[10px] text-accent font-medium">{Math.round(pattern.confidence * 100)}% confidence</span>
                  </div>
                </div>

                {/* Chart */}
                <div className="mb-4">{renderChart(pattern)}</div>

                {/* Legend */}
                <div className="flex gap-4 mb-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 bg-accent rounded" />
                    <span className="text-[10px] text-muted-foreground">Historical</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 bg-amber-500 rounded" style={{ borderStyle: "dashed" }} />
                    <span className="text-[10px] text-muted-foreground">Predicted</span>
                  </div>
                </div>

                {/* Insights */}
                {pattern.insights && pattern.insights.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-light tracking-[0.1em] text-muted-foreground/50 uppercase">Key Insights</p>
                    {pattern.insights.map((insight, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <ArrowRight className="h-3 w-3 text-accent/50 mt-0.5 shrink-0" />
                        <span className="text-xs font-light text-muted-foreground">{insight}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PatternAnalysisView;
