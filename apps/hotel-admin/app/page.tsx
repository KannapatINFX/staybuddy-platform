import { hotelAdminFoundation } from "./foundation";

const arrivals = [
  { guest: "Anna P.", language: "RU", source: "Agoda", room: "—", app: "Pre-arrival active" },
  { guest: "Li W.", language: "ZH-CN", source: "Direct", room: "508", app: "Ready for QR" },
];
export default function Today() {
  return (
    <>
      <p className="lede">{hotelAdminFoundation.screenId} · Today command center</p>
      <h1>Good afternoon. Your hotel is busy, but under control.</h1>
      <section className="grid">
        <article className="card">
          <span>Arrivals</span>
          <div className="metric">18</div>
        </article>
        <article className="card">
          <span>In-house</span>
          <div className="metric">61</div>
        </article>
        <article className="card">
          <span>Needs attention</span>
          <div className="metric">3</div>
        </article>
        <article className="card">
          <span>Pending PMS post</span>
          <div className="metric">2</div>
        </article>
      </section>
      <h2>Arrivals and stay activation</h2>
      <div className="queue">
        {arrivals.map((item) => (
          <div className="row" key={item.guest}>
            <b>{item.guest}</b>
            <span>{item.language}</span>
            <span>{item.source}</span>
            <span>Room {item.room}</span>
            <span>{item.app}</span>
          </div>
        ))}
      </div>
      <h2>{hotelAdminFoundation.reservationFallbackLabel}</h2>
      <p className="lede">
        Paste a CSV preview or connect the upload contract. Rejected rows remain explainable and retryable.
      </p>
      <textarea
        aria-label="Reservation CSV"
        defaultValue={
          "reservation_id,status,source,confirmation,guest_name,check_in,check_out\nR-100,CONFIRMED,agoda,C100,Anna,2026-09-01T07:00:00Z,2026-09-04T05:00:00Z"
        }
      />
      <p>
        <button>Preview import</button>
      </p>
    </>
  );
}
