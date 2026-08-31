import type { Metadata } from "next";
import Link from "next/link";
import "./styles.css";

export const metadata: Metadata = { title: "StayBuddy Ops", description: "StayBuddy platform operations" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <aside>
          <div className="brand">StayBuddy</div>
          <div className="subtitle">Platform Operations</div>
          <nav aria-label="Primary navigation">
            <Link href="/">Platform</Link>
            <Link href="/hotels">Hotels</Link>
            <Link href="/hotels/new">Create hotel</Link>
            <span>App Factory</span>
            <span>Integrations</span>
            <span>AI Operations</span>
            <span>Billing & Commission</span>
          </nav>
        </aside>
        <main>{children}</main>
      </body>
    </html>
  );
}
