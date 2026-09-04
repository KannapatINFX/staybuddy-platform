export default function IntegrationSetup() {
  return (
    <>
      <div className="eyebrow">SB-O-012 · Reservation Integration Setup</div>
      <h1>Choose an onboarding path</h1>
      <p className="lede">
        Start without a vendor dependency. PMS/channel adapters can be added later without changing the
        canonical stay model.
      </p>
      <section className="grid">
        <article className="card">
          <h2>CSV import</h2>
          <p>Map, preview, validate, save profile, and retry rejected rows.</p>
          <button>Prepare CSV fallback</button>
        </article>
        <article className="card">
          <h2>Manual entry</h2>
          <p>Audited front-desk fallback for individual reservations.</p>
          <button>Enable manual entry</button>
        </article>
        <article className="card">
          <h2>Connector adapter</h2>
          <p>Future API/webhook lane using the same canonical DTO.</p>
          <button disabled>Configure when vendor is known</button>
        </article>
      </section>
    </>
  );
}
