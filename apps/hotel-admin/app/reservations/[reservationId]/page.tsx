export default function ReservationDetail() {
  return (
    <>
      <div className="eyebrow">SB-H-007 · Reservation Detail</div>
      <h1>Ada Lovelace</h1>
      <p className="lede">CNF-A100 · Ocean Suite · 7–10 September 2026</p>
      <section className="grid">
        <article className="card">
          <h2>Stay</h2>
          <p>
            <b>Status:</b> Confirmed
          </p>
          <p>
            <b>Lifecycle:</b> Upcoming
          </p>
          <p>
            <b>Language:</b> English
          </p>
        </article>
        <article className="card">
          <h2>Source provenance</h2>
          <p>
            <b>System:</b> INTEGRATION_CSV
          </p>
          <p>
            <b>External ID:</b> A-100
          </p>
          <p>
            <b>Source updated:</b> 4 Sep, 20:12
          </p>
        </article>
        <article className="card">
          <h2>Import lineage</h2>
          <p>
            <b>Batch:</b> 7de…91a
          </p>
          <p>
            <b>Outcome:</b> Created
          </p>
          <p>No StayBuddy-owned fields were overwritten.</p>
        </article>
      </section>
    </>
  );
}
