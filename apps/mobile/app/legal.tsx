import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { OnboardingShell, onboardingStyles } from "../src/components/OnboardingShell";
import { compiledConfig } from "../src/config/compiled";
import { useAuthSession } from "../src/state/AuthSessionContext";
import { useGuestExperience } from "../src/state/GuestExperienceContext";
import { useTenantTheme } from "../src/theme/useTenantTheme";
export default function Legal() {
  const router = useRouter();
  const { locale, t } = useGuestExperience();
  const theme = useTenantTheme();
  const auth = useAuthSession();
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    if (!auth.session) {
      router.replace("/welcome");
      return;
    }
    try {
      for (const purpose of ["TERMS", "PRIVACY"] as const) {
        const response = await fetch(`${compiledConfig().apiUrl}/v1/consents`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-App-Installation-Key": compiledConfig().tenant.appInstallationKey,
            Authorization: `Bearer ${auth.session.accessToken}`,
          },
          body: JSON.stringify({
            purpose,
            channel: "SERVICE",
            granted: true,
            definitionVersion: "2026-08",
            locale,
            source: "ONBOARDING",
          }),
        });
        if (!response.ok) throw new Error("CONSENT_FAILED");
      }
      router.push("/permissions");
    } catch {
      setMessage(t("bootstrap.offline"));
    }
  }
  return (
    <OnboardingShell eyebrow="SB-G-004 · SB-G-005" title={t("legal.title")} body={t("legal.required")}>
      <View style={onboardingStyles.row}>
        <Switch value={accepted} onValueChange={setAccepted} trackColor={{ true: theme.primary }} />
        <Text style={{ flex: 1, fontSize: 16, lineHeight: 23, color: theme.ink }}>
          {t("legal.acceptStatement")}
        </Text>
      </View>
      <Text style={{ fontSize: 15, lineHeight: 23, color: theme.ink, opacity: 0.72 }}>
        {t("legal.marketingOptional")}
      </Text>
      <Pressable
        disabled={!accepted}
        style={[onboardingStyles.button, { backgroundColor: theme.primary, opacity: accepted ? 1 : 0.4 }]}
        onPress={() => void submit()}
      >
        <Text style={onboardingStyles.primaryText}>{t("legal.acceptAction")}</Text>
      </Pressable>
      <Text accessibilityLiveRegion="polite" style={[onboardingStyles.message, { color: theme.ink }]}>
        {message}
      </Text>
    </OnboardingShell>
  );
}
