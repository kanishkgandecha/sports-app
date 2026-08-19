import type { Metadata } from "next";
import Link from "next/link";
import {
  getCricketFixture,
  getCricketFixtures,
  getCricketInnings,
  type CricketFixture,
  type CricketFreshness,
  type CricketInnings,
} from "../../../lib/cricketApi";
import { formatDate, formatDateTime, venueLine } from "../../../lib/format";
import { FreshnessIndicator } from "../../../components/FreshnessIndicator";
import { ConceptChip } from "../../../components/ConceptChip";
import { Countdown } from "../../../components/Countdown";
import styles from "./cricketLanding.module.css";

export const metadata: Metadata = { title: "Cricket — Sports Platform" };

interface FixturesResult {
  fixtures: CricketFixture[];
  /** Distinguishes "reachable API, genuinely zero fixtures" from "API unreachable" — item 8's two different empty states need different copy, not one collapsed "nothing here." */
  ok: boolean;
}

async function getFixtures(): Promise<FixturesResult> {
  try {
    const { fixtures } = await getCricketFixtures();
    return { fixtures, ok: true };
  } catch {
    return { fixtures: [], ok: false };
  }
}

interface LiveMatch {
  fixture: CricketFixture;
  innings: CricketInnings | null;
  freshness: CricketFreshness | null;
}

/**
 * For live fixtures only (typically zero, occasionally one or two) —
 * resolves each one's currently-live innings score. Bounded by how many
 * matches are genuinely live right now, not by total fixture count, and
 * reads only `apps/api` (Postgres) — this spends zero CricketData.org
 * requests; see docs/CONTEXT.md's Cricket Checkpoint 3 section for why
 * this isn't folded into a single aggregate endpoint.
 */
async function getLiveMatches(liveFixtures: CricketFixture[]): Promise<LiveMatch[]> {
  return Promise.all(
    liveFixtures.map(async (fixture): Promise<LiveMatch> => {
      try {
        const detail = await getCricketFixture(fixture.id);
        // A fixture can (rarely) have more than one session that currently
        // classifies as "live" — a completed innings whose `endTime` ingestion
        // hasn't written yet still reads as live for up to
        // CRICKET_MAX_SESSION_DURATION_MS (12h) after its own start, and the
        // next innings' session may already have started by then. The most
        // recently *started* live session is the real current one; an
        // unqualified `.find()` would return whichever comes first in
        // `sessions` (ascending start time) — the stale one. Found via
        // real-review, not hypothetical: docs/CONTEXT.md's Cricket
        // Checkpoint 3 section records this as a genuine bug fix.
        const liveSession = [...detail.sessions]
          .filter((s) => s.lifecycle === "live")
          .sort((a, b) => b.startTime.localeCompare(a.startTime))[0];
        if (!liveSession) return { fixture, innings: null, freshness: null };
        const { innings, freshness } = await getCricketInnings(liveSession.id);
        return { fixture, innings, freshness };
      } catch {
        return { fixture, innings: null, freshness: null };
      }
    }),
  );
}

/**
 * `/sports/cricket` — Cricket Checkpoint 3. Same architectural shape as
 * `/sports/f1` (server component, one `/api/cricket/fixtures` call,
 * grouped client-side by real `Fixture.status`) but a deliberately
 * different visual read: scoreboard-first, not session-strip-first — see
 * cricketLanding.module.css's header comment. Hierarchy: hero (live score,
 * or next match + countdown, or latest result — whichever is genuinely
 * true right now) → live matches → up next → recent results → learn
 * entry point. No competition/standings snapshot section (unlike F1's
 * championship snapshot) — Cricket has no standings data yet (points-table
 * remains unverified, per Cricket Checkpoint 1's and 2's known-limitations
 * sections in docs/CONTEXT.md), and this checkpoint's own scope explicitly
 * excludes adding it.
 */
export default async function CricketLandingPage() {
  const { fixtures, ok } = await getFixtures();

  const live = fixtures.filter((f) => f.status === "live");
  const upcoming = [...fixtures.filter((f) => f.status === "scheduled")].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const recent = [...fixtures.filter((f) => f.status === "completed")].sort((a, b) => b.startTime.localeCompare(a.startTime));

  const liveMatches = live.length > 0 ? await getLiveMatches(live) : [];
  const featuredLive = liveMatches[0];
  const featuredUpcoming = upcoming[0];
  const featuredRecent = recent[0];

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <span className={styles.kicker}>Cricket</span>

          {!ok ? (
            <>
              <h1 className={styles.title}>Cricket</h1>
              <p className={styles.heroUnavailable}>
                Cricket data is temporarily unavailable — the API couldn&apos;t be reached. Try
                again shortly.
              </p>
            </>
          ) : featuredLive ? (
            <HeroLive match={featuredLive} />
          ) : featuredUpcoming ? (
            <HeroUpcoming fixture={featuredUpcoming} />
          ) : featuredRecent ? (
            <HeroRecent fixture={featuredRecent} />
          ) : (
            <>
              <h1 className={styles.title}>Cricket</h1>
              <p className={styles.heroUnavailable}>
                No Cricket fixtures loaded yet — start the ingestion worker (see README) to
                populate this from the calendar.
              </p>
            </>
          )}
        </div>
      </section>

      {ok && (
        <>
          <section className={styles.section} aria-label="Live now">
            <div className={styles.sectionHeader}>
              <h2 className={`${styles.sectionTitle} ${styles.sectionTitleLive}`}>Live now</h2>
            </div>
            {liveMatches.length === 0 ? (
              <p className={styles.emptyState}>No cricket matches are live right now.</p>
            ) : (
              <div className={styles.liveGrid}>
                {liveMatches.map((match) => (
                  <LiveMatchCard key={match.fixture.id} match={match} />
                ))}
              </div>
            )}
          </section>

          <section className={styles.section} aria-label="Up next">
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Up next</h2>
            </div>
            {upcoming.length === 0 ? (
              <p className={styles.emptyState}>No upcoming Cricket fixtures loaded.</p>
            ) : (
              <FixtureList fixtures={upcoming.slice(0, 6)} kind="upcoming" />
            )}
          </section>

          <section className={styles.section} aria-label="Recent results">
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Recent results</h2>
            </div>
            {recent.length === 0 ? (
              <p className={styles.emptyState}>No completed Cricket matches yet.</p>
            ) : (
              <FixtureList fixtures={recent.slice(0, 6)} kind="completed" />
            )}
          </section>
        </>
      )}

      <section className={styles.learnCard}>
        <div className={styles.learnCardText}>
          <span className={styles.learnCardTitle}>New to cricket?</span>
          <p className={styles.learnCardBody}>
            Innings, overs, wickets, run rate — plain-language explanations, whenever you want
            them, never in your way.
          </p>
        </div>
        <ConceptChip slug="what-is-cricket" label="What is cricket?" />
      </section>
    </>
  );
}

/** The scoreboard hero — the "live/current" state (item 6). */
function HeroLive({ match }: { match: LiveMatch }) {
  const { fixture, innings, freshness } = match;
  return (
    <>
      <div className={styles.heroStatusRow}>
        <span className={styles.liveBadge}>
          <span className={styles.liveDot} aria-hidden="true" />
          LIVE
        </span>
        {freshness && <FreshnessIndicator state={freshness.state} updatedAt={freshness.updatedAt ?? new Date().toISOString()} />}
      </div>
      <h1 className={styles.title}>{fixture.name}</h1>
      {fixture.competition && <p className={styles.heroCompetition}>{fixture.competition.name}</p>}
      {innings ? (
        <div className={styles.heroScoreboard}>
          <span className={styles.heroTeam}>{innings.battingTeam.name}</span>
          <span className={styles.heroScore}>
            {innings.runs}/{innings.wickets}
          </span>
          <span className={styles.heroOvers}>{innings.overs.toFixed(1)} overs</span>
        </div>
      ) : (
        <p className={styles.heroUnavailable}>
          This match is live, but no score has been captured yet — check back shortly.
        </p>
      )}
      <Link href={`/events/${fixture.id}`} className={styles.heroCta}>
        Open Event Center →
      </Link>
    </>
  );
}

/** The "next match, and when" state — a countdown is meaningful and truthful here (item 6, "upcoming"). */
function HeroUpcoming({ fixture }: { fixture: CricketFixture }) {
  return (
    <>
      <span className={styles.upcomingBadge}>UPCOMING</span>
      <h1 className={styles.title}>{fixture.name}</h1>
      {fixture.competition && <p className={styles.heroCompetition}>{fixture.competition.name}</p>}
      <div className={styles.heroMeta}>
        <div className={styles.countdown}>
          <Countdown targetIso={fixture.startTime} valueClassName={styles.countdownValue} />
          <span className={styles.countdownLabel}>until start</span>
        </div>
        {venueLine(fixture.venue) && <span className={styles.heroVenue}>{venueLine(fixture.venue)}</span>}
        <Link href={`/events/${fixture.id}`} className={styles.heroCta}>
          Open Event Center →
        </Link>
      </div>
    </>
  );
}

/** No live match, nothing upcoming loaded — the latest real result is the honest "what should I look at" answer (item 6, "completed/result"). */
function HeroRecent({ fixture }: { fixture: CricketFixture }) {
  return (
    <>
      <span className={styles.completedBadge}>LATEST RESULT</span>
      <h1 className={styles.title}>{fixture.name}</h1>
      {fixture.competition && <p className={styles.heroCompetition}>{fixture.competition.name}</p>}
      <div className={styles.heroMeta}>
        <span className={styles.heroVenue}>{formatDate(fixture.startTime)}</span>
        <Link href={`/events/${fixture.id}`} className={styles.heroCta}>
          Open Event Center →
        </Link>
      </div>
    </>
  );
}

function LiveMatchCard({ match }: { match: LiveMatch }) {
  const { fixture, innings, freshness } = match;
  return (
    <Link href={`/events/${fixture.id}`} className={styles.liveCard}>
      <div className={styles.liveCardHeader}>
        <span className={styles.liveBadgeSmall}>
          <span className={styles.liveDot} aria-hidden="true" />
          LIVE
        </span>
        {freshness && <FreshnessIndicator state={freshness.state} updatedAt={freshness.updatedAt ?? new Date().toISOString()} />}
      </div>
      <span className={styles.liveCardName}>{fixture.name}</span>
      {fixture.competition && <span className={styles.liveCardCompetition}>{fixture.competition.name}</span>}
      {innings ? (
        <div className={styles.liveCardScore}>
          <span className={styles.liveCardTeam}>{innings.battingTeam.name}</span>
          <span className={styles.liveCardDigits}>
            {innings.runs}/{innings.wickets}
            <span className={styles.liveCardOvers}> ({innings.overs.toFixed(1)} ov)</span>
          </span>
        </div>
      ) : (
        <p className={styles.liveCardUnavailable}>No score captured yet.</p>
      )}
    </Link>
  );
}

function FixtureList({ fixtures, kind }: { fixtures: CricketFixture[]; kind: "upcoming" | "completed" }) {
  return (
    <ul className={styles.fixtureList}>
      {fixtures.map((fixture) => {
        const venue = venueLine(fixture.venue);
        return (
          <li key={fixture.id}>
            <Link href={`/events/${fixture.id}`} className={styles.fixtureRow}>
              <span className={styles.fixtureMain}>
                <span className={styles.fixtureNameText}>{fixture.name}</span>
                <span className={styles.fixtureSub}>
                  {fixture.competition && <span className={styles.fixtureCompetition}>{fixture.competition.name}</span>}
                  {/* The separator only renders between two real values — never a dangling "·" when a fixture has a competition but no venue (Fixture.venueId is nullable, competitionId isn't). */}
                  {fixture.competition && venue && <span aria-hidden="true"> · </span>}
                  {venue && <span className={styles.fixtureVenue}>{venue}</span>}
                </span>
              </span>
              <span className={styles.fixtureMeta}>
                <span className={styles.fixtureDate}>{formatDateTime(fixture.startTime)}</span>
                <span className={kind === "upcoming" ? styles.upcomingBadge : styles.completedBadge}>
                  {kind === "upcoming" ? "UPCOMING" : "COMPLETED"}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
