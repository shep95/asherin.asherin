import { FileText, Download, Calendar, Clock } from "lucide-react";

const reportTypes = [
  {
    id: "executive",
    name: "Executive Summary",
    description: "1-2 page overview with charts, no code. Designed for C-suite and board reporting.",
    pages: "1-2",
  },
  {
    id: "technical",
    name: "Technical Detail",
    description: "Full finding list with code snippets, dataflow traces, and reproduction steps.",
    pages: "15-50+",
  },
  {
    id: "compliance",
    name: "Compliance Report",
    description: "Findings mapped to SOC 2, PCI DSS, HIPAA, ISO 27001, or FedRAMP controls.",
    pages: "10-30",
  },
  {
    id: "remediation",
    name: "Remediation Progress",
    description: "Time-to-fix trends, SLA compliance, resolved vs. open over time.",
    pages: "5-10",
  },
  {
    id: "benchmark",
    name: "Industry Benchmark",
    description: "Compare your security posture against similar companies in your sector.",
    pages: "3-5",
  },
];

const formats = ["PDF", "CSV", "JSON"];

const ReportsScreen = () => {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-[900px] mx-auto space-y-6">
        <div>
          <h2 className="text-sm font-light tracking-[0.1em] text-foreground/80 uppercase">Reports</h2>
          <p className="text-[10px] text-muted-foreground/35 mt-0.5">Generate, schedule, and export security reports</p>
        </div>

        {/* Report Types */}
        <div className="space-y-3">
          <h3 className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Report Types</h3>
          {reportTypes.map((r) => (
            <div key={r.id} className="rounded-xl border border-border/[0.06] bg-card/20 backdrop-blur-sm p-4 flex items-start justify-between hover:bg-foreground/[0.01] transition-colors">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-foreground/[0.03] border border-border/[0.06] flex items-center justify-center shrink-0">
                  <FileText className="h-3.5 w-3.5 text-foreground/30" />
                </div>
                <div>
                  <div className="text-[11px] text-foreground/60">{r.name}</div>
                  <p className="text-[9px] text-muted-foreground/30 mt-0.5 max-w-md">{r.description}</p>
                  <span className="text-[8px] text-muted-foreground/20 mt-1 inline-block">~{r.pages} pages</span>
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {formats.map((fmt) => (
                  <button
                    key={fmt}
                    className="px-2 py-1 rounded-md bg-foreground/[0.03] border border-border/[0.06] text-[8px] text-muted-foreground/30 hover:text-foreground/50 hover:bg-foreground/[0.06] transition-colors"
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Scheduled Reports */}
        <div className="space-y-3">
          <h3 className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Scheduled Reports</h3>
          <div className="rounded-xl border border-border/[0.06] bg-card/20 backdrop-blur-sm divide-y divide-border/[0.04]">
            {[
              { name: "Weekly Security Digest", schedule: "Every Monday 8:00 AM", recipients: "security-team@aureon.io", type: "Executive Summary" },
              { name: "Monthly Board Report", schedule: "1st of each month", recipients: "board@aureon.io", type: "Compliance Report" },
            ].map((s) => (
              <div key={s.name} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground/20" />
                  <div>
                    <div className="text-[10px] text-foreground/50">{s.name}</div>
                    <div className="text-[8px] text-muted-foreground/25 mt-0.5">{s.type} → {s.recipients}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] text-muted-foreground/25 flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" /> {s.schedule}
                  </span>
                  <button className="text-[9px] text-muted-foreground/25 hover:text-foreground/50">Edit</button>
                </div>
              </div>
            ))}
          </div>
          <button className="text-[10px] text-muted-foreground/30 hover:text-foreground/50 transition-colors">
            + Schedule new report
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportsScreen;
