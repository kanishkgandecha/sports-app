-- CreateTable
CREATE TABLE "CricketBattingFigure" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "battingOrder" INTEGER NOT NULL,
    "runs" INTEGER NOT NULL,
    "balls" INTEGER NOT NULL,
    "fours" INTEGER NOT NULL,
    "sixes" INTEGER NOT NULL,
    "strikeRate" DOUBLE PRECISION NOT NULL,
    "dismissalText" TEXT NOT NULL,

    CONSTRAINT "CricketBattingFigure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CricketBowlingFigure" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "bowlingOrder" INTEGER NOT NULL,
    "overs" DOUBLE PRECISION NOT NULL,
    "maidens" INTEGER NOT NULL,
    "runsConceded" INTEGER NOT NULL,
    "wickets" INTEGER NOT NULL,
    "economy" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CricketBowlingFigure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CricketBattingFigure_sessionId_battingOrder_idx" ON "CricketBattingFigure"("sessionId", "battingOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CricketBattingFigure_sessionId_playerId_key" ON "CricketBattingFigure"("sessionId", "playerId");

-- CreateIndex
CREATE INDEX "CricketBowlingFigure_sessionId_bowlingOrder_idx" ON "CricketBowlingFigure"("sessionId", "bowlingOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CricketBowlingFigure_sessionId_playerId_key" ON "CricketBowlingFigure"("sessionId", "playerId");
