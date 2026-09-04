import Link from "next/link";
export default function History() {
  return (
    <>
      <div className="eyebrow">SB-H-080 · Import History & Retry</div>
      <h1>Import history</h1>
      <p className="lede">Every retry creates a linked batch; prior evidence is never rewritten.</p>
      <table>
        <thead>
          <tr>
            <th>Attempt</th>
            <th>Source</th>
            <th>Outcome</th>
            <th>Created / updated / unchanged</th>
            <th>Rejected</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <Link href="/integrations/history/sample-batch">4 Sep, 20:12</Link>
            </td>
            <td>INTEGRATION_CSV</td>
            <td>
              <span className="status">Partially rejected</span>
            </td>
            <td>2 / 0 / 0</td>
            <td>1</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
