import Link from "next/link";

const hotels = [
  { name: "CC Phuket Residence", status: "PILOT", rooms: 80, app: "Ready" },
  { name: "Andaman Bay Demo", status: "ONBOARDING", rooms: 64, app: "Draft" },
];

export default function HotelDirectory() {
  return (
    <>
      <div className="eyebrow">SB-O-003</div>
      <h1>Hotel directory</h1>
      <p className="lede">Tenant, commercial, app and integration status in one operational view.</p>
      <table>
        <thead>
          <tr>
            <th>Hotel</th>
            <th>Status</th>
            <th>Rooms</th>
            <th>App</th>
          </tr>
        </thead>
        <tbody>
          {hotels.map((hotel) => (
            <tr key={hotel.name}>
              <td>{hotel.name}</td>
              <td>{hotel.status}</td>
              <td>{hotel.rooms}</td>
              <td>{hotel.app}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 24 }}>
        <Link className="button" href="/hotels/new">
          Create hotel
        </Link>
      </p>
    </>
  );
}
