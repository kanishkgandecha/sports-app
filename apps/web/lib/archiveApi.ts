import { apiGet } from "./api";

export interface ArchiveFixture {
  id: string;
  name: string;
  status: string;
  kind: "race-weekend" | "testing" | "other";
  startTime: string;
  season: { id: string; label: string };
  competition: { id: string; slug: string; name: string; type: string };
  venue: { id: string; name: string; country: string; timezone: string } | null;
  coverage: "summary" | "partial" | "event-data";
  source: { provider: string; attribution: string | null } | null;
  detailAvailable: boolean;
  sessionCoverage: { total: number; available: number; unavailable: number; failed: number; importing: number };
}

export interface ArchiveOptions {
  seasons: Array<{ id: string; label: string }>;
  competitions: Array<{ id: string; slug: string; name: string }>;
}

export type ArchiveFilters = Record<string, string | undefined>;

export function buildArchiveQuery(filters: ArchiveFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return params.toString();
}

export function getArchiveFixtures(filters: ArchiveFilters) {
  return apiGet<{
    fixtures: ArchiveFixture[];
    pageInfo: { hasNextPage: boolean; nextCursor: string | null };
    appliedFilters: ArchiveFilters;
  }>(`/api/archive/fixtures?${buildArchiveQuery(filters)}`);
}

export function getArchiveOptions() {
  return apiGet<ArchiveOptions>("/api/archive/options");
}
