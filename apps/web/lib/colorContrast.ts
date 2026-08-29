/**
 * Phase 6 — a small, dependency-free WCAG 2 contrast-ratio utility. No
 * accessibility-testing library is used anywhere in this repo yet (only
 * eslint-plugin-jsx-a11y's lint-time rules), so this stays a plain function
 * rather than pulling in axe-core/pa11y for one check — see
 * packages/design/src/tokens.contrast.test.ts for how it's used against the
 * app's real design tokens, and docs/TESTING.md for what this does and
 * doesn't cover.
 */

/** Parses `#rgb`, `#rrggbb`, or `#rrggbbaa` (alpha ignored — contrast math needs the composited color, and every token this checks is opaque). */
export function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  const int = parseInt(full.slice(0, 6), 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

/** WCAG 2's relative luminance (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance). */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [rl, gl, bl] = [channel(r), channel(g), channel(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/** WCAG 2's contrast-ratio formula (https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio); always ≥1, order-independent. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexToRgb(hexA));
  const lB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG 2 AA thresholds: 4.5:1 for normal text, 3:1 for large text (≥24px,
 * or ≥19px bold) and for non-text UI components/graphical objects (SC
 * 1.4.11) such as a focus ring or a status pill's own boundary.
 */
export function meetsWcagAA(ratio: number, large: boolean): boolean {
  return ratio >= (large ? 3 : 4.5);
}
