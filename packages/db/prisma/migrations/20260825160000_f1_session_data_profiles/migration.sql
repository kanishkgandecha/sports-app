-- Archive detail is session-scoped: one weekend can have timing for the race
-- while practice or qualifying is unavailable from the upstream provider.
CREATE TABLE "SessionDataProfile" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionDataProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionDataProfile_sessionId_key" ON "SessionDataProfile"("sessionId");
CREATE INDEX "SessionDataProfile_source_status_idx" ON "SessionDataProfile"("source", "status");
CREATE INDEX "SessionDataProfile_status_nextRetryAt_idx" ON "SessionDataProfile"("status", "nextRetryAt");

ALTER TABLE "SessionDataProfile"
ADD CONSTRAINT "SessionDataProfile_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve detailed data imported before this model existed.
INSERT INTO "SessionDataProfile" (
    "id", "sessionId", "source", "status", "attemptCount", "importedAt", "updatedAt"
)
SELECT
    'session-profile-' || md5(s."id"),
    s."id",
    COALESCE(fdp."source", 'openf1'),
    'available',
    1,
    COALESCE(fdp."importedAt", CURRENT_TIMESTAMP),
    CURRENT_TIMESTAMP
FROM "Session" s
JOIN "Fixture" f ON f."id" = s."fixtureId"
LEFT JOIN "FixtureDataProfile" fdp ON fdp."fixtureId" = f."id"
WHERE EXISTS (SELECT 1 FROM "DriverTiming" dt WHERE dt."sessionId" = s."id")
   OR EXISTS (SELECT 1 FROM "PitStop" ps WHERE ps."sessionId" = s."id")
   OR EXISTS (SELECT 1 FROM "RaceControlMessage" rc WHERE rc."sessionId" = s."id")
   OR EXISTS (SELECT 1 FROM "LiveEvent" le WHERE le."sessionId" = s."id")
ON CONFLICT ("sessionId") DO NOTHING;
