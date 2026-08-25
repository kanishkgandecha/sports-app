-- Historical Archive & Controlled Backfill

CREATE TABLE "FixtureDataProfile" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "coverage" TEXT NOT NULL,
    "attribution" TEXT,
    "sourceRevision" TEXT,
    "datePrecision" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixtureDataProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HistoricalImport" (
    "id" TEXT NOT NULL,
    "sportSlug" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sourceRevision" TEXT,
    "checksum" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "HistoricalImport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FixtureDataProfile_fixtureId_key" ON "FixtureDataProfile"("fixtureId");
CREATE UNIQUE INDEX "FixtureDataProfile_source_externalId_key" ON "FixtureDataProfile"("source", "externalId");
CREATE INDEX "FixtureDataProfile_source_coverage_idx" ON "FixtureDataProfile"("source", "coverage");
CREATE UNIQUE INDEX "HistoricalImport_source_scopeKey_key" ON "HistoricalImport"("source", "scopeKey");
CREATE INDEX "HistoricalImport_sportSlug_startedAt_idx" ON "HistoricalImport"("sportSlug", "startedAt");
CREATE INDEX "HistoricalImport_status_idx" ON "HistoricalImport"("status");

CREATE TABLE "FixtureParticipant" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "role" TEXT,
    CONSTRAINT "FixtureParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FixtureParticipant_fixtureId_teamId_key" ON "FixtureParticipant"("fixtureId", "teamId");
CREATE INDEX "FixtureParticipant_teamId_fixtureId_idx" ON "FixtureParticipant"("teamId", "fixtureId");
ALTER TABLE "FixtureParticipant" ADD CONSTRAINT "FixtureParticipant_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FixtureParticipant" ADD CONSTRAINT "FixtureParticipant_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CricketDelivery" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "overNumber" INTEGER NOT NULL,
    "deliveryIndex" INTEGER NOT NULL,
    "actualDelivery" TEXT NOT NULL,
    "batterId" TEXT NOT NULL,
    "nonStrikerId" TEXT NOT NULL,
    "bowlerId" TEXT NOT NULL,
    "batterRuns" INTEGER NOT NULL,
    "extras" JSONB NOT NULL,
    "totalRuns" INTEGER NOT NULL,
    "wickets" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    CONSTRAINT "CricketDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CricketDelivery_sessionId_sequence_key" ON "CricketDelivery"("sessionId", "sequence");
CREATE INDEX "CricketDelivery_sessionId_sequence_idx" ON "CricketDelivery"("sessionId", "sequence");

ALTER TABLE "FixtureDataProfile" ADD CONSTRAINT "FixtureDataProfile_fixtureId_fkey"
FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
