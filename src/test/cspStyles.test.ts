import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cspStylesPlugin } from "../../scripts/cspStylesPlugin";

function transform(code: string, id: string): string | undefined {
  const hook = cspStylesPlugin().transform;
  if (typeof hook !== "function") throw new Error("missing transform hook");
  return hook.call({ error(message: string) { throw new Error(message); } } as never, code, id) as string | undefined;
}

describe("strict style CSP", () => {
  it("removes the real Sonner injection while shipping its official external stylesheet", () => {
    const path = resolve("node_modules/sonner/dist/index.mjs");
    const code = readFileSync(path, "utf8");
    const result = transform(code, path);
    expect(result).not.toBe(code);
    expect(result).not.toContain('wt(`:where');
    expect(readFileSync(resolve("src/main.tsx"), "utf8")).toContain('import "sonner/dist/styles.css"');
    expect(() => transform("changed upstream layout", path)).toThrow("review CSP compatibility");
  });

  it("keeps measured scroll-lock styles mounted until their last consumer exits", () => {
    const code = transform("", "/node_modules/react-style-singleton/dist/es2015/singleton.js");
    expect(code).toBeDefined();
    class Sheet {
      css = "";
      replaceSync(css: string) { this.css = css; }
    }
    const existing = new Sheet();
    const doc = { adoptedStyleSheets: [existing] };
    const make = new Function("CSSStyleSheet", "document", `${code!.replace("export function", "function")}; return stylesheetSingleton;`)(Sheet, doc);
    const styles = make();
    styles.add("body { overflow: hidden; }");
    styles.add("ignored second consumer");
    expect(doc.adoptedStyleSheets).toHaveLength(2);
    expect(doc.adoptedStyleSheets[1].css).toBe("body { overflow: hidden; }");
    styles.remove();
    expect(doc.adoptedStyleSheets).toHaveLength(2);
    styles.remove();
    styles.remove();
    expect(doc.adoptedStyleSheets).toEqual([existing]);
  });

  it("blocks inline styles in both enforced and static-host policies and restricts CORS", () => {
    const config = JSON.parse(readFileSync(resolve("vercel.json"), "utf8"));
    for (const group of config.headers) {
      for (const header of group.headers) {
        if (header.key === "Content-Security-Policy") expect(header.value).not.toContain("'unsafe-inline'");
      }
    }
    expect(readFileSync(resolve("index.html"), "utf8")).not.toContain("'unsafe-inline'");
    expect(config.headers[0].headers).toContainEqual({ key: "Access-Control-Allow-Origin", value: "https://www.asherin.com" });
  });
});
