import { classifySessionLifecycle } from "@sports/domain";

type FixtureSessionTimes = { startTime: Date; endTime: Date | null };

/**
 * Fixture status is derived from session timestamps at read time so a worker
 * restart or delayed provider refresh cannot leave a completed weekend marked
 * live. Provider-declared exceptional states are preserved.
 */
export function deriveF1FixtureStatus(
  fixture: { status: string; sessions: FixtureSessionTimes[] },
  now: Date = new Date(),
): string {
  if (fixture.status === "cancelled" || fixture.status === "postponed") return fixture.status;
  if (fixture.sessions.length === 0) return fixture.status;

  const lifecycles = fixture.sessions.map((session) =>
    classifySessionLifecycle(
      {
        startTime: session.startTime.toISOString(),
        endTime: session.endTime?.toISOString() ?? null,
      },
      now,
    ),
  );
  if (lifecycles.includes("live")) return "live";
  if (lifecycles.every((lifecycle) => lifecycle === "completed")) return "completed";
  return "scheduled";
}
