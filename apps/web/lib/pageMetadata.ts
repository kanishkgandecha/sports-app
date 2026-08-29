import type { Metadata } from "next";
import { SITE_URL } from "./siteUrl";

/**
 * Phase 6 — the canonical/Open Graph/Twitter block every static, indexable
 * route needs, built from just a path/title/description. Mirrors
 * `app/events/[id]/page.tsx`'s `generateMetadata` exactly (same `siteName`,
 * `type: "website"`, `twitter.card: "summary"`, and the convention of
 * reusing one plain title string for the page `<title>`, `og:title`, and
 * `twitter:title` rather than baking " — F1 Race Center" into it —
 * `siteName` already carries brand attribution in Open Graph readers) so
 * the two don't drift into two different metadata "shapes" for what is
 * otherwise the same convention applied to a static vs. a dynamic route.
 * Not merged with the event-page version: that one is async (fetches a
 * fixture) and has its own noindex-fallback branching that doesn't apply
 * to these always-real static routes.
 */
export function buildPageMetadata({
  path,
  title,
  description,
}: {
  /** Site-relative path starting with "/", e.g. "/archive". */
  path: string;
  title: string;
  description: string;
}): Metadata {
  const url = `${SITE_URL}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", siteName: "F1 Race Center" },
    twitter: { card: "summary", title, description },
  };
}
