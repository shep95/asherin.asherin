import { describe, expect, it } from "vitest";
import { stitchAiContinuation } from "@/lib/aiContinuation";
import { extractZanoemCodeFiles } from "./zanoemOutput";

describe("extractZanoemCodeFiles", () => {
  it("keeps explicit filenames from code_output JSON", () => {
    const files = extractZanoemCodeFiles([
      "```code_output",
      '{"files":[{"filename":"src/App.tsx","language":"tsx","content":"export default function App(){ return <div/> }"}]}',
      "```",
    ].join("\n"));

    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe("src/App.tsx");
  });

  it("extracts a path label above a normal fenced code block so IDE preview can materialize it", () => {
    const files = extractZanoemCodeFiles([
      "**CODE**",
      "",
      "src/App.tsx",
      "```tsx",
      "export default function App() {",
      "  return <main>Hello</main>;",
      "}",
      "```",
      "",
      "src/index.css",
      "```css",
      "body { margin: 0; }",
      "```",
    ].join("\n"));

    expect(files.map((file) => file.filename)).toEqual(["src/App.tsx", "src/index.css"]);
    expect(files[0].content).toContain("export default function App");
  });

  it("falls back to snippet filenames when no path label exists", () => {
    const files = extractZanoemCodeFiles(["```ts", "export const answer = 42;", "```"].join("\n"));

    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe("snippet-1.ts");
  });
});

describe("stitchAiContinuation", () => {
  it("continues after the cut point instead of duplicating a restarted answer", () => {
    const first = [
      "src/App.tsx",
      "```tsx",
      "export default function App() {",
      "  function moveSnake() {",
      "    const next = { x: head.x + dx, y: head.y + dy };",
    ].join("\n");
    const restarted = [
      "src/App.tsx",
      "```tsx",
      "export default function App() {",
      "  function moveSnake() {",
      "    const next = { x: head.x + dx, y: head.y + dy };",
      "    if (next.x < 0 || next.y < 0) return endGame();",
      "    render();",
      "  }",
      "}",
      "```",
    ].join("\n");

    const stitched = stitchAiContinuation(first, restarted);

    expect(stitched.text.match(/src\/App\.tsx/g)).toHaveLength(1);
    expect(stitched.text).toContain("return endGame");
    expect(stitched.text.trim().endsWith("```")).toBe(true);
  });

  it("replaces the visible answer when the provider restarts with a longer complete copy but no safe overlap", () => {
    const first = "Here is the fixed file:\n```tsx\nexport default function Game(){\n  function moveSnake(){\n    const next = head";
    const completeRestart = "Here is the fixed file:\n```tsx\nexport default function Game(){\n  function moveSnake(){\n    const nextCell = head.next;\n    if (hitWall(nextCell)) endGame();\n  }\n}\n```";

    const stitched = stitchAiContinuation(first, completeRestart);

    expect(stitched.strategy).toBe("restart-replace");
    expect(stitched.text).toBe(completeRestart);
  });
});