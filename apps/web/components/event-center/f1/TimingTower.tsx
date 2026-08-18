"use client";

import { useEffect, useRef, useState } from "react";
import type { F1TimingRow } from "../../../lib/f1Api";
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
 * motion" example) via a CSS-driven flash (f1EventCenter.module.css
 * `.valueChanged`), which the reduced-motion media query neutralizes at
 * the CSS layer, not with a JS branch here.
 */
export function TimingTower({ rows, loading, error }: { rows: F1TimingRow[]; loading: boolean; error: boolean }) {
  const previous = useRef<Map<string, F1TimingRow>>(new Map());
  const [changed, setChanged] = useState<Set<string>>(new Set());

  useEffect(() => {
    const next = new Set<string>();
    for (const row of rows) {
      const prevRow = previous.current.get(row.driver.id);
      if (prevRow && (prevRow.position !== row.position || prevRow.lastLapTime !== row.lastLapTime)) {
        next.add(row.driver.id);
      }
    }
    setChanged(next);
    previous.current = new Map(rows.map((r) => [r.driver.id, r]));

    if (next.size === 0) return;
    const timeout = setTimeout(() => setChanged(new Set()), 500);
    return () => clearTimeout(timeout);
  }, [rows]);

  if (loading) return <StateView kind="loading">Loading timing…</StateView>;
  if (error) return <StateView kind="error">Timing data isn&apos;t available right now.</StateView>;
  if (rows.length === 0) {
    return <StateView kind="empty">No timing data yet for this session.</StateView>;
  }

  return (
    <div className={styles.timingScroll}>
      <table className={styles.timingTable}>
        <thead>
          <tr>
            <th>Pos</th>
            <th>Driver</th>
            <th>Gap</th>
            <th>Interval</th>
            <th>Last lap</th>
            <th>Best lap</th>
            <th>Tyre</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.driver.id}
              className={[
                styles.timingRow,
                index === 0 ? styles.leaderRow : "",
                changed.has(row.driver.id) ? styles.valueChanged : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <td className={styles.position}>{row.position}</td>
              <td>
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
                  <span className={`${styles.tyre} ${TYRE_CLASS[row.tyreCompound] ?? ""}`}>
                    {row.tyreCompound[0]}
                  </span>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
