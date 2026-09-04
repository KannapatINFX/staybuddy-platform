import Link from "next/link";
const rows = [
  ["14:00", "Ada Lovelace", "Ocean Suite", "Direct", "Ready for QR"],
  ["15:30", "Grace Hopper", "Garden Suite", "Agent", "Room unassigned"],
];
export default function Arrivals() {
  return (
    <>
      <div className="eyebrow">SB-H-003 · Arrivals Today</div>
      <h1>Today’s arrivals</h1>
      <p className="lede">
        Operational queue created from normalized reservations. Resolve missing room data before arrival.
      </p>
      <table>
        <thead>
          <tr>
            <th>Arrival</th>
            <th>Guest</th>
            <th>Room/type</th>
            <th>Source</th>
            <th>Action state</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[1]}>
              {r.map((v) => (
                <td key={v}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="actions">
        <Link className="button" href="/reservations">
          View upcoming
        </Link>
        <Link className="button secondary" href="/reservations/manual">
          Add reservation
        </Link>
      </div>
    </>
  );
}
