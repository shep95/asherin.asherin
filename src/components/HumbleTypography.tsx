import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Editorial rules shared by every public page, every article, and the
 * subscription surface.  Longest phrases come first so a specific sentence is
 * softened before a shorter word inside it is considered.
 */
/**
 * There is no rewrite dictionary any more.
 *
 * A DOM post-filter that swapped "uncensored" for "user-directed" at paint time
 * left the overclaim in the source, in the bundle, in view-source and in every
 * crawler that reads server HTML — it only hid the words from a human eye. The
 * claims are now written honestly at the source, so the only job left here is
 * the lowercase editorial voice on public pages.
 */
const HUMBLE_REWRITES: ReadonlyArray<readonly [RegExp, string]> = [];

const PRESERVE_TAGS = new Set(["CODE", "PRE", "KBD", "SAMP", "SCRIPT", "STYLE", "TEXTAREA", "INPUT"]);

function rewriteCopy(value: string): string {
  return HUMBLE_REWRITES.reduce((copy, [pattern, replacement]) => copy.replace(pattern, replacement), value).toLowerCase();
}

function shouldPreserve(node: Node): boolean {
  const parent = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return Boolean(parent?.closest("[data-preserve-case], code, pre, kbd, samp, script, style, textarea, input"));
}

function rewriteTree(root: ParentNode): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  nodes.forEach((node) => {
    if (shouldPreserve(node) || !node.nodeValue?.trim()) return;
    const next = rewriteCopy(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
  });

  root.querySelectorAll?.("[aria-label], [title], img[alt]").forEach((element) => {
    if (shouldPreserve(element) || PRESERVE_TAGS.has(element.tagName)) return;
    ["aria-label", "title", "alt"].forEach((attribute) => {
      const value = element.getAttribute(attribute);
      if (value) element.setAttribute(attribute, rewriteCopy(value));
    });
  });
}

/**
 * Public pages speak in a quiet, lowercase voice.
 *
 * The switch lives on <html data-humble="on"> and is driven by the route, not
 * by each page, so a new marketing page inherits the voice for free and no
 * component has to remember to opt in.
 *
 * Working surfaces (dashboards, tools, reports) are excluded: there, casing is
 * data — identifiers, hashes, coordinates, code — and flattening it would
 * destroy meaning rather than soften tone. The single exception is the
 * subscription screen, which is commercial copy and opts in explicitly via its
 * own wrapper attribute.
 */
const WORKING_SURFACES = [
  "/dashboard",
  "/asher-dashboard",
  "/report/",
  "/whiteboard",
  "/ziaassets",
  "/asherin.acatalepsy",
];

const HumbleTypography = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const path = pathname.toLowerCase();
    const isWorking = WORKING_SURFACES.some(
      (p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`),
    );
    const root = document.documentElement;
    if (isWorking) root.removeAttribute("data-humble");
    else root.setAttribute("data-humble", "on");

    const apply = () => {
      const scope = isWorking
        ? document.querySelector("[data-humble-scope]")
        : document.body;
      if (scope) rewriteTree(scope);
      if (!isWorking) {
        document.title = rewriteCopy(document.title);
        document.head.querySelectorAll('meta[name="description"], meta[property="og:title"], meta[property="og:description"], meta[name="twitter:title"], meta[name="twitter:description"]').forEach((meta) => {
          const content = meta.getAttribute("content");
          if (content) meta.setAttribute("content", rewriteCopy(content));
        });
      }
    };

    apply();
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        apply();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      root.removeAttribute("data-humble");
    };
  }, [pathname]);

  return null;
};

export default HumbleTypography;
