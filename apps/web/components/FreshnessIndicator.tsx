"use client";

import { useEffect, useState } from "react";
import { freshnessTokens, type DataFreshnessState } from "@sports/design";

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
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
        fontFamily: "var(--font-data)",
        fontSize: "var(--font-size-xs)",
        fontWeight: 700,
        letterSpacing: "0.04em",
        padding: "3px var(--space-2)",
        borderRadius: "var(--radius-full)",
        color: tokens.fg,
        background: tokens.bg,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: tokens.fg,
        }}
      />
      {label}
    </span>
  );
}
