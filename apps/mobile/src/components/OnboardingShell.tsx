import type { PropsWithChildren } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { compiledConfig } from "../config/compiled";
import { useGuestExperience } from "../state/GuestExperienceContext";
import { useTenantTheme } from "../theme/useTenantTheme";

export function OnboardingShell({
  eyebrow,
  title,
  body,
  children,
}: PropsWithChildren<{ eyebrow: string; title: string; body: string }>) {
  const theme = useTenantTheme();
  const { t } = useGuestExperience();
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={{ backgroundColor: theme.canvas }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <Text style={[styles.hotel, { color: theme.primary }]}>{compiledConfig().tenant.displayName}</Text>
          <Text style={[styles.eyebrow, { color: theme.accent }]}>{eyebrow}</Text>
        </View>
        <View style={styles.copy}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.ink }]}>
            {title}
          </Text>
          <Text style={[styles.body, { color: theme.ink }]}>{body}</Text>
        </View>
        <View style={styles.actions}>{children}</View>
        <Text style={[styles.credit, { color: theme.ink }]}>{t("common.secure")}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
export const onboardingStyles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  primaryText: { color: "white", fontSize: 16, fontWeight: "800" },
  secondaryText: { fontSize: 16, fontWeight: "700" },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 15,
    fontSize: 16,
    backgroundColor: "white",
  },
  label: { fontSize: 14, fontWeight: "800", marginBottom: 7 },
  message: { fontSize: 15, lineHeight: 22 },
  row: { flexDirection: "row", gap: 10, alignItems: "center" },
});
const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: 24, paddingTop: 72, gap: 34 },
  hotel: { fontSize: 18, fontWeight: "900" },
  eyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 1.3, marginTop: 5 },
  copy: { gap: 12 },
  title: { fontSize: 34, lineHeight: 41, fontWeight: "800" },
  body: { fontSize: 16, lineHeight: 25, opacity: 0.75 },
  actions: { gap: 12 },
  credit: { fontSize: 11, opacity: 0.45, textAlign: "center", marginTop: "auto" },
});
