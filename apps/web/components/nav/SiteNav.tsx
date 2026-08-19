"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./SiteNav.module.css";

interface NavItem {
  label: string;
  href: string;
  /** Product-shell metadata, not live data — Sport.status in Postgres has
   * no row for football/esports yet (nothing's bootstrapped), and this
   * needs to render correctly before any of that exists. Cricket moved to
   * "available" in Checkpoint 3 — it now has a real landing page, Event
   * Center, and data pipeline, the same bar F1 already cleared. */
  status: "available" | "coming-next" | "planned";
}

const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/", status: "available" },
  { label: "Formula 1", href: "/sports/f1", status: "available" },
  { label: "Cricket", href: "/sports/cricket", status: "available" },
  { label: "Football", href: "/sports/football", status: "planned" },
  { label: "Esports", href: "/sports/esports", status: "planned" },
  { label: "Learn", href: "/learn", status: "planned" },
];

/**
 * One multi-sport product, not an F1-only site with extra links (Checkpoint
 * 7's explicit requirement) — every sport is a real nav destination; F1 and
 * Cricket (Checkpoint 3) route to real landing pages/Event Centers, and
 * the ones without a built product yet (Football, Esports) route to an
 * honest "coming soon" page (see app/sports/[football|esports]/page.tsx)
 * rather than a bare 404 or, worse, a page that pretends to be finished.
 */
export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        <span className={styles.brandMark} aria-hidden="true" />
        <span>Sports Platform</span>
      </Link>
      <nav className={styles.links} aria-label="Sports">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={[
                styles.link,
                isActive ? styles.linkActive : "",
                item.status !== "available" ? styles.linkComingSoon : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {item.label}
              {item.status === "coming-next" && <span className={styles.badge}>Coming next</span>}
              {item.status === "planned" && item.label !== "Learn" && (
                <span className={`${styles.badge} ${styles.badgeMuted}`}>Planned</span>
              )}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
