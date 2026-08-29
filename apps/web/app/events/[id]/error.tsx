"use client";

import styles from "./eventState.module.css";

/** Next.js route-segment error boundary — anything other than a genuine 404 (see page.tsx) lands here, not a browser alert. */
export default function EventError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className={styles.state} role="alert">
      <h1 className={styles.title}>Couldn&apos;t load this event</h1>
      <p className={styles.message}>The backend might be temporarily unavailable. Try again in a moment.</p>
      <button type="button" onClick={reset} className={styles.action}>
        Retry
      </button>
    </div>
  );
}
