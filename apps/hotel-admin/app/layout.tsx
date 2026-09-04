import type { Metadata } from "next";
import Link from "next/link";
import "./styles.css";
export const metadata: Metadata = { title: "StayBuddy Hotel Admin" };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header>
          <b>StayBuddy</b>
          <nav aria-label="Hotel operations">
            <Link href="/arrivals">Arrivals</Link>
            <Link href="/reservations">Upcoming</Link>
            <Link href="/integrations/import">Import</Link>
            <Link href="/integrations/history">History</Link>
            <Link href="/reservations/manual">Manual</Link>
          </nav>
          <span>CC Phuket Residence · Front Desk</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
