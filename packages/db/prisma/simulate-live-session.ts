import { prisma } from "../src/index.js";

/**
 * Phase 6 — a deterministic, fully reversible way to verify the live-
 * session browser flow (Event Center timing/freshness/SSE reconnect) when
 * no real F1 session is live in the current rolling-archive dataset (the
 * exact gap Phase 5 documented and could not close). Never touches real
 * F1 data: everything it creates lives under one dedicated, clearly-named
 * fixture/session id, and `stop` deletes all of it.
 *
 * Publishes through the identical insert-then-`pg_notify` path
 * apps/ingestion/src/publish.ts uses in production (same LiveEvent table,
 * same `live_events` channel apps/api's LiveEventBus subscribes to), and
 * updates the corresponding DriverTiming row on each `tick` so the Event
 * Center's Timing table visibly changes — not just the connection/
 * freshness indicator. This is a dev script, not a production code path:
 * it is never imported by apps/api, apps/web, or apps/ingestion, and adds
 * no conditional branch to any of them.
 *
 * Usage (from repo root, against the same DATABASE_URL the running
 * Compose stack's Postgres uses):
 *
 *   node --env-file=.env scripts/run-with-root-env.mjs \
 *     pnpm --filter @sports/db exec tsx prisma/simulate-live-session.ts start
 *
 *   node --env-file=.env scripts/run-with-root-env.mjs \
 *     pnpm --filter @sports/db exec tsx prisma/simulate-live-session.ts tick
 *
 *   node --env-file=.env scripts/run-with-root-env.mjs \
 *     pnpm --filter @sports/db exec tsx prisma/simulate-live-session.ts stop
 *
 * `start` prints the fixture id to open (`/events/<id>`). Run `tick` again
 * any time to simulate another live update arriving. Always finish with
 * `stop` to restore the database to exactly how it was before `start`.
 */
const SPORT_SLUG = "f1"; // reuses the real F1 sport row — every real route filters by sport slug "f1" the same way
const FIXTURE_ID = "f1-dev-sim-live-fixture"; // must start with "f1-" — app/events/[id]/page.tsx 404s anything that doesn't
const SESSION_ID = "dev-sim-live-session";
const COMPETITION_ID = "dev-sim-live-competition";
const SEASON_ID = "dev-sim-live-season";

async function start() {
  const sport = await prisma.sport.upsert({
    where: { slug: SPORT_SLUG },
    update: {},
    create: { slug: SPORT_SLUG, name: "Formula 1", status: "live" },
  });
  const competition = await prisma.competition.upsert({
    where: { id: COMPETITION_ID },
    update: {},
    create: {
      id: COMPETITION_ID,
      sportId: sport.id,
      slug: "dev-sim-live-competition",
      name: "Local Live Simulation",
      type: "championship",
    },
  });
  const season = await prisma.season.upsert({
    where: { id: SEASON_ID },
    update: {},
    create: {
      id: SEASON_ID,
      competitionId: competition.id,
      label: "Dev Simulation",
      startDate: new Date(),
      endDate: new Date(Date.now() + 86_400_000),
    },
  });
  const start = new Date(Date.now() - 2 * 60 * 1000);
  const end = new Date(Date.now() + 58 * 60 * 1000);
  await prisma.fixture.upsert({
    where: { id: FIXTURE_ID },
    update: { status: "live", startTime: start },
    create: {
      id: FIXTURE_ID,
      sportId: sport.id,
      competitionId: competition.id,
      seasonId: season.id,
      slug: "dev-simulated-live-session",
      name: "Simulated Live Session (dev only, Phase 6 SSE verification)",
      status: "live",
      startTime: start,
    },
  });
  await prisma.session.upsert({
    where: { id: SESSION_ID },
    update: { startTime: start, endTime: end, status: "live" },
    create: { id: SESSION_ID, fixtureId: FIXTURE_ID, type: "RACE", status: "live", startTime: start, endTime: end },
  });

  // Reuse a real, already-bootstrapped driver so the timing row shows a
  // genuine name/team/color instead of a synthetic id degrading in the UI
  // (see f1.ts's "never drop the row, degrade gracefully" comment).
  const driver = await prisma.player.findFirst({ where: { sportId: sport.id }, orderBy: { id: "asc" } });
  if (!driver) {
    throw new Error("no Player rows found — run the F1 calendar bootstrap first so there's a real driver to reuse");
  }

  await prisma.driverTiming.upsert({
    where: { sessionId_driverId: { sessionId: SESSION_ID, driverId: driver.id } },
    update: { position: 1, lastLapTime: 90, bestLapTime: 90, state: "running" },
    create: {
      sessionId: SESSION_ID,
      driverId: driver.id,
      position: 1,
      lastLapTime: 90,
      bestLapTime: 90,
      state: "running",
    },
  });

  console.log(`Simulated live session ready — lifecycle is "live" for the next ~58 minutes.`);
  console.log(`Open: /events/${FIXTURE_ID}`);
  console.log(`Driver reused for the timing row: ${driver.id}`);
  console.log(`Run "tick" to publish a live update; run "stop" when done to remove everything.`);
}

async function tick() {
  const sport = await prisma.sport.findUniqueOrThrow({ where: { slug: SPORT_SLUG } });
  const row = await prisma.driverTiming.findUnique({
    where: { sessionId_driverId: { sessionId: SESSION_ID, driverId: (await requireDriver()).id } },
  });
  if (!row) throw new Error('no DriverTiming row found — run "start" first');

  const newLapTime = Math.round((row.lastLapTime! - 0.3 + Math.random() * 0.6) * 1000) / 1000;
  const bestLapTime = Math.min(row.bestLapTime ?? newLapTime, newLapTime);
  await prisma.driverTiming.update({ where: { id: row.id }, data: { lastLapTime: newLapTime, bestLapTime } });

  const timestamp = new Date();
  const eventId = `dev-sim-tick-${timestamp.getTime()}`;
  const created = await prisma.liveEvent.create({
    data: {
      id: eventId,
      sportId: sport.id,
      sessionId: SESSION_ID,
      eventType: "SYNTHETIC_TICK",
      timestamp,
      source: "dev-simulate-live-session",
      payload: { driverId: row.driverId, lastLapTime: newLapTime, bestLapTime },
    },
  });
  const wireEvent = {
    id: eventId,
    sportId: SPORT_SLUG,
    sessionId: SESSION_ID,
    eventType: "SYNTHETIC_TICK",
    timestamp: timestamp.toISOString(),
    source: "dev-simulate-live-session",
    payload: { driverId: row.driverId, lastLapTime: newLapTime, bestLapTime },
    sequence: created.sequence.toString(),
  };
  await prisma.$executeRaw`SELECT pg_notify('live_events', ${JSON.stringify(wireEvent)})`;

  console.log(
    `Published tick (sequence ${created.sequence}): lastLapTime -> ${newLapTime}s, bestLapTime -> ${bestLapTime}s`,
  );
}

async function requireDriver() {
  const driver = await prisma.driverTiming.findFirst({ where: { sessionId: SESSION_ID } });
  if (!driver) throw new Error('no DriverTiming row found — run "start" first');
  return { id: driver.driverId };
}

async function stop() {
  await prisma.liveEvent.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.driverTiming.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.session.deleteMany({ where: { id: SESSION_ID } });
  await prisma.fixture.deleteMany({ where: { id: FIXTURE_ID } });
  await prisma.season.deleteMany({ where: { id: SEASON_ID } });
  await prisma.competition.deleteMany({ where: { id: COMPETITION_ID } });
  console.log("Simulated live session removed — database restored to its prior state.");
}

const commands: Record<string, () => Promise<void>> = { start, tick, stop };
const command = process.argv[2] ?? "";

const run = commands[command];
if (!run) {
  console.error("Usage: tsx prisma/simulate-live-session.ts <start|tick|stop>");
  process.exitCode = 1;
} else {
  run()
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
