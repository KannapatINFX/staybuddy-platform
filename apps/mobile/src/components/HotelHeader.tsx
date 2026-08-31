import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { compiledConfig } from "../config/compiled";
import { useGuestExperience } from "../state/GuestExperienceContext";
import { useTenantTheme } from "../theme/useTenantTheme";

export function HotelHeader() {
  const router = useRouter();
  const { t } = useGuestExperience();
  const theme = useTenantTheme();
  return (
    <View style={styles.header}>
      <View accessibilityRole="header">
        <Text style={[styles.hotelName, { color: theme.primary }]}>
          {compiledConfig().tenant.displayName}
        </Text>
        <Text style={[styles.subtle, { color: theme.ink }]}>{t("header.concierge")}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={t("header.inbox")}
          hitSlop={8}
          style={styles.iconButton}
          onPress={() => router.push("/inbox")}
        >
          <Ionicons name="mail-outline" size={23} color={theme.primary} />
        </Pressable>
        <Pressable
          accessibilityLabel={t("header.profile")}
          hitSlop={8}
          style={styles.iconButton}
          onPress={() => router.push("/profile")}
        >
          <Ionicons name="person-outline" size={23} color={theme.primary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 68,
    paddingHorizontal: 20,
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hotelName: { fontSize: 18, fontWeight: "800" },
  subtle: { fontSize: 12, marginTop: 2, opacity: 0.68 },
  actions: { flexDirection: "row", gap: 8 },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,.8)",
  },
});
