import Link from "next/link";
export default function ConnectorDetail() {
  return (
    <>
      <div className="eyebrow">SB-O-038 · Hotel Connector Detail</div>
      <h1>CC Phuket Residence</h1>
      <p className="lede">Current source: CSV fallback · last outcome: partially rejected</p>
      <section className="grid">
        <article className="card">
          <h2>Identity</h2>
          <p>Source system: INTEGRATION_CSV</p>
          <p>Mapping: Integration profile v1</p>
        </article>
        <article className="card">
          <h2>Last attempt</h2>
          <span className="status-pill">PARTIAL</span>
          <p>2 created · 1 rejected</p>
        </article>
        <article className="card">
          <h2>Runtime impact</h2>
          <span className="status-pill">AVAILABLE</span>
          <p>Guest app and manual entry unaffected.</p>
        </article>
      </section>
      <p>
        <Link href="/integrations/sample-hotel/mapping">Mapping rules</Link> ·{" "}
        <Link href="/integrations/sample-hotel/monitor">Sync monitor</Link>
      </p>
    </>
  );
}
