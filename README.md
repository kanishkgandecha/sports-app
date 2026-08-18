# Sports Platform

Live sports tracking + optional sports education. Architecture and rationale:
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) (working doc, gitignored —
see that folder's note). Implementation order: F1 → Cricket → Football →
Esports (fixed, see ARCHITECTURE.md §0/§7).

This is Phase 0 — the foundation, proven with synthetic live data before any
real sport is implemented.

## Layout

```text
apps/
  web/         Next.js frontend
  api/         Fastify REST + SSE
  ingestion/   Long-running worker (synthetic job today, per-sport jobs later)
packages/
  domain/            Shared TypeScript types
  db/                Prisma schema + client
  providers/core/    SportsProvider interface + FakeSportsProvider
  education/         Markdown/MDX content loader + relationship resolver
  design/            Design tokens (colors, type, spacing, motion)
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
start ticking within a couple of seconds. That's the Phase 0 exit criterion
from ARCHITECTURE.md §7: ingestion → Postgres `LISTEN/NOTIFY` → SSE →
browser, working end to end before any real F1 data is wired in.

## Tests

```bash
pnpm test
```

Runs the `SportsProvider` contract tests (against `FakeSportsProvider`) and
the education content loader tests (against the seeded F1 glossary in
`content/education/f1/`).

## What's next

Phase 1 (F1) starts once this pipeline is confirmed working — see
ARCHITECTURE.md §7 and §9 for the plan and open risks.
