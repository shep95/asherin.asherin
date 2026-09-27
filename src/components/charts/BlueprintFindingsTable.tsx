/**
 * SOVEREIGN TABLE ENGINE
 * Enterprise-grade sortable, resizable, virtualized table for ZERLAL findings.
 * Uses @blueprintjs/table for intelligence-class data density.
 */
import { useState, useMemo, useCallback } from "react";
import { Column, Table2, Cell, ColumnHeaderCell, RenderMode } from "@blueprintjs/table";
import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/table/lib/css/table.css";
import type { ZerlalFinding, FindingSeverity, FindingStatus } from "@/components/dashboard/zerlal/types";

interface BlueprintFindingsTableProps {
  findings: ZerlalFinding[];
  onSelectFinding: (id: string) => void;
  onExpandFinding?: (id: string) => void;
}

type SortKey = "severity" | "title" | "file_path" | "category" | "confidence" | "age_days" | "cvss_score" | "status";
type SortDir = "asc" | "desc";

const severityRank: Record<FindingSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

const severityColors: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  info: "#6b7280",
};

const statusColors: Record<string, string> = {
  open: "#ef4444",
  "in-progress": "#eab308",
  resolved: "#10b981",
  waived: "#6b7280",
};

const BlueprintFindingsTable = ({ findings, onSelectFinding, onExpandFinding }: BlueprintFindingsTableProps) => {
  const [sortKey, setSortKey] = useState<SortKey>("severity");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }, [sortKey]);

  const sorted = useMemo(() => {
    const arr = [...findings];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case "severity":
          return dir * ((severityRank[a.severity] ?? 4) - (severityRank[b.severity] ?? 4));
        case "title":
          return dir * a.title.localeCompare(b.title);
        case "file_path":
          return dir * (a.file_path ?? "").localeCompare(b.file_path ?? "");
        case "category":
          return dir * a.category.localeCompare(b.category);
        case "confidence":
          return dir * (a.confidence - b.confidence);
        case "age_days":
          return dir * (a.age_days - b.age_days);
        case "cvss_score":
          return dir * (a.cvss_score - b.cvss_score);
        case "status":
          return dir * a.status.localeCompare(b.status);
        default:
          return 0;
      }
    });
    return arr;
  }, [findings, sortKey, sortDir]);

  const renderHeader = (name: string, key: SortKey) => (
    <ColumnHeaderCell
      name={name}
      nameRenderer={() => (
        <button
          onClick={() => toggleSort(key)}
          className="flex items-center gap-1 w-full text-left text-[9px] uppercase tracking-wider font-normal"
          style={{ color: "hsl(var(--muted-foreground) / 0.5)" }}
        >
          {name}
          {sortKey === key && (
            <span className="text-[8px]">{sortDir === "asc" ? "▲" : "▼"}</span>
          )}
        </button>
      )}
    />
  );

  const cellRenderer = (rowIndex: number, col: SortKey) => {
    const f = sorted[rowIndex];
    if (!f) return <Cell />;

    switch (col) {
      case "severity":
        return (
          <Cell
            interactive
            style={{ cursor: "pointer" }}
          >
            <span
              className="px-2 py-0.5 rounded text-[9px] uppercase font-medium"
              style={{
                color: severityColors[f.severity],
                backgroundColor: `${severityColors[f.severity]}15`,
              }}
            >
              {f.severity}
            </span>
          </Cell>
        );
      case "title":
        return (
          <Cell interactive style={{ cursor: "pointer" }}>
            <span
              className="text-[10px] text-foreground/70 truncate block"
              onClick={() => onSelectFinding(f.id)}
              title={f.title}
            >
              {f.title}
            </span>
          </Cell>
        );
      case "file_path":
        return (
          <Cell>
            <span className="text-[9px] font-mono text-muted-foreground/40 truncate block" title={`${f.file_path}:${f.line_number}`}>
              {f.file_path?.split("/").pop() ?? "—"}:{f.line_number}
            </span>
          </Cell>
        );
      case "category":
        return <Cell><span className="text-[9px] text-muted-foreground/50">{f.category}</span></Cell>;
      case "confidence":
        return (
          <Cell>
            <div className="flex items-center gap-1">
              <div className="w-10 h-1 rounded-full bg-foreground/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${f.confidence}%`,
                    backgroundColor: f.confidence > 80 ? "#ef4444" : f.confidence > 50 ? "#eab308" : "#3b82f6",
                  }}
                />
              </div>
              <span className="text-[9px] text-muted-foreground/40">{f.confidence}%</span>
            </div>
          </Cell>
        );
      case "age_days":
        return <Cell><span className="text-[9px] text-muted-foreground/40">{f.age_days}d</span></Cell>;
      case "cvss_score": {
        const score = typeof f.cvss_score === "number" && Number.isFinite(f.cvss_score) ? f.cvss_score : null;
        return (
          <Cell>
            <span className="text-[10px] font-mono" style={{ color: score === null ? "#6b7280" : score >= 9 ? "#ef4444" : score >= 7 ? "#f97316" : score >= 4 ? "#eab308" : "#6b7280" }}>
              {score === null ? "—" : score.toFixed(1)}
            </span>
          </Cell>
        );
      }
      case "status":
        return (
          <Cell>
            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: statusColors[f.status], backgroundColor: `${statusColors[f.status]}12` }}>
              {f.status}
            </span>
          </Cell>
        );
      default:
        return <Cell />;
    }
  };

  if (findings.length === 0) {
    return (
      <div className="py-12 text-center text-[11px] text-muted-foreground/30">
        No findings to display
      </div>
    );
  }

  return (
    <div
      className="asherin-findings-table bp5-dark rounded-xl border border-border/[0.08] overflow-hidden bg-card/20"
      style={{
        ["--pt-table-background-color" as string]: "transparent",
      }}
    >
      <style>{`
        .asherin-findings-table,
        .asherin-findings-table .bp5-table-container,
        .asherin-findings-table .bp5-table-quadrant,
        .asherin-findings-table .bp5-table-quadrant-scroll-container,
        .asherin-findings-table .bp5-table-quadrant-main,
        .asherin-findings-table .bp5-table-top-container,
        .asherin-findings-table .bp5-table-bottom-container,
        .asherin-findings-table .bp5-table-body,
        .asherin-findings-table .bp5-table-body-virtual-client,
        .asherin-findings-table .bp5-table-cell-client {
          background: transparent !important;
          background-color: transparent !important;
          color: hsl(var(--foreground)) !important;
        }
        .asherin-findings-table .bp5-table-cell {
          background: transparent !important;
          background-color: transparent !important;
          border-bottom: 1px solid hsl(var(--border) / 0.06) !important;
          border-right: 1px solid hsl(var(--border) / 0.04) !important;
          box-shadow: none !important;
          font-family: inherit !important;
          color: hsl(var(--foreground)) !important;
        }
        .asherin-findings-table .bp5-table-cell-ledger-odd,
        .asherin-findings-table .bp5-table-cell-ledger-even {
          background: transparent !important;
          background-color: transparent !important;
        }
        .asherin-findings-table .bp5-table-cell:hover {
          background: hsl(var(--foreground) / 0.03) !important;
        }
        .asherin-findings-table .bp5-table-header,
        .asherin-findings-table .bp5-table-column-header-cell {
          background: hsl(var(--card) / 0.5) !important;
          background-color: hsl(var(--card) / 0.5) !important;
          box-shadow: none !important;
          border-right: 1px solid hsl(var(--border) / 0.06) !important;
          border-bottom: 1px solid hsl(var(--border) / 0.1) !important;
          color: hsl(var(--muted-foreground)) !important;
        }
        .asherin-findings-table .bp5-table-column-headers {
          background: transparent !important;
        }
        .asherin-findings-table .bp5-table-row-headers {
          display: none !important;
        }
        .asherin-findings-table .bp5-table-selection-region {
          background: hsl(var(--primary) / 0.08) !important;
          border: 1px solid hsl(var(--primary) / 0.2) !important;
        }
        .asherin-findings-table .bp5-table-resize-handle-target {
          opacity: 0.3;
        }
        .asherin-findings-table .bp5-table-overlay-layer,
        .asherin-findings-table .bp5-table-quadrant-top,
        .asherin-findings-table .bp5-table-quadrant-left,
        .asherin-findings-table .bp5-table-quadrant-top-left {
          background: transparent !important;
          background-color: transparent !important;
        }
      `}</style>
      <Table2
        numRows={sorted.length}
        defaultRowHeight={36}
        enableRowHeader={false}
        enableColumnResizing
        enableRowResizing={false}
        renderMode={RenderMode.NONE}
        cellRendererDependencies={[sorted, sortKey, sortDir]}
      >
        <Column name="Severity" cellRenderer={(r) => cellRenderer(r, "severity")} columnHeaderCellRenderer={() => renderHeader("Severity", "severity")} />
        <Column name="Title" cellRenderer={(r) => cellRenderer(r, "title")} columnHeaderCellRenderer={() => renderHeader("Title", "title")} />
        <Column name="File" cellRenderer={(r) => cellRenderer(r, "file_path")} columnHeaderCellRenderer={() => renderHeader("File", "file_path")} />
        <Column name="Category" cellRenderer={(r) => cellRenderer(r, "category")} columnHeaderCellRenderer={() => renderHeader("Category", "category")} />
        <Column name="Conf." cellRenderer={(r) => cellRenderer(r, "confidence")} columnHeaderCellRenderer={() => renderHeader("Conf.", "confidence")} />
        <Column name="Age" cellRenderer={(r) => cellRenderer(r, "age_days")} columnHeaderCellRenderer={() => renderHeader("Age", "age_days")} />
        <Column name="CVSS" cellRenderer={(r) => cellRenderer(r, "cvss_score")} columnHeaderCellRenderer={() => renderHeader("CVSS", "cvss_score")} />
        <Column name="Status" cellRenderer={(r) => cellRenderer(r, "status")} columnHeaderCellRenderer={() => renderHeader("Status", "status")} />
      </Table2>
    </div>
  );
};

export default BlueprintFindingsTable;
