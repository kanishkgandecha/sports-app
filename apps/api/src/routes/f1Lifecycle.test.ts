import { describe, expect, it } from "vitest";
import { deriveF1FixtureStatus } from "./f1Lifecycle";

const now = new Date("2026-08-25T12:00:00.000Z");

describe("deriveF1FixtureStatus", () => {
  it("corrects a stale live fixture after every session has ended", () => {
    expect(
      deriveF1FixtureStatus(
        {
          status: "live",
          sessions: [
            {
              startTime: new Date("2026-08-23T13:00:00.000Z"),
              endTime: new Date("2026-08-23T15:00:00.000Z"),
            },
          ],
        },
        now,
      ),
    ).toBe("completed");
  });

  it("marks a weekend live when any session is currently live", () => {
    expect(
      deriveF1FixtureStatus(
        {
          status: "scheduled",
          sessions: [
            {
              startTime: new Date("2026-08-25T11:00:00.000Z"),
              endTime: new Date("2026-08-25T13:00:00.000Z"),
            },
            {
              startTime: new Date("2026-08-26T11:00:00.000Z"),
              endTime: new Date("2026-08-26T13:00:00.000Z"),
            },
          ],
        },
        now,
      ),
    ).toBe("live");
  });

  it("preserves provider-declared cancelled and postponed states", () => {
    const sessions = [{ startTime: new Date("2026-01-01"), endTime: new Date("2026-01-02") }];
    expect(deriveF1FixtureStatus({ status: "cancelled", sessions }, now)).toBe("cancelled");
    expect(deriveF1FixtureStatus({ status: "postponed", sessions }, now)).toBe("postponed");
  });
});
