"use client";

import { useEffect, useState } from "react";

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
 * A live-updating countdown to a fixture/session's start — moved here from
 * `app/sports/f1/Countdown.tsx` in Cricket Checkpoint 3, the same "second
 * real consumer" trigger that moved `GlossaryDrawer`/`StateView` in
 * Cricket Checkpoint 2 (docs/CONTEXT.md). The logic (day/hour/minute
 * bucketing, "Live now" once the target passes, and — the part actually
 * worth not duplicating — rendering `—` until the first client tick to
 * avoid a server/client hydration mismatch on a value that depends on
 * "now") was already sport-agnostic; only its `f1Landing.module.css`
 * import was F1-specific. Callers supply their own `valueClassName` for
 * sizing/typography rather than this component assuming any — F1 and
 * Cricket's landing pages each keep their own visual language.
 *
 * Ticks once a minute, not every second: seconds-level precision would
 * churn far more than a "starts in 2d 4h" figure needs.
 */
export function Countdown({ targetIso, valueClassName }: { targetIso: string; valueClassName?: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [targetIso]);

  // `now` is null on the server/first client render — avoids a
  // hydration mismatch between server-rendered and client-rendered
  // "time until X", which would differ by however long the response took.
  if (now === null) return <span className={valueClassName}>—</span>;

  const remaining = new Date(targetIso).getTime() - now;
  return <span className={valueClassName}>{formatRemaining(remaining)}</span>;
}
