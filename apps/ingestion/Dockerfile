# syntax=docker/dockerfile:1.7

# apps/ingestion — the long-running polling/normalization worker.
# Same pattern as apps/api/Dockerfile — see that file's doc comment for the
# full rationale (turbo prune, why source (not just dist) is copied, the
# migrate-deploy-on-start decision). Not repeated verbatim here; only the
# genuine differences are called out below.

FROM node:26-alpine AS base
RUN corepack enable
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /repo

# ---- prune ----------------------------------------------------------------
FROM base AS pruner
RUN corepack prepare pnpm@9.15.9 --activate && pnpm add -g turbo@2.5.8
COPY . .
RUN turbo prune @sports/ingestion --docker

# ---- install ----------------------------------------------------------------
FROM base AS installer
RUN corepack prepare pnpm@9.15.9 --activate
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile

# ---- build ------------------------------------------------------------------
FROM base AS builder
RUN corepack prepare pnpm@9.15.9 --activate && pnpm add -g turbo@2.5.8
COPY --from=installer /repo/ .
COPY --from=pruner /repo/out/full/ .
# See apps/api/Dockerfile's doc comment on this line — `turbo prune` never
# includes tsconfig.base.json.
COPY tsconfig.base.json ./tsconfig.base.json
RUN turbo run build --filter=@sports/ingestion...

# ---- runtime ------------------------------------------------------------------
FROM node:26-alpine AS runner
RUN addgroup -S sports && adduser -S sports -G sports
WORKDIR /repo
COPY --from=builder /repo .
USER sports
ENV NODE_ENV=production
# No exposed port — this worker has no HTTP surface of its own (SSE/API
# delivery is apps/api's job; this process only writes to Postgres and
# NOTIFYs). No container HEALTHCHECK either, for the same honest reason:
# there is no request/response endpoint to probe, and a fake one (e.g. a
# throwaway HTTP server whose only job is to answer a healthcheck) would be
# exactly the "unnecessary infrastructure" this checkpoint says not to add.
# docker-compose.yml's `depends_on: condition: service_started` is what
# actually orders this against postgres/api being ready — see that file.
#
# `prisma migrate deploy` also runs here (not just in apps/api) because
# either service could plausibly be the first one to start against a fresh
# database in a given deployment, and the operation is idempotent — running
# it twice (once from each service) is a safe no-op, not a real race.
#
# `tsx`, not plain `node` — see apps/api/Dockerfile's CMD comment for the
# full explanation (a real `ERR_MODULE_NOT_FOUND` this checkpoint's actual
# container run hit, not a hypothetical).
CMD ["sh", "-c", "cd packages/db && npx --no-install prisma migrate deploy && cd /repo && apps/ingestion/node_modules/.bin/tsx apps/ingestion/dist/index.cjs"]
