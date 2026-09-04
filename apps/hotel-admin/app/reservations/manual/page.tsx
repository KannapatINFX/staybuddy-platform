export default function ManualReservation() {
  return (
    <>
      <div className="eyebrow">SB-H-009 · Manual Reservation Entry</div>
      <h1>Add reservation manually</h1>
      <p className="lede">
        Saved with MANUAL provenance and the same audit trail as an imported reservation.
      </p>
      <form>
        <label>
          Guest name
          <input required />
        </label>
        <label>
          Confirmation code
          <input required />
        </label>
        <label>
          Booking source
          <input placeholder="Phone, walk-in, direct" required />
        </label>
        <label>
          Preferred language
          <select>
            <option>English</option>
            <option>ไทย</option>
            <option>简体中文</option>
            <option>Русский</option>
          </select>
        </label>
        <label>
          Check-in
          <input type="datetime-local" required />
        </label>
        <label>
          Check-out
          <input type="datetime-local" required />
        </label>
        <label>
          Room type
          <input />
        </label>
        <label>
          Room number
          <input />
        </label>
        <div className="full">
          <button type="submit">Create upcoming stay</button>
        </div>
      </form>
    </>
  );
}
