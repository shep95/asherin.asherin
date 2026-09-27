// Per-route SEO head helper: sets canonical + OG/Twitter tags + description.
// Returns a cleanup function suitable for useEffect.

const SITE_ORIGIN = "https://asherin.com";

type SeoOpts = {
  title: string;
  description: string;
  path?: string; // defaults to current location.pathname
};

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.rel = "canonical";
    document.head.appendChild(el);
  }
  el.href = href;
}

export function applySeoHead({ title, description, path }: SeoOpts) {
  const url =
    SITE_ORIGIN + (path ?? (typeof window !== "undefined" ? window.location.pathname : "/"));
  const desc = description.length > 157 ? description.slice(0, 157).trimEnd() + "…" : description;

  document.title = title;
  upsertMeta("name", "description", desc);
  upsertCanonical(url);
  upsertMeta("property", "og:title", title);
  upsertMeta("property", "og:description", desc);
  upsertMeta("property", "og:url", url);
  upsertMeta("name", "twitter:title", title);
  upsertMeta("name", "twitter:description", desc);
}
