import { prisma } from "@sports/db";
import type { cricket, Player, Team } from "@sports/domain";
import { logger } from "../logger";

/**
 * Cricket Checkpoint 2 — closes a real gap `bootstrapCricketCurrent`
 * doesn't (it never called `getTeams`/`getPlayers`): without this, the API
 * would only ever have opaque `teamId`/`playerId` strings to show, never a
 * real name. Mirrors `bootstrapCricketCurrent`'s own `Team` upsert exactly
 * (including the `sportId` override — the domain `Team.sportId` is the
 * provider's sport *slug*, not the real `Sport` row's id, the same real
 * bug class `bootstrapF1Calendar`'s own doc comment already documents for
 * F1). Called from the job's per-fixture state-refresh tick (`job.ts`),
 * where `getRosterForFixture` gives real teams/players scoped to exactly
 * the fixture being refreshed — not a second, separate roster job.
 * `sportId` comes from the caller's own resolved `provider.sportId` (the
 * `SportsProvider` interface field every adapter already exposes) rather
 * than a hardcoded constant re-imported from the provider package —
 * `bootstrapCricketCurrent` already establishes this exact pattern.
 */
export async function upsertCricketRoster(sportId: string, teams: Team[], players: Player[]): Promise<void> {
  const sportRow = await prisma.sport.upsert({
    where: { slug: sportId },
    update: {},
    create: { slug: sportId, name: "Cricket", status: "beta" },
  });

  for (const team of teams) {
    try {
      await prisma.team.upsert({
        where: { id: team.id },
        update: { name: team.name, colorHex: team.colorHex },
        create: { ...team, sportId: sportRow.id },
      });
    } catch (error) {
      logger.warn({ teamId: team.id, error: error instanceof Error ? error.message : String(error) }, "Cricket Team upsert failed");
    }
  }

  for (const player of players) {
    try {
      await prisma.player.upsert({
        where: { id: player.id },
        update: { name: player.name, teamId: player.teamId },
        create: { ...player, sportId: sportRow.id },
      });
    } catch (error) {
      logger.warn({ playerId: player.id, error: error instanceof Error ? error.message : String(error) }, "Cricket Player upsert failed");
    }
  }
}

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

/**
 * Cricket Checkpoint 2 — the batting scorecard, one row per real batsman
 * entry. Idempotent via `@@unique([sessionId, playerId])` (a batsman bats
 * at most once per innings in the real data — verified, never more than
 * one entry per player per scorecard block).
 */
export async function upsertCricketBattingFigure(figure: cricket.CricketBattingFigure): Promise<void> {
  try {
    await prisma.cricketBattingFigure.upsert({
      where: { sessionId_playerId: { sessionId: figure.sessionId, playerId: figure.playerId } },
      update: {
        battingOrder: figure.battingOrder,
        runs: figure.runs,
        balls: figure.balls,
        fours: figure.fours,
        sixes: figure.sixes,
        strikeRate: figure.strikeRate,
        dismissalText: figure.dismissalText,
      },
      create: {
        sessionId: figure.sessionId,
        playerId: figure.playerId,
        battingOrder: figure.battingOrder,
        runs: figure.runs,
        balls: figure.balls,
        fours: figure.fours,
        sixes: figure.sixes,
        strikeRate: figure.strikeRate,
        dismissalText: figure.dismissalText,
      },
    });
  } catch (error) {
    logger.warn(
      { sessionId: figure.sessionId, playerId: figure.playerId, error: error instanceof Error ? error.message : String(error) },
      "CricketBattingFigure upsert failed",
    );
  }
}

export async function upsertCricketBowlingFigure(figure: cricket.CricketBowlingFigure): Promise<void> {
  try {
    await prisma.cricketBowlingFigure.upsert({
      where: { sessionId_playerId: { sessionId: figure.sessionId, playerId: figure.playerId } },
      update: {
        bowlingOrder: figure.bowlingOrder,
        overs: figure.overs,
        maidens: figure.maidens,
        runsConceded: figure.runsConceded,
        wickets: figure.wickets,
        economy: figure.economy,
      },
      create: {
        sessionId: figure.sessionId,
        playerId: figure.playerId,
        bowlingOrder: figure.bowlingOrder,
        overs: figure.overs,
        maidens: figure.maidens,
        runsConceded: figure.runsConceded,
        wickets: figure.wickets,
        economy: figure.economy,
      },
    });
  } catch (error) {
    logger.warn(
      { sessionId: figure.sessionId, playerId: figure.playerId, error: error instanceof Error ? error.message : String(error) },
      "CricketBowlingFigure upsert failed",
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
