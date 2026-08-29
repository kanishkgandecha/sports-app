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
    <div className={styles.sessionTabs} role="tablist" aria-label="Weekend sessions">
      {sessions.map((session, index) => {
        const isActive = session.id === activeSessionId;
        return (
          <button
            key={session.id}
            id={`session-tab-${session.id}`}
            type="button"
            role="tab"
            className={`${styles.sessionTab} ${isActive ? styles.sessionTabActive : ""}`}
            aria-selected={isActive}
            aria-controls={`session-panel-${session.id}`}
            tabIndex={isActive ? 0 : -1}
            data-lifecycle={session.lifecycle}
            onClick={() => onSelect(session.id)}
            onKeyDown={(event) => {
              const targetIndex = keyboardTargetIndex(event.key, index, sessions.length);
              if (targetIndex === null) return;
              event.preventDefault();
              const target = sessions[targetIndex];
              onSelect(target.id);
              document.getElementById(`session-tab-${target.id}`)?.focus();
            }}
          >
            <span className={styles.sessionTabLabel}>{SESSION_LABEL[session.type] ?? session.type}</span>
            <span className={styles.sessionTabStatus}>{sessionStatusLabel(session)}</span>
          </button>
        );
      })}
    </div>
  );
}

function keyboardTargetIndex(key: string, currentIndex: number, length: number): number | null {
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  if (key === "ArrowRight") return (currentIndex + 1) % length;
  if (key === "ArrowLeft") return (currentIndex - 1 + length) % length;
  return null;
}

function sessionStatusLabel(session: F1Session): string {
  if (session.lifecycle === "live") return "Live now";
  if (session.lifecycle === "upcoming") return "Scheduled";
  if (session.detailAvailable) return "Data ready";
  if (session.detailStatus === "upstream-unavailable") return "Unavailable";
  if (session.detailStatus === "importing") return "Importing";
  if (session.detailStatus === "failed") return "Retry queued";
  return "Summary only";
}
