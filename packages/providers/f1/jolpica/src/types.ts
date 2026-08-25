/**
 * Raw Jolpica-F1 (Ergast-compatible) response shapes — verified against real
 * responses from https://api.jolpi.ca/ergast/f1 (see docs/CONTEXT.md,
 * Checkpoint 6 §1 "Research"). These types exist ONLY inside this package.
 * Nothing outside `packages/providers/f1/jolpica` may import from this file
 * — same provider-boundary rule as OpenF1 (ARCHITECTURE.md §4).
 *
 * Jolpica wraps every response in an `MRData` envelope (an inherited Ergast
 * convention) — a different shape than OpenF1's bare-array responses, so
 * this package's HTTP client (client.ts) is not a copy of OpenF1's; it has
 * to unwrap this envelope instead.
 */

export interface JolpicaDriver {
  driverId: string;
  /** FIA car number as a string, e.g. "12" — the field this whole adapter's driver-identity mapping hinges on (see reference.ts / constructorMapping.ts doc comments and docs/CONTEXT.md Checkpoint 6 §2). Absent for a small number of historical drivers who never had a permanent number; never assume present. */
  permanentNumber?: string;
  /** 3-letter code, e.g. "ANT" — matches our existing Player.shortName built by OpenF1Adapter, verified against real DB rows. */
  code?: string;
  url: string;
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  nationality: string;
}

export interface JolpicaConstructor {
  constructorId: string;
  url: string;
  name: string;
  nationality: string;
}

export interface JolpicaDriverStanding {
  position: string;
  positionText: string;
  points: string;
  wins: string;
  Driver: JolpicaDriver;
  Constructors: JolpicaConstructor[];
}

export interface JolpicaConstructorStanding {
  position: string;
  positionText: string;
  points: string;
  wins: string;
  Constructor: JolpicaConstructor;
}

export interface JolpicaStandingsList {
  season: string;
  round: string;
  DriverStandings?: JolpicaDriverStanding[];
  ConstructorStandings?: JolpicaConstructorStanding[];
}

export interface JolpicaStandingsTable {
  season: string;
  /** `null`, not absent, on an empty result — verified against the real `/2099/driverstandings/` response (see fixtures/driverStandings.empty2099.json). */
  round?: string | null;
  StandingsLists: JolpicaStandingsList[];
}

export interface JolpicaLocation {
  lat: string;
  long: string;
  locality: string;
  country: string;
}

export interface JolpicaCircuit {
  circuitId: string;
  url: string;
  circuitName: string;
  Location: JolpicaLocation;
}

export interface JolpicaDateTime {
  date: string;
  time?: string;
}

export interface JolpicaRace {
  season: string;
  round: string;
  url: string;
  raceName: string;
  Circuit: JolpicaCircuit;
  date: string;
  time?: string;
  FirstPractice?: JolpicaDateTime;
  SecondPractice?: JolpicaDateTime;
  ThirdPractice?: JolpicaDateTime;
  Qualifying?: JolpicaDateTime;
  Sprint?: JolpicaDateTime;
  SprintQualifying?: JolpicaDateTime;
}

export interface JolpicaRaceTable {
  season: string;
  round?: string;
  Races: JolpicaRace[];
}

export interface JolpicaSeason {
  season: string;
  url: string;
}

export interface JolpicaSeasonTable {
  Seasons: JolpicaSeason[];
}

/**
 * The envelope every Jolpica endpoint wraps its payload in. Exactly one of
 * `StandingsTable` / `RaceTable` / `SeasonTable` is present depending on
 * which endpoint was called — modeled as all-optional rather than a
 * discriminated union because the client (client.ts) is generic over the
 * table shape and doesn't itself know which endpoint was requested.
 */
export interface JolpicaResponse {
  MRData: {
    xmlns: string;
    series: string;
    url: string;
    limit: string;
    offset: string;
    total: string;
    StandingsTable?: JolpicaStandingsTable;
    RaceTable?: JolpicaRaceTable;
    SeasonTable?: JolpicaSeasonTable;
  };
}

/** Body shape of a 400 response, e.g. requesting `/driverstandings/` with no season. Verified against the real API — see docs/CONTEXT.md Checkpoint 6 §1. */
export interface JolpicaErrorBody {
  detail: string;
}
