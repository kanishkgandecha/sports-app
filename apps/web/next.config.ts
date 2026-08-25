import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sports/design", "@sports/domain"],
  // Checkpoint 7 (Docker) — `standalone` traces only the files this app
  // actually needs (including the workspace packages above) into
  // `.next/standalone`, so the runtime Docker image doesn't need the full
  // `node_modules` tree copied in. `outputFileTracingRoot` has to point at
  // the monorepo root, not this app's own directory — otherwise the tracer
  // can't see `packages/*` at all (a pnpm workspace, not a subfolder of
  // apps/web) and the trace silently omits them. See docs/CONTEXT.md,
  // Checkpoint 7 §4.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
