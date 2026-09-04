import Link from "next/link";
const hotels = [
  ["CC Phuket Residence", "PARTIAL", "4 Sep, 20:12", "1 rejected"],
  ["Andaman Bay Test Hotel", "FALLBACK_ONLY", "Never", "Manual/CSV ready"],
];
export default function IntegrationDashboard() {
  return (
    <>
      <div className="eyebrow">SB-O-036 · Integrations Dashboard</div>
      <h1>Reservation ingestion health</h1>
      <p className="lede">
        Read-only operational visibility. A connector incident does not disable guest or hotel runtime.
      </p>
      <section className="grid">
        <article className="card">
          <span>Healthy</span>
          <div className="metric">0</div>
        </article>
        <article className="card">
          <span>Needs action</span>
          <div className="metric">1</div>
        </article>
        <article className="card">
          <span>Fallback only</span>
          <div className="metric">1</div>
        </article>
      </section>
      <table>
        <thead>
          <tr>
            <th>Hotel</th>
            <th>Health</th>
            <th>Last attempt</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {hotels.map((h) => (
            <tr key={h[0]}>
              <td>
                <Link href="/integrations/sample-hotel">{h[0]}</Link>
              </td>
              <td>
                <span className="status-pill">{h[1]}</span>
              </td>
              <td>{h[2]}</td>
              <td>{h[3]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <Link className="button" href="/integrations/setup">
          Set up reservation source
        </Link>
      </p>
    </>
  );
}
