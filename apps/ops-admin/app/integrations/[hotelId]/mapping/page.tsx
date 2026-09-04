export default function MappingRules() {
  return (
    <>
      <div className="eyebrow">SB-O-039 · Mapping Rules</div>
      <h1>Integration profile · version 1</h1>
      <p className="lede">Read-only platform view of hotel-owned mapping provenance.</p>
      <table>
        <thead>
          <tr>
            <th>Canonical field</th>
            <th>CSV column</th>
            <th>Required</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>externalReservationId</td>
            <td>reservation_id</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>updatedAtSource</td>
            <td>updated_at</td>
            <td>Recommended</td>
          </tr>
          <tr>
            <td>timezone</td>
            <td>Asia/Bangkok (default)</td>
            <td>Yes</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
