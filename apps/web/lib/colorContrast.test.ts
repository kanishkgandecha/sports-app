import { describe, expect, it } from "vitest";
import { contrastRatio, hexToRgb, meetsWcagAA } from "./colorContrast";

describe("hexToRgb", () => {
  it("parses 6-digit and 3-digit hex the same way", () => {
    expect(hexToRgb("#ff0000")).toEqual([255, 0, 0]);
    expect(hexToRgb("#f00")).toEqual([255, 0, 0]);
  });
});

describe("contrastRatio", () => {
  it("matches WCAG's published reference ratios for black/white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("is symmetric — argument order doesn't matter", () => {
    expect(contrastRatio("#123456", "#fedcba")).toBeCloseTo(contrastRatio("#fedcba", "#123456"), 10);
  });
});

describe("meetsWcagAA", () => {
  it("requires 4.5:1 for normal text and 3:1 for large text/UI components", () => {
    expect(meetsWcagAA(4.5, false)).toBe(true);
    expect(meetsWcagAA(4.49, false)).toBe(false);
    expect(meetsWcagAA(3, true)).toBe(true);
    expect(meetsWcagAA(2.99, true)).toBe(false);
  });
});
