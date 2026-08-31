import { PlaceholderScreen } from "../../src/components/PlaceholderScreen";
import { useGuestExperience } from "../../src/state/GuestExperienceContext";
export default function MyStay() {
  const { t } = useGuestExperience();
  return <PlaceholderScreen eyebrow="SB-G-016" title={t("screen.stay.title")} body={t("screen.stay.body")} />;
}
