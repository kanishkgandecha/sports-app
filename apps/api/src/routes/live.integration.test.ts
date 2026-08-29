import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@sports/db";
import { buildApp } from "../app";

/**
 * Integration tests — real local Postgres, a real listening HTTP server
 * (not `app.inject()`: SSE is a genuinely open, chunked stream that never
 * "completes" the way `.inject()` expects a response to), and the actual
 * LISTEN/NOTIFY channel `LiveEventBus` subscribes to — the same one
 * `apps/ingestion`'s `publishLiveEvent` (publish.ts) notifies in
 * production. This exercises the cursor-based resume/replay logic in
 * live.ts directly, closing the gap Phase 5 could not: the current F1
 * dataset has no live session, so the browser-level SSE flow could not be
 * exercised there — this is the deterministic, database-level proof that
 * cursor resume genuinely delivers each event exactly once, in order,
 * with no duplicates, independent of a real F1 session ever existing.
 *
 * Publishing is done the same way `apps/ingestion/src/publish.ts` does
 * (insert a LiveEvent row, then `pg_notify('live_events', ...)` in one
 * transaction) rather than importing that function across an app
 * boundary — `apps/api` doesn't depend on `apps/ingestion`, and
 * `publish.integration.test.ts` already covers `publishLiveEvent` itself;
 * this file only needs the identical wire format it produces.
 */
const SPORT_SLUG = "sse-test-sport";
const SESSION_ID = "sse-test-session";
let sportId: string;

async function publish(id: string, extra: Record<string, unknown> = {}) {
  const created = await prisma.liveEvent.create({
    data: {
      id,
      sportId,
      sessionId: SESSION_ID,
      eventType: "SYNTHETIC_TICK",
      timestamp: new Date(),
      source: "test",
      payload: { ...extra } as never, // matches publish.ts's own cast — Prisma's Json input type doesn't infer a plain object literal
    },
  });
  const event = {
    id,
    sportId: SPORT_SLUG,
    sessionId: SESSION_ID,
    eventType: "SYNTHETIC_TICK",
    timestamp: created.timestamp.toISOString(),
    source: "test",
    payload: { ...extra },
    sequence: created.sequence.toString(),
  };
  await prisma.$executeRaw`SELECT pg_notify('live_events', ${JSON.stringify(event)})`;
  return created.sequence;
}

/**
 * Reads Server-Sent Events off a streaming Response until `count`
 * `live-event` frames have arrived or `timeoutMs` elapses. Returns them
 * plus a way to stop reading.
 *
 * Deliberately a single outstanding `reader.read()` at a time, with the
 * timeout enforced by cancelling the *reader* (not by racing a per-
 * iteration timer against `read()`): `ReadableStreamDefaultReader` only
 * permits one in-flight `read()` call — a `Promise.race` against a short
 * per-iteration timer looks reasonable but leaves the "losing" `read()`
 * call still pending underneath, and issuing a second `read()` next
 * iteration while the first is still outstanding produced exactly the
 * silent hangs this comment now guards against (caught before this file's
 * first real run — see docs/CONTEXT.md's Phase 6 checkpoint).
 */
async function readLiveEvents(
  response: Response,
  count: number,
  timeoutMs = 8000,
): Promise<{ events: Array<{ id: string; sequence: string }>; cancel: () => Promise<void> }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: Array<{ id: string; sequence: string }> = [];
  let buffer = "";
  const cancel = () => reader.cancel().catch(() => undefined);
  const timeoutHandle = setTimeout(() => {
    reader
      .cancel(new Error(`timed out waiting for ${count} live-event frame(s), got ${events.length}`))
      .catch(() => undefined);
  }, timeoutMs);

  try {
    while (events.length < count) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (frame.startsWith(": ")) continue; // heartbeat comment
        const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
        const eventLine = frame.split("\n").find((line) => line.startsWith("event: "));
        if (eventLine?.slice(7) === "live-event" && dataLine) {
          const parsed = JSON.parse(dataLine.slice(6));
          events.push({ id: parsed.id, sequence: parsed.sequence });
        }
      }
    }
  } finally {
    clearTimeout(timeoutHandle);
  }
  if (events.length < count) {
    throw new Error(`stream ended before ${count} live-event frame(s) arrived, got ${events.length}`);
  }
  return { events, cancel };
}

describe("GET /api/sessions/:sessionId/stream (integration, real Postgres + LISTEN/NOTIFY)", () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    const sport = await prisma.sport.upsert({
      where: { slug: SPORT_SLUG },
      update: {},
      create: { slug: SPORT_SLUG, name: "SSE Test Sport", status: "beta" },
    });
    // Self-healing: a previous run's afterAll can fail to finish (e.g. an
    // SSE reader that didn't get cancelled in time, holding a hook open
    // past its timeout — exactly what an earlier draft of this file did).
    // Clearing any leftover rows for this sport up front means a retry
    // after that kind of partial failure doesn't collide on `LiveEvent.id`.
    await prisma.liveEvent.deleteMany({ where: { sportId: sport.id } });
    sportId = sport.id;
    const competition = await prisma.competition.upsert({
      where: { id: "sse-test-competition" },
      update: {},
      create: {
        id: "sse-test-competition",
        sportId: sport.id,
        slug: "sse-test-competition",
        name: "Test",
        type: "championship",
      },
    });
    const season = await prisma.season.upsert({
      where: { id: "sse-test-season" },
      update: {},
      create: {
        id: "sse-test-season",
        competitionId: competition.id,
        label: "2098",
        startDate: new Date("2098-01-01"),
        endDate: new Date("2098-12-31"),
      },
    });
    const fixture = await prisma.fixture.upsert({
      where: { id: "sse-test-fixture" },
      update: {},
      create: {
        id: "sse-test-fixture",
        sportId: sport.id,
        competitionId: competition.id,
        seasonId: season.id,
        slug: "sse-test-fixture",
        name: "SSE Test Fixture",
        status: "live",
        startTime: new Date(),
      },
    });
    await prisma.session.upsert({
      where: { id: SESSION_ID },
      update: {},
      create: {
        id: SESSION_ID,
        fixtureId: fixture.id,
        type: "RACE",
        status: "live",
        startTime: new Date(Date.now() - 5 * 60 * 1000),
        endTime: new Date(Date.now() + 55 * 60 * 1000),
      },
    });

    app = await buildApp(process.env.DATABASE_URL!);
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("expected a real listening TCP address");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (!sportId) return;

    await prisma.liveEvent.deleteMany({ where: { sportId } });
    await prisma.session.deleteMany({ where: { id: SESSION_ID } });
    await prisma.fixture.deleteMany({ where: { id: "sse-test-fixture" } });
    await prisma.season.deleteMany({ where: { id: "sse-test-season" } });
    await prisma.competition.deleteMany({ where: { id: "sse-test-competition" } });
    await prisma.sport.deleteMany({ where: { slug: SPORT_SLUG } });
  });

  it("sets Access-Control-Allow-Origin for an allowed browser origin, and omits it for one that isn't allowed — Phase 6 regression, this stream bypasses @fastify/cors entirely", async () => {
    // readApiConfig's CORS_ORIGINS default (unset in this test process) is
    // exactly "http://localhost:3000" — see apps/api/src/config.ts.
    const allowed = await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/stream`, {
      headers: { Origin: "http://localhost:3000" },
    });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    await allowed.body?.cancel();

    const disallowed = await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/stream`, {
      headers: { Origin: "https://evil.example" },
    });
    expect(disallowed.headers.get("access-control-allow-origin")).toBeNull();
    await disallowed.body?.cancel();
  });

  it("keeps the real SSE connection open past Node's global per-socket idle timeout", async () => {
    app.server.closeIdleConnections();
    const nextSocket = new Promise<import("node:net").Socket>((resolve) => app.server.once("connection", resolve));
    const [socket, response] = await Promise.all([nextSocket, fetch(`${baseUrl}/api/sessions/${SESSION_ID}/stream`)]);
    try {
      await new Promise((resolve) => setTimeout(resolve, 10_500));
      expect(socket.destroyed).toBe(false);
    } finally {
      await response.body?.cancel();
    }
  }, 15_000);

  it("sends a ready event immediately, then delivers a genuinely new live event", async () => {
    const response = await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/stream`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");

    const publishSoon = new Promise((resolve) => setTimeout(resolve, 150)).then(() => publish("connect-test-1"));
    const { events, cancel } = await readLiveEvents(response, 1);
    await publishSoon;

    expect(events).toEqual([{ id: "connect-test-1", sequence: expect.any(String) }]);
    await cancel();
  }, 10000);

  it("resumes from a cursor, replaying only events after it, exactly once and in order — no duplicates", async () => {
    await publish("resume-test-1");
    const cursorSequence = await publish("resume-test-2");
    await publish("resume-test-3");
    await publish("resume-test-4");

    const response = await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/stream?after=${cursorSequence}`);
    const { events, cancel } = await readLiveEvents(response, 2);
    await cancel();

    // Only events strictly after the cursor, each exactly once, in sequence order.
    expect(events.map((e) => e.id)).toEqual(["resume-test-3", "resume-test-4"]);
    const sequences = events.map((e) => BigInt(e.sequence));
    expect(sequences[1]).toBeGreaterThan(sequences[0]);
    expect(sequences[0]).toBeGreaterThan(cursorSequence);
  }, 10000);

  it("does not duplicate an event that arrives live while a cursor replay is still catching up", async () => {
    const cursorSequence = await publish("live-during-replay-1");

    // Reconnect with a cursor while simultaneously publishing a brand-new
    // event — exercises the `replaying` buffering branch in live.ts (an
    // event that arrives over LISTEN/NOTIFY while the cursor-replay
    // database read is still in flight must be buffered and deduplicated
    // against the replay, not delivered twice).
    const connectPromise = fetch(`${baseUrl}/api/sessions/${SESSION_ID}/stream?after=${cursorSequence}`);
    const publishPromise = publish("live-during-replay-2");
    const [response] = await Promise.all([connectPromise, publishPromise]);

    const { events, cancel } = await readLiveEvents(response, 1);
    await cancel();

    expect(events).toEqual([{ id: "live-during-replay-2", sequence: expect.any(String) }]);
  }, 10000);

  it("simulates a client reconnect after a dropped connection: the second connection resumes from the last cursor with no duplicate and no gap", async () => {
    // First connection: receive one event, then abandon it (simulating a
    // dropped network connection) without an orderly close.
    const first = await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/stream`);
    const publishFirst = new Promise((resolve) => setTimeout(resolve, 100)).then(() => publish("reconnect-test-1"));
    const { events: firstEvents, cancel: cancelFirst } = await readLiveEvents(first, 1);
    await publishFirst;
    await cancelFirst();

    const lastSeenSequence = firstEvents[0].sequence;

    // A brand-new event is published while genuinely disconnected (no
    // subscriber at all) — proves the *next* connection's cursor replay,
    // not a lucky live delivery, is what picks it up.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await publish("reconnect-test-2");

    // Second connection ("the client reconnecting"), resuming from the
    // cursor it last saw.
    const second = await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/stream?after=${lastSeenSequence}`);
    const { events: secondEvents, cancel: cancelSecond } = await readLiveEvents(second, 1);
    await cancelSecond();

    expect(secondEvents).toEqual([{ id: "reconnect-test-2", sequence: expect.any(String) }]);
    expect(secondEvents.map((e) => e.id)).not.toContain("reconnect-test-1"); // no duplicate of what the first connection already saw
  }, 10000);

  it("rejects a malformed cursor with 400, matching parseCursor's contract", async () => {
    const response = await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/stream?after=not-a-number`);
    expect(response.status).toBe(400);
  });
});
