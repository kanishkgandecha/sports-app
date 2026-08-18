import { prisma } from "@sports/db";
import type { cricket } from "@sports/domain";
import { logger } from "../logger";

/**
 * Idempotent via the schema's `@@unique` constraints on `fixtureId`/
 * `sessionId` — same pattern as F1's `upsertDriverTiming` (current-state,
 * not append-only: `update` overwrites with the latest known state).
 */
export async function upsertCricketFixtureDetail(detail: cricket.CricketFixtureDetail): Promise<void> {
  try {
    await prisma.cricketFixtureDetail.upsert({
      where: { fixtureId: detail.fixtureId },
      update: {
        format: detail.format,
        tossWonByTeamId: detail.tossWonByTeamId,
        tossDecision: detail.tossDecision,
        result: detail.result,
      },
      create: {
        fixtureId: detail.fixtureId,
        format: detail.format,
        tossWonByTeamId: detail.tossWonByTeamId,
        tossDecision: detail.tossDecision,
        result: detail.result,
      },
    });
  } catch (error) {
    // No enforced FK to Fixture (same Phase 0/Checkpoint 2 schema
    // simplification as DriverTiming/PitStop/RaceControlMessage — see
    // schema.prisma's comments) — a write here can't fail on a missing
    // parent row. Still shouldn't take the rest of a poll tick down over a
    // genuine DB/connection error.
    logger.warn(
      { fixtureId: detail.fixtureId, error: error instanceof Error ? error.message : String(error) },
      "CricketFixtureDetail upsert failed",
    );
  }
}

export async function upsertCricketInningsState(state: cricket.CricketInningsState): Promise<void> {
  try {
    await prisma.cricketInningsState.upsert({
      where: { sessionId: state.sessionId },
      update: {
        battingTeamId: state.battingTeamId,
        bowlingTeamId: state.bowlingTeamId,
        runs: state.runs,
        wickets: state.wickets,
        overs: state.overs,
        strikerId: state.strikerId,
        nonStrikerId: state.nonStrikerId,
        currentBowlerId: state.currentBowlerId,
        target: state.target,
        requiredRunRate: state.requiredRunRate,
      },
      create: {
        sessionId: state.sessionId,
        battingTeamId: state.battingTeamId,
        bowlingTeamId: state.bowlingTeamId,
        runs: state.runs,
        wickets: state.wickets,
        overs: state.overs,
        strikerId: state.strikerId,
        nonStrikerId: state.nonStrikerId,
        currentBowlerId: state.currentBowlerId,
        target: state.target,
        requiredRunRate: state.requiredRunRate,
      },
    });
  } catch (error) {
    logger.warn(
      { sessionId: state.sessionId, error: error instanceof Error ? error.message : String(error) },
      "CricketInningsState upsert failed",
    );
  }
}
