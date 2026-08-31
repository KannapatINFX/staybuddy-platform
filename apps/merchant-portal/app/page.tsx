import { merchantPortalFoundation } from "./foundation";

export default function MerchantPlaceholder() {
  return (
    <main>
      <h1>Merchant Portal</h1>
      <p>
        Phase {merchantPortalFoundation.releasePhase} boundary reserved. No hotel guest CRM data is exposed
        here.
      </p>
    </main>
  );
}
