CREATE TABLE "SessionClassification" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "position" INTEGER,
    "status" TEXT NOT NULL,
    "lapsCompleted" INTEGER NOT NULL,
    "points" DOUBLE PRECISION,
    "durationSeconds" DOUBLE PRECISION,
    "gapToLeader" TEXT,
    "phase1Duration" DOUBLE PRECISION,
    "phase2Duration" DOUBLE PRECISION,
    "phase3Duration" DOUBLE PRECISION,
    "phase1Gap" TEXT,
    "phase2Gap" TEXT,
    "phase3Gap" TEXT,
    CONSTRAINT "SessionClassification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Lap" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "lapNumber" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3),
    "duration" DOUBLE PRECISION,
    "sector1" DOUBLE PRECISION,
    "sector2" DOUBLE PRECISION,
    "sector3" DOUBLE PRECISION,
    "speedI1" INTEGER,
    "speedI2" INTEGER,
    "speedTrap" INTEGER,
    "isPitOutLap" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Lap_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TyreStint" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "stintNumber" INTEGER NOT NULL,
    "lapStart" INTEGER NOT NULL,
    "lapEnd" INTEGER,
    "compound" TEXT,
    "tyreAgeAtStart" INTEGER,
    CONSTRAINT "TyreStint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionClassification_sessionId_driverId_key" ON "SessionClassification"("sessionId", "driverId");
CREATE INDEX "SessionClassification_sessionId_position_idx" ON "SessionClassification"("sessionId", "position");
CREATE UNIQUE INDEX "Lap_sessionId_driverId_lapNumber_key" ON "Lap"("sessionId", "driverId", "lapNumber");
CREATE INDEX "Lap_sessionId_driverId_lapNumber_idx" ON "Lap"("sessionId", "driverId", "lapNumber");
CREATE INDEX "Lap_sessionId_duration_idx" ON "Lap"("sessionId", "duration");
CREATE UNIQUE INDEX "TyreStint_sessionId_driverId_stintNumber_key" ON "TyreStint"("sessionId", "driverId", "stintNumber");
CREATE INDEX "TyreStint_sessionId_driverId_stintNumber_idx" ON "TyreStint"("sessionId", "driverId", "stintNumber");
