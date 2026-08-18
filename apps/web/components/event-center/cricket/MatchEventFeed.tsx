import type { CricketLiveEvent } from "../../../lib/cricketApi";
import { StateView } from "../StateView";
import { EducationTrigger } from "../../GlossaryDrawer";
import styles from "./cricketEventCenter.module.css";

/** Only event types with a real seeded education concept get a chip — see content/education/cricket/. */
const EDUCATION_SLUG: Record<string, string> = {
  WICKET: "wicket",
  SCORE_UPDATE: "run-rate",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function num(payload: Record<string, unknown>, key: string): number | null {
  const v = payload[key];
  return typeof v === "number" ? v : null;
}

function str(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  return typeof v === "string" ? v : null;
}

/**
 * Turns a raw `LiveEvent.payload` (shaped by `ScoreUpdatePayload` /
 * `WicketPayload` / `MatchStatusPayload` / `BallPayload` —
 * packages/domain/src/sports/cricket.ts) into a readable line, entirely
 * from fields that are actually present. Reads defensively (payload is
 * untyped JSON from Postgres by the time it reaches here) rather than
 * assuming a shape and crashing on whichever event type shows up in
 * practice — `SCORE_UPDATE`/`WICKET`/`MATCH_STATUS` are the reliably
 * populated ones (Checkpoint 1 §2); `BALL` has never been observed with
 * real data, so it's handled the same defensive way rather than assumed
 * to always carry every field.
 */
function formatMessage(event: CricketLiveEvent): string {
  const p = event.payload;
  switch (event.eventType) {
    case "WICKET": {
      const wickets = num(p, "wickets");
      const overs = num(p, "overs");
      const dismissal = str(p, "dismissalText");
      const suffix = wickets !== null ? ` — ${wickets} down${overs !== null ? ` (${overs} overs)` : ""}` : "";
      return `Wicket!${dismissal ? ` ${dismissal}` : ""}${suffix}`;
    }
    case "SCORE_UPDATE": {
      const runs = num(p, "runs");
      const wickets = num(p, "wickets");
      const overs = num(p, "overs");
      const deltaRuns = num(p, "deltaRuns");
      const lead = deltaRuns !== null ? `${deltaRuns >= 0 ? "+" : ""}${deltaRuns} runs` : "Score updated";
      const score = runs !== null && wickets !== null ? ` — ${runs}/${wickets}${overs !== null ? ` (${overs} overs)` : ""}` : "";
      return `${lead}${score}`;
    }
    case "MATCH_STATUS": {
      return str(p, "status") ?? "Match status updated";
    }
    case "BALL": {
      const over = num(p, "over");
      const ballInOver = num(p, "ballInOver");
      const runs = num(p, "runs");
      const label = over !== null && ballInOver !== null ? `Over ${over}.${ballInOver}` : "Ball";
      return `${label}${runs !== null ? `: ${runs} run${runs === 1 ? "" : "s"}` : ""}`;
    }
    default:
      return event.eventType;
  }
}

/**
 * Cricket's ball-by-ball/match-event feed — reads `LiveEvent` directly
 * (see apps/api/src/routes/cricket.ts's `/events` route doc comment for
 * why this has no dedicated derived table the way F1's race control
 * does). Visually its own thing, not RaceControlFeed re-skinned: category
 * colored left-border keyed to WICKET/MATCH_STATUS/SCORE_UPDATE, matching
 * this sport's actual event vocabulary rather than F1's flag/VSC/safety-car
 * one.
 */
export function MatchEventFeed({
  events,
  loading,
  error,
  onExplain,
}: {
  events: CricketLiveEvent[];
  loading: boolean;
  error: boolean;
  onExplain: (slug: string) => void;
}) {
  if (loading) return <StateView kind="loading">Loading match events…</StateView>;
  if (error) return <StateView kind="error">Match events aren&apos;t available right now.</StateView>;
  if (events.length === 0) return <StateView kind="empty">No match events yet.</StateView>;

  return (
    <ol className={styles.eventList}>
      {events.map((event) => {
        const slug = EDUCATION_SLUG[event.eventType];
        return (
          <li key={event.id} className={styles.eventItem} data-category={event.eventType}>
            <span className={styles.eventTime}>{formatTime(event.timestamp)}</span>
            <div className={styles.eventBody}>
              <span className={styles.eventMessage}>{formatMessage(event)}</span>
              {slug && <EducationTrigger label="What does this mean?" onOpen={() => onExplain(slug)} />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
