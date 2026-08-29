import { describe, expect, it } from "vitest";
import { selectCompletedDetailSessions } from "./importF1Details";

describe("F1 historical detail selection", () => {
  it("selects only completed requested session types", () => {
    const now = new Date("2024-01-02T00:00:00Z");
    const sessions = [
      { id: "race", fixtureId: "f", type: "RACE", status: "completed", endTime: new Date("2024-01-01") },
      { id: "fp1", fixtureId: "f", type: "FP1", status: "completed", endTime: new Date("2024-01-01") },
      { id: "future", fixtureId: "f", type: "RACE", status: "scheduled", endTime: new Date("2024-01-03") },
    ];
    expect(selectCompletedDetailSessions(sessions, ["RACE"], now).map((session) => session.id)).toEqual(["race"]);
    expect(selectCompletedDetailSessions(sessions, "ALL", now).map((session) => session.id)).toEqual(["race", "fp1"]);
  });
});
