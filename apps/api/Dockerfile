# syntax=docker/dockerfile:1.7

# apps/api — Fastify REST + SSE service.
#
# Checkpoint 7 (docs/CONTEXT.md §4): four-stage build built around
# `turbo prune`, the standard pattern for a pnpm+Turborepo monorepo where
# only one app's dependency subset should end up in the final image —
# without it, every Docker build for every service would need the *entire*
# monorepo's dependencies (including apps/web's) just to build one Fastify
# service. Build context is the **repo root** (see docker-compose.yml's
# `build.context: .`), not this directory — a pnpm workspace can't be built
# from inside one package's own folder in isolation.
#
# This app has no separate compiled "dist for its dependencies" step: only
# `@sports/db` has a real build script (`prisma generate`); every other
# workspace package (`@sports/domain`, `@sports/education`) is consumed as
# raw TypeScript source at runtime (`main`/`types` point straight at
# `src/index.ts` — see those packages' package.json). Verified empirically
# (docs/CONTEXT.md §11) that Node's built-in TypeScript support resolves
# this correctly at runtime with no bundler/loader needed — so the final
# image copies the pruned **source** tree, not just `dist/`.

FROM node:26-alpine AS base
RUN corepack enable
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /repo

# ---- prune: compute the minimal workspace subset for @sports/api --------
FROM base AS pruner
RUN corepack prepare pnpm@9.15.9 --activate && pnpm add -g turbo@2.5.8
COPY . .
RUN turbo prune @sports/api --docker

# ---- install: only the pruned package.jsons, for a cache-friendly layer -
FROM base AS installer
RUN corepack prepare pnpm@9.15.9 --activate
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile

# ---- build: full pruned source + installed deps, run the real build -----
FROM base AS builder
RUN corepack prepare pnpm@9.15.9 --activate && pnpm add -g turbo@2.5.8
COPY --from=installer /repo/ .
COPY --from=pruner /repo/out/full/ .
# `turbo prune` only follows the workspace dependency graph — it does not
# know every package's tsconfig.json `extends` a root file by relative
# path, so tsconfig.base.json never makes it into out/full on its own
# (found by actually running this build, not by inspection — see
# docs/CONTEXT.md §11). Copied from the real build context directly.
COPY tsconfig.base.json ./tsconfig.base.json
RUN turbo run build --filter=@sports/api...

# ---- runtime: minimal, non-root -----------------------------------------
FROM node:26-alpine AS runner
RUN addgroup -S sports && adduser -S sports -G sports
WORKDIR /repo
COPY --from=builder /repo .
USER sports
ENV NODE_ENV=production
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# `prisma migrate deploy` is idempotent (no-ops once applied) — run on every
# container start rather than as a separate one-off migration service, per
# this checkpoint's "don't introduce unnecessary infrastructure" rule.
# `npx --no-install` resolves `packages/db/node_modules/.bin/prisma` (real,
# installed as part of @sports/db's own devDependencies) without ever
# reaching the network — see docs/CONTEXT.md §4 for why this lives here and
# not in a wrapper script or a separate migration container.
#
# `tsx`, not plain `node`, runs the built entrypoint: `dist/server.cjs`
# itself is fully compiled JS (tsup already did that), but it still
# `require()`s workspace packages that only ever ship raw `.ts` source
# (`@sports/db`/`@sports/domain`/`@sports/education` — see the class doc
# comment above). Plain `node` resolving those depends on version-specific
# native TypeScript support that turned out NOT to be reliable across Node
# versions: it worked locally (Node 25.9.0) but broke in this image's own
# node:22-alpine with `ERR_MODULE_NOT_FOUND` on an extensionless relative
# import (`export * from "./loader"` in @sports/education) — a real failure
# only a real container run surfaced, not local inspection. `tsx` installs
# its own resolution/transform hook that isn't Node-version-dependent, and
# it's already a real devDependency here (not new infrastructure) — see
# docs/CONTEXT.md §11.
CMD ["sh", "-c", "cd packages/db && npx --no-install prisma migrate deploy && cd /repo && apps/api/node_modules/.bin/tsx apps/api/dist/server.cjs"]
