# Sports Platform

Live sports tracking + optional sports education. Architecture and rationale:
`docs/ARCHITECTURE.md`, `docs/CONTEXT.md` (working docs, gitignored — see
that folder's own README). Implementation order: F1 → Cricket → Football →
Esports (fixed).

Phase 1 (F1) is in progress: the OpenF1 provider adapter and the ingestion
pipeline (calendar bootstrap, active-session polling, live current-state
persistence) are built and tested against real captured/live OpenF1 data.
The F1 Event Center / UI hasn't started yet.

## Layout

```text
apps/
  web/         Next.js frontend
  api/         Fastify REST + SSE
  ingestion/   Long-running worker — synthetic health-check job (Phase 0)
               + F1 job (calendar bootstrap, active-session polling) side by side
packages/
  domain/                 Shared TypeScript types (core + F1 extension)
  db/                     Prisma schema + client
  providers/core/         SportsProvider interface + FakeSportsProvider
  providers/f1/openf1/    OpenF1 adapter — normalization, real fixtures, tests
  education/              Markdown/MDX content loader + relationship resolver
  design/                 Design tokens (colors, type, spacing, motion)
content/
  education/f1/      Seeded F1 glossary (Markdown + frontmatter)
```

## Running it locally

```bash
cp .env.example .env          # already done if you're reading this post-scaffold
docker compose up -d          # starts local Postgres on :5432
pnpm install
pnpm --filter @sports/db exec prisma migrate dev --name init
pnpm --filter @sports/db exec tsx prisma/seed.ts

# three terminals:
pnpm --filter @sports/api dev         # http://localhost:4000
pnpm --filter @sports/ingestion dev   # publishes a synthetic LiveEvent every 2s
pnpm --filter @sports/web dev         # http://localhost:3000
```

Open `http://localhost:3000` — the "Synthetic pipeline check" panel should
start ticking within a couple of seconds (Phase 0's exit criterion: ingestion
→ Postgres `LISTEN/NOTIFY` → SSE → browser).

The ingestion worker also starts an F1 job alongside the synthetic one —
bootstraps the current season's calendar from OpenF1 and polls whichever
session is currently live. Configuration (all optional, sensible defaults):

| Env var | Default | What it does |
|---|---|---|
| `F1_PROVIDER` | `openf1` | `disabled` turns the F1 job off entirely |
| `F1_POLL_INTERVAL_MS` | `15000` | How often an active session is polled |
| `F1_BOOTSTRAP_SEASONS` | current year | Comma-separated years to bootstrap, e.g. `2023,2024,2025,2026` |
| `F1_BOOTSTRAP_REQUEST_DELAY_MS` | `400` | Pacing between `/sessions` requests during bootstrap — see docs/CONTEXT.md §9 for why this exists |
| `F1_MAX_SESSION_DURATION_MS` | 4 hours | Safety cap so a session with no known end time isn't polled forever |

## Tests

```bash
pnpm test
```

Runs the `SportsProvider` contract tests (against `FakeSportsProvider` and
`OpenF1Adapter`), the OpenF1 adapter's normalization tests (against real
captured OpenF1 responses — see `packages/providers/f1/openf1/src/fixtures/
README.md`), the education content loader tests, and the ingestion package's
tests. The ingestion package's bootstrap/persistence tests are integration
tests against the real local Postgres (the same one `docker compose up`
starts) — `pnpm test` needs it running, same as `pnpm dev`.

## What's next

F1 Event Center / UI — see docs/CONTEXT.md §9 for the detailed plan and open
risks (OpenF1's free-tier rate limit is tight enough to matter under heavy
testing — see that section's pacing/retry notes).
