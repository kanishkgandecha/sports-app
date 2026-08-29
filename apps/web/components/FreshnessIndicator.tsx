"use client";

import { useEffect, useState } from "react";
import { freshnessTokens, type DataFreshnessState } from "@sports/design";
import styles from "./FreshnessIndicator.module.css";

/**
 * The component every live surface must use instead of a bare "LIVE" label —
 * see ARCHITECTURE.md §2 and master brief §21: never represent stale data
 * as live. `updatedAt` re-renders on an interval so "UPDATED Ns AGO" keeps
 * counting without a new event arriving.
 */
export function FreshnessIndicator({ state, updatedAt }: { state: DataFreshnessState; updatedAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const tokens = freshnessTokens[state];
  const secondsAgo = Math.max(0, Math.round((now - new Date(updatedAt).getTime()) / 1000));
  const label = state === "live" && secondsAgo > 0 ? `LIVE · ${secondsAgo}s AGO` : tokens.label;

  return (
    <span className={styles.pill} data-state={state}>
      <span aria-hidden className={styles.dot} />
      {label}
    </span>
  );
}
