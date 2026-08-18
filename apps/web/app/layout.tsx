import type { Metadata } from "next";
import { displayFont } from "./fonts";
import { SiteNav } from "../components/nav/SiteNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sports Platform",
  description: "Live sports tracking and sports education, one sport at a time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={displayFont.variable}>
      <body>
        <SiteNav />
        <main className="page-shell">{children}</main>
      </body>
    </html>
  );
}
