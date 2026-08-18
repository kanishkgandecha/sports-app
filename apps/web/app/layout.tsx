import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sports Platform",
  description: "Live sports tracking and sports education, one sport at a time.",
};

const navItems = [
  { label: "Home", href: "/" },
  { label: "Formula 1", href: "/sports/f1" },
  { label: "Cricket", href: "/sports/cricket" },
  { label: "Football", href: "/sports/football" },
  { label: "Esports", href: "/sports/esports" },
  { label: "Learn", href: "/learn" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-6)",
            padding: "var(--space-4) var(--space-6)",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <strong style={{ fontFamily: "var(--font-display)", fontSize: "var(--font-size-lg)" }}>
            Sports Platform
          </strong>
          <nav style={{ display: "flex", gap: "var(--space-5)" }}>
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                style={{
                  fontSize: "var(--font-size-sm)",
                  color: "var(--color-text-muted)",
                }}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </header>
        <main
          style={{
            maxWidth: 760,
            margin: "0 auto",
            padding: "var(--space-7) var(--space-6)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-7)",
          }}
        >
          {children}
        </main>
      </body>
    </html>
  );
}
