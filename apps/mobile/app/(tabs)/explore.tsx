import { PlaceholderScreen } from "../../src/components/PlaceholderScreen";
import { useGuestExperience } from "../../src/state/GuestExperienceContext";
export default function Explore() {
  const { t } = useGuestExperience();
  return (
    <PlaceholderScreen eyebrow="SB-G-037" title={t("screen.explore.title")} body={t("screen.explore.body")} />
  );
}
