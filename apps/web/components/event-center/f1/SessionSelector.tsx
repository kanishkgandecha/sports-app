import type { F1Session } from "../../../lib/f1Api";
import styles from "./f1EventCenter.module.css";

/** Human labels for the session types OpenF1Adapter normalizes to — see packages/providers/f1/openf1/src/sessionType.ts. */
const SESSION_LABEL: Record<string, string> = {
  FP1: "FP1",
  FP2: "FP2",
  FP3: "FP3",
  QUALIFYING: "Qualifying",
  SPRINT_QUALIFYING: "Sprint Quali",
  SPRINT: "Sprint",
  RACE: "Race",
};

/**
 * Only sessions that actually exist for this fixture are shown (§11) — a
 * Sprint weekend has different sessions than a normal one, and this never
 * renders a tab for one that isn't real. The current session is visually
 * obvious (filled, not just a subtle underline), not merely implied.
 */
export function SessionSelector({
  sessions,
  activeSessionId,
  onSelect,
}: {
  sessions: F1Session[];
  activeSessionId: string;
  onSelect: (sessionId: string) => void;
}) {
  return (
    <nav className={styles.sessionTabs} aria-label="Session">
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId;
        return (
          <button
            key={session.id}
            type="button"
            className={`${styles.sessionTab} ${isActive ? styles.sessionTabActive : ""}`}
            aria-current={isActive ? "true" : undefined}
            onClick={() => onSelect(session.id)}
          >
            {SESSION_LABEL[session.type] ?? session.type}
            {session.lifecycle === "live" && " ·"}
            {session.detailStatus === "upstream-unavailable" && " · unavailable"}
          </button>
        );
      })}
    </nav>
  );
}
