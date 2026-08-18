"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveSession } from "../../../lib/hooks/useLiveSession";
import {
  getCricketEvents,
  getCricketInnings,
  getCricketScorecard,
  type CricketFixture,
  type CricketFixtureDetail,
  type CricketInnings,
  type CricketLiveEvent,
  type CricketScorecard,
  type CricketSession,
} from "../../../lib/cricketApi";
import { FreshnessIndicator } from "../../FreshnessIndicator";
import { EducationTrigger, GlossaryDrawer } from "../../GlossaryDrawer";
import { InningsSelector } from "./InningsSelector";
import { ScoreHeader } from "./ScoreHeader";
import { BattingCard } from "./BattingCard";
import { BowlingCard } from "./BowlingCard";
import { MatchEventFeed } from "./MatchEventFeed";
import styles from "./cricketEventCenter.module.css";

interface SingleState<T> {
  value: T;
  loading: boolean;
  error: boolean;
}

interface ListState<T> {
  items: T[];
  loading: boolean;
  error: boolean;
}

const IDLE_SINGLE: SingleState<null> = { value: null, loading: true, error: false };
const IDLE_LIST: ListState<never> = { items: [], loading: true, error: false };

const FORMAT_LABEL: Record<string, string> = { TEST: "Test", ODI: "ODI", T20: "T20" };

/** Prefers a currently-live innings, else the most recently completed one, else the next upcoming one — otherwise the first at all. Same policy as F1's pickInitialSession. */
function pickInitialSession(sessions: CricketSession[]): CricketSession | undefined {
  const live = sessions.find((s) => s.lifecycle === "live");
  if (live) return live;
  const completed = [...sessions].reverse().find((s) => s.lifecycle === "completed");
  if (completed) return completed;
  const upcoming = sessions.find((s) => s.lifecycle === "upcoming");
  return upcoming ?? sessions[0];
}

const REFETCH_DEBOUNCE_MS = 400;

/**
 * The Cricket Event Center — built on the same architecture as
 * F1EventCenter (session-scoped live data behind one `useLiveSession`
 * subscription, server-normalized responses only, StateView for every
 * loading/empty/error case) but a deliberately different visual language:
 * a scoreboard, not a timing tower. Score → innings switcher → batting/
 * bowling scorecards → match events → education, matching how a real
 * cricket broadcast graphic is read, not F1's dense live-sorted grid.
 */
export function CricketEventCenter({
  fixture,
  sessions,
  detail,
}: {
  fixture: CricketFixture;
  sessions: CricketSession[];
  detail: CricketFixtureDetail | null;
}) {
  const [activeSessionId, setActiveSessionId] = useState(() => pickInitialSession(sessions)?.id ?? sessions[0]?.id);
  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const [innings, setInnings] = useState<SingleState<CricketInnings | null>>(IDLE_SINGLE);
  const [scorecard, setScorecard] = useState<SingleState<CricketScorecard | null>>(IDLE_SINGLE);
  const [events, setEvents] = useState<ListState<CricketLiveEvent>>(IDLE_LIST);
  const [initialFreshnessAt, setInitialFreshnessAt] = useState<string | null>(null);
  const [educationSlug, setEducationSlug] = useState<string | null>(null);

  const loadAll = useMemo(
    () => async (sessionId: string) => {
      const [inningsResult, scorecardResult, eventsResult] = await Promise.allSettled([
        getCricketInnings(sessionId),
        getCricketScorecard(sessionId),
        getCricketEvents(sessionId),
      ]);

      if (inningsResult.status === "fulfilled") {
        setInnings({ value: inningsResult.value.innings, loading: false, error: false });
        setInitialFreshnessAt((prev) => prev ?? inningsResult.value.freshness.updatedAt);
      } else {
        setInnings({ value: null, loading: false, error: true });
      }

      setScorecard(
        scorecardResult.status === "fulfilled"
          ? { value: scorecardResult.value.scorecard, loading: false, error: false }
          : { value: null, loading: false, error: true },
      );

      setEvents(
        eventsResult.status === "fulfilled"
          ? { items: eventsResult.value.events, loading: false, error: false }
          : { items: [], loading: false, error: true },
      );
    },
    [],
  );

  useEffect(() => {
    if (!activeSessionId) return;
    setInnings(IDLE_SINGLE);
    setScorecard(IDLE_SINGLE);
    setEvents(IDLE_LIST);
    setInitialFreshnessAt(null);
    void loadAll(activeSessionId);
  }, [activeSessionId, loadAll]);

  // Same coalescing rationale as F1EventCenter — a poll tick can write
  // several LiveEvents at once; refetch once shortly after they stop,
  // rather than reconstructing score/scorecard state from event payloads
  // client-side (that normalization stays server-side).
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function scheduleRefetch() {
    if (!activeSessionId) return;
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => void loadAll(activeSessionId), REFETCH_DEBOUNCE_MS);
  }
  useEffect(() => () => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
  }, []);

  // The existing, sport-agnostic live-data boundary — same hook, same
  // `/api/sessions/:id/stream` endpoint F1 uses. Nothing Cricket-specific
  // here; a Session's live-ness and this hook's contract don't know or
  // care which sport a session belongs to.
  const { freshness } = useLiveSession(activeSessionId ?? null, {
    isLive: activeSession?.lifecycle === "live",
    initialLastEventAt: initialFreshnessAt,
    onEvent: scheduleRefetch,
  });

  if (!activeSession) {
    return <p style={{ color: "var(--color-text-faint)" }}>This fixture has no innings yet.</p>;
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.fixtureName}>{fixture.name}</h1>
            {fixture.venue && (
              <p className={styles.venue}>
                {fixture.venue.name}
                {fixture.venue.country ? `, ${fixture.venue.country}` : ""}
              </p>
            )}
          </div>
          <EducationTrigger label="New to cricket?" onOpen={() => setEducationSlug("what-is-cricket")} />
        </div>

        <div className={styles.statusRow}>
          <FreshnessIndicator state={freshness.state} updatedAt={freshness.updatedAt ?? new Date().toISOString()} />
          {detail?.format && (
            <span className={styles.formatBadge}>
              {FORMAT_LABEL[detail.format] ?? detail.format}{" "}
              <EducationTrigger label="What's this?" onOpen={() => setEducationSlug("match-format")} />
            </span>
          )}
          {detail?.tossWonByTeam && detail.tossDecision && (
            <span className={styles.tossLine}>
              {detail.tossWonByTeam.name} won the toss, chose to {detail.tossDecision === "BAT" ? "bat" : "bowl"}{" "}
              <EducationTrigger label="What's the toss?" onOpen={() => setEducationSlug("toss")} />
            </span>
          )}
          {detail?.result && <span className={styles.tossLine}>{detail.result}</span>}
        </div>

        <InningsSelector sessions={sessions} activeSessionId={activeSession.id} onSelect={setActiveSessionId} />
      </header>

      <ScoreHeader innings={innings.value} scorecard={scorecard.value} loading={innings.loading} error={innings.error} />

      <div className={styles.mainGrid}>
        <div className={styles.scorecardStack}>
          <section className={styles.section} aria-label="Batting">
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Batting</h2>
              <EducationTrigger label="What's an innings?" onOpen={() => setEducationSlug("innings")} />
            </div>
            <BattingCard rows={scorecard.value?.batting ?? []} loading={scorecard.loading} error={scorecard.error} />
          </section>

          <section className={styles.section} aria-label="Bowling">
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Bowling</h2>
              <EducationTrigger label="What's an over?" onOpen={() => setEducationSlug("over")} />
            </div>
            <BowlingCard rows={scorecard.value?.bowling ?? []} loading={scorecard.loading} error={scorecard.error} />
          </section>
        </div>

        <section className={styles.section} aria-label="Match events">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Match events</h2>
          </div>
          <MatchEventFeed events={events.items} loading={events.loading} error={events.error} onExplain={setEducationSlug} />
        </section>
      </div>

      {educationSlug && (
        <GlossaryDrawer slug={educationSlug} onClose={() => setEducationSlug(null)} onNavigate={setEducationSlug} />
      )}
    </div>
  );
}
