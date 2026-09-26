import { CANONICAL_ORIGIN } from "./site-config";

// docs/roadmap/engineering-roadmap.md item 26: shared helpers for the two structured-data shapes
// used across every content page — a canonical <link> tag and a BreadcrumbList JSON-LD block —
// so each route's head() builds them the same way instead of hand-rolling the schema.org shape
// per file.

export function canonicalLink(path: string) {
  return { rel: "canonical", href: `${CANONICAL_ORIGIN}${path}` };
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export function breadcrumbListJsonLd(items: BreadcrumbItem[]) {
  return {
    type: "application/ld+json",
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: `${CANONICAL_ORIGIN}${item.path}`,
      })),
    }),
  };
}

export function titleCase(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
