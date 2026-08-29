import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/siteUrl";
import { getF1Fixtures } from "../lib/f1Api";

/**
 * Phase 4 (search-engine discovery). Static, always-present routes plus one
 * entry per fixture that actually has real content to show
 * (`detailAvailable: true` — timing/results/classification exist; see
 * docs/CONTEXT.md's per-session detail-availability tracking). A
 * summary-only or future-scheduled fixture's Event Center page is
 * deliberately left out: it's thin/duplicate content today, not a genuine
 * indexable page, and would just churn as sessions later gain detail.
 *
 * `/health` is excluded — a technical endpoint, not a page (see robots.ts).
 * `/events/[id]` pages for an *invalid* id are excluded by construction:
 * only real fixture ids returned by the API ever appear here.
 *
 * The API call can fail (provider/API downtime); a broken sitemap request
 * would be worse than a smaller one, so this falls back to the static
 * routes alone rather than throwing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/sports/f1`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/archive`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/learn`, changeFrequency: "weekly", priority: 0.5 },
  ];

  let eventRoutes: MetadataRoute.Sitemap = [];
  try {
    const { fixtures } = await getF1Fixtures({ limit: 100 });
    eventRoutes = fixtures
      .filter((fixture) => fixture.detailAvailable)
      .map((fixture) => ({
        url: `${SITE_URL}/events/${fixture.id}`,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));
  } catch {
    // API unreachable at generation time — return the static routes only
    // rather than fail the whole sitemap request.
  }

  return [...staticRoutes, ...eventRoutes];
}
