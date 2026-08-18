-- CreateTable
CREATE TABLE "CricketFixtureDetail" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "tossWonByTeamId" TEXT,
    "tossDecision" TEXT,
    "result" TEXT,

    CONSTRAINT "CricketFixtureDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CricketInningsState" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "battingTeamId" TEXT NOT NULL,
    "bowlingTeamId" TEXT NOT NULL,
    "runs" INTEGER NOT NULL,
    "wickets" INTEGER NOT NULL,
    "overs" DOUBLE PRECISION NOT NULL,
    "strikerId" TEXT,
    "nonStrikerId" TEXT,
    "currentBowlerId" TEXT,
    "target" INTEGER,
    "requiredRunRate" DOUBLE PRECISION,

    CONSTRAINT "CricketInningsState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CricketFixtureDetail_fixtureId_key" ON "CricketFixtureDetail"("fixtureId");

-- CreateIndex
CREATE INDEX "CricketFixtureDetail_fixtureId_idx" ON "CricketFixtureDetail"("fixtureId");

-- CreateIndex
CREATE UNIQUE INDEX "CricketInningsState_sessionId_key" ON "CricketInningsState"("sessionId");

-- CreateIndex
CREATE INDEX "CricketInningsState_sessionId_idx" ON "CricketInningsState"("sessionId");
