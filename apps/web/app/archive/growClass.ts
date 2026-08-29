import styles from "./archive.module.css";

const MAX_GROW_CLASS = 10;

/**
 * Phase 5 — maps a session count to one of the static `.grow1`…`.grow10`
 * classes in archive.module.css instead of an inline `style={{flexGrow}}`,
 * which the strict CSP style-src (no unsafe-inline) blocks. Clamped rather
 * than unbounded: see that stylesheet's comment for why 10 is a safe
 * ceiling for a single coverage-track segment. Kept out of page.tsx (a
 * Next.js App Router page file, which only recognizes a fixed set of
 * special exports) so it can be unit-tested as a plain module.
 */
export function growClass(count: number): string {
  const clamped = Math.min(Math.max(Math.round(count), 1), MAX_GROW_CLASS);
  return styles[`grow${clamped}`];
}
