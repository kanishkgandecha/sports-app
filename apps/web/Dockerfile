# syntax=docker/dockerfile:1.7

# apps/web — the Next.js frontend.
#
# Genuinely different shape from apps/api/apps/ingestion's Dockerfile
# (see those files' doc comments for the turbo-prune rationale, which is
# shared): Next's `output: "standalone"` (next.config.ts) traces and
# bundles everything this app needs — including `@sports/design`/
# `@sports/domain`, both in `transpilePackages` and compiled directly into
# the Next.js build output — so, unlike the API/ingestion images, the
# runtime stage here does NOT need the monorepo source tree or a
# `node_modules` install at all. Only `.next/standalone` + `.next/static`
# + `public` (this app has none yet) are copied in.
#
# `NEXT_PUBLIC_API_URL` has to be a **build**-time ARG, not a runtime env
# var: Next.js inlines every `process.env.NEXT_PUBLIC_*` reference as a
# literal string into the compiled bundle at `next build` time (this is
# true for both client- and server-bundled code — see lib/api.ts's doc
# comment) — setting it at `docker run` time would have no effect. See
# docs/CONTEXT.md, Checkpoint 7 §4.

FROM node:22-alpine AS base
RUN corepack enable
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /repo

# ---- prune ----------------------------------------------------------------
FROM base AS pruner
RUN corepack prepare pnpm@9.15.9 --activate && pnpm add -g turbo@2.5.8
COPY . .
RUN turbo prune @sports/web --docker

# ---- install ----------------------------------------------------------------
FROM base AS installer
RUN corepack prepare pnpm@9.15.9 --activate
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile

# ---- build --------------------------------------------------------------------
FROM base AS builder
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN corepack prepare pnpm@9.15.9 --activate && pnpm add -g turbo@2.5.8
COPY --from=installer /repo/ .
COPY --from=pruner /repo/out/full/ .
RUN turbo run build --filter=@sports/web...

# ---- runtime: non-root, standalone server.js -----------------------------
# NOT copying only `.next/standalone`'s own (self-contained, in theory)
# node_modules, as Next's docs describe — a real container run of exactly
# that hit `Cannot find module '.../next/node_modules/@swc/helpers/esm/
# _interop_require_default.js'` at startup. Root cause: Next's standalone
# output tracer (`@vercel/nft`) has a known gap walking pnpm's `.pnpm`
# virtual-store symlink structure for `next`'s own internal require-hook-
# based dynamic resolution (this is a pnpm+Next standalone interaction
# issue, not specific to this app's code — see docs/CONTEXT.md §11). Fix:
# use the real, fully-installed `node_modules` from the builder stage
# instead of trusting the traced subset — a real superset of what's
# needed, at the cost of some of `standalone`'s size-minimality, in
# exchange for actually working. Still far smaller than shipping the whole
# monorepo source tree the way apps/api/apps/ingestion's images do.
FROM node:22-alpine AS runner
RUN addgroup -S sports && adduser -S sports -G sports
WORKDIR /repo
COPY --from=builder /repo/node_modules ./node_modules
# The root node_modules alone isn't enough — pnpm's workspace layout also
# needs each package's own `node_modules` (its per-package dependency
# symlinks, e.g. `apps/web/node_modules/next -> ../../node_modules/.pnpm/
# next@.../node_modules/next`) for `require("next")` from
# `apps/web/server.js` to resolve at all. Found the same way as the
# `@swc/helpers` issue above — a real container run, not inspection.
COPY --from=builder /repo/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /repo/apps/web/.next/standalone/apps/web/server.js ./apps/web/server.js
COPY --from=builder /repo/apps/web/.next/standalone/apps/web/.next ./apps/web/.next
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
USER sports
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
