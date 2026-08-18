-- CreateTable
CREATE TABLE "Sport" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "Sport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "country" TEXT,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "teamId" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fixture" (
    "id" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "venueId" TEXT,

    CONSTRAINT "Fixture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveEvent" (
    "id" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "LiveEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Standing" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "points" DOUBLE PRECISION NOT NULL,
    "position" INTEGER NOT NULL,
    "extra" JSONB NOT NULL,

    CONSTRAINT "Standing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderRawResponse" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "body" JSONB NOT NULL,

    CONSTRAINT "ProviderRawResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverTiming" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "gapToLeader" TEXT,
    "lastLapTime" TEXT,
    "bestLapTime" TEXT,
    "sector1" TEXT,
    "sector2" TEXT,
    "sector3" TEXT,
    "tyreCompound" TEXT,
    "state" TEXT NOT NULL,

    CONSTRAINT "DriverTiming_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PitStop" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "lap" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PitStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaceControlMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "RaceControlMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sport_slug_key" ON "Sport"("slug");

-- CreateIndex
CREATE INDEX "Sport_slug_idx" ON "Sport"("slug");

-- CreateIndex
CREATE INDEX "Competition_sportId_idx" ON "Competition"("sportId");

-- CreateIndex
CREATE UNIQUE INDEX "Competition_sportId_slug_key" ON "Competition"("sportId", "slug");

-- CreateIndex
CREATE INDEX "Season_competitionId_idx" ON "Season"("competitionId");

-- CreateIndex
CREATE UNIQUE INDEX "Season_competitionId_label_key" ON "Season"("competitionId", "label");

-- CreateIndex
CREATE INDEX "Team_sportId_idx" ON "Team"("sportId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_sportId_slug_key" ON "Team"("sportId", "slug");

-- CreateIndex
CREATE INDEX "Player_sportId_idx" ON "Player"("sportId");

-- CreateIndex
CREATE INDEX "Player_teamId_idx" ON "Player"("teamId");

-- CreateIndex
CREATE INDEX "Fixture_competitionId_status_idx" ON "Fixture"("competitionId", "status");

-- CreateIndex
CREATE INDEX "Fixture_startTime_idx" ON "Fixture"("startTime");

-- CreateIndex
CREATE UNIQUE INDEX "Fixture_sportId_slug_key" ON "Fixture"("sportId", "slug");

-- CreateIndex
CREATE INDEX "Session_fixtureId_idx" ON "Session"("fixtureId");

-- CreateIndex
CREATE INDEX "Session_status_idx" ON "Session"("status");

-- CreateIndex
CREATE INDEX "LiveEvent_sessionId_timestamp_idx" ON "LiveEvent"("sessionId", "timestamp");

-- CreateIndex
CREATE INDEX "LiveEvent_eventType_idx" ON "LiveEvent"("eventType");

-- CreateIndex
CREATE INDEX "Standing_competitionId_seasonId_idx" ON "Standing"("competitionId", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "Standing_seasonId_entityType_entityId_key" ON "Standing"("seasonId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "ProviderRawResponse_providerId_requestedAt_idx" ON "ProviderRawResponse"("providerId", "requestedAt");

-- CreateIndex
CREATE INDEX "DriverTiming_sessionId_position_idx" ON "DriverTiming"("sessionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "DriverTiming_sessionId_driverId_key" ON "DriverTiming"("sessionId", "driverId");

-- CreateIndex
CREATE INDEX "PitStop_sessionId_driverId_idx" ON "PitStop"("sessionId", "driverId");

-- CreateIndex
CREATE INDEX "RaceControlMessage_sessionId_timestamp_idx" ON "RaceControlMessage"("sessionId", "timestamp");

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveEvent" ADD CONSTRAINT "LiveEvent_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveEvent" ADD CONSTRAINT "LiveEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standing" ADD CONSTRAINT "Standing_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standing" ADD CONSTRAINT "Standing_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
