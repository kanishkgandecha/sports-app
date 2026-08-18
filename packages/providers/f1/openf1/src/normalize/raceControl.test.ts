import { describe, expect, it } from "vitest";
import type { OpenF1RaceControlMessage } from "../types";
import { classifyRaceControl, normalizeRaceControlEvent, toRaceControlMessageRow } from "./raceControl";
import australianGp2023 from "../fixtures/raceControl.australia2023race.json";

const realMessages = australianGp2023 as OpenF1RaceControlMessage[];

function find(predicate: (m: OpenF1RaceControlMessage) => boolean): OpenF1RaceControlMessage {
  const msg = realMessages.find(predicate);
  if (!msg) throw new Error("Fixture message not found — fixture may have changed");
  return msg;
}

describe("classifyRaceControl — against real 2023 Australian GP data (session_key 7787)", () => {
  it("classifies full Safety Car deployment", () => {
    const msg = find((m) => m.message === "SAFETY CAR DEPLOYED");
    expect(classifyRaceControl(msg)).toEqual({ category: "safety_car", eventType: "SAFETY_CAR" });
  });

  it("classifies Virtual Safety Car as distinct from full Safety Car, despite sharing category=SafetyCar", () => {
    const msg = find((m) => m.message === "VIRTUAL SAFETY CAR DEPLOYED");
    expect(msg.category).toBe("SafetyCar"); // same category as full SC — the whole point of this test
    expect(classifyRaceControl(msg)).toEqual({ category: "vsc", eventType: "SAFETY_CAR" });
  });

  it("classifies Red Flag as category=Flag/flag=RED — NOT category=SafetyCar, NOT category=SessionStatus", () => {
    const msg = find((m) => m.message === "RED FLAG");
    // This is the exact correction documented in docs/CONTEXT.md §8: a
    // Checkpoint 2 assumption (from doc prose) guessed SessionStatus.
    expect(msg.category).toBe("Flag");
    expect(msg.flag).toBe("RED");
    expect(classifyRaceControl(msg)).toEqual({ category: "red_flag", eventType: "SAFETY_CAR" });
  });

  it("classifies an ordinary yellow flag as FLAG, not SAFETY_CAR", () => {
    const msg = find((m) => m.flag === "YELLOW");
    expect(classifyRaceControl(msg)).toEqual({ category: "flag", eventType: "FLAG" });
  });

  it("classifies a chequered flag as FLAG", () => {
    const msg = find((m) => m.flag === "CHEQUERED");
    expect(classifyRaceControl(msg)).toEqual({ category: "flag", eventType: "FLAG" });
  });

  it("classifies session status transitions distinctly from flags", () => {
    const msg = find((m) => m.message === "SESSION ABORTED");
    expect(classifyRaceControl(msg)).toEqual({ category: "message", eventType: "SESSION_STATUS" });
  });

  it("falls back to a generic message for unstructured categories (e.g. incident notes)", () => {
    const msg = find((m) => m.category === "Other");
    expect(classifyRaceControl(msg).eventType).toBe("RACE_CONTROL_MESSAGE");
  });

  it("falls back to a generic message for an entirely unrecognized category", () => {
    const msg: OpenF1RaceControlMessage = {
      session_key: 1,
      meeting_key: 1,
      date: "2026-01-01T00:00:00Z",
      category: "SomethingBrandNew",
      flag: null,
      message: "test",
      driver_number: null,
      lap_number: null,
      scope: null,
      sector: null,
      qualifying_phase: null,
    };
    expect(classifyRaceControl(msg)).toEqual({ category: "message", eventType: "RACE_CONTROL_MESSAGE" });
  });
});

describe("normalizeRaceControlEvent", () => {
  it("produces a SAFETY_CAR LiveEvent with the payload category discriminator for a red flag", () => {
    const msg = find((m) => m.message === "RED FLAG");
    const event = normalizeRaceControlEvent(msg, { sessionId: "f1-session-7787" });
    expect(event.eventType).toBe("SAFETY_CAR");
    expect(event.sessionId).toBe("f1-session-7787");
    expect(event.payload).toMatchObject({ category: "red_flag" });
    expect(event.source).toBe("openf1");
  });

  it("produces a FLAG LiveEvent carrying scope/sector for a sector-scoped yellow flag", () => {
    const msg = find((m) => m.scope === "Sector" && m.flag === "YELLOW");
    const event = normalizeRaceControlEvent(msg, { sessionId: "f1-session-9574" });
    expect(event.eventType).toBe("FLAG");
    expect(event.payload).toMatchObject({ flag: "YELLOW", scope: "Sector" });
  });

  it("carries driver_number through as null when the provider gives null, even if the message text references a car", () => {
    // Real observed quirk: message="TURN 5 INCIDENT INVOLVING CAR 23 (ALB)..." had driver_number: null.
    const msg = find((m) => /INCIDENT INVOLVING CAR/i.test(m.message));
    expect(msg.driver_number).toBeNull();
    const event = normalizeRaceControlEvent(msg, { sessionId: "s" });
    expect(event.eventType).toBe("RACE_CONTROL_MESSAGE");
    expect(event.payload).toMatchObject({ driverId: null });
  });

  it("produces deterministic ids for the same input (idempotent re-normalization)", () => {
    const msg = find((m) => m.message === "RED FLAG");
    const a = normalizeRaceControlEvent(msg, { sessionId: "s" });
    const b = normalizeRaceControlEvent(msg, { sessionId: "s" });
    expect(a.id).toBe(b.id);
  });

  it("produces distinct ids for two different messages sharing the exact same timestamp/category shape", () => {
    // Real fixture has two race-suspending events close in time; construct a
    // synthetic same-timestamp collision to prove the hash — not the
    // timestamp alone — disambiguates.
    const base: OpenF1RaceControlMessage = {
      session_key: 1,
      meeting_key: 1,
      date: "2026-01-01T00:00:00Z",
      category: "Flag",
      flag: "YELLOW",
      message: "YELLOW IN TRACK SECTOR 3",
      driver_number: null,
      lap_number: 1,
      scope: "Sector",
      sector: 3,
      qualifying_phase: null,
    };
    const other = { ...base, message: "YELLOW IN TRACK SECTOR 9", sector: 9 };
    const a = normalizeRaceControlEvent(base, { sessionId: "s" });
    const b = normalizeRaceControlEvent(other, { sessionId: "s" });
    expect(a.id).not.toBe(b.id);
  });
});

describe("toRaceControlMessageRow", () => {
  it("preserves the human-readable message alongside the narrowed category", () => {
    const msg = find((m) => m.message === "SAFETY CAR IN THIS LAP");
    const row = toRaceControlMessageRow(msg, "f1-session-7787");
    expect(row).toEqual({
      sessionId: "f1-session-7787",
      timestamp: msg.date,
      category: "safety_car",
      message: "SAFETY CAR IN THIS LAP",
    });
  });
});
