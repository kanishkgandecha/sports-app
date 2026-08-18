"use client";

import { useEffect, useState } from "react";
import {
  getF1ConstructorStandings,
  getF1DriverStandings,
  type F1ConstructorStanding,
  type F1DriverStanding,
} from "../../../lib/f1Api";
import { StateView } from "../StateView";
import { EducationTrigger } from "./GlossaryDrawer";
import styles from "./f1EventCenter.module.css";

interface ListState<T> {
  items: T[];
  loading: boolean;
  error: boolean;
}

const IDLE_LIST: ListState<never> = { items: [], loading: true, error: false };

type StandingsKind = "drivers" | "constructors";

/**
 * Championship standings (Checkpoint 6 — docs/CONTEXT.md Checkpoint 6 §6),
 * sourced from `GET /api/f1/seasons/:year/standings/*`, which reads the
 * `Standing` table the ingestion worker's Jolpica-F1 sync writes to — never
 * fetched live from a provider in the browser, same "backend normalizes,
 * frontend only renders" boundary every other Event Center panel follows.
 *
 * Deliberately season-scoped, not session-scoped: unlike TimingTower/
 * RaceControlFeed/PitStopList, standings don't change with which session
 * tab is selected, so this panel takes the fixture's year directly rather
 * than subscribing to `activeSessionId`. Reuses the shared driver-cell/
 * team-swatch table styling from TimingTower's CSS rather than introducing
 * a second visual language for "a table with a driver in it."
 *
 * No movement/position-change column — see f1Api.ts's `F1DriverStanding`
 * doc comment for why: the API has nothing truthful to send.
 */
export function StandingsPanel({ year, onExplain }: { year: number; onExplain: (slug: string) => void }) {
  const [kind, setKind] = useState<StandingsKind>("drivers");
  const [drivers, setDrivers] = useState<ListState<F1DriverStanding>>(IDLE_LIST);
  const [constructors, setConstructors] = useState<ListState<F1ConstructorStanding>>(IDLE_LIST);

  useEffect(() => {
    let cancelled = false;
    setDrivers(IDLE_LIST);
    setConstructors(IDLE_LIST);

    void Promise.allSettled([getF1DriverStandings(year), getF1ConstructorStandings(year)]).then(
      ([driverResult, constructorResult]) => {
        if (cancelled) return;
        setDrivers(
          driverResult.status === "fulfilled"
            ? { items: driverResult.value.standings, loading: false, error: false }
            : { items: [], loading: false, error: true },
        );
        setConstructors(
          constructorResult.status === "fulfilled"
            ? { items: constructorResult.value.standings, loading: false, error: false }
            : { items: [], loading: false, error: true },
        );
      },
    );

    return () => {
      cancelled = true;
    };
  }, [year]);

  return (
    <section className={styles.section} aria-label="Championship standings">
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Championship standings</h2>
        <EducationTrigger label="How are these determined?" onOpen={() => onExplain("championship-points")} />
      </div>

      <div className={styles.standingsToggle} role="tablist" aria-label="Standings type">
        <button
          type="button"
          role="tab"
          aria-selected={kind === "drivers"}
          className={[styles.standingsToggleButton, kind === "drivers" ? styles.standingsToggleButtonActive : ""].join(" ")}
          onClick={() => setKind("drivers")}
        >
          Drivers
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === "constructors"}
          className={[styles.standingsToggleButton, kind === "constructors" ? styles.standingsToggleButtonActive : ""].join(" ")}
          onClick={() => setKind("constructors")}
        >
          Constructors
        </button>
      </div>

      {kind === "drivers" ? (
        <DriverStandingsTable rows={drivers.items} loading={drivers.loading} error={drivers.error} />
      ) : (
        <ConstructorStandingsTable rows={constructors.items} loading={constructors.loading} error={constructors.error} />
      )}
    </section>
  );
}

function DriverStandingsTable({ rows, loading, error }: { rows: F1DriverStanding[]; loading: boolean; error: boolean }) {
  if (loading) return <StateView kind="loading">Loading driver standings…</StateView>;
  if (error) return <StateView kind="error">Driver standings aren&apos;t available right now.</StateView>;
  if (rows.length === 0) return <StateView kind="empty">No driver standings yet for this season.</StateView>;

  return (
    <div className={styles.timingScroll}>
      <table className={styles.timingTable}>
        <thead>
          <tr>
            <th scope="col">Pos</th>
            <th scope="col">Driver</th>
            <th scope="col">Points</th>
            <th scope="col">Wins</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.driver.id} className={[styles.timingRow, row.position === 1 ? styles.leaderRow : ""].filter(Boolean).join(" ")}>
              <td className={styles.position}>{row.position}</td>
              <td>
                <div className={styles.driverCell}>
                  <span className={styles.teamSwatch} style={{ background: row.team?.colorHex ?? "var(--color-border)" }} aria-hidden="true" />
                  <span className={styles.driverCode}>{row.driver.shortName ?? row.driver.name.slice(0, 3).toUpperCase()}</span>
                  <span className={styles.driverFullName}>{row.team?.name ?? row.driver.name}</span>
                </div>
              </td>
              <td className={styles.pointsCell}>{row.points}</td>
              <td className={styles.winsCell}>{row.wins ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConstructorStandingsTable({ rows, loading, error }: { rows: F1ConstructorStanding[]; loading: boolean; error: boolean }) {
  if (loading) return <StateView kind="loading">Loading constructor standings…</StateView>;
  if (error) return <StateView kind="error">Constructor standings aren&apos;t available right now.</StateView>;
  if (rows.length === 0) return <StateView kind="empty">No constructor standings yet for this season.</StateView>;

  return (
    <div className={styles.timingScroll}>
      <table className={styles.timingTable}>
        <thead>
          <tr>
            <th scope="col">Pos</th>
            <th scope="col">Team</th>
            <th scope="col">Points</th>
            <th scope="col">Wins</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.team.id} className={[styles.timingRow, row.position === 1 ? styles.leaderRow : ""].filter(Boolean).join(" ")}>
              <td className={styles.position}>{row.position}</td>
              <td>
                <div className={styles.driverCell}>
                  <span className={styles.teamSwatch} style={{ background: row.team.colorHex ?? "var(--color-border)" }} aria-hidden="true" />
                  <span className={styles.driverFullName}>{row.team.name}</span>
                </div>
              </td>
              <td className={styles.pointsCell}>{row.points}</td>
              <td className={styles.winsCell}>{row.wins ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
