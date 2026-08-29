import { JolpicaAdapter } from "@sports/providers-f1-jolpica";
import { syncF1Standings } from "../../f1/standings";
import { rollingSeasonYears } from "./importF1History";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.split("=");
    return [key, value.join("=")];
  }),
);
const requestedYear = args.get("--year");
const requestedWindow = args.get("--years");
if ((requestedYear === undefined) === (requestedWindow === undefined)) {
  throw new Error("Usage: pnpm history:f1:standings (--year=YYYY | --years=3)");
}
const years = requestedYear ? [Number(requestedYear)] : rollingSeasonYears(Number(requestedWindow));
const summary = await syncF1Standings(new JolpicaAdapter(), { seasonLabels: years.map(String) });
console.log(JSON.stringify({ years, ...summary }, null, 2));
if (summary.seasonsSynced !== years.length) process.exitCode = 1;
