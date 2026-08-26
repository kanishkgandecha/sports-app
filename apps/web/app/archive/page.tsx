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
          <p className={styles.empty}>Loading archive…</p>
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
  return (
    <div className={styles.shell}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Formula 1 · database-backed · provider attributed</p>
        <h1>F1 archive</h1>
        <p>Browse every imported F1 weekend, including honest session-by-session historical coverage.</p>
      </header>
      <form className={styles.filters} method="get" aria-label="Filter the F1 archive">
        <label>
          Search
          <input name="q" defaultValue={filters.q} placeholder="Grand Prix or circuit" />
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
          Status
          <select name="status" defaultValue={filters.status ?? ""}>
            <option value="">Any status</option>
            <option value="completed">Completed</option>
            <option value="scheduled">Scheduled</option>
            <option value="live">Live</option>
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
        <div className={styles.actions}>
          <button type="submit">Apply filters</button>
          <Link href="/archive">Clear</Link>
        </div>
      </form>
      {!results ? (
        <p className={styles.empty}>The archive API is temporarily unavailable.</p>
      ) : results.fixtures.length === 0 ? (
        <p className={styles.empty}>No imported races match these filters.</p>
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
                <div className={styles.cardBottom}>
                  <span>{fixture.source?.provider ?? "Imported F1 record"}</span>
                  <span className={styles.cardAction}>
                    {fixture.sessionCoverage.available > 0
                      ? `${fixture.sessionCoverage.available}/${fixture.sessionCoverage.total} sessions available`
                      : fixture.sessionCoverage.unavailable > 0
                        ? "Provider has no session detail"
                        : fixture.sessionCoverage.failed > 0
                          ? "Import retry scheduled"
                          : fixture.status === "scheduled"
                            ? "Weekend scheduled"
                            : "Summary available"}
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
