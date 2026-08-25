"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./SiteNav.module.css";

const NAV_ITEMS = [
  { label: "Race Center", href: "/" },
  { label: "Archive", href: "/archive" },
  { label: "Learn F1", href: "/learn" },
] as const;

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        <span className={styles.brandMark} aria-hidden="true" />
        <span>F1 Race Center</span>
      </Link>
      <nav className={styles.links} aria-label="Formula 1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={[styles.link, isActive ? styles.linkActive : ""].filter(Boolean).join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
