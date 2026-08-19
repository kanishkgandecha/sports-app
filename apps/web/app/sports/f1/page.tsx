import type { Metadata } from "next";
import Link from "next/link";
import {
  getF1ConstructorStandings,
  getF1DriverStandings,
  getF1Fixture,
  type F1ConstructorStanding,
  type F1DriverStanding,
  type F1Fixture,
  type F1Session,
} from "../../../lib/f1Api";
import { apiGet } from "../../../lib/api";
import { formatDate } from "../../../lib/format";
import styles from "./f1Landing.module.css";
import { Countdown } from "../../../components/Countdown";

export const metadata: Metadata = { title: "Formula 1 — Sports Platform" };

const SESSION_LABEL: Record<string, string> = {
  FP1: "FP1",
  FP2: "FP2",
  FP3: "FP3",
  QUALIFYING: "Qualifying",
  SPRINT_QUALIFYING: "Sprint Quali",
  SPRINT: "Sprint",
  RACE: "Race",
};

async function getFixtures(): Promise<F1Fixture[]> {
  try {
    const { fixtures } = await apiGet<{ fixtures: F1Fixture[] }>("/api/f1/fixtures");
    return fixtures;
  } catch {
    return [];
  }
}

/** Prefers a session that's currently live, else the nearest upcoming one, else the most recently completed — the single "what should I look at right now" answer for the hero. */
function pickFeaturedSession(sessions: F1Session[]): F1Session | undefined {
  const live = sessions.find((s) => s.lifecycle === "live");
  if (live) return live;
  const upcoming = [...sessions].filter((s) => s.lifecycle === "upcoming").sort((a, b) => a.startTime.localeCompare(b.startTime));
  if (upcoming[0]) return upcoming[0];
  return [...sessions].reverse().find((s) => s.lifecycle === "completed");
}

/**
 * `/sports/f1` — the main F1 entry point (Checkpoint 7). Hierarchy: hero
 * (current/next session + countdown) → this weekend's session strip →
 * championship snapshot → recent results → upcoming calendar → learn.
 * Deviates from the checkpoint brief's suggested order in one place
 * (results before the full calendar) — recent results are what a returning
 * fan actually wants first ("what did I miss"), the full calendar is a
 * reference list, not a headline; this reads better than the brief's
 * literal order without dropping any of its sections.
 */
export default async function F1LandingPage() {
  const fixtures = await getFixtures();

  const live = fixtures.filter((f) => f.status === "live");
  const upcoming = [...fixtures.filter((f) => f.status === "scheduled")].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const completed = [...fixtures.filter((f) => f.status === "completed")].sort((a, b) => b.startTime.localeCompare(a.startTime));

  const featuredFixture = live[0] ?? upcoming[0] ?? completed[0];
  const featuredDetail = featuredFixture ? await getF1Fixture(featuredFixture.id).catch(() => null) : null;
  const featuredSession = featuredDetail ? pickFeaturedSession(featuredDetail.sessions) : undefined;

  const year = new Date().getFullYear();
  const [driverStandingsResult, constructorStandingsResult] = await Promise.allSettled([
    getF1DriverStandings(year),
    getF1ConstructorStandings(year),
  ]);
  const driverStandings: F1DriverStanding[] =
    driverStandingsResult.status === "fulfilled" ? driverStandingsResult.value.standings.slice(0, 5) : [];
  const constructorStandings: F1ConstructorStanding[] =
    constructorStandingsResult.status === "fulfilled" ? constructorStandingsResult.value.standings.slice(0, 5) : [];

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <span className={styles.kicker}>Formula 1 · {year} season</span>
          {featuredFixture ? (
            <>
              <h1 className={styles.title}>{featuredFixture.name}</h1>
              <div className={styles.heroMeta}>
                {featuredSession && featuredSession.lifecycle !== "completed" && (
                  <div className={styles.countdown}>
                    <Countdown targetIso={featuredSession.startTime} valueClassName={styles.countdownValue} />
                    <span className={styles.countdownLabel}>
                      until {SESSION_LABEL[featuredSession.type] ?? featuredSession.type}
                    </span>
                  </div>
                )}
                {featuredFixture.venue && (
                  <span style={{ color: "var(--color-text-faint)", fontSize: "var(--font-size-sm)" }}>
                    {featuredFixture.venue.name}, {featuredFixture.venue.country}
                  </span>
                )}
                <Link href={`/events/${featuredFixture.id}`} className={styles.heroCta}>
                  Open Event Center →
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1 className={styles.title}>Formula 1</h1>
              <p style={{ color: "var(--color-text-faint)" }}>
                No F1 calendar loaded yet — start the ingestion worker (see README).
              </p>
            </>
          )}

          {featuredDetail && featuredDetail.sessions.length > 0 && (
            <div className={styles.sessionStrip} role="list" aria-label="This weekend's sessions">
              {featuredDetail.sessions.map((session) => (
                <div
                  key={session.id}
                  role="listitem"
                  className={`${styles.sessionCard} ${session.lifecycle === "live" ? styles.sessionCardLive : ""}`}
                >
                  <span className={styles.sessionCardType}>{SESSION_LABEL[session.type] ?? session.type}</span>
                  <span className={styles.sessionCardTime}>
                    {session.lifecycle === "live" ? "LIVE" : formatDate(session.startTime)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={styles.section} aria-label="Championship standings">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Championship snapshot</h2>
        </div>
        {driverStandings.length === 0 && constructorStandings.length === 0 ? (
          <p style={{ color: "var(--color-text-faint)", fontSize: "var(--font-size-sm)" }}>
            No standings synced yet — start the ingestion worker (see README).
          </p>
        ) : (
          <div className={styles.standingsGrid}>
            <div className={styles.standingsCard}>
              <div className={styles.standingsCardHeader}>Drivers</div>
              {driverStandings.map((s) => (
                <div className={styles.standingsRow} key={s.driver.id}>
                  <span className={styles.standingsPos}>{s.position}</span>
                  <span className={styles.standingsSwatch} style={{ background: s.team?.colorHex ?? "var(--color-border)" }} aria-hidden="true" />
                  <span className={styles.standingsName}>{s.driver.shortName ?? s.driver.name}</span>
                  <span className={styles.standingsPoints}>{s.points}</span>
                </div>
              ))}
            </div>
            <div className={styles.standingsCard}>
              <div className={styles.standingsCardHeader}>Constructors</div>
              {constructorStandings.map((s) => (
                <div className={styles.standingsRow} key={s.team.id}>
                  <span className={styles.standingsPos}>{s.position}</span>
                  <span className={styles.standingsSwatch} style={{ background: s.team.colorHex ?? "var(--color-border)" }} aria-hidden="true" />
                  <span className={styles.standingsName}>{s.team.name}</span>
                  <span className={styles.standingsPoints}>{s.points}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className={styles.section} aria-label="Recent results">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Recent results</h2>
        </div>
        {completed.length === 0 ? (
          <p style={{ color: "var(--color-text-faint)", fontSize: "var(--font-size-sm)" }}>No completed sessions yet.</p>
        ) : (
          <FixtureList fixtures={completed.slice(0, 5)} />
        )}
      </section>

      <section className={styles.section} aria-label="Upcoming calendar">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Upcoming calendar</h2>
        </div>
        {upcoming.length === 0 ? (
          <p style={{ color: "var(--color-text-faint)", fontSize: "var(--font-size-sm)" }}>No upcoming races loaded.</p>
        ) : (
          <FixtureList fixtures={upcoming.slice(0, 8)} />
        )}
      </section>

      <section className={styles.learnCard}>
        <div className={styles.learnCardText}>
          <span className={styles.learnCardTitle}>New to F1?</span>
          <p className={styles.learnCardBody}>
            Sessions, points, flags, Safety Cars — plain-language explanations, whenever you want
            them, never in your way.
          </p>
        </div>
        <Link href="/learn" className={styles.heroCta}>
          Learn F1 →
        </Link>
      </section>
    </>
  );
}

function FixtureList({ fixtures }: { fixtures: F1Fixture[] }) {
  return (
    <ul className={styles.fixtureList}>
      {fixtures.map((fixture) => (
        <li key={fixture.id}>
          <Link href={`/events/${fixture.id}`} className={styles.fixtureRow}>
            <span className={styles.fixtureName}>
              <span className={styles.fixtureNameText}>{fixture.name}</span>
              {fixture.venue && <span className={styles.fixtureVenue}>{fixture.venue.name}, {fixture.venue.country}</span>}
            </span>
            <span className={styles.fixtureDate}>{formatDate(fixture.startTime)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
