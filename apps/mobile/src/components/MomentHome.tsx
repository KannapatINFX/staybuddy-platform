import { Ionicons } from "@expo/vector-icons";
import type { GuestLifecycle } from "@staybuddy/contracts";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useGuestExperience } from "../state/GuestExperienceContext";
import { useTenantTheme } from "../theme/useTenantTheme";
import { HotelHeader } from "./HotelHeader";

const homeKeys: Record<
  GuestLifecycle,
  {
    eyebrow:
      "home.upcoming.eyebrow" | "home.inHouse.eyebrow" | "home.departing.eyebrow" | "home.past.eyebrow";
    title: "home.upcoming.title" | "home.inHouse.title" | "home.departing.title" | "home.past.title";
  }
> = {
  RESERVATION_IMPORTED: { eyebrow: "home.upcoming.eyebrow", title: "home.upcoming.title" },
  UPCOMING: { eyebrow: "home.upcoming.eyebrow", title: "home.upcoming.title" },
  PRE_ARRIVAL_ACTIVATED: { eyebrow: "home.upcoming.eyebrow", title: "home.upcoming.title" },
  IN_HOUSE: { eyebrow: "home.inHouse.eyebrow", title: "home.inHouse.title" },
  DEPARTING: { eyebrow: "home.departing.eyebrow", title: "home.departing.title" },
  PAST_GUEST: { eyebrow: "home.past.eyebrow", title: "home.past.title" },
  REPEAT_DIRECT_BOOKING: { eyebrow: "home.past.eyebrow", title: "home.past.title" },
};

export function MomentHome() {
  const router = useRouter();
  const { lifecycle, t } = useGuestExperience();
  const theme = useTenantTheme();
  const keys = homeKeys[lifecycle];
  return (
    <ScrollView style={{ backgroundColor: theme.canvas }} contentContainerStyle={styles.content}>
      <HotelHeader />
      <View style={styles.greeting}>
        <Text style={[styles.eyebrow, { color: theme.accent }]}>{t("home.dayEyebrow")}</Text>
        <Text style={[styles.greetingTitle, { color: theme.ink }]}>{t("home.conciergePrompt")}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("navigation.concierge")}
        onPress={() => router.push("/(tabs)/concierge")}
        style={[styles.concierge, { backgroundColor: theme.primary }]}
      >
        <View style={[styles.conciergeIcon, { backgroundColor: theme.accent }]}>
          <Ionicons name="sparkles" size={22} color={theme.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.conciergeLabel}>{t("home.conciergeLabel")}</Text>
          <Text style={styles.conciergeText}>{t("home.conciergeBody")}</Text>
        </View>
        <Ionicons name="arrow-forward" size={22} color="white" />
      </Pressable>
      <View style={[styles.story, { backgroundColor: theme.surfaceWarm }]}>
        <View style={[styles.curve, { borderColor: theme.accent }]} />
        <Text style={[styles.storyEyebrow, { color: theme.primary }]}>{t(keys.eyebrow)}</Text>
        <Text style={[styles.storyTitle, { color: theme.ink }]}>{t(keys.title)}</Text>
        <Text style={[styles.storyBody, { color: theme.ink }]}>{t("home.storyBody")}</Text>
        <Pressable style={[styles.storyAction, { backgroundColor: theme.primary }]}>
          <Text style={styles.storyActionText}>{t("home.storyAction")}</Text>
        </Pressable>
      </View>
      <Text style={[styles.sectionTitle, { color: theme.ink }]}>{t("home.closeAtHand")}</Text>
      <View style={styles.shortcuts}>
        {(["home.roomWifi", "home.dining", "home.spa", "home.requests"] as const).map((key) => (
          <Pressable key={key} style={[styles.shortcut, { borderColor: theme.divider }]}>
            <Text style={{ color: theme.ink, fontWeight: "700" }}>{t(key)}</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.primary} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 36 },
  greeting: { paddingHorizontal: 20, paddingTop: 18, gap: 8 },
  eyebrow: { fontSize: 12, letterSpacing: 1.4, fontWeight: "900" },
  greetingTitle: { fontSize: 30, lineHeight: 37, fontWeight: "800", maxWidth: 350 },
  concierge: {
    margin: 20,
    minHeight: 82,
    borderRadius: 20,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  conciergeIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
  conciergeLabel: { color: "white", fontSize: 11, fontWeight: "900", letterSpacing: 1.1 },
  conciergeText: { color: "white", fontSize: 15, marginTop: 4 },
  story: {
    marginHorizontal: 20,
    minHeight: 280,
    borderRadius: 24,
    padding: 24,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  curve: {
    position: "absolute",
    width: 420,
    height: 190,
    borderRadius: 250,
    borderWidth: 3,
    top: -135,
    left: -70,
    opacity: 0.7,
  },
  storyEyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
  storyTitle: { fontSize: 28, lineHeight: 34, fontWeight: "800", marginTop: 9, maxWidth: 310 },
  storyBody: { fontSize: 15, lineHeight: 22, marginTop: 10, opacity: 0.72 },
  storyAction: {
    minHeight: 48,
    borderRadius: 14,
    alignSelf: "flex-start",
    paddingHorizontal: 18,
    justifyContent: "center",
    marginTop: 18,
  },
  storyActionText: { color: "white", fontSize: 15, fontWeight: "800" },
  sectionTitle: { fontSize: 21, fontWeight: "800", marginHorizontal: 20, marginTop: 30, marginBottom: 12 },
  shortcuts: { marginHorizontal: 20, gap: 10 },
  shortcut: {
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "white",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
