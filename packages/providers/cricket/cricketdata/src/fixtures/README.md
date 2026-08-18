# Fixtures

Real CricketData.org (`api.cricapi.com/v1`) API responses, captured 2026-08-18
for Cricket Checkpoint 1 (see docs/CONTEXT.md). A real, user-supplied API
key was used to call the live API directly — the same standard every F1
provider checkpoint held itself to. The key itself is redacted
(`"REDACTED"`) from every file below; it was never committed anywhere.

**Every file here is real EXCEPT `matchBbb.CONSTRUCTED.json`**, which is
explicitly marked in its own `_provenance` field and filename — see below
for why.

| File | Source query | Why this one |
|---|---|---|
| `currentMatches.json` | `/currentMatches` (trimmed to 4 of 18 real matches) | Covers the real edge cases this checkpoint's normalization logic actually depends on: an ODI with no `matchType` field at all (`ca1a54c7...`); a match `matchEnded: false` yet genuinely over — "awarded" on a forfeit (`1fa3bd8a...`, **the key evidence file for `deriveFixtureStatus`'s status-text fallback**); a match mid-"Innings Break" with a real, live, in-progress second innings already at 0.3 overs (`e9d200fb...`); an ordinary two-innings completed T20 (`793fd4ac...`) |
| `matchInfo.awarded.json` | `/match_info?id=1fa3bd8a...` | The same awarded/forfeit match's full detail — confirms `tossWinner`/`tossChoice` are real fields present on detail but absent from list summaries |
| `matchInfo.inningsBreak.json` | `/match_info?id=e9d200fb...` | Confirms `status: "Vida Kovai Kings need 163 runs"` — the **only** place a target/required-run-rate fact exists in this provider's real data; there is no structured field for it (drives `deriveTarget`'s design) |
| `matchScorecard.available.json` | `/match_scorecard?id=1fa3bd8a...` | The one real match this checkpoint found with a populated scorecard — confirms `batting[]`/`bowling[]`/`catching[]` field names, the not-out-batsman shape (no `dismissal` field), and that `extras`/`totals` are genuinely empty `{}` even on a real, complete innings |
| `matchScorecard.notFound.json` | `/match_scorecard?id=e9d200fb...` | Confirmed real failure mode: `{"status":"failure","reason":"ERR: Scorecard ... not found"}` for a match that IS live (`match_info` succeeds for the same id) — scorecard availability is NOT guaranteed by match state |
| `matchBbb.notFound.json` | `/match_bbb?id=e9d200fb...` | Confirms `match_bbb` is a real, live endpoint (a match-specific failure reason, not a generic 404/auth error) — but this is the **only** real response this checkpoint ever got from it; every match sampled had `bbbEnabled: false` |
| `seriesInfo.json` | `/series_info?id=6c3c5876...` (matchList trimmed to 3 of 32) | Confirms the `{info: {...}, matchList: [...]}` shape and the real `enddate: "Aug 28"` — **not** always a clean ISO date the way `startdate` is |
| `error.invalidKey.json` | `/currentMatches?apikey=<invalid>` | Confirms the real, always-HTTP-200 failure envelope this client relies on |
| `matchBbb.CONSTRUCTED.json` | **Not a real response** | No real match sampled this checkpoint had `bbbEnabled: true`, so no real `match_bbb` success payload could be captured — see `types.ts`'s `CricketDataBallByBallResponse` doc comment. Hand-constructed against the vendor's own consistent player-ref conventions (confirmed real elsewhere in `match_scorecard`) to exercise `normalizeBalls`' parsing logic; **not evidence of the real shape**, only of what this adapter does if a response roughly matching this arrives. Re-capture for real the moment a real `bbbEnabled: true` match is found. |

Also confirmed real, not captured as separate fixture files (see
`types.ts`'s per-field doc comments for where each is used):

- Real endpoints confirmed to exist (identical auth-gated response, not a
  404): `currentMatches`, `matches`, `match_info`, `match_scorecard`,
  `match_bbb`, `match_squad`, `match_points_table`, `series_squad`,
  `players`, `series`, `countries`, `matches_archive`.
- `cricScore` resolves to a **different, older ASP.NET-based system**
  (errors on a GUID-format check, not the v1 REST API's own auth/error
  convention) — confirmed NOT part of the v1 API surface this adapter uses.
- Rate limit: `info.hitsLimit: 100` on every real response — a real,
  observed daily cap, not just a documented one.

Re-capture by re-running real calls (a valid API key is required — see
`.env.example`'s `CRICKETDATA_API_KEY`) if CricketData.org's schema ever
changes enough to matter — don't hand-edit these to make a test pass.
