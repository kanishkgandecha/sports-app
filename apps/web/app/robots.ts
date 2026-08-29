import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/siteUrl";

/**
 * Phase 4 (search-engine discovery). `/health` is the one route worth an
 * explicit Disallow: it's a technical, dependency-free container probe
 * (apps/web/app/health/route.ts), never a page a person or search engine
 * should land on. Every other route is a genuine, public page and is left
 * to the default `allow: "/"`.
 *
 * Individual invalid `/events/[id]` pages are handled per-page instead of
 * here: they already carry `<meta name="robots" content="noindex">`
 * automatically (Next's own behavior for a thrown `notFound()` — see
 * app/events/[id]/page.tsx and this checkpoint's generateMetadata, which
 * sets the same signal explicitly), which is the correct per-URL mechanism
 * for "this specific fixture id doesn't exist" — a blanket robots.txt rule
 * can't express that distinction, only a path pattern can, and no such
 * pattern exists (valid and invalid ids share the same `/events/*` shape).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/health"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
