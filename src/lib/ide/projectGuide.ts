// Pain Point #25a: AI Project Guide — surfaces next tasks, quick wins, suggestions.
// Pure heuristic, no AI calls — derives signals from validator + file metadata.

import { validateCode } from "./codeValidator";

export type GuideTaskPriority = "high" | "suggested" | "quick";

export interface GuideTask {
  id: string;
  priority: GuideTaskPriority;
  title: string;
  detail: string;
  estimateMin?: number;
  filePath?: string;
}

export interface GuideFile { id: string; path: string; content: string; language?: string }

export function buildProjectGuide(files: GuideFile[]): GuideTask[] {
  const tasks: GuideTask[] = [];
  let unusedImports = 0;
  let lintWarnings = 0;
  let totalErrors = 0;
  const todoLines: { path: string; line: number; text: string }[] = [];

  for (const f of files) {
    const v = validateCode(f.content, f.language || "tsx");
    for (const issue of v.issues) {
      if (issue.severity === "error") totalErrors++;
      else if (issue.severity === "warning") lintWarnings++;
      if (/unused\s+(import|variable)/i.test(issue.message)) unusedImports++;
    }
    // TODO scanner
    const lines = f.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (/\b(TODO|FIXME|HACK|XXX)\b/.test(lines[i])) {
        todoLines.push({ path: f.path, line: i + 1, text: lines[i].trim().slice(0, 160) });
      }
    }
  }

  if (totalErrors > 0) {
    tasks.push({
      id: "fix-errors",
      priority: "high",
      title: `Fix ${totalErrors} blocking error${totalErrors === 1 ? "" : "s"}`,
      detail: "Validator detected errors that will break the build.",
      estimateMin: Math.min(60, 5 + totalErrors * 2),
    });
  }

  if (todoLines.length > 0) {
    const sample = todoLines.slice(0, 3).map(t => `${t.path}:${t.line}`).join(", ");
    tasks.push({
      id: "address-todos",
      priority: "suggested",
      title: `Address ${todoLines.length} TODO${todoLines.length === 1 ? "" : "s"}`,
      detail: `Outstanding markers in: ${sample}${todoLines.length > 3 ? "…" : ""}`,
      estimateMin: Math.min(45, 5 + todoLines.length * 3),
    });
  }

  if (lintWarnings > 0) {
    tasks.push({
      id: "fix-warnings",
      priority: "quick",
      title: `Resolve ${lintWarnings} lint warning${lintWarnings === 1 ? "" : "s"}`,
      detail: "Quick stylistic fixes — improves codebase hygiene.",
      estimateMin: Math.max(2, Math.round(lintWarnings * 0.5)),
    });
  }

  if (unusedImports > 0) {
    tasks.push({
      id: "remove-unused-imports",
      priority: "quick",
      title: `Remove ${unusedImports} unused import${unusedImports === 1 ? "" : "s"}`,
      detail: "Dead imports inflate bundle size.",
      estimateMin: 2,
    });
  }

  // Suggest tests for components without a sibling .test file
  const paths = new Set(files.map(f => f.path));
  let untested = 0;
  for (const f of files) {
    if (/\.(t|j)sx?$/.test(f.path) && !/\.test\./.test(f.path) && !/\.d\.ts$/.test(f.path)) {
      const testPath = f.path.replace(/\.(t|j)sx?$/, ".test.$1");
      if (!paths.has(testPath)) untested++;
    }
  }
  if (untested >= 3) {
    tasks.push({
      id: "add-tests",
      priority: "suggested",
      title: `Add tests for ${untested} component${untested === 1 ? "" : "s"}`,
      detail: "Files without sibling .test files detected — boost coverage.",
      estimateMin: untested * 5,
    });
  }

  if (!tasks.length) {
    tasks.push({
      id: "all-clear",
      priority: "suggested",
      title: "All clear — no blocking issues",
      detail: "Codebase looks healthy. Consider new features or refactors.",
    });
  }

  // Sort by priority weight
  const w: Record<GuideTaskPriority, number> = { high: 0, suggested: 1, quick: 2 };
  tasks.sort((a, b) => w[a.priority] - w[b.priority]);
  return tasks;
}
