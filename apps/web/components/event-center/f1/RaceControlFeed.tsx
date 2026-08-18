import type { F1RaceControlMessage } from "../../../lib/f1Api";
import { StateView } from "../StateView";
import { EducationTrigger } from "./GlossaryDrawer";
import styles from "./f1EventCenter.module.css";

/** Only categories with a real seeded education concept get a chip — see content/education/f1/. */
const EDUCATION_SLUG: Record<string, string> = {
  safety_car: "safety-car",
  vsc: "vsc",
  red_flag: "red-flag",
  flag: "what-is-a-flag",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * Real backend data only (§9) — every row here is a `RaceControlMessage`
 * row `apps/ingestion` wrote from a normalized `LiveEvent`, never invented
 * client-side.
 */
export function RaceControlFeed({
  messages,
  loading,
  error,
  onExplain,
}: {
  messages: F1RaceControlMessage[];
  loading: boolean;
  error: boolean;
  onExplain: (slug: string) => void;
}) {
  if (loading) return <StateView kind="loading">Loading race control…</StateView>;
  if (error) return <StateView kind="error">Race control feed isn&apos;t available right now.</StateView>;
  if (messages.length === 0) {
    return <StateView kind="empty">No race control messages yet.</StateView>;
  }

  return (
    <ol className={styles.raceControlList}>
      {messages.map((m) => {
        const slug = EDUCATION_SLUG[m.category];
        return (
          <li key={m.id} className={styles.raceControlItem} data-category={m.category}>
            <span className={styles.raceControlTime}>{formatTime(m.timestamp)}</span>
            <div className={styles.raceControlBody}>
              <span className={styles.raceControlMessage}>{m.message}</span>
              {slug && <EducationTrigger label="What does this mean?" onOpen={() => onExplain(slug)} />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
