"use client";

import { useEffect, useState } from "react";
import styles from "./f1Landing.module.css";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Live now";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * A live-updating countdown to the next session's start — one of this
 * checkpoint's explicit "good motion" examples ("session transition"; a
 * countdown communicating real state, not decorative). Ticks once a
 * minute, not every second: seconds-level precision would churn far more
 * than a "starts in 2d 4h" figure needs and would fight
 * `font-variant-numeric: tabular-nums` for nothing — nobody reads a
 * countdown at second resolution three days out.
 */
export function Countdown({ targetIso }: { targetIso: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [targetIso]);

  // `now` is null on the server/first client render — avoids a
  // hydration mismatch between server-rendered and client-rendered
  // "time until X", which would differ by however long the response took.
  if (now === null) return <span className={styles.countdownValue}>—</span>;

  const remaining = new Date(targetIso).getTime() - now;
  return <span className={styles.countdownValue}>{formatRemaining(remaining)}</span>;
}
