"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./SiteNav.module.css";

const NAV_ITEMS = [
  { label: "Race Center", href: "/", sections: ["/sports/f1", "/events"] },
  { label: "Archive", href: "/archive", sections: [] },
  { label: "Learn F1", href: "/learn", sections: [] },
] as const;

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          <span>F1 Race Center</span>
        </Link>
        <nav className={styles.links} aria-label="Formula 1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(`${item.href}/`)) ||
              item.sections.some((section) => pathname === section || pathname.startsWith(`${section}/`));
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
      </div>
    </header>
  );
}
