import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Locale } from "@staybuddy/contracts";
import { HotelHeader } from "../src/components/HotelHeader";
import { useGuestExperience } from "../src/state/GuestExperienceContext";
import { useTenantTheme } from "../src/theme/useTenantTheme";
const locales: { code: Locale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "th", label: "ไทย" },
  { code: "zh-CN", label: "简体中文" },
  { code: "ru", label: "Русский" },
];
export default function Profile() {
  const { locale, setLocale, t } = useGuestExperience();
  const theme = useTenantTheme();
  return (
    <View style={[styles.screen, { backgroundColor: theme.canvas }]}>
      <HotelHeader />
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.ink }]}>{t("profile.title")}</Text>
        <Text style={[styles.body, { color: theme.ink }]}>{t("profile.body")}</Text>
        {locales.map((item) => (
          <Pressable
            key={item.code}
            accessibilityRole="radio"
            accessibilityState={{ checked: locale === item.code }}
            onPress={() => setLocale(item.code)}
            style={[styles.option, { borderColor: locale === item.code ? theme.primary : theme.divider }]}
          >
            <Text
              style={{ fontSize: 16, color: theme.ink, fontWeight: locale === item.code ? "800" : "500" }}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, gap: 12 },
  title: { fontSize: 28, fontWeight: "800" },
  body: { fontSize: 16, lineHeight: 24, opacity: 0.72, marginBottom: 8 },
  option: {
    minHeight: 56,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderWidth: 2,
    borderRadius: 14,
    backgroundColor: "white",
  },
});
