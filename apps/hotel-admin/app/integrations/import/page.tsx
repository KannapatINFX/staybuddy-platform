export default function CsvImport() {
  return (
    <>
      <div className="eyebrow">SB-H-078 · CSV Import</div>
      <h1>Preview reservations before import</h1>
      <p className="lede">
        The server reparses the encrypted original at commit. Preview rows cannot be edited into trusted data.
      </p>
      <label>
        Saved mapping
        <select>
          <option>Integration profile · v1</option>
          <option>Map a new file</option>
        </select>
      </label>
      <label className="full">
        Reservation CSV
        <textarea aria-label="Reservation CSV" placeholder="Drop or paste CSV data here" />
      </label>
      <div className="actions">
        <button>Generate secure preview</button>
      </div>
      <section className="grid">
        <article className="card">
          <h2>Valid rows</h2>
          <div className="metric">2</div>
        </article>
        <article className="card">
          <h2>Rejected rows</h2>
          <div className="metric">1</div>
          <p>Row 4 · check-out must follow check-in</p>
        </article>
      </section>
    </>
  );
}
