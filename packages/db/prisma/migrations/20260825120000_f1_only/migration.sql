-- The product is now Formula 1 only. Remove sport-specific Cricket storage
-- and every persisted row owned by a non-F1 sport while preserving F1 history.
DROP TABLE IF EXISTS "CricketDelivery";
DROP TABLE IF EXISTS "CricketBowlingFigure";
DROP TABLE IF EXISTS "CricketBattingFigure";
DROP TABLE IF EXISTS "CricketInningsState";
DROP TABLE IF EXISTS "CricketFixtureDetail";
DROP TABLE IF EXISTS "FixtureParticipant";

CREATE TEMP TABLE "_NonF1Fixtures" AS
SELECT f."id" FROM "Fixture" f
JOIN "Sport" sport ON sport."id" = f."sportId"
WHERE sport."slug" <> 'f1';

CREATE TEMP TABLE "_NonF1Sessions" AS
SELECT s."id" FROM "Session" s
JOIN "_NonF1Fixtures" f ON f."id" = s."fixtureId";

DELETE FROM "DriverTiming" WHERE "sessionId" IN (SELECT "id" FROM "_NonF1Sessions");
DELETE FROM "PitStop" WHERE "sessionId" IN (SELECT "id" FROM "_NonF1Sessions");
DELETE FROM "RaceControlMessage" WHERE "sessionId" IN (SELECT "id" FROM "_NonF1Sessions");
DELETE FROM "ProviderCursor"
WHERE "sessionId" IN (SELECT "id" FROM "_NonF1Sessions")
   OR lower("providerId") LIKE '%cricket%'
   OR lower("providerId") LIKE '%cricsheet%';
DELETE FROM "LiveEvent" WHERE "sessionId" IN (SELECT "id" FROM "_NonF1Sessions");
DELETE FROM "Session" WHERE "id" IN (SELECT "id" FROM "_NonF1Sessions");
DELETE FROM "Fixture" WHERE "id" IN (SELECT "id" FROM "_NonF1Fixtures");

DELETE FROM "Standing" WHERE "competitionId" IN (
  SELECT c."id" FROM "Competition" c JOIN "Sport" sport ON sport."id" = c."sportId" WHERE sport."slug" <> 'f1'
);
DELETE FROM "Player" WHERE "sportId" IN (SELECT "id" FROM "Sport" WHERE "slug" <> 'f1');
DELETE FROM "Team" WHERE "sportId" IN (SELECT "id" FROM "Sport" WHERE "slug" <> 'f1');
DELETE FROM "Season" WHERE "competitionId" IN (
  SELECT c."id" FROM "Competition" c JOIN "Sport" sport ON sport."id" = c."sportId" WHERE sport."slug" <> 'f1'
);
DELETE FROM "Competition" WHERE "sportId" IN (SELECT "id" FROM "Sport" WHERE "slug" <> 'f1');
DELETE FROM "LiveEvent" WHERE "sportId" IN (SELECT "id" FROM "Sport" WHERE "slug" <> 'f1');
DELETE FROM "HistoricalImport" WHERE "sportSlug" <> 'f1';
DELETE FROM "ProviderRawResponse"
WHERE lower("providerId") LIKE '%cricket%'
   OR lower("providerId") LIKE '%cricsheet%';
DELETE FROM "Sport" WHERE "slug" <> 'f1';
DELETE FROM "Venue" WHERE NOT EXISTS (SELECT 1 FROM "Fixture" WHERE "Fixture"."venueId" = "Venue"."id");

ALTER TABLE "Venue" ALTER COLUMN "country" SET NOT NULL;
