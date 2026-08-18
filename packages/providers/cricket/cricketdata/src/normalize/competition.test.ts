import { describe, expect, it } from "vitest";
import { normalizeCompetition, normalizeSeason } from "./competition";
import type { CricketDataSeriesInfo } from "../types";
import seriesInfoFixture from "../fixtures/seriesInfo.json";

const seriesInfo = seriesInfoFixture.data!.info as CricketDataSeriesInfo;

describe("normalizeCompetition — real series_info", () => {
  it("normalizes the real series as a tournament-type Competition", () => {
    const competition = normalizeCompetition(seriesInfo);
    expect(competition).toEqual({
      id: "cricket-series-6c3c5876-5cfc-4490-9c8e-8ba90aec4323",
      sportId: "cricket",
      slug: "tamil-nadu-premier-league-2026",
      name: "Tamil Nadu Premier League 2026",
      type: "tournament",
    });
  });
});

describe("normalizeSeason — real startdate/enddate, including the malformed enddate case", () => {
  it("uses the real ISO startdate directly", () => {
    const season = normalizeSeason(seriesInfo, { competitionId: "cricket-series-x" });
    expect(season.startDate).toBe("2026-08-04");
  });

  it("falls back to {year}-12-31 for the real 'Aug 28' enddate — verified real, and verified that new Date('Aug 28') silently parses to year 2001 rather than throwing, so a naive isNaN check alone would have let a wrong date through", () => {
    expect(seriesInfo.enddate).toBe("Aug 28");
    expect(new Date(seriesInfo.enddate!).getFullYear()).toBe(2001); // the actual JS behavior this normalizer defends against
    const season = normalizeSeason(seriesInfo, { competitionId: "cricket-series-x" });
    expect(season.endDate).toBe("2026-12-31");
  });

  it("falls back to {year}-01-01/{year}-12-31 entirely when startdate is genuinely undefined — verified real: this checkpoint's own live smoke test hit a real series with no startdate field at all", () => {
    const noStartDate: CricketDataSeriesInfo = { ...seriesInfo, startdate: undefined, enddate: undefined };
    const season = normalizeSeason(noStartDate, { competitionId: "cricket-series-x" });
    expect(season.startDate).toBe("2026-01-01");
    expect(season.endDate).toBe("2026-12-31");
    expect(season.label).toBe("2026"); // still real — from the series name, not the missing dates
  });

  it("labels the season from the year embedded in the real series name, not the startdate's year", () => {
    const season = normalizeSeason(seriesInfo, { competitionId: "cricket-series-x" });
    expect(season.label).toBe("2026");
  });

  it("uses a real, parseable enddate as-is when one is given", () => {
    const cleanSeries: CricketDataSeriesInfo = { ...seriesInfo, enddate: "2026-08-28" };
    const season = normalizeSeason(cleanSeries, { competitionId: "cricket-series-x" });
    expect(season.endDate).toBe("2026-08-28");
  });

  it("still accepts a real year-spanning season (starts in one year, ends in the next)", () => {
    const spanning: CricketDataSeriesInfo = { ...seriesInfo, startdate: "2026-12-20", enddate: "2027-01-05" };
    const season = normalizeSeason(spanning, { competitionId: "cricket-series-x" });
    expect(season.endDate).toBe("2027-01-05");
  });
});
