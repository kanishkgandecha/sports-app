import Link from "next/link";
import styles from "./eventState.module.css";

export default function EventNotFound() {
  return (
    <div className={styles.state}>
      <h1 className={styles.title}>No such event</h1>
      <p className={styles.message}>This fixture doesn&apos;t exist, or hasn&apos;t been bootstrapped yet.</p>
      <Link href="/" className={styles.action}>
        Back home
      </Link>
    </div>
  );
}
