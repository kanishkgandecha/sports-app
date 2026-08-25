import { describe, expect, it } from "vitest";
import { parseQuery } from "./archive";

describe("archive query validation", () => {
  it("defaults to F1 and applies a bounded default", () => {
    const parsed = parseQuery({});
    expect("error" in parsed).toBe(false);
    if (!("error" in parsed)) expect(parsed.limit).toBe(24);
  });

  it("rejects non-F1 and unsafe pagination values", () => {
    expect(parseQuery({ sport: "other" })).toEqual({ error: "only Formula 1 archives are available" });
    expect(parseQuery({ limit: "51" })).toEqual({ error: "limit must be an integer from 1 to 50" });
    expect(parseQuery({ cursor: "not-a-cursor" })).toEqual({ error: "invalid cursor" });
  });

  it("uses inclusive calendar dates and rejects reversed ranges before querying", () => {
    expect(parseQuery({ from: "2024-02-01", to: "2024-01-01" })).toEqual({
      error: "from must not be after to",
    });
    expect(parseQuery({ from: "not-a-date" })).toEqual({ error: "from must be YYYY-MM-DD" });
  });
});
