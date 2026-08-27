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
import { formatDate, formatDateTime } from "../../../lib/format";
import styles from "./f1Landing.module.css";
import { Countdown } from "../../../components/Countdown";

export const metadata: Metadata = { title: "F1 Race Center" };

const SESSION_LABEL: Record<string, string> = {
  FP1: "FP1",
  FP2: "FP2",
  FP3: "FP3",
  QUALIFYING: "Qualifying",
  SPRINT_QUALIFYING: "Sprint Quali",
  SPRINT: "Sprint",
  RACE: "Race",
};

async function getFixtures(): Promise<{ fixtures: F1Fixture[]; unavailable: boolean }> {
  try {
    const results = await Promise.all([
      apiGet<{ fixtures: F1Fixture[] }>("/api/f1/fixtures?status=live&limit=5&order=desc"),
      apiGet<{ fixtures: F1Fixture[] }>("/api/f1/fixtures?status=scheduled&limit=8&order=asc"),
      apiGet<{ fixtures: F1Fixture[] }>("/api/f1/fixtures?status=completed&limit=6&order=desc"),
    ]);
    return { fixtures: results.flatMap((result) => result.fixtures), unavailable: false };
  } catch {
    return { fixtures: [], unavailable: true };
  }
}

/** Prefers a session that's currently live, else the nearest upcoming one, else the most recently completed — the single "what should I look at right now" answer for the hero. */
function pickFeaturedSession(sessions: F1Session[]): F1Session | undefined {
  const live = sessions.find((s) => s.lifecycle === "live");
  if (live) return live;
  const upcoming = [...sessions]
    .filter((s) => s.lifecycle === "upcoming")
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
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
  const fixtureResult = await getFixtures();
  const fixtures = fixtureResult.fixtures;

  const live = fixtures.filter((f) => f.status === "live");
  const upcoming = [...fixtures.filter((f) => f.status === "scheduled")].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );
  const completed = [...fixtures.filter((f) => f.status === "completed")].sort((a, b) =>
    b.startTime.localeCompare(a.startTime),
  );

  const featuredFixture = live[0] ?? upcoming[0] ?? completed[0];
  const featuredDetail = featuredFixture ? await getF1Fixture(featuredFixture.id).catch(() => null) : null;
  const featuredSession = featuredDetail ? pickFeaturedSession(featuredDetail.sessions) : undefined;
  const featuredHref = featuredFixture
    ? `/events/${featuredFixture.id}${featuredSession ? `?session=${featuredSession.id}` : ""}`
    : "/archive";

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
          <div className={styles.heroTopline}>
            <span className={styles.kicker}>Formula 1 · {year} season</span>
            {featuredFixture && (
              <span className={styles.statusPill} data-status={featuredFixture.status}>
                {fixtureStatusLabel(featuredFixture.status)}
              </span>
            )}
          </div>
          {featuredFixture ? (
            <>
              <h1 className={styles.title}>{featuredFixture.name}</h1>
              <p className={styles.heroSummary}>{heroSummary(featuredFixture.status, featuredSession)}</p>
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
                  <span className={styles.heroVenue}>
                    {featuredFixture.venue.name}, {featuredFixture.venue.country}
                  </span>
                )}
                <Link href={featuredHref} className={styles.heroCta}>
                  Open Event Center →
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1 className={styles.title}>Formula 1</h1>
              <p className={styles.emptyCopy}>
                {fixtureResult.unavailable
                  ? "The F1 calendar is temporarily unavailable. Please try again shortly."
                  : "No F1 calendar has been imported yet."}
              </p>
            </>
          )}

          {featuredDetail && featuredDetail.sessions.length > 0 && (
            <ol className={styles.sessionStrip} aria-label="This weekend's sessions">
              {featuredDetail.sessions.map((session) => (
                <li key={session.id}>
                  <Link
                    href={`/events/${featuredFixture.id}?session=${session.id}`}
                    className={`${styles.sessionCard} ${session.lifecycle === "live" ? styles.sessionCardLive : ""} ${session.id === featuredSession?.id ? styles.sessionCardActive : ""}`}
                    aria-current={session.id === featuredSession?.id ? "true" : undefined}
                  >
                    <span className={styles.sessionCardTopline}>
                      <span className={styles.sessionCardType}>{SESSION_LABEL[session.type] ?? session.type}</span>
                      <span className={styles.sessionCardArrow} aria-hidden="true">
                        →
                      </span>
                    </span>
                    <span className={styles.sessionCardTime}>{formatDateTime(session.startTime)}</span>
                    <span className={styles.sessionCardState}>{sessionStateLabel(session)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section className={styles.section} aria-label="Championship standings">
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionEyebrow}>{year} title race</span>
            <h2 className={styles.sectionTitle}>Championship snapshot</h2>
          </div>
        </div>
        {(driverStandingsResult.status === "rejected" || constructorStandingsResult.status === "rejected") &&
        driverStandings.length === 0 &&
        constructorStandings.length === 0 ? (
          <p className={styles.emptyCopy}>Championship standings are temporarily unavailable.</p>
        ) : driverStandings.length === 0 && constructorStandings.length === 0 ? (
          <p className={styles.emptyCopy}>No championship standings have been imported yet.</p>
        ) : (
          <div className={styles.standingsGrid}>
            <div className={styles.standingsCard}>
              <div className={styles.standingsCardHeader}>
                <span>Drivers</span>
                <span>PTS</span>
              </div>
              {driverStandings.map((s) => (
                <div className={styles.standingsRow} key={s.driver.id}>
                  <span className={styles.standingsPos}>{s.position}</span>
                  <span
                    className={styles.standingsSwatch}
                    style={{ background: s.team?.colorHex ?? "var(--color-border)" }}
                    aria-hidden="true"
                  />
                  <span className={styles.standingsName}>{s.driver.shortName ?? s.driver.name}</span>
                  <span className={styles.standingsPoints}>{s.points}</span>
                </div>
              ))}
            </div>
            <div className={styles.standingsCard}>
              <div className={styles.standingsCardHeader}>
                <span>Constructors</span>
                <span>PTS</span>
              </div>
              {constructorStandings.map((s) => (
                <div className={styles.standingsRow} key={s.team.id}>
                  <span className={styles.standingsPos}>{s.position}</span>
                  <span
                    className={styles.standingsSwatch}
                    style={{ background: s.team.colorHex ?? "var(--color-border)" }}
                    aria-hidden="true"
                  />
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
          <div>
            <span className={styles.sectionEyebrow}>What you missed</span>
            <h2 className={styles.sectionTitle}>Recent results</h2>
          </div>
          <Link href="/archive" className={styles.sectionLink}>
            Browse archive →
          </Link>
        </div>
        {completed.length === 0 ? (
          <p className={styles.emptyCopy}>No completed sessions yet.</p>
        ) : (
          <FixtureList fixtures={completed.slice(0, 5)} />
        )}
      </section>

      <section className={styles.section} aria-label="Upcoming calendar">
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionEyebrow}>Plan the next race</span>
            <h2 className={styles.sectionTitle}>Upcoming calendar</h2>
          </div>
        </div>
        {upcoming.length === 0 ? (
          <p className={styles.emptyCopy}>No upcoming races loaded.</p>
        ) : (
          <FixtureList fixtures={upcoming.slice(0, 8)} />
        )}
      </section>

      <section className={styles.learnCard}>
        <div className={styles.learnCardText}>
          <span className={styles.learnCardTitle}>New to F1?</span>
          <p className={styles.learnCardBody}>
            Sessions, points, flags, Safety Cars — plain-language explanations, whenever you want them, never in your
            way.
          </p>
        </div>
        <Link href="/learn" className={styles.heroCta}>
          Learn F1 →
        </Link>
      </section>
    </>
  );
}

function fixtureStatusLabel(status: string) {
  if (status === "live") return "Live weekend";
  if (status === "scheduled") return "Up next";
  return "Latest result";
}

function heroSummary(status: string, session: F1Session | undefined) {
  if (session?.lifecycle === "live") {
    return `${SESSION_LABEL[session.type] ?? session.type} is live now. Follow timing and race control as it happens.`;
  }
  if (status === "scheduled" && session) {
    return `${SESSION_LABEL[session.type] ?? session.type} is the next session. Open the weekend hub for the complete schedule.`;
  }
  return "Catch up with session results, lap pace, tyre strategy, and race-control context from the latest weekend.";
}

function sessionStateLabel(session: F1Session) {
  if (session.lifecycle === "live") return "Live now";
  if (session.lifecycle === "upcoming") return "Scheduled";
  if (session.detailStatus === "available") return "Results ready";
  if (session.detailStatus === "importing") return "Importing data";
  if (session.detailStatus === "upstream-unavailable") return "Summary only";
  return "Completed";
}

function FixtureList({ fixtures }: { fixtures: F1Fixture[] }) {
  return (
    <ul className={styles.fixtureList}>
      {fixtures.map((fixture) => (
        <li key={fixture.id}>
          <Link href={`/events/${fixture.id}`} className={styles.fixtureRow}>
            <FixtureRowContent fixture={fixture} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function FixtureRowContent({ fixture }: { fixture: F1Fixture }) {
  return (
    <>
      <span className={styles.fixtureName}>
        <span className={styles.fixtureNameText}>{fixture.name}</span>
        {fixture.venue && (
          <span className={styles.fixtureVenue}>
            {fixture.venue.name}, {fixture.venue.country}
          </span>
        )}
      </span>
      <span className={styles.fixtureDate}>{formatDate(fixture.startTime)}</span>
    </>
  );
}
