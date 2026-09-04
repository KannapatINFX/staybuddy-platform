export default function ImportDetail() {
  return (
    <>
      <div className="eyebrow">SB-H-080 · Rejection Report</div>
      <h1>Import attempt</h1>
      <p className="lede">
        2 rows accepted · 1 row rejected. Retrying will reparse the encrypted original and create a linked
        attempt.
      </p>
      <table>
        <thead>
          <tr>
            <th>Row</th>
            <th>Code</th>
            <th>Safe detail</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>4</td>
            <td>SOURCE_VERSION_CONFLICT</td>
            <td>Incoming source version is older</td>
          </tr>
        </tbody>
      </table>
      <div className="actions">
        <button>Retry as new attempt</button>
        <button className="button secondary">Download rejection report</button>
      </div>
    </>
  );
}
