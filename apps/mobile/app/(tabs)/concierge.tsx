import { PlaceholderScreen } from "../../src/components/PlaceholderScreen";
import { useGuestExperience } from "../../src/state/GuestExperienceContext";
export default function Concierge() {
  const { t } = useGuestExperience();
  return (
    <PlaceholderScreen
      eyebrow="SB-G-014"
      title={t("screen.concierge.title")}
      body={t("screen.concierge.body")}
    />
  );
}
