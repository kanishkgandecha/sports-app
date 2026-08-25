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

/** Live countdown that delays its first value until hydration and ticks once a minute. */
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
