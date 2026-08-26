import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionAnalysis } from "./SessionAnalysis";

const driver = {
  id: "f1-driver-1",
  name: "Max Example",
  shortName: "MAX",
  avatarUrl: null,
  team: { id: "f1-team-1", name: "Example Racing", colorHex: "#3671C6" },
};

function mockFetch() {
  return vi.fn(async (url: string | URL) => {
    const path = String(url);
    if (path.includes("/results")) {
      return Response.json({
        results: [
          {
            position: 1,
            driver,
            status: "classified",
            lapsCompleted: 72,
            points: 25,
            durationSeconds: 5401.123,
            gapToLeader: null,
            phases: [
              { duration: null, gap: null },
              { duration: null, gap: null },
              { duration: null, gap: null },
            ],
          },
        ],
      });
    }
    if (path.includes("/stints")) {
      return Response.json({
        stints: [
          {
            id: "stint-1",
            driver,
            stintNumber: 1,
            lapStart: 1,
            lapEnd: 26,
            compound: "MEDIUM",
            tyreAgeAtStart: 0,
          },
        ],
      });
    }
    return Response.json({
      laps: [
        {
          id: "lap-18",
          driver,
          lapNumber: 18,
          startedAt: null,
          duration: 73.456,
          sector1: 24.111,
          sector2: 25.222,
          sector3: 24.123,
          speedI1: 278,
          speedI2: 291,
          speedTrap: 312,
          isPitOutLap: false,
        },
      ],
      truncated: false,
    });
  }) as unknown as typeof fetch;
}

describe("SessionAnalysis", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders real classification data and switches to tyre strategy without another request", async () => {
    const fetchImpl = mockFetch();
    vi.stubGlobal("fetch", fetchImpl);
    render(<SessionAnalysis sessionId="f1-session-1" sessionType="RACE" />);

    await waitFor(() => expect(screen.getByText("72")).toBeInTheDocument());
    expect(screen.getByText("25")).toBeInTheDocument();
    const callsBeforeSwitch = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls.length;

    await userEvent.click(screen.getByRole("tab", { name: "Tyre strategy" }));
    expect(screen.getByText("MEDIUM")).toBeInTheDocument();
    expect(screen.getByText("Laps 1–26")).toBeInTheDocument();
    expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBeforeSwitch);
  });

  it("fetches laps for only the selected driver and renders lap timing", async () => {
    const fetchImpl = mockFetch();
    vi.stubGlobal("fetch", fetchImpl);
    render(<SessionAnalysis sessionId="f1-session-1" sessionType="RACE" />);
    await waitFor(() => expect(screen.getByText("72")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("tab", { name: "Lap pace" }));
    await waitFor(() => expect(screen.getByText("1:13.456")).toBeInTheDocument());
    expect(screen.getByText("312 km/h")).toBeInTheDocument();
    expect(
      (fetchImpl as ReturnType<typeof vi.fn>).mock.calls.some(([url]) =>
        String(url).includes("/laps?driverId=f1-driver-1"),
      ),
    ).toBe(true);
  });

  it("shows an honest empty state when historical analysis has not been imported", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) =>
        Response.json(String(url).includes("/results") ? { results: [] } : { stints: [] }),
      ) as unknown as typeof fetch,
    );
    render(<SessionAnalysis sessionId="f1-session-2" sessionType="QUALIFYING" />);

    await waitFor(() => expect(screen.getByText(/has not been backfilled/i)).toBeInTheDocument());
  });
});
