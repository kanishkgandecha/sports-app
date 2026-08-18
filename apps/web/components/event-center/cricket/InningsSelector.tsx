import type { CricketSession } from "../../../lib/cricketApi";
import styles from "./cricketEventCenter.module.css";

/** Human labels for the four innings a Session's `type` can be — see packages/domain/src/sports/cricket.ts's CricketSessionType. */
const INNINGS_LABEL: Record<string, string> = {
  "1ST_INNINGS": "1st Innings",
  "2ND_INNINGS": "2nd Innings",
  "3RD_INNINGS": "3rd Innings",
  "4TH_INNINGS": "4th Innings",
};

/**
 * Cricket's equivalent of F1's SessionSelector, but only as many tabs as
 * the format actually has — a T20/ODI fixture never grows a 3rd/4th tab
 * (only real Sessions ingestion has bootstrapped are ever shown, same
 * "no fabricated tabs" discipline as F1's).
 */
export function InningsSelector({
  sessions,
  activeSessionId,
  onSelect,
}: {
  sessions: CricketSession[];
  activeSessionId: string;
  onSelect: (sessionId: string) => void;
}) {
  return (
    <nav className={styles.inningsTabs} aria-label="Innings">
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId;
        return (
          <button
            key={session.id}
            type="button"
            className={`${styles.inningsTab} ${isActive ? styles.inningsTabActive : ""}`}
            aria-current={isActive ? "true" : undefined}
            onClick={() => onSelect(session.id)}
          >
            {INNINGS_LABEL[session.type] ?? session.type}
            {session.lifecycle === "live" && " ·"}
          </button>
        );
      })}
    </nav>
  );
}
