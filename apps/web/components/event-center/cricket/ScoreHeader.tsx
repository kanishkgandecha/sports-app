import type { CricketBattingRow, CricketBowlingRow, CricketInnings, CricketScorecard } from "../../../lib/cricketApi";
import { StateView } from "../StateView";
import styles from "./cricketEventCenter.module.css";

/**
 * The scoreboard — the one number that matters most, at real scoreboard
 * proportions (see cricketEventCenter.module.css's header comment). This
 * is the sport-specific presentation the checkpoint asked for: not a row
 * in a dense sortable table (F1's TimingTower shape), a single live
 * total that settles on change, the way a real cricket scoreboard reads.
 *
 * `CricketInningsState` only carries the batting team's aggregate score
 * (runs/wickets/overs) plus the not-out batsmen's identities and the
 * current bowler's identity — not their individual figures. Individual
 * runs/balls/overs-bowled for those specific players are cross-referenced
 * from the scorecard (`CricketBattingFigure`/`CricketBowlingFigure`,
 * refreshed on the same ingestion tick — Cricket Checkpoint 2 job.ts) when
 * available. A not-out batsman or the current bowler with no matching
 * scorecard row yet is shown by name only — never a fabricated 0/0*0.
 */
export function ScoreHeader({
  innings,
  scorecard,
  loading,
  error,
}: {
  innings: CricketInnings | null;
  scorecard: CricketScorecard | null;
  loading: boolean;
  error: boolean;
}) {
  if (loading) return <StateView kind="loading">Loading score…</StateView>;
  if (error) return <StateView kind="error">Score isn&apos;t available right now.</StateView>;
  if (!innings) {
    return <StateView kind="empty">No score captured for this innings yet.</StateView>;
  }

  const battingFigure = (playerId: string): CricketBattingRow | undefined =>
    scorecard?.batting.find((row) => row.player.id === playerId);
  const bowlingFigure = (playerId: string): CricketBowlingRow | undefined =>
    scorecard?.bowling.find((row) => row.player.id === playerId);

  return (
    <div className={styles.scoreboard}>
      <div className={styles.scoreboardTeams}>
        <div className={styles.scoreboardBattingTeam}>
          <span
            className={styles.teamSwatch}
            style={{ background: innings.battingTeam.colorHex ?? "var(--color-border)" }}
            aria-hidden="true"
          />
          {innings.battingTeam.name}
        </div>
        <div className={styles.scoreboardBowlingTeam}>vs {innings.bowlingTeam.name}</div>

        <div>
          <span className={styles.scoreDigits}>
            {innings.runs}/{innings.wickets}
          </span>
          <div className={styles.scoreOvers}>{innings.overs.toFixed(1)} overs</div>
        </div>

        {innings.notOutBatsmen.length > 0 && (
          <div className={styles.batsmenRow} aria-label="Not out">
            {innings.notOutBatsmen.map((batsman) => {
              const figure = battingFigure(batsman.id);
              return (
                <span key={batsman.id} className={styles.batsmanChip}>
                  <span className={styles.batsmanName}>{batsman.shortName ?? batsman.name}*</span>
                  {figure && (
                    <span className={styles.batsmanFigures}>
                      {figure.runs} ({figure.balls})
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {innings.currentBowler &&
          (() => {
            const figure = bowlingFigure(innings.currentBowler.id);
            return (
              <div className={styles.bowlerLine}>
                {innings.currentBowler.shortName ?? innings.currentBowler.name}
                {figure && ` — ${figure.overs}-${figure.maidens}-${figure.runsConceded}-${figure.wickets}`}
              </div>
            );
          })()}
      </div>

      {innings.target !== null && (
        <div className={styles.scoreMeta}>
          <span className={styles.targetLine}>Target {innings.target}</span>
          {innings.requiredRunRate !== null && (
            <span className={styles.rrrLine}>Req. RR {innings.requiredRunRate.toFixed(2)}</span>
          )}
        </div>
      )}
    </div>
  );
}
