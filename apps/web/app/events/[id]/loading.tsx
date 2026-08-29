import styles from "./eventState.module.css";

export default function EventLoading() {
  return (
    <div role="status" className={`${styles.state} ${styles.loading}`}>
      Loading event…
    </div>
  );
}
