import { Big_Shoulders } from "next/font/google";

/**
 * Checkpoint 7 (F1 UI polish) — the first real display typeface this
 * product ships. `packages/design/src/tokens.ts`'s doc comment always
 * planned for this: "system stacks for now, deliberately... swap
 * --font-display here when [a licensed display face is chosen]; nothing
 * above this file should need to change." That's exactly what happens
 * below — this is the only file that names the actual typeface; every
 * heading across every sport already reads `var(--font-display)`.
 *
 * Big Shoulders: a condensed, high-contrast grotesk with real scoreboard/
 * timing-tower character — chosen for what a live sports product's
 * headings should feel like (dense, upright, built for numbers and short
 * labels), not a generic SaaS display face. Self-hosted via `next/font`
 * (no external font-CDN request at runtime, no CLS from a late-loading
 * webfont — the whole point of using `next/font` over a `<link>` tag).
 */
export const displayFont = Big_Shoulders({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-display-loaded",
  display: "swap",
});
