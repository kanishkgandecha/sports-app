import { apiGet } from "./api";
import type { DataFreshness } from "@sports/domain";

/**
 * Typed fetchers for the F1 read endpoints (apps/api/src/routes/f1.ts,
 * Checkpoint 5). Response shapes mirror the API's normalized output
 * exactly — never a Prisma model, never an OpenF1 shape (see
 * docs/CONTEXT.md §10).
 */

export interface F1Freshness {
  state: DataFreshness;
  updatedAt: string | null;
}

export interface F1Venue {
  id: string;
  name: string;
  country: string;
  timezone: string;
}

export interface F1Fixture {
  id: string;
  slug: string;
  name: string;
  status: string;
  startTime: string;
  venue: F1Venue | null;
  detailAvailable: boolean;
}

export type F1SessionLifecycle = "upcoming" | "live" | "completed";
export type F1SessionDetailStatus = "summary" | "importing" | "available" | "upstream-unavailable" | "failed";

export interface F1Session {
  id: string;
  type: string;
  status: string;
  lifecycle: F1SessionLifecycle;
  startTime: string;
  endTime: string | null;
  detailAvailable: boolean;
  detailStatus: F1SessionDetailStatus;
  detailReason: string | null;
  nextRetryAt: string | null;
}

export interface F1DriverRef {
  id: string;
  name: string;
  shortName: string | null;
  avatarUrl: string | null;
  team: { id: string; name: string; colorHex: string | null } | null;
}

export interface F1TimingRow {
  position: number;
  driver: F1DriverRef;
  gapToLeader: string | null;
  intervalToAhead: string | null;
  lastLapTime: number | null;
  bestLapTime: number | null;
  sector1: number | null;
  sector2: number | null;
  sector3: number | null;
  tyreCompound: string | null;
  state: string;
}

export interface F1RaceControlMessage {
  id: string;
  timestamp: string;
  category: string;
  message: string;
}

export interface F1PitStop {
  id: string;
  driver: F1DriverRef;
  lap: number;
  durationMs: number;
  timestamp: string;
}

export interface F1SessionResult {
  position: number | null;
  driver: F1DriverRef;
  status: "classified" | "dnf" | "dns" | "dsq";
  lapsCompleted: number | null;
  points: number | null;
  durationSeconds: number | null;
  gapToLeader: string | null;
  phases: Array<{ duration: number | null; gap: string | null }>;
}

export interface F1Lap {
  id: string;
  driver: F1DriverRef;
  lapNumber: number;
  startedAt: string | null;
  duration: number | null;
  sector1: number | null;
  sector2: number | null;
  sector3: number | null;
  speedI1: number | null;
  speedI2: number | null;
  speedTrap: number | null;
  isPitOutLap: boolean;
}

export interface F1TyreStint {
  id: string;
  driver: F1DriverRef;
  stintNumber: number;
  lapStart: number;
  lapEnd: number | null;
  compound: string | null;
  tyreAgeAtStart: number | null;
}

/**
 * Checkpoint 6 — championship standings, sourced from
 * `GET /api/f1/seasons/:year/standings/*` (apps/api/src/routes/f1.ts).
 * Deliberately no movement/position-change field: the API doesn't send one
 * (see that route's doc comment on why — nothing here fabricates one from
 * a single snapshot).
 */
export interface F1StandingsDriverRef {
  id: string;
  name: string;
  shortName: string | null;
  avatarUrl: string | null;
}

export interface F1StandingsTeamRef {
  id: string;
  name: string;
  colorHex: string | null;
}

export interface F1DriverStanding {
  position: number;
  points: number;
  wins: number | null;
  driver: F1StandingsDriverRef;
  team: F1StandingsTeamRef | null;
}

export interface F1ConstructorStanding {
  position: number;
  points: number;
  wins: number | null;
  team: F1StandingsTeamRef;
}

export function getF1Fixture(fixtureId: string) {
  return apiGet<{ fixture: F1Fixture; sessions: F1Session[] }>(`/api/f1/fixtures/${fixtureId}`);
}

export function getF1Session(sessionId: string) {
  return apiGet<{ session: F1Session; fixture: F1Fixture; freshness: F1Freshness }>(`/api/f1/sessions/${sessionId}`);
}

export function getF1Timing(sessionId: string) {
  return apiGet<{ timing: F1TimingRow[]; freshness: F1Freshness }>(`/api/f1/sessions/${sessionId}/timing`);
}

export function getF1RaceControl(sessionId: string) {
  return apiGet<{ messages: F1RaceControlMessage[]; freshness: F1Freshness }>(
    `/api/f1/sessions/${sessionId}/race-control`,
  );
}

export function getF1PitStops(sessionId: string) {
  return apiGet<{ pitStops: F1PitStop[]; freshness: F1Freshness }>(`/api/f1/sessions/${sessionId}/pit-stops`);
}

export function getF1Results(sessionId: string) {
  return apiGet<{ results: F1SessionResult[] }>(`/api/f1/sessions/${sessionId}/results`);
}

export function getF1Laps(sessionId: string, driverId?: string) {
  const query = new URLSearchParams();
  if (driverId) query.set("driverId", driverId);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiGet<{ laps: F1Lap[]; truncated: boolean }>(`/api/f1/sessions/${sessionId}/laps${suffix}`);
}

export function getF1Stints(sessionId: string) {
  return apiGet<{ stints: F1TyreStint[] }>(`/api/f1/sessions/${sessionId}/stints`);
}

export function getF1DriverStandings(year: number) {
  return apiGet<{ season: { year: string; id: string }; standings: F1DriverStanding[] }>(
    `/api/f1/seasons/${year}/standings/drivers`,
  );
}

export function getF1ConstructorStandings(year: number) {
  return apiGet<{ season: { year: string; id: string }; standings: F1ConstructorStanding[] }>(
    `/api/f1/seasons/${year}/standings/constructors`,
  );
}
