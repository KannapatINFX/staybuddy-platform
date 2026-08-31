import type { Metadata } from "next";
import "./styles.css";
export const metadata: Metadata = { title: "StayBuddy Hotel Admin" };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header>
          <b>StayBuddy</b>
          <span>CC Phuket Residence · Front Desk</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
