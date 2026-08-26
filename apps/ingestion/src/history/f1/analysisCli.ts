import { OpenF1Adapter, OpenF1FetchClient } from "@sports/providers-f1-openf1";
import { importF1Analysis } from "./importF1Analysis";
import { rollingSeasonYears } from "./importF1History";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.split("=");
    return [key, value.join("=")];
  }),
);
const requestedYear = args.get("--year");
const requestedWindow = args.get("--years");
const limit = Number(args.get("--limit") ?? 30);
if ((requestedYear === undefined) === (requestedWindow === undefined)) {
  throw new Error(
    "Usage: pnpm history:f1:analysis (--year=YYYY | --years=3) [--limit=30] [--fixture=id] [--session-types=RACE,QUALIFYING|ALL] [--retry-unavailable] [--force] [--dry-run]",
  );
}

const rawSessionTypes = args.get("--session-types") ?? "ALL";
const sessionTypes = rawSessionTypes === "ALL" ? "ALL" : rawSessionTypes.split(",").map((value) => value.trim());
if (sessionTypes !== "ALL" && sessionTypes.some((value) => value.length === 0)) {
  throw new Error("--session-types must be ALL or a comma-separated list such as RACE,QUALIFYING");
}

const years = requestedYear ? [Number(requestedYear)] : rollingSeasonYears(Number(requestedWindow));
const provider = new OpenF1Adapter({
  client: new OpenF1FetchClient({
    maxRetries: 5,
    retryDelayMs: 15_000,
    maxRetryDelayMs: 120_000,
    minRequestIntervalMs: 2_100,
  }),
});
const summaries = [];
for (const year of years) {
  summaries.push(
    await importF1Analysis(provider, {
      year,
      limit,
      fixtureId: args.get("--fixture"),
      sessionTypes,
      retryUnavailable: args.has("--retry-unavailable"),
      force: args.has("--force"),
      dryRun: args.has("--dry-run"),
    }),
  );
}

console.log(JSON.stringify(summaries.length === 1 ? summaries[0] : { years, summaries }, null, 2));
if (summaries.some((summary) => summary.failed > 0)) process.exitCode = 1;
