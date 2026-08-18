import type { DataFreshness } from "@sports/domain";

/**
 * Programmatic mirror of tokens.css, for the handful of cases JS needs a
 * raw value (animation timing in a JS-driven transition, etc.) rather than
 * a CSS variable. The CSS file is the source of truth for anything that can
 * stay in CSS.
 */
export const motion = {
  durationFast: 120,
  durationBase: 200,
  durationSlow: 400,
  easeStandard: "cubic-bezier(0.2, 0, 0, 1)",
} as const;

// Was independently redefined here in Phase 0 — the exact same union
// already lives in @sports/domain as `DataFreshness` (the type the API's
// freshness responses are actually typed with). Two definitions of "what
// freshness states exist" is precisely the kind of drift Checkpoint 5
// needed to not have while wiring real freshness end to end — aliased, not
// duplicated, from here on. Kept the local name (`DataFreshnessState`) so
// existing imports (FreshnessIndicator, LiveTicker) don't need to change.
export type DataFreshnessState = DataFreshness;

/** Maps a freshness state to the CSS token pair the FreshnessIndicator uses. */
export const freshnessTokens: Record<DataFreshnessState, { fg: string; bg: string; label: string }> = {
  live: { fg: "var(--color-live)", bg: "var(--color-live-soft)", label: "LIVE" },
  updated: { fg: "var(--color-accent)", bg: "var(--color-accent-soft)", label: "UPDATED" },
  delayed: { fg: "var(--color-delayed)", bg: "var(--color-delayed-soft)", label: "DELAYED" },
  offline: { fg: "var(--color-offline)", bg: "var(--color-offline-soft)", label: "OFFLINE" },
};
