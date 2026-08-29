"use client";

import { useEffect } from "react";

const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const SHEET_ELEMENT_ID = "dynamic-team-colors";

// Tracks which selector→color rules have already been inserted into a given
// sheet, keyed by the sheet instance itself (not a plain module-level Map)
// so each independent stylesheet — the one persistent one in production,
// or a fresh one per test — gets its own bookkeeping. Comparing against a
// re-read `cssRules[].cssText` doesn't work reliably: browsers re-serialize
// an inserted rule (e.g. `#ff0000` becomes `rgb(255, 0, 0)`), so the literal
// string this component constructs almost never matches what reads back.
const insertedRulesBySheet = new WeakMap<CSSStyleSheet, Map<string, string>>();

/**
 * Escapes a value for safe use inside a CSS attribute-selector string
 * (`[data-team-dot="..."]`). Only backslash and double-quote need handling
 * for a CSS string literal; this is not a general CSS/HTML sanitizer.
 */
function escapeAttrValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Renders a team-color indicator without an inline `style` attribute.
 *
 * Phase 5 finding: apps/web's strict CSP (`style-src 'self' 'nonce-...'`,
 * no `unsafe-inline`) blocks every `style={{ background: colorHex }}` prop
 * in the codebase. Team color is raw third-party provider data (OpenF1's
 * `team_colour` field — see
 * packages/providers/f1/openf1/src/normalize/driver.ts and
 * docs/SECURITY.md's provider trust boundary), not a fixed set this app
 * can bake into a stylesheet at build time.
 *
 * A per-instance nonce'd `<style nonce={nonce}>` tag was tried first and
 * rejected: the CSP nonce a browser enforces is fixed to the *original*
 * full-page-load response. Client-side (`next/link`) navigation re-runs
 * this app's Server Components and generates a *fresh* nonce for that RSC
 * fetch's own (unused) response headers, but the element actually inserted
 * into the still-live DOM would carry that fresh nonce — which no longer
 * matches what the browser is enforcing, so the browser blocks it. This
 * broke real navigation between every route (confirmed via Phase 5 browser
 * QA: 0 console errors on a hard reload of an Event Center, 67 on clicking
 * an in-app `<Link>` to the same page). `script-src`'s `'strict-dynamic'`
 * avoids this exact problem for scripts (a trusted script may insert more
 * scripts regardless of nonce); there is no style-src equivalent.
 *
 * Fix: one nonce'd, initially-empty `<style id="dynamic-team-colors">` is
 * rendered once in the root layout (see app/layout.tsx), which Next never
 * re-renders on client-side navigation between these routes — so its nonce
 * always matches the one the browser is actually enforcing, for the whole
 * session. Every TeamColorDot instance appends its rule into that *same*
 * approved stylesheet via the CSSOM (`sheet.insertRule`) instead of
 * rendering a new `<style>` element of its own — CSP validates a `<style>`
 * element's nonce when it's inserted, not on every subsequent CSSOM
 * mutation of an already-approved sheet (the same mechanism CSS-in-JS
 * libraries such as styled-components/emotion use for "nonce" support).
 *
 * `colorHex` is validated against a strict hex-color shape before being
 * used — provider JSON is an untrusted boundary (docs/SECURITY.md), so a
 * malformed value falls back to the default border color instead of being
 * trusted verbatim.
 */
export function TeamColorDot({
  id,
  colorHex,
  className,
}: {
  /** Stable unique id for this row (e.g. driver or team id) — scopes the generated CSS rule to this instance only. */
  id: string;
  colorHex: string | null;
  className?: string;
}) {
  const color = colorHex && HEX_COLOR.test(colorHex) ? colorHex : "var(--color-border)";
  const selector = `[data-team-dot="${escapeAttrValue(id)}"]`;

  useEffect(() => {
    const sheet = (document.getElementById(SHEET_ELEMENT_ID) as HTMLStyleElement | null)?.sheet;
    if (!sheet) return;
    let known = insertedRulesBySheet.get(sheet);
    if (!known) {
      known = new Map();
      insertedRulesBySheet.set(sheet, known);
    }
    if (known.get(selector) === color) return; // already inserted with this exact color
    // A later rule with the same selector simply overrides an earlier,
    // stale one in the cascade — no need to find and delete it first, and
    // leaving it in place (rather than juggling shifting rule indices) is
    // harmless: the set of driver/team ids in a season is small and bounded.
    sheet.insertRule(`${selector}{background:${color}}`, sheet.cssRules.length);
    known.set(selector, color);
  }, [selector, color]);

  return <span className={className} data-team-dot={id} aria-hidden="true" />;
}
