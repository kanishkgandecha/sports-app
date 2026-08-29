import { describe, expect, it } from "vitest";
import { growClass } from "./growClass";
import styles from "./archive.module.css";

/**
 * Phase 5 regression coverage — the archive coverage track used an inline
 * `style={{ flexGrow: n }}` per segment, which the strict CSP style-src (no
 * unsafe-inline) blocks at runtime. Pins the discrete-class mapping that
 * replaced it, including the clamp at the stylesheet's enumerated ceiling.
 */
describe("growClass", () => {
  it("maps a count directly to its matching grow class", () => {
    expect(growClass(1)).toBe(styles.grow1);
    expect(growClass(5)).toBe(styles.grow5);
    expect(growClass(7)).toBe(styles.grow7);
  });

  it("rounds a non-integer count", () => {
    expect(growClass(3.4)).toBe(styles.grow3);
    expect(growClass(3.6)).toBe(styles.grow4);
  });

  it("clamps below the minimum up to grow1", () => {
    expect(growClass(0)).toBe(styles.grow1);
    expect(growClass(-3)).toBe(styles.grow1);
  });

  it("clamps above the enumerated ceiling down to grow10, rather than emitting an unstyled class", () => {
    expect(growClass(11)).toBe(styles.grow10);
    expect(growClass(1000)).toBe(styles.grow10);
  });
});
