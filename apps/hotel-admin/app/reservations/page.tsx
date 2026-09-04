import Link from "next/link";
export default function Upcoming() {
  return (
    <>
      <div className="eyebrow">SB-H-006 · Upcoming Reservations</div>
      <h1>Upcoming stays</h1>
      <p className="lede">
        Search by guest, confirmation, source, or date. Provenance remains attached to every stay.
      </p>
      <div className="actions">
        <input aria-label="Search reservations" placeholder="Guest or confirmation" />
        <select aria-label="Source">
          <option>All sources</option>
          <option>CSV</option>
          <option>Manual</option>
        </select>
      </div>
      <table>
        <thead>
          <tr>
            <th>Check-in</th>
            <th>Guest</th>
            <th>Confirmation</th>
            <th>Source</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>7 Sep, 14:00</td>
            <td>
              <Link href="/reservations/sample-reservation">Ada Lovelace</Link>
            </td>
            <td>CNF-A100</td>
            <td>INTEGRATION_CSV</td>
            <td>
              <span className="status">Confirmed</span>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
