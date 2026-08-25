-- A provider timestamp is not a safe delivery cursor: timestamps can collide,
-- arrive out of order, or change precision between vendors. PostgreSQL owns
-- this monotonic sequence so reconnecting SSE clients can replay without gaps.
ALTER TABLE "LiveEvent"
ADD COLUMN "sequence" BIGSERIAL NOT NULL;

CREATE UNIQUE INDEX "LiveEvent_sequence_key" ON "LiveEvent"("sequence");
CREATE INDEX "LiveEvent_sessionId_sequence_idx" ON "LiveEvent"("sessionId", "sequence");
