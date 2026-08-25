import { prisma } from "@sports/db";
import type { DriverTimingPatch } from "@sports/providers-f1-openf1";
import type { PitStopRow, RaceControlMessageRow } from "./currentState";
import { logger } from "../logger";

/**
 * Idempotent via the shared LiveEvent id (see currentState.ts's doc comment)
 * — `upsert` means a re-processed poll tick (overlapping `since` window,
 * worker restart replaying a cursor) can never create a duplicate row.
 */
export async function upsertRaceControlMessage(row: RaceControlMessageRow): Promise<void> {
  await prisma.raceControlMessage.upsert({
    where: { id: row.id },
    update: {}, // append-only in spirit — a given provider event's row never changes once written
    create: {
      id: row.id,
      sessionId: row.sessionId,
      timestamp: new Date(row.timestamp),
      category: row.category,
      message: row.message,
    },
  });
}

export async function upsertPitStop(row: PitStopRow): Promise<void> {
  await prisma.pitStop.upsert({
    where: { id: row.id },
    update: {},
    create: {
      id: row.id,
      sessionId: row.sessionId,
      driverId: row.driverId,
      lap: row.lap,
      durationMs: row.durationMs,
      timestamp: new Date(row.timestamp),
    },
  });
}

/**
 * Current-state (not append-only): `update` overwrites with whatever this
 * patch carries; `create` needs `position`/`state` even if this particular
 * patch doesn't have them yet (e.g. the very first patch seen for a driver
 * this session came from `/intervals`, not `/position`) — defaults to a
 * placeholder (position 0, state "running") self-corrected by a later patch
 * that does carry position. Documented limitation, not a silent guess: see
 * docs/CONTEXT.md §9 "Known limitations".
 */
export async function upsertDriverTiming(patch: DriverTimingPatch): Promise<void> {
  try {
    await prisma.driverTiming.upsert({
      where: { sessionId_driverId: { sessionId: patch.sessionId, driverId: patch.driverId } },
      update: {
        ...(patch.position !== undefined && { position: patch.position }),
        ...(patch.gapToLeader !== undefined && { gapToLeader: patch.gapToLeader }),
        ...(patch.intervalToAhead !== undefined && { intervalToAhead: patch.intervalToAhead }),
        ...(patch.lastLapTime !== undefined && { lastLapTime: patch.lastLapTime }),
        ...(patch.bestLapTime !== undefined && { bestLapTime: patch.bestLapTime }),
        ...(patch.sector1 !== undefined && { sector1: patch.sector1 }),
        ...(patch.sector2 !== undefined && { sector2: patch.sector2 }),
        ...(patch.sector3 !== undefined && { sector3: patch.sector3 }),
        ...(patch.tyreCompound !== undefined && { tyreCompound: patch.tyreCompound }),
        ...(patch.state !== undefined && { state: patch.state }),
      },
      create: {
        sessionId: patch.sessionId,
        driverId: patch.driverId,
        position: patch.position ?? 0,
        gapToLeader: patch.gapToLeader ?? null,
        intervalToAhead: patch.intervalToAhead ?? null,
        lastLapTime: patch.lastLapTime ?? null,
        bestLapTime: patch.bestLapTime ?? null,
        sector1: patch.sector1 ?? null,
        sector2: patch.sector2 ?? null,
        sector3: patch.sector3 ?? null,
        tyreCompound: patch.tyreCompound ?? null,
        state: patch.state ?? "running",
      },
    });
  } catch (error) {
    // DriverTiming/PitStop/RaceControlMessage have no enforced foreign key
    // to Session (a Phase 0/Checkpoint 2 schema simplification — see
    // schema.prisma's comments on those models), so a write here can't fail
    // on a missing parent row. It can still fail on a genuine DB/connection
    // error, which shouldn't take down the rest of the tick — see
    // docs/CONTEXT.md §9 "Error handling".
    logger.warn(
      {
        sessionId: patch.sessionId,
        driverId: patch.driverId,
        error: error instanceof Error ? error.message : String(error),
      },
      "DriverTiming upsert failed",
    );
  }
}
