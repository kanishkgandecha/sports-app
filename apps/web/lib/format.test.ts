import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, venueLine } from "./format";

describe("formatDate", () => {
  it("formats an ISO date as month + day", () => {
    expect(formatDate("2026-08-21T00:00:00Z")).toMatch(/Aug/);
  });
});

describe("formatDateTime", () => {
  it("includes a time component alongside the date", () => {
    const result = formatDateTime("2026-08-21T11:50:00Z");
    expect(result).toMatch(/Aug/);
    expect(result).toMatch(/:/); // some locale-formatted time with a colon
  });
});

describe("venueLine", () => {
  it("joins name and country when both are known", () => {
    expect(venueLine({ name: "Sabina Park", country: "Jamaica" })).toBe("Sabina Park, Jamaica");
  });

  it("returns just the name, never a dangling ', ', when country is null", () => {
    expect(venueLine({ name: "Unknown circuit", country: null })).toBe("Unknown circuit");
  });

  it("returns null when there is no venue at all", () => {
    expect(venueLine(null)).toBeNull();
  });
});
