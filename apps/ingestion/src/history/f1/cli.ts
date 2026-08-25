import { JolpicaAdapter } from "@sports/providers-f1-jolpica";
import { OpenF1Adapter, OpenF1FetchClient } from "@sports/providers-f1-openf1";
import { importF1Season, rollingSeasonYears } from "./importF1History";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.split("=");
    return [key, value.join("=")];
  }),
);
const limit = Number(args.get("--limit") ?? 30);
const requestedYear = args.get("--year");
const requestedWindow = args.get("--years");
if (!Number.isInteger(limit) || (requestedYear === undefined) === (requestedWindow === undefined)) {
  throw new Error("Usage: pnpm history:f1 (--year=YYYY | --years=3) [--limit=30] [--dry-run]");
}

const years = requestedYear ? [Number(requestedYear)] : rollingSeasonYears(Number(requestedWindow));
const summaries = [];
for (const year of years) {
  const provider =
    year >= 2023
      ? new OpenF1Adapter({
          client: new OpenF1FetchClient({ maxRetries: 5, retryDelayMs: 15_000, maxRetryDelayMs: 120_000 }),
        })
      : new JolpicaAdapter();
  summaries.push(await importF1Season(provider, { year, limit, dryRun: args.has("--dry-run") }));
}
console.log(JSON.stringify(summaries.length === 1 ? summaries[0] : { years, summaries }, null, 2));
