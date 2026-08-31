import { ScrollView, StyleSheet } from "react-native";
import { GuestStateCard } from "../src/components/GuestStateCard";
import { useGuestExperience } from "../src/state/GuestExperienceContext";
import { useTenantTheme } from "../src/theme/useTenantTheme";
export default function StateLibrary() {
  const { t } = useGuestExperience();
  const theme = useTenantTheme();
  return (
    <ScrollView style={{ backgroundColor: theme.canvas }} contentContainerStyle={styles.content}>
      <GuestStateCard kind="loading" title={t("state.loadingTitle")} detail={t("bootstrap.loading")} />
      <GuestStateCard
        kind="offline"
        title={t("state.offlineTitle")}
        detail={t("bootstrap.offline")}
        action={t("common.retry")}
      />
      <GuestStateCard kind="empty" title={t("state.emptyTitle")} detail={t("state.empty")} />
      <GuestStateCard kind="validation" title={t("state.validationTitle")} detail={t("state.validation")} />
      <GuestStateCard
        kind="permission"
        title={t("state.permissionTitle")}
        detail={t("state.permissionDenied")}
      />
      <GuestStateCard
        kind="maintenance"
        title={t("state.maintenanceTitle")}
        detail={t("bootstrap.maintenance")}
      />
      <GuestStateCard kind="update" title={t("state.updateTitle")} detail={t("bootstrap.updateRequired")} />
    </ScrollView>
  );
}
const styles = StyleSheet.create({ content: { padding: 20, gap: 14 } });
