import { useCallback, useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { GuestStateCard } from "../src/components/GuestStateCard";
import { compiledConfig } from "../src/config/compiled";
import { useAuthSession } from "../src/state/AuthSessionContext";
import { useBootstrap } from "../src/state/BootstrapContext";
import { useGuestExperience } from "../src/state/GuestExperienceContext";
import { useTenantTheme } from "../src/theme/useTenantTheme";

export default function Bootstrap() {
  const router = useRouter();
  const theme = useTenantTheme();
  const { t } = useGuestExperience();
  const auth = useAuthSession();
  const bootstrap = useBootstrap();

  const start = useCallback(async () => {
    if (!auth.hydrated) return;
    const status = await bootstrap.refresh();
    if (["CURRENT", "CACHED"].includes(status)) router.replace(auth.session ? "/(tabs)" : "/welcome");
  }, [auth.hydrated, auth.session, bootstrap.refresh, router]);

  useEffect(() => {
    void start();
  }, [start]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.canvas }]}>
      <Text style={[styles.hotel, { color: theme.primary }]}>
        {bootstrap.manifest?.hotelDisplayName ?? compiledConfig().tenant.displayName}
      </Text>
      {bootstrap.status === "MAINTENANCE" ? (
        <GuestStateCard
          kind="maintenance"
          title={t("state.maintenanceTitle")}
          detail={t("bootstrap.maintenance")}
        />
      ) : bootstrap.status === "UPDATE_REQUIRED" ? (
        <GuestStateCard kind="update" title={t("state.updateTitle")} detail={t("bootstrap.updateRequired")} />
      ) : bootstrap.status === "UNAVAILABLE" ? (
        <GuestStateCard
          kind="offline"
          title={t("state.unavailableTitle")}
          detail={t("bootstrap.offline")}
          action={t("common.retry")}
          onAction={() => void start()}
        />
      ) : (
        <>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.copy, { color: theme.ink }]}>{t("bootstrap.loading")}</Text>
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", alignItems: "center", gap: 24, padding: 28 },
  hotel: { fontSize: 26, fontWeight: "800", textAlign: "center" },
  copy: { fontSize: 16, textAlign: "center" },
});
