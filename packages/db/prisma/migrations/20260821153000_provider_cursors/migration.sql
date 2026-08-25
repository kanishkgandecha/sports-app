CREATE TABLE "ProviderCursor" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "cursor" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderCursor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderCursor_providerId_sessionId_key"
ON "ProviderCursor"("providerId", "sessionId");

CREATE INDEX "ProviderCursor_providerId_updatedAt_idx"
ON "ProviderCursor"("providerId", "updatedAt");
