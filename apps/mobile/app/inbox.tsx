import { PlaceholderScreen } from "../src/components/PlaceholderScreen";
import { useGuestExperience } from "../src/state/GuestExperienceContext";
export default function Inbox() {
  const { t } = useGuestExperience();
  return <PlaceholderScreen eyebrow={t("header.inbox")} title={t("inbox.title")} body={t("inbox.body")} />;
}
