import Link from "next/link";
export default function Integrations() {
  return (
    <>
      <div className="eyebrow">SB-H-077 · Reservation Source</div>
      <h1>CSV and manual fallback</h1>
      <p className="lede">
        No PMS connection is required. The last import was partially accepted; guest runtime remains
        available.
      </p>
      <section className="grid">
        <article className="card">
          <h2>Import health</h2>
          <span className="status">Partial · action required</span>
          <p>2 created, 1 rejected</p>
        </article>
        <article className="card">
          <h2>Saved mappings</h2>
          <p>Integration profile · version 1</p>
          <Link href="/integrations/mapping">Manage mapping</Link>
        </article>
      </section>
      <div className="actions">
        <Link className="button" href="/integrations/import">
          Import CSV
        </Link>
        <Link className="button secondary" href="/integrations/history">
          View history
        </Link>
      </div>
    </>
  );
}
