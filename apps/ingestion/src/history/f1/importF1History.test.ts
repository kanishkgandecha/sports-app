import { describe, expect, it } from "vitest";
import { importF1Season, rollingSeasonYears } from "./importF1History";

describe("F1 historical source policy", () => {
  it("rejects overlapping sources before making provider requests", async () => {
    const provider = { id: "jolpica", sportId: "f1" } as never;
    await expect(importF1Season(provider, { year: 2024, limit: 1, dryRun: true })).rejects.toThrow(
      "2024 must use openf1",
    );
  });
});

describe("rollingSeasonYears", () => {
  it("returns the complete oldest-to-newest rolling window", () => {
    expect(rollingSeasonYears(3, 2026)).toEqual([2024, 2025, 2026]);
  });

  it.each([0, 11, 1.5])("rejects unsafe window size %s", (count) => {
    expect(() => rollingSeasonYears(count, 2026)).toThrow("years must be from 1 to 10");
  });
});
