import Link from "next/link";

export default function EventNotFound() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <h1 style={{ fontSize: "var(--font-size-xl)" }}>No such event</h1>
      <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
        This fixture doesn&apos;t exist, or hasn&apos;t been bootstrapped yet.
      </p>
      <Link href="/" style={{ color: "var(--color-accent)" }}>
        Back home
      </Link>
    </div>
  );
}
