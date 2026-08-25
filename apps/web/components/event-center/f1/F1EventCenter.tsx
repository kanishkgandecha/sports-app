"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveSession } from "../../../lib/hooks/useLiveSession";
import {
  getF1PitStops,
  getF1RaceControl,
  getF1Timing,
  type F1Fixture,
  type F1PitStop,
  type F1RaceControlMessage,
  type F1Session,
  type F1TimingRow,
} from "../../../lib/f1Api";
import { FreshnessIndicator } from "../../FreshnessIndicator";
import { EducationTrigger, GlossaryDrawer } from "../../GlossaryDrawer";
import { SessionSelector } from "./SessionSelector";
import { TimingTower } from "./TimingTower";
import { RaceControlFeed } from "./RaceControlFeed";
import { PitStopList } from "./PitStopList";
import { StandingsPanel } from "./StandingsPanel";
import styles from "./f1EventCenter.module.css";

interface ListState<T> {
  items: T[];
  loading: boolean;
  error: boolean;
}

const IDLE_LIST: ListState<never> = { items: [], loading: true, error: false };

/** Prefers a currently-live session, else the most recently completed one, else the next upcoming one — otherwise the first session at all. */
function pickInitialSession(sessions: F1Session[]): F1Session | undefined {
  const live = sessions.find((s) => s.lifecycle === "live");
  if (live) return live;
  const completed = [...sessions].reverse().find((s) => s.lifecycle === "completed");
  if (completed) return completed;
  const upcoming = sessions.find((s) => s.lifecycle === "upcoming");
  return upcoming ?? sessions[0];
}

const REFETCH_DEBOUNCE_MS = 400;

/**
 * The F1 Event Center — session status → current session → live timing →
 * timing tower → race control → pit stops → education, in that visual
 * order and weight (§2's information hierarchy; see f1EventCenter.module.css
 * for how the timing tower dominates the layout).
 */
export function F1EventCenter({ fixture, sessions }: { fixture: F1Fixture; sessions: F1Session[] }) {
  const availableSessions = useMemo(
    () => sessions.filter((session) => session.detailAvailable || session.lifecycle === "live"),
    [sessions],
  );
  const [activeSessionId, setActiveSessionId] = useState(
    () => pickInitialSession(availableSessions)?.id ?? availableSessions[0]?.id,
  );
  const activeSession = availableSessions.find((s) => s.id === activeSessionId);

  const [timing, setTiming] = useState<ListState<F1TimingRow>>(IDLE_LIST);
  const [raceControl, setRaceControl] = useState<ListState<F1RaceControlMessage>>(IDLE_LIST);
  const [pitStops, setPitStops] = useState<ListState<F1PitStop>>(IDLE_LIST);
  const [initialFreshnessAt, setInitialFreshnessAt] = useState<string | null>(null);
  const [educationSlug, setEducationSlug] = useState<string | null>(null);

  const loadAll = useMemo(
    () => async (sessionId: string) => {
      const [timingResult, raceControlResult, pitResult] = await Promise.allSettled([
        getF1Timing(sessionId),
        getF1RaceControl(sessionId),
        getF1PitStops(sessionId),
      ]);

      if (timingResult.status === "fulfilled") {
        setTiming({ items: timingResult.value.timing, loading: false, error: false });
        setInitialFreshnessAt((prev) => prev ?? timingResult.value.freshness.updatedAt);
      } else {
        setTiming({ items: [], loading: false, error: true });
      }

      setRaceControl(
        raceControlResult.status === "fulfilled"
          ? { items: raceControlResult.value.messages, loading: false, error: false }
          : { items: [], loading: false, error: true },
      );

      setPitStops(
        pitResult.status === "fulfilled"
          ? { items: pitResult.value.pitStops, loading: false, error: false }
          : { items: [], loading: false, error: true },
      );
    },
    [],
  );

  useEffect(() => {
    if (!activeSessionId) return;
    setTiming(IDLE_LIST);
    setRaceControl(IDLE_LIST);
    setPitStops(IDLE_LIST);
    setInitialFreshnessAt(null);
    void loadAll(activeSessionId);
  }, [activeSessionId, loadAll]);

  // Coalesces bursts of LiveEvents (a single poll tick can produce many)
  // into one refetch shortly after they stop arriving, rather than
  // reconstructing table rows from event payloads client-side — that
  // normalization stays server-side (provider-boundary discipline carried
  // through from the adapter/ingestion checkpoints).
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function scheduleRefetch() {
    if (!activeSessionId) return;
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => void loadAll(activeSessionId), REFETCH_DEBOUNCE_MS);
  }
  useEffect(
    () => () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    },
    [],
  );

  const { freshness } = useLiveSession(activeSessionId ?? null, {
    isLive: activeSession?.lifecycle === "live",
    initialLastEventAt: initialFreshnessAt,
    onEvent: scheduleRefetch,
  });

  if (!activeSession) {
    return <p style={{ color: "var(--color-text-faint)" }}>This fixture has no sessions yet.</p>;
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.fixtureName}>{fixture.name}</h1>
            {fixture.venue && (
              <p className={styles.venue}>
                {fixture.venue.name}, {fixture.venue.country}
              </p>
            )}
          </div>
          <EducationTrigger label="New to F1?" onOpen={() => setEducationSlug("what-is-f1")} />
        </div>
        <div className={styles.statusRow}>
          <span className={styles.sessionLabel}>{activeSession.type.replace(/_/g, " ")}</span>
          <FreshnessIndicator state={freshness.state} updatedAt={freshness.updatedAt ?? new Date().toISOString()} />
        </div>
        <SessionSelector
          sessions={availableSessions}
          activeSessionId={activeSession.id}
          onSelect={setActiveSessionId}
        />
      </header>

      <div className={styles.mainGrid}>
        <section className={styles.section} aria-label="Timing">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Timing</h2>
          </div>
          <TimingTower rows={timing.items} loading={timing.loading} error={timing.error} />
        </section>

        <div className={styles.sidebar}>
          <section className={styles.section} aria-label="Race control">
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Race control</h2>
            </div>
            <RaceControlFeed
              messages={raceControl.items}
              loading={raceControl.loading}
              error={raceControl.error}
              onExplain={setEducationSlug}
            />
          </section>

          <section className={styles.section} aria-label="Pit stops">
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Pit stops</h2>
            </div>
            <PitStopList stops={pitStops.items} loading={pitStops.loading} error={pitStops.error} />
          </section>
        </div>
      </div>

      {/* Season-scoped, not session-scoped — see StandingsPanel's doc
          comment for why this sits outside .mainGrid's session-driven
          layout rather than inside the timing/sidebar split above. */}
      <StandingsPanel year={new Date(fixture.startTime).getFullYear()} onExplain={setEducationSlug} />

      {educationSlug && (
        <GlossaryDrawer slug={educationSlug} onClose={() => setEducationSlug(null)} onNavigate={setEducationSlug} />
      )}
    </div>
  );
}
