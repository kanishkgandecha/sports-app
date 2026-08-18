import type { CricketBattingRow } from "../../../lib/cricketApi";
import { StateView } from "../StateView";
import styles from "./cricketEventCenter.module.css";

/** "not out" is the real text CricketData.org sends for a batter who hasn't been dismissed — never invented client-side (Checkpoint 1's normalizer passes it through verbatim). */
function isNotOut(dismissalText: string): boolean {
  return dismissalText.trim().toLowerCase() === "not out";
}

export function BattingCard({ rows, loading, error }: { rows: CricketBattingRow[]; loading: boolean; error: boolean }) {
  if (loading) return <StateView kind="loading">Loading batting card…</StateView>;
  if (error) return <StateView kind="error">Batting card isn&apos;t available right now.</StateView>;
  if (rows.length === 0) return <StateView kind="empty">No batting card captured for this innings yet.</StateView>;

  return (
    <div className={styles.tableScroll}>
      <table className={styles.scorecardTable}>
        <thead>
          <tr>
            <th scope="col">Batter</th>
            <th scope="col">R</th>
            <th scope="col">B</th>
            <th scope="col">4s</th>
            <th scope="col">6s</th>
            <th scope="col">SR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const notOut = isNotOut(row.dismissalText);
            return (
              <tr key={row.player.id} className={notOut ? styles.notOutRow : undefined}>
                <td className={styles.playerName}>
                  {row.player.shortName ?? row.player.name}
                  {notOut && "*"}
                  {!notOut && row.dismissalText && <span className={styles.dismissalText}>{row.dismissalText}</span>}
                </td>
                <td>{row.runs}</td>
                <td>{row.balls}</td>
                <td>{row.fours}</td>
                <td>{row.sixes}</td>
                <td>{row.strikeRate.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
