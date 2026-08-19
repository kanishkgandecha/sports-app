import { apiGet } from "./api";
import type { DataFreshness } from "@sports/domain";

/**
 * Typed fetchers for the Cricket read endpoints
 * (apps/api/src/routes/cricket.ts, Cricket Checkpoint 2). Same discipline
 * as f1Api.ts: response shapes mirror the API's normalized output exactly
 * — never a Prisma model, never a raw CricketData.org shape.
 */

export interface CricketFreshness {
  state: DataFreshness;
  updatedAt: string | null;
}

export interface CricketVenue {
  id: string;
  name: string;
  country: string | null;
  timezone: string;
}

export interface CricketCompetitionRef {
  id: string;
  name: string;
  type: string;
}

export interface CricketFixture {
  id: string;
  slug: string;
  name: string;
  status: string;
  startTime: string;
  venue: CricketVenue | null;
  /** Real, already-related data (Cricket Checkpoint 3) — null only when a fixture genuinely has none, never omitted to save a join. */
  competition: CricketCompetitionRef | null;
}

export type CricketSessionLifecycle = "upcoming" | "live" | "completed";

export interface CricketSession {
  id: string;
  type: string;
  status: string;
  lifecycle: CricketSessionLifecycle;
  startTime: string;
  endTime: string | null;
}

export interface CricketTeamRef {
  id: string;
  name: string;
  colorHex: string | null;
}

export interface CricketPlayerRef {
  id: string;
  name: string;
  shortName: string | null;
  avatarUrl: string | null;
}

export interface CricketFixtureDetail {
  format: "TEST" | "ODI" | "T20" | null;
  tossWonByTeam: CricketTeamRef | null;
  tossDecision: "BAT" | "BOWL" | null;
  result: string | null;
}

/**
 * `notOutBatsmen` is a plain array, not `striker`/`nonStriker` — verified
 * real limitation (Checkpoint 1): the provider gives no "on strike" flag,
 * so this API never claims to know which of the two is actually facing.
 */
export interface CricketInnings {
  battingTeam: CricketTeamRef;
  bowlingTeam: CricketTeamRef;
  runs: number;
  wickets: number;
  overs: number;
  notOutBatsmen: CricketPlayerRef[];
  currentBowler: CricketPlayerRef | null;
  target: number | null;
  requiredRunRate: number | null;
}

export interface CricketBattingRow {
  player: CricketPlayerRef;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  dismissalText: string;
}

export interface CricketBowlingRow {
  player: CricketPlayerRef;
  overs: number;
  maidens: number;
  runsConceded: number;
  wickets: number;
  economy: number;
}

export interface CricketScorecard {
  batting: CricketBattingRow[];
  bowling: CricketBowlingRow[];
}

export interface CricketLiveEvent {
  id: string;
  eventType: "BALL" | "SCORE_UPDATE" | "WICKET" | "MATCH_STATUS" | string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export function getCricketFixtures(status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiGet<{ fixtures: CricketFixture[] }>(`/api/cricket/fixtures${query}`);
}

export function getCricketFixture(fixtureId: string) {
  return apiGet<{ fixture: CricketFixture; sessions: CricketSession[]; detail: CricketFixtureDetail | null }>(
    `/api/cricket/fixtures/${fixtureId}`,
  );
}

export function getCricketSession(sessionId: string) {
  return apiGet<{ session: CricketSession; fixture: CricketFixture; freshness: CricketFreshness }>(
    `/api/cricket/sessions/${sessionId}`,
  );
}

export function getCricketInnings(sessionId: string) {
  return apiGet<{ innings: CricketInnings | null; freshness: CricketFreshness }>(`/api/cricket/sessions/${sessionId}/innings`);
}

export function getCricketScorecard(sessionId: string) {
  return apiGet<{ scorecard: CricketScorecard | null; freshness: CricketFreshness }>(`/api/cricket/sessions/${sessionId}/scorecard`);
}

export function getCricketEvents(sessionId: string) {
  return apiGet<{ events: CricketLiveEvent[]; freshness: CricketFreshness }>(`/api/cricket/sessions/${sessionId}/events`);
}
