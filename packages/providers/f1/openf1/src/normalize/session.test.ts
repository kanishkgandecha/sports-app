import { describe, expect, it, vi } from "vitest";
import type { OpenF1Session } from "../types";
import { deriveSessionStatus, normalizeSession } from "./session";
import sessions from "../fixtures/sessions.belgium2024.json";

const realSessions = sessions as OpenF1Session[];
const find = (name: string) => {
  const s = realSessions.find((x) => x.session_name === name);
  if (!s) throw new Error(`fixture session "${name}" not found`);
  return s;
};

describe("normalizeSession — session_name vs session_type mapping", () => {
  it("distinguishes FP1/FP2/FP3 by session_name even though session_type is the same coarse 'Practice' for all three", () => {
    const fp1 = find("Practice 1");
    const fp2 = find("Practice 2");
    const fp3 = find("Practice 3");
    expect([fp1.session_type, fp2.session_type, fp3.session_type]).toEqual(["Practice", "Practice", "Practice"]);

    expect(normalizeSession(fp1, { fixtureId: "f1-meeting-1242" }).type).toBe("FP1");
    expect(normalizeSession(fp2, { fixtureId: "f1-meeting-1242" }).type).toBe("FP2");
    expect(normalizeSession(fp3, { fixtureId: "f1-meeting-1242" }).type).toBe("FP3");
  });

  it("maps Qualifying and Race directly", () => {
    expect(normalizeSession(find("Qualifying"), { fixtureId: "x" }).type).toBe("QUALIFYING");
    expect(normalizeSession(find("Race"), { fixtureId: "x" }).type).toBe("RACE");
  });

  it("falls back to a normalized raw name for an unrecognized session_name instead of throwing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const session = normalizeSession({ ...find("Race"), session_name: "Bonus Showdown" }, { fixtureId: "x" });
    expect(session.type).toBe("BONUS_SHOWDOWN");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("deriveSessionStatus", () => {
  const race = find("Race");

  it("is scheduled before date_start", () => {
    expect(deriveSessionStatus(race, new Date("2020-01-01"))).toBe("scheduled");
  });

  it("is completed after date_end", () => {
    expect(deriveSessionStatus(race, new Date("2030-01-01"))).toBe("completed");
  });

  it("is live between date_start and date_end", () => {
    const midpoint = new Date((new Date(race.date_start).getTime() + new Date(race.date_end).getTime()) / 2);
    expect(deriveSessionStatus(race, midpoint)).toBe("live");
  });

  it("is cancelled regardless of dates when is_cancelled is true", () => {
    expect(deriveSessionStatus({ ...race, is_cancelled: true }, new Date(race.date_start))).toBe("cancelled");
  });
});

describe("normalizeSession", () => {
  it("normalizes the real Race session end to end", () => {
    const race = find("Race");
    const session = normalizeSession(race, { fixtureId: "f1-meeting-1242", now: new Date("2024-07-28T14:00:00Z") });
    expect(session).toEqual({
      id: `f1-session-${race.session_key}`,
      fixtureId: "f1-meeting-1242",
      type: "RACE",
      status: "live",
      startTime: race.date_start,
      endTime: race.date_end,
    });
  });
});
