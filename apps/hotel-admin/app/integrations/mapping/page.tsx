export default function Mapping() {
  const fields = [
    "Reservation ID",
    "Status",
    "Booking source",
    "Confirmation",
    "Guest name",
    "Check-in",
    "Check-out",
    "Updated at source",
  ];
  return (
    <>
      <div className="eyebrow">SB-H-079 · Mapping Wizard</div>
      <h1>Map columns to StayBuddy</h1>
      <p className="lede">Required fields are explicit. Saving creates a new immutable mapping version.</p>
      <form>
        {fields.map((f) => (
          <label key={f}>
            {f}
            <select>
              <option>Select CSV column</option>
            </select>
          </label>
        ))}
        <label>
          Hotel timezone
          <input defaultValue="Asia/Bangkok" />
        </label>
        <label>
          Profile name
          <input defaultValue="Integration profile" />
        </label>
        <div className="full">
          <button>Save mapping version</button>
        </div>
      </form>
    </>
  );
}
