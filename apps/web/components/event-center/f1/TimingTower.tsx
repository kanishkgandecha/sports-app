"use client";

import type { F1TimingRow } from "../../../lib/f1Api";
import { useLiveFlash } from "../../LiveValue";
import { StateView } from "../StateView";
import styles from "./f1EventCenter.module.css";

const TYRE_CLASS: Record<string, string> = {
  SOFT: styles.tyreSoft,
  MEDIUM: styles.tyreMedium,
  HARD: styles.tyreHard,
  INTERMEDIATE: styles.tyreIntermediate,
  WET: styles.tyreWet,
};

function formatLapTime(seconds: number | null): string {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = (seconds % 60).toFixed(3).padStart(6, "0");
  return minutes > 0 ? `${minutes}:${rest}` : rest;
}

/**
 * Dense, professional timing-tower rows (§8) — not a card per driver.
 * Position-change and lap-time-change rows briefly settle (§13's "good
 * motion" example) via `useLiveFlash` (Checkpoint 7 — extracted from this
 * component's own inline `Map`/`Set` bookkeeping into `components/
 * LiveValue.tsx`, the shared primitive ARCHITECTURE.md §2 always named for
 * this layer but never actually had a home), which the reduced-motion
 * media query neutralizes at the CSS layer, not with a JS branch here.
 */
export function TimingTower({ rows, loading, error }: { rows: F1TimingRow[]; loading: boolean; error: boolean }) {
  if (loading) return <StateView kind="loading">Loading timing…</StateView>;
  if (error) return <StateView kind="error">Timing data isn&apos;t available right now.</StateView>;
  if (rows.length === 0) {
    return <StateView kind="empty">No timing data yet for this session.</StateView>;
  }

  return (
    <>
      <p className={styles.scrollHint}>Scroll sideways for gaps, lap times, and tyres.</p>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The overflow region must receive focus so keyboard users can scroll the wide timing table. */}
      <div className={styles.timingScroll} role="region" aria-label="Session timing table" tabIndex={0}>
        <table className={styles.timingTable}>
          <caption className={styles.visuallyHidden}>
            Driver positions, gaps, lap times, and current tyre compounds
          </caption>
          <thead>
            <tr>
              <th scope="col" className={styles.timingPositionCell}>
                Pos
              </th>
              <th scope="col" className={styles.timingDriverCell}>
                Driver
              </th>
              <th scope="col">Gap</th>
              <th scope="col">Interval</th>
              <th scope="col">Last lap</th>
              <th scope="col">Best lap</th>
              <th scope="col">Tyre</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <TimingTowerRow key={row.driver.id} row={row} isLeader={index === 0} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TimingTowerRow({ row, isLeader }: { row: F1TimingRow; isLeader: boolean }) {
  // A single composite key: either field changing means "this row moved or
  // set a new time," the one visual event worth flashing about — matches
  // the original inline logic exactly, just expressed through the shared
  // hook instead of a locally re-implemented one.
  const changed = useLiveFlash(`${row.position}:${row.lastLapTime}`);

  return (
    <tr
      className={[styles.timingRow, isLeader ? styles.leaderRow : "", changed ? styles.valueChanged : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <td className={`${styles.position} ${styles.timingPositionCell}`}>{row.position}</td>
      <td className={styles.timingDriverCell}>
        <div className={styles.driverCell}>
          <span
            className={styles.teamSwatch}
            style={{ background: row.driver.team?.colorHex ?? "var(--color-border)" }}
            aria-hidden="true"
          />
          <span className={styles.driverCode}>{row.driver.shortName ?? row.driver.name.slice(0, 3).toUpperCase()}</span>
          <span className={styles.driverFullName}>{row.driver.team?.name ?? row.driver.name}</span>
        </div>
      </td>
      <td>{row.gapToLeader ?? "—"}</td>
      <td>{row.intervalToAhead ?? "—"}</td>
      <td>{formatLapTime(row.lastLapTime)}</td>
      <td>{formatLapTime(row.bestLapTime)}</td>
      <td>
        {row.tyreCompound ? (
          <span className={`${styles.tyre} ${TYRE_CLASS[row.tyreCompound] ?? ""}`}>{row.tyreCompound[0]}</span>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}
