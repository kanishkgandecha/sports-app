import { prisma } from "@sports/db";
import type { SportsProvider } from "@sports/providers-core";
import { logger } from "../logger";

export interface StandingsSyncSummary {
  seasonsSynced: number;
  standingsWritten: number;
}

/**
 * Periodic standings sync — Checkpoint 6 (docs/CONTEXT.md Checkpoint 6 §4
 * "Provider decision"). Deliberately separate from `bootstrapF1Calendar`
 * (./bootstrapCalendar.ts): standings change after every race, not once at
 * startup, so this runs on its own recurring interval (see standingsJob.ts)
 * rather than being folded into the one-time calendar bootstrap. Uses
 * whichever provider `resolveF1StandingsProvider` resolves (Jolpica-F1 by
 * default — see ../providers/registry.ts), independent of and never
 * replacing `F1_PROVIDER` (OpenF1, the live-data provider).
 *
 * Idempotent via the schema's `@@unique([seasonId, entityType, entityId])`
 * constraint (packages/db/prisma/schema.prisma) — unlike Fixture/Session,
 * a Standing row's own `id` is a DB-generated cuid, not the provider's
 * deterministic id, so upserts here target that compound key instead.
 *
 * Requires the season/competition to already be bootstrapped (real FK
 * targets) — skips with a warning rather than failing the whole sync if
 * they aren't, since standings sync can run independently of (and on a
 * different cadence than) the F1 calendar bootstrap.
 */
export async function syncF1Standings(
  provider: SportsProvider,
  options: { seasonLabels: string[] },
): Promise<StandingsSyncSummary> {
  const summary: StandingsSyncSummary = { seasonsSynced: 0, standingsWritten: 0 };

  const [competition] = await provider.getCompetitions();
  const competitionRow = await prisma.competition.findUnique({ where: { id: competition.id } });
  if (!competitionRow) {
    logger.warn(
      { competitionId: competition.id },
      "F1 standings sync skipped — competition not bootstrapped yet (run the F1 calendar bootstrap first)",
    );
    return summary;
  }

  const allSeasons = await provider.getSeasons({ competitionId: competition.id });
  const targetSeasons = allSeasons.filter((s) => options.seasonLabels.includes(s.label));
  if (targetSeasons.length === 0) {
    logger.warn(
      { requested: options.seasonLabels, available: allSeasons.map((s) => s.label) },
      "none of the requested F1 standings seasons were found by the provider",
    );
  }

  for (const season of targetSeasons) {
    const seasonRow = await prisma.season.findUnique({ where: { id: season.id } });
    if (!seasonRow) {
      logger.warn({ seasonId: season.id }, "F1 standings sync skipped for season — not bootstrapped yet");
      continue;
    }

    let standings;
    try {
      standings = await provider.getStandings({ seasonId: season.id });
    } catch (error) {
      logger.error(
        { seasonId: season.id, error: error instanceof Error ? error.message : String(error) },
        "F1 standings fetch failed",
      );
      continue;
    }

    for (const standing of standings) {
      await prisma.standing.upsert({
        where: {
          seasonId_entityType_entityId: {
            seasonId: standing.seasonId,
            entityType: standing.entityType,
            entityId: standing.entityId,
          },
        },
        update: {
          points: standing.points,
          position: standing.position,
          extra: standing.extra as never,
        },
        create: {
          competitionId: standing.competitionId,
          seasonId: standing.seasonId,
          entityType: standing.entityType,
          entityId: standing.entityId,
          points: standing.points,
          position: standing.position,
          extra: standing.extra as never,
        },
      });
      summary.standingsWritten += 1;
    }
    summary.seasonsSynced += 1;
  }

  logger.info(summary, "F1 standings sync complete");
  return summary;
}
