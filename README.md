# F1 Race Center

A Formula 1-only live timing, results, standings, archive, and education app.

## Workspace

```text
apps/web                 Next.js frontend
apps/api                 Fastify REST + SSE API
apps/ingestion           OpenF1 live/history and Jolpica standings ingestion
packages/domain          F1 domain contracts
packages/db              Prisma schema and migrations
packages/providers/f1    OpenF1 and Jolpica adapters
packages/education       Markdown concept loader
content/education/f1     Formula 1 glossary content
```

## Local development

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:migrate:deploy
pnpm db:seed
```

Run these in separate terminals:

```bash
pnpm --filter @sports/api dev
pnpm --filter @sports/ingestion dev
pnpm --filter @sports/web dev
```

The web app runs at `http://localhost:3000` and the API at `http://localhost:4000`.

## Three-year F1 archive

Archive page views read PostgreSQL only and never call a provider. Imports are explicit, bounded, resumable, and idempotent.

```bash
# Calendar/race summaries
pnpm --filter @sports/ingestion history:f1:rolling

# Timing, laps, pit stops, and race-control detail
pnpm --filter @sports/ingestion history:f1:details:rolling
```

OpenF1 supplies session detail and Jolpica supplies historical/reference data and standings. If OpenF1 has no detail for a session, the archive displays it honestly as summary-only.

## Quality gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm build
```

Unit tests are database-independent. Integration tests fail fast with a clear
prerequisite message unless the configured PostgreSQL service is reachable.
