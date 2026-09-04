export default function ImportError() {
  return (
    <>
      <div className="eyebrow">SB-O-041 · Import Error Detail</div>
      <h1>Partially rejected import</h1>
      <p className="lede">
        Historical evidence is immutable. Hotel staff can correct the source or mapping and retry as a new
        linked batch.
      </p>
      <section className="card">
        <h2>Row 4 · INVALID_RESERVATION</h2>
        <p>checkOutAt: must be after checkInAt</p>
        <p>
          <b>Guest PII:</b> not exposed in Ops error detail
        </p>
        <p>
          <b>Runtime impact:</b> none; two valid upcoming stays were created.
        </p>
      </section>
    </>
  );
}
