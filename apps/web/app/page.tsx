import Link from "next/link";
import { apiGet } from "../lib/api";
import type { F1Fixture } from "../lib/f1Api";
import { ConceptChip } from "../components/ConceptChip";
import styles from "./home.module.css";

async function getF1Fixtures(): Promise<F1Fixture[]> {
  try {
    const { fixtures } = await apiGet<{ fixtures: F1Fixture[] }>("/api/f1/fixtures");
    return fixtures;
  } catch {
    // API not running yet — the shell still renders so design/education work
    // isn't blocked on the backend being up.
    return [];
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const PLANNED_SPORTS = [
  { name: "Cricket", slug: "cricket", pill: "Coming next", pillClass: "pillComingNext" as const, blurb: "Provider research underway — see Checkpoint 7." },
  { name: "Football", slug: "football", pill: "Planned", pillClass: "pillPlanned" as const, blurb: "After Cricket, per the fixed build order." },
  { name: "Esports", slug: "esports", pill: "Planned", pillClass: "pillPlanned" as const, blurb: "Esports World Cup coverage, last in the build order." },
];

/**
 * The home feed (Checkpoint 7 §"Live home feed"): LIVE / UPCOMING /
 * RESULTS, across all sports — today that means real F1 data in each
 * bucket and honest coming-soon cards for every other sport. Nothing here
 * fabricates Cricket/Football/Esports data to fill space.
 */
export default async function HomePage() {
  const fixtures = await getF1Fixtures();

  const live = fixtures.filter((f) => f.status === "live");
  const upcoming = [...fixtures.filter((f) => f.status === "scheduled")]
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, 5);
  const results = [...fixtures.filter((f) => f.status === "completed")]
    .sort((a, b) => b.startTime.localeCompare(a.startTime))
    .slice(0, 5);

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <span className={styles.eyebrow}>
            <span className={styles.eyebrowDot} aria-hidden="true" />
            Live sports, explained as they happen
          </span>
          <h1 className={styles.heroTitle}>Follow the race. Understand every moment.</h1>
          <p className={styles.heroLede}>
            Real-time Formula 1 — timing, race control, standings — with a plain-language
            explanation one tap away whenever something you don&apos;t recognize happens.
            Cricket, football, and esports follow the same way, one sport at a time.
          </p>
          <div className={styles.heroActions}>
            <Link href="/sports/f1" className={styles.buttonPrimary}>
              Open F1 →
            </Link>
            <Link href="/learn" className={styles.buttonSecondary}>
              New to live sports? Start here
            </Link>
          </div>
        </div>
      </section>

      {live.length > 0 && (
        <section className={styles.feedSection} aria-label="Live now">
          <div className={styles.feedHeader}>
            <h2 className={`${styles.feedTitle} ${styles.feedTitleLive}`}>Live now</h2>
            <span className={styles.feedCount}>{live.length}</span>
          </div>
          <FixtureList fixtures={live} showRelativeTime={false} />
        </section>
      )}

      <section className={styles.feedSection} aria-label="Upcoming">
        <div className={styles.feedHeader}>
          <h2 className={styles.feedTitle}>Upcoming</h2>
          <span className={styles.feedCount}>{upcoming.length}</span>
        </div>
        {upcoming.length === 0 ? (
          <p style={{ color: "var(--color-text-faint)", fontSize: "var(--font-size-sm)", margin: 0 }}>
            No upcoming F1 sessions loaded — start the ingestion worker (see README) to
            populate this from the calendar.
          </p>
        ) : (
          <FixtureList fixtures={upcoming} showRelativeTime />
        )}
      </section>

      <section className={styles.feedSection} aria-label="Recent results">
        <div className={styles.feedHeader}>
          <h2 className={styles.feedTitle}>Recent results</h2>
          <span className={styles.feedCount}>{results.length}</span>
        </div>
        {results.length === 0 ? (
          <p style={{ color: "var(--color-text-faint)", fontSize: "var(--font-size-sm)", margin: 0 }}>
            No completed F1 sessions loaded yet.
          </p>
        ) : (
          <FixtureList fixtures={results} showRelativeTime />
        )}
      </section>

      <section className={styles.feedSection} aria-label="All sports">
        <div className={styles.feedHeader}>
          <h2 className={styles.feedTitle}>All sports</h2>
        </div>
        <div className={styles.sportGrid}>
          <Link href="/sports/f1" className={`${styles.sportCard} ${styles.sportCardAvailable}`}>
            <span className={`${styles.pill} ${styles.pillLive}`}>Live</span>
            <span className={styles.sportCardTitle}>Formula 1</span>
            <p className={styles.sportCardMeta}>Timing, race control, standings — live.</p>
          </Link>
          {PLANNED_SPORTS.map((sport) => (
            <Link key={sport.slug} href={`/sports/${sport.slug}`} className={styles.sportCard}>
              <span className={`${styles.pill} ${styles[sport.pillClass]}`}>{sport.pill}</span>
              <span className={styles.sportCardTitle}>{sport.name}</span>
              <p className={styles.sportCardMeta}>{sport.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.educationTeaser}>
        <h2 className={styles.educationTeaserTitle}>New to live sports?</h2>
        <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
          Education is optional and contextual — it never blocks the live experience. Try it:
        </p>
        <ConceptChip slug="safety-car" label="Safety Car" />
      </section>
    </>
  );
}

function FixtureList({ fixtures, showRelativeTime }: { fixtures: F1Fixture[]; showRelativeTime: boolean }) {
  return (
    <ul className={styles.fixtureList}>
      {fixtures.map((fixture) => (
        <li key={fixture.id}>
          <Link href={`/events/${fixture.id}`} className={styles.fixtureRow}>
            <span className={styles.fixtureName}>
              <span className={styles.fixtureNameText}>{fixture.name}</span>
              {fixture.venue && <span className={styles.fixtureVenue}>{fixture.venue.name}, {fixture.venue.country}</span>}
            </span>
            <span className={styles.fixtureMeta}>
              {showRelativeTime && <span>{formatDate(fixture.startTime)}</span>}
              <span>{fixture.status.toUpperCase()}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
