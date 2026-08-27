import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buildArchiveQuery, getArchiveFixtures, getArchiveOptions, type ArchiveFilters } from "../../lib/archiveApi";
import { formatDate, venueLine } from "../../lib/format";
import styles from "./archive.module.css";

export const metadata: Metadata = { title: "F1 archive" };
type RawSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function ArchivePage({ searchParams }: { searchParams: RawSearchParams }) {
  return (
    <Suspense
      fallback={
        <div className={styles.shell}>
          <div className={styles.emptyState} role="status">
            <h2>Loading archive</h2>
            <p>Preparing the race index and coverage details…</p>
          </div>
        </div>
      }
    >
      <ArchiveContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ArchiveContent({ searchParams }: { searchParams: RawSearchParams }) {
  const raw = await searchParams;
  const filters: ArchiveFilters = {
    q: scalar(raw.q),
    season: scalar(raw.season),
    competition: scalar(raw.competition),
    status: scalar(raw.status),
    kind: scalar(raw.kind),
    from: scalar(raw.from),
    to: scalar(raw.to),
    cursor: scalar(raw.cursor),
  };
  const [results, options] = await Promise.all([
    getArchiveFixtures(filters).catch(() => null),
    getArchiveOptions().catch(() => null),
  ]);
  const pageCoverage = results?.fixtures.reduce(
    (counts, fixture) => {
      counts[fixture.coverage] += 1;
      return counts;
    },
    { summary: 0, partial: 0, "event-data": 0 },
  );
  const availableSessions = results?.fixtures.reduce((total, fixture) => total + fixture.sessionCoverage.available, 0);
  const advancedFilterCount = [filters.competition, filters.kind, filters.from, filters.to].filter(Boolean).length;
  const activeFilters = archiveFilterLabels(filters, options);

  return (
    <div className={styles.shell}>
      <header className={styles.hero}>
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>Formula 1 · database-backed · provider attributed</p>
          <h1>F1 archive</h1>
          <p>Find a race weekend fast, then see exactly how much session data is ready before opening it.</p>
        </div>
        <dl className={styles.heroStats} aria-label="Archive summary">
          <div>
            <dt>Seasons</dt>
            <dd>{options?.seasons.length ?? "—"}</dd>
          </div>
          <div>
            <dt>On this page</dt>
            <dd>{results?.fixtures.length ?? "—"}</dd>
          </div>
          <div>
            <dt>Sessions ready</dt>
            <dd>{availableSessions ?? "—"}</dd>
          </div>
        </dl>
      </header>
      <form className={styles.filters} method="get" aria-label="Filter the F1 archive">
        <label className={styles.searchField}>
          Search
          <input name="q" type="search" defaultValue={filters.q} placeholder="Grand Prix, circuit, or country" />
        </label>
        <label>
          Season
          <select name="season" defaultValue={filters.season ?? ""}>
            <option value="">All seasons</option>
            {options?.seasons.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={filters.status ?? ""}>
            <option value="">Any status</option>
            <option value="completed">Completed</option>
            <option value="scheduled">Scheduled</option>
            <option value="live">Live</option>
          </select>
        </label>
        <details className={styles.advancedFilters} open={advancedFilterCount > 0}>
          <summary>
            <span>Advanced filters</span>
            <span className={styles.advancedCount}>
              {advancedFilterCount > 0 ? `${advancedFilterCount} active` : "Competition, event type, dates"}
            </span>
          </summary>
          <div className={styles.advancedGrid}>
            <label>
              Competition
              <select name="competition" defaultValue={filters.competition ?? ""}>
                <option value="">All competitions</option>
                {options?.competitions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Event type
              <select name="kind" defaultValue={filters.kind ?? ""}>
                <option value="">All events</option>
                <option value="race-weekend">Race weekends</option>
                <option value="testing">Pre-season testing</option>
              </select>
            </label>
            <label>
              From
              <input type="date" name="from" defaultValue={filters.from} />
            </label>
            <label>
              To
              <input type="date" name="to" defaultValue={filters.to} />
            </label>
          </div>
        </details>
        <div className={styles.actions}>
          <button type="submit">Apply filters</button>
          {activeFilters.length > 0 && <Link href="/archive">Clear all</Link>}
        </div>
      </form>
      {activeFilters.length > 0 && (
        <div className={styles.activeFilters} role="group" aria-label="Active archive filters">
          <span className={styles.activeFiltersLabel}>Active filters</span>
          <ul>
            {activeFilters.map((filter) => {
              const query = buildArchiveQuery({ ...filters, [filter.key]: undefined, cursor: undefined });
              return (
                <li key={filter.key}>
                  <Link href={query ? `/archive?${query}` : "/archive"} aria-label={`Remove ${filter.label} filter`}>
                    {filter.label}
                    <span aria-hidden="true">×</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {!results ? (
        <div className={styles.emptyState} role="status">
          <h2>The archive is temporarily unavailable</h2>
          <p>We couldn’t load the race index. The rest of F1 Race Center is still available.</p>
          <Link href="/archive">Try again</Link>
        </div>
      ) : results.fixtures.length === 0 ? (
        <div className={styles.emptyState}>
          <h2>No weekends match</h2>
          <p>Try a broader season, status, or date range.</p>
          <Link href="/archive">Clear filters</Link>
        </div>
      ) : (
        <section aria-labelledby="archive-results-title">
          <div className={styles.resultsHeader}>
            <div>
              <p className={styles.resultsEyebrow}>Archive index</p>
              <h2 id="archive-results-title">{results.fixtures.length} weekends on this page</h2>
            </div>
            {pageCoverage && (
              <ul className={styles.coverageLegend} aria-label="Coverage on this page">
                <li data-coverage="event-data">{pageCoverage["event-data"]} event data</li>
                <li data-coverage="partial">{pageCoverage.partial} partial</li>
                <li data-coverage="summary">{pageCoverage.summary} summary</li>
              </ul>
            )}
          </div>
          <div className={styles.results}>
            {results.fixtures.map((fixture) => (
              <Link
                key={fixture.id}
                href={`/events/${fixture.id}`}
                className={styles.card}
                data-coverage={fixture.coverage}
              >
                <div className={styles.cardTop}>
                  <span>
                    {fixture.season.label} · {fixture.competition.name}
                  </span>
                  <span className={styles.coverage}>{coverageLabel(fixture)}</span>
                </div>
                <h3>{fixture.name}</h3>
                <p className={styles.meta}>
                  {formatDate(fixture.startTime)}
                  {venueLine(fixture.venue) && ` · ${venueLine(fixture.venue)}`}
                </p>
                <div className={styles.sessionCoverage}>
                  <div className={styles.coverageTrack} aria-hidden="true">
                    {fixture.sessionCoverage.available > 0 && (
                      <span
                        className={styles.coverageAvailable}
                        style={{ flexGrow: fixture.sessionCoverage.available }}
                      />
                    )}
                    {fixture.sessionCoverage.unavailable > 0 && (
                      <span
                        className={styles.coverageUnavailable}
                        style={{ flexGrow: fixture.sessionCoverage.unavailable }}
                      />
                    )}
                    {fixture.sessionCoverage.failed > 0 && (
                      <span className={styles.coverageFailed} style={{ flexGrow: fixture.sessionCoverage.failed }} />
                    )}
                    {fixture.sessionCoverage.importing > 0 && (
                      <span
                        className={styles.coverageImporting}
                        style={{ flexGrow: fixture.sessionCoverage.importing }}
                      />
                    )}
                    {pendingSessionCount(fixture) > 0 && (
                      <span className={styles.coveragePending} style={{ flexGrow: pendingSessionCount(fixture) }} />
                    )}
                  </div>
                  <span>{sessionCoverageLabel(fixture)}</span>
                </div>
                <div className={styles.cardBottom}>
                  <span>{fixture.source?.provider ?? "Imported F1 record"}</span>
                  <span className={styles.cardAction}>
                    Open weekend
                    <span aria-hidden="true">→</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
      {results?.pageInfo.nextCursor && (
        <div className={styles.more}>
          <Link href={`/archive?${buildArchiveQuery({ ...filters, cursor: results.pageInfo.nextCursor })}`}>
            Next page →
          </Link>
        </div>
      )}
    </div>
  );
}

function coverageLabel(fixture: Awaited<ReturnType<typeof getArchiveFixtures>>["fixtures"][number]) {
  if (fixture.kind === "testing") return "Testing";
  if (fixture.status === "scheduled") return "Scheduled";
  if (fixture.coverage === "event-data") return "Event data";
  if (fixture.coverage === "partial") return "Partial data";
  return "Summary only";
}

function scalar(value: string | string[] | undefined) {
  return typeof value === "string" ? value : value?.[0];
}

function archiveFilterLabels(filters: ArchiveFilters, options: Awaited<ReturnType<typeof getArchiveOptions>> | null) {
  const labels: Array<{ key: string; label: string }> = [];
  if (filters.q) labels.push({ key: "q", label: `Search: ${filters.q}` });
  if (filters.season) {
    labels.push({
      key: "season",
      label: `Season: ${options?.seasons.find((option) => option.id === filters.season)?.label ?? filters.season}`,
    });
  }
  if (filters.status) labels.push({ key: "status", label: `Status: ${titleCase(filters.status)}` });
  if (filters.competition) {
    labels.push({
      key: "competition",
      label: `Competition: ${options?.competitions.find((option) => option.id === filters.competition)?.name ?? filters.competition}`,
    });
  }
  if (filters.kind) labels.push({ key: "kind", label: `Event: ${titleCase(filters.kind)}` });
  if (filters.from) labels.push({ key: "from", label: `From: ${filters.from}` });
  if (filters.to) labels.push({ key: "to", label: `To: ${filters.to}` });
  return labels;
}

function titleCase(value: string) {
  return value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

type Fixture = Awaited<ReturnType<typeof getArchiveFixtures>>["fixtures"][number];

function pendingSessionCount(fixture: Fixture) {
  const coverage = fixture.sessionCoverage;
  return Math.max(0, coverage.total - coverage.available - coverage.unavailable - coverage.failed - coverage.importing);
}

function sessionCoverageLabel(fixture: Fixture) {
  const coverage = fixture.sessionCoverage;
  if (coverage.available > 0) return `${coverage.available} of ${coverage.total} sessions ready`;
  if (coverage.failed > 0) return "Session import retry scheduled";
  if (coverage.importing > 0) return "Session data importing";
  if (coverage.unavailable > 0) return "Provider has no session detail";
  if (fixture.status === "scheduled") return `${coverage.total} sessions scheduled`;
  return "Weekend summary available";
}
