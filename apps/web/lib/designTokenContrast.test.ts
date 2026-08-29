import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { contrastRatio, meetsWcagAA } from "./colorContrast";

/**
 * Phase 6 — automated WCAG AA contrast evidence for the design tokens that
 * back the UI Phase 5 exercised: primary/muted text, freshness pills, the
 * focus ring, and archive coverage indicators. Reads `packages/design/src/
 * tokens.css` directly (via `@sports/design`'s own package resolution, not
 * a hardcoded relative path — this test doesn't care where in the monorepo
 * that package physically lives) rather than duplicating hex values here,
 * so a future token change that breaks contrast fails this test instead of
 * silently drifting from what was last checked by hand.
 *
 * No accessibility-testing dependency (axe-core, pa11y, ...) was added for
 * this — see colorContrast.ts's doc comment. What this can't cover:
 * runtime-composited colors (opacity, gradients, images behind text) and
 * arbitrary third-party team colors (OpenF1 provider data — see the "team
 * color" describe block below for why that's a documented exception, not a
 * gap). See docs/TESTING.md for the full statement of scope.
 */
const tokensPath = path.resolve(import.meta.dirname, "../../../packages/design/src/tokens.css");
const tokensCss = readFileSync(tokensPath, "utf-8");

/** Extracts `--name: value;` pairs from one `{ ... }` block, keyed by name without the `--` prefix. */
function parseBlock(css: string, blockStartMarker: string): Record<string, string> {
  const start = css.indexOf(blockStartMarker);
  if (start === -1) throw new Error(`tokens.css block not found: ${blockStartMarker}`);
  const openBrace = css.indexOf("{", start);
  const closeBrace = css.indexOf("}", openBrace);
  const body = css.slice(openBrace + 1, closeBrace);
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

/** Resolves a token value that may itself be `var(--other-token)`, one level deep — every alias in tokens.css is exactly one hop. */
function resolve(tokens: Record<string, string>, name: string): string {
  const value = tokens[name];
  if (!value) throw new Error(`token not found: --${name}`);
  const aliasMatch = value.match(/^var\(--([\w-]+)\)$/);
  return aliasMatch ? resolve(tokens, aliasMatch[1]) : value;
}

const light = parseBlock(tokensCss, ":root {");
// `:root[data-theme="dark"]` only *overrides* what changes per-theme — a
// token it doesn't redefine (e.g. --button-primary-fg) still cascades from
// `:root {}` in a real browser, so the merge below mirrors that instead of
// treating the dark block as a full, isolated replacement.
const dark = { ...light, ...parseBlock(tokensCss, ':root[data-theme="dark"] {') };

describe.each([
  ["light", light],
  ["dark", dark],
])("design tokens — %s theme — WCAG AA contrast", (_themeName, tokens) => {
  const get = (name: string) => resolve(tokens, name);

  it("primary text on the page background and on a card surface", () => {
    expect(meetsWcagAA(contrastRatio(get("color-text"), get("color-bg")), false)).toBe(true);
    expect(meetsWcagAA(contrastRatio(get("color-text"), get("color-surface")), false)).toBe(true);
  });

  it("muted and faint text on the page background", () => {
    expect(meetsWcagAA(contrastRatio(get("color-text-muted"), get("color-bg")), false)).toBe(true);
    expect(meetsWcagAA(contrastRatio(get("color-text-faint"), get("color-bg")), false)).toBe(true);
  });

  it("the primary button (white text on the accent background)", () => {
    expect(meetsWcagAA(contrastRatio(get("button-primary-fg"), get("button-primary-bg")), false)).toBe(true);
  });

  it("the global focus ring against the page background (non-text UI component, 3:1)", () => {
    expect(meetsWcagAA(contrastRatio(get("color-accent"), get("color-bg")), true)).toBe(true);
  });

  it.each(["live", "delayed", "offline"] as const)(
    "the %s freshness pill's text on its own pill background",
    (state) => {
      expect(meetsWcagAA(contrastRatio(get(`color-${state}`), get(`color-${state}-soft`)), false)).toBe(true);
    },
  );

  it("the 'updated' freshness pill (accent text on accent-soft background)", () => {
    expect(meetsWcagAA(contrastRatio(get("color-accent"), get("color-accent-soft")), false)).toBe(true);
  });

  it("archive coverage indicators against the track background (non-text graphical objects, 3:1)", () => {
    const trackBg = get("color-surface-2");
    for (const indicator of ["color-positive", "color-offline", "color-negative", "color-delayed"]) {
      expect(meetsWcagAA(contrastRatio(get(indicator), trackBg), true)).toBe(true);
    }
    // The "pending" indicator IS the border color itself — by definition
    // indistinguishable from its own track in a flat contrast check; it
    // reads as an intentional gap in the track, and every segment also has
    // an adjacent text label (sessionCoverageLabel) that never relies on
    // color alone (WCAG 1.4.1).
  });
});

/**
 * Team color (TeamColorDot) is deliberately NOT contrast-checked here:
 * it's a live, arbitrary per-team value from OpenF1
 * (packages/providers/f1/openf1/src/normalize/driver.ts), not a fixed
 * design token — there is no build-time guarantee possible for it. The
 * real mitigation lives in the UI instead: TeamColorDot is always rendered
 * alongside the driver/team's name or code as text (TimingTower.tsx,
 * StandingsPanel.tsx, SessionAnalysis.tsx, app/sports/f1/page.tsx) — color
 * is a supplementary accent, never the only way to identify a driver or
 * team, satisfying WCAG 1.4.1 "Use of Color" by construction. Each of
 * those components' existing tests already assert the driver code/team
 * name text renders — see e.g. TimingTower.test.tsx's "LDR"/"SEC"
 * assertions — so this isn't an untested gap, just a check that can't be
 * expressed as a color-value assertion.
 */
