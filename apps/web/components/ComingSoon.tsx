import Link from "next/link";
import styles from "./ComingSoon.module.css";

/**
 * Honest placeholder for a sport with no built product yet — Checkpoint 7's
 * explicit requirement: "Cricket may be shown as 'Coming next' but do not
 * expose unfinished pages as if they were production-ready." This is
 * deliberately NOT a mock Event Center, NOT fake fixtures/scores, and NOT
 * styled to look finished (dashed border, plain — never a live status
 * pill). It exists so the nav's Cricket/Football/Esports links go
 * somewhere truthful rather than a bare 404.
 */
export function ComingSoon({
  sport,
  status,
  progress,
}: {
  sport: string;
  status: string;
  progress: string[];
}) {
  return (
    <div className={styles.wrap}>
      <span className={styles.pill}>{status}</span>
      <h1 className={styles.title}>{sport}</h1>
      <p className={styles.body}>
        There&apos;s no live {sport} data or Event Center here yet — this page exists so the
        navigation is honest about what this product actually covers today, not to imply a
        finished experience.
      </p>
      {progress.length > 0 && (
        <ul className={styles.list}>
          {progress.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <Link href="/sports/f1" className={styles.back}>
        ← See what&apos;s live today: Formula 1
      </Link>
    </div>
  );
}
