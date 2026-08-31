import Link from "next/link";
import { opsAdminFoundation } from "./foundation";

export default function PlatformDashboard() {
  return (
    <>
      <div className="eyebrow">Platform now</div>
      <h1>Hotels are under control.</h1>
      <p className="lede">{opsAdminFoundation.dataClassification} environment · no production guest data</p>
      <section className="grid" aria-label="Platform overview">
        <article className="card">
          <span>Hotels onboarding</span>
          <div className="metric">2</div>
          <Link href="/hotels">Open directory</Link>
        </article>
        <article className="card">
          <span>App builds waiting</span>
          <div className="metric">0</div>
          <span>All build lanes healthy</span>
        </article>
        <article className="card">
          <span>Integration incidents</span>
          <div className="metric">0</div>
          <span>CSV fallback ready</span>
        </article>
      </section>
      <p style={{ marginTop: 32 }}>
        <Link className="button" href={opsAdminFoundation.hotelOnboardingRoute}>
          Create a hotel tenant
        </Link>
      </p>
    </>
  );
}
