import type { CricketBowlingRow } from "../../../lib/cricketApi";
import { StateView } from "../StateView";
import styles from "./cricketEventCenter.module.css";

export function BowlingCard({ rows, loading, error }: { rows: CricketBowlingRow[]; loading: boolean; error: boolean }) {
  if (loading) return <StateView kind="loading">Loading bowling figures…</StateView>;
  if (error) return <StateView kind="error">Bowling figures aren&apos;t available right now.</StateView>;
  if (rows.length === 0) return <StateView kind="empty">No bowling figures captured for this innings yet.</StateView>;

  return (
    <div className={styles.tableScroll}>
      <table className={styles.scorecardTable}>
        <thead>
          <tr>
            <th scope="col">Bowler</th>
            <th scope="col">O</th>
            <th scope="col">M</th>
            <th scope="col">R</th>
            <th scope="col">W</th>
            <th scope="col">Econ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.player.id}>
              <td className={styles.playerName}>{row.player.shortName ?? row.player.name}</td>
              <td>{row.overs}</td>
              <td>{row.maidens}</td>
              <td>{row.runsConceded}</td>
              <td>{row.wickets}</td>
              <td>{row.economy.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
