import type { F1PitStop } from "../../../lib/f1Api";
import { StateView } from "../StateView";
import styles from "./f1EventCenter.module.css";

/** Compact and secondary to the timing tower, per §10 — no team swatches, no drawer, just the facts. */
export function PitStopList({ stops, loading, error }: { stops: F1PitStop[]; loading: boolean; error: boolean }) {
  if (loading) return <StateView kind="loading">Loading pit stops…</StateView>;
  if (error) return <StateView kind="error">Pit stop data isn&apos;t available right now.</StateView>;
  if (stops.length === 0) {
    return <StateView kind="empty">No pit stops yet.</StateView>;
  }

  return (
    <div className={styles.pitScroll}>
      <table className={styles.pitTable}>
        <thead>
          <tr>
            <th scope="col">Driver</th>
            <th scope="col">Lap</th>
            <th scope="col">Duration</th>
          </tr>
        </thead>
        <tbody>
          {stops.map((stop) => (
            <tr key={stop.id}>
              <td>{stop.driver.shortName ?? stop.driver.name}</td>
              <td>{stop.lap}</td>
              <td>{(stop.durationMs / 1000).toFixed(1)}s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
