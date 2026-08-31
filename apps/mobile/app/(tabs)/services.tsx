import { PlaceholderScreen } from "../../src/components/PlaceholderScreen";
import { useGuestExperience } from "../../src/state/GuestExperienceContext";
export default function Services() {
  const { t } = useGuestExperience();
  return (
    <PlaceholderScreen
      eyebrow="SB-G-022"
      title={t("screen.services.title")}
      body={t("screen.services.body")}
    />
  );
}
