/**
 * SeoJsonLd — Article, FAQPage, and BreadcrumbList JSON-LD emitters.
 *
 * Theory 5 (Early Adopter): FAQ schema is at ~4% adoption and gets cited
 * 3x more in AI search results than plain pages. Theory 11 (Compound
 * Chain Signals): breadcrumbs strengthen the topical chain.
 */
import { useEffect } from "react";

const ORIGIN = "https://asherin.com";

export interface ArticleSchemaProps {
  id: string;
  url: string;
  headline: string;
  description: string;
  datePublished: string; // YYYY-MM-DD
  dateModified?: string;
  author?: string;
  keywords?: string[];
}

export const ArticleJsonLd = ({
  id,
  url,
  headline,
  description,
  datePublished,
  dateModified,
  author = "Asher Newton",
  keywords,
}: ArticleSchemaProps) => {
  useEffect(() => {
    const elId = `article-jsonld-${id}`;
    document.getElementById(elId)?.remove();
    const el = document.createElement("script");
    el.id = elId;
    el.type = "application/ld+json";
    el.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline,
      description,
      datePublished,
      dateModified: dateModified ?? datePublished,
      author: { "@type": "Person", name: author },
      publisher: {
        "@type": "Organization",
        name: "Asherin",
        url: ORIGIN,
      },
      mainEntityOfPage: url,
      keywords: keywords?.join(", "),
    });
    document.head.appendChild(el);
    return () => {
      document.getElementById(elId)?.remove();
    };
  }, [id, url, headline, description, datePublished, dateModified, author, keywords]);
  return null;
};

export interface FaqItem {
  q: string;
  a: string;
}

export const FaqJsonLd = ({ id, items }: { id: string; items: FaqItem[] }) => {
  useEffect(() => {
    const elId = `faq-jsonld-${id}`;
    document.getElementById(elId)?.remove();
    const el = document.createElement("script");
    el.id = elId;
    el.type = "application/ld+json";
    el.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: items.map((i) => ({
        "@type": "Question",
        name: i.q,
        acceptedAnswer: { "@type": "Answer", text: i.a },
      })),
    });
    document.head.appendChild(el);
    return () => {
      document.getElementById(elId)?.remove();
    };
  }, [id, items]);
  return null;
};

export interface Crumb {
  name: string;
  url: string;
}

export const BreadcrumbJsonLd = ({ id, items }: { id: string; items: Crumb[] }) => {
  useEffect(() => {
    const elId = `crumb-jsonld-${id}`;
    document.getElementById(elId)?.remove();
    const el = document.createElement("script");
    el.id = elId;
    el.type = "application/ld+json";
    el.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items.map((it, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: it.name,
        item: it.url.startsWith("http") ? it.url : `${ORIGIN}${it.url}`,
      })),
    });
    document.head.appendChild(el);
    return () => {
      document.getElementById(elId)?.remove();
    };
  }, [id, items]);
  return null;
};
