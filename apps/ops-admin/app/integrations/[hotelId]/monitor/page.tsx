import Link from "next/link";
export default function SyncMonitor() {
  return (
    <>
      <div className="eyebrow">SB-O-040 · Sync Monitor</div>
      <h1>Reservation attempts</h1>
      <p className="lede">Freshness and row outcomes are explicit; status never depends on colour alone.</p>
      <table>
        <thead>
          <tr>
            <th>Attempt</th>
            <th>Status</th>
            <th>Created</th>
            <th>Updated</th>
            <th>Unchanged</th>
            <th>Conflicted</th>
            <th>Rejected</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>4 Sep, 20:12</td>
            <td>
              <Link href="/integrations/errors/sample-batch">PARTIALLY_REJECTED</Link>
            </td>
            <td>2</td>
            <td>0</td>
            <td>0</td>
            <td>0</td>
            <td>1</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
