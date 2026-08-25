# Fixtures

Real OpenF1 API responses, captured 2026-08-18 for Checkpoint 3 (see
docs/CONTEXT.md §8). Not hand-written from documentation — every file here is
an actual response body, pretty-printed. Tests must not depend on the live
network; these are what stand in for it.

| File | Source query | Why this one |
|---|---|---|
| `meetings.belgium2024.json` | `/meetings?meeting_key=1242` | A normal race weekend, no cancellations |
| `sessions.belgium2024.json` | `/sessions?meeting_key=1242` | Confirms `session_name` vs `session_type` distinguish FP1/FP2/FP3 (both "Practice" as `session_type`) |
| `drivers.belgium2024race.json` | `/drivers?session_key=9574` | Full 2024 grid — confirms `team_colour` has no `#` prefix, `headshot_url` populated |
| `raceControl.australia2023race.json` | `/race_control?session_key=7787` | **The key evidence file.** 2023 Australian GP — two genuine red flags, a full Safety Car, a VSC. Corrects the Checkpoint 2 assumption that Red Flag is `category=SessionStatus`; it's actually `category=Flag, flag=RED`. |
| `laps.sample.json` | `/laps?session_key=9574&driver_number=1&lap_number=5` | One representative lap — confirms numeric sector/lap durations, mini-sector segment arrays (deliberately not modeled) |
| `position.sample.json` | `/position?session_key=9574&driver_number=1` | Confirms position is a raw stream, no "from" field — adapter must diff |
| `intervals.sample.json` | `/intervals?session_key=9574&driver_number=1` (trimmed to 8 rows) | Confirms `gap_to_leader`/`interval` numeric in the common case |
| `pit.belgium2024race.json` | `/pit?session_key=9574` | **Resolved the pit-duration unknown from Checkpoint 2.** `pit_duration` and `lane_duration` were equal in every row (0/34 differed); `stop_duration` was null in every row |
| `stints.sample.json` | `/stints?session_key=9574&driver_number=1` | Confirms compound naming matches our `TyreCompound` enum |
| `championship.empty.json` | `/drivers_championship` (any query) | OpenF1's actual "no rows" response shape — verified this is what the beta championship endpoints return for every query tried, not a hypothetical |

Re-capture by re-running the `curl` commands in this checkpoint's session if
OpenF1's schema ever changes enough to matter — don't hand-edit these to make
a test pass.
