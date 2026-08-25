# Fixtures

Real Jolpica-F1 (Ergast-compatible) API responses, captured 2026-08-18 for
Checkpoint 6 (see docs/CONTEXT.md, Checkpoint 6 §1). Not hand-written from
documentation — every file here is an actual response body from
`https://api.jolpi.ca/ergast/f1`, pretty-printed (`races.2026.sample.json`
is a real response with `Races` trimmed to its first 2 entries — see below
for why those two). Tests must not depend on the live network; these are
what stand in for it.

| File | Source query | Why this one |
|---|---|---|
| `driverStandings.2026.json` | `/2026/driverstandings/` | Full real current-season driver standings, 22 drivers. Confirms `permanentNumber`/`code` present on every entry, `Constructors` is an array (mid-season team changes), `position`/`points`/`wins` all string-typed numerics |
| `constructorStandings.2026.json` | `/2026/constructorstandings/` | Full real current-season constructor standings, all 11 real 2026 constructors. **The key evidence file for `constructorMapping.ts`** — direct source of the 5 real constructorId/slug mismatches documented there (`red_bull`, `rb`, `haas`, `aston_martin` naming, `cadillac`) |
| `races.2026.sample.json` | `/2026.json`, trimmed to rounds 1-2 | Round 1 (Australian GP) is a normal weekend: FP1/FP2/FP3/Qualifying/Race, no Sprint. Round 2 (Chinese GP) is a **Sprint weekend**: only FP1 (no FP2/FP3), plus `Sprint`/`SprintQualifying`. Together these two real rounds exercise every optional session field this adapter normalizes — a single non-sprint race would not have caught the sprint-weekend field shape |
| `driverStandings.empty2099.json` | `/2099/driverstandings/` | Confirmed real "no data" shape: HTTP 200, `StandingsLists: []`, `StandingsTable.round: null` (not omitted) — the opposite of OpenF1's 404-for-empty convention. Drives the malformed/empty-response normalization tests |
| `error.malformedRequest.json` | `/driverstandings/` (no season) | Confirmed real HTTP 400 body: `{"detail": "Bad Request: Missing one of the required parameters ['season_year']."}` — drives `client.test.ts`'s error-handling tests |
| `seasons.sample.json` | `/seasons/?limit=5&offset=75` | Confirms the plain `{season, url}` shape and that season "2026" is a real, present season (`total: "77"`) |

Re-capture by re-running the `curl` commands in this checkpoint's session if
Jolpica's schema ever changes enough to matter — don't hand-edit these to
make a test pass.
