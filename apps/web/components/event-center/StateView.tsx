import styles from "./f1/f1EventCenter.module.css";

/**
 * One shared shape for every section's loading/empty/error state
 * (Checkpoint 5 §16) — no browser alerts, no misleading zero-values shown
 * as if they were real data.
 */
export function StateView({
  kind,
  children,
}: {
  kind: "loading" | "empty" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${styles.stateView} ${kind === "error" ? styles.stateViewError : ""}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
