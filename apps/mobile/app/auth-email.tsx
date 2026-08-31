import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { compiledConfig } from "../src/config/compiled";
import { OnboardingShell, onboardingStyles } from "../src/components/OnboardingShell";
import { useAuthSession, type GuestSession } from "../src/state/AuthSessionContext";
import { useGuestExperience } from "../src/state/GuestExperienceContext";
import { useTenantTheme } from "../src/theme/useTenantTheme";
export default function EmailOtp() {
  const router = useRouter();
  const { t } = useGuestExperience();
  const theme = useTenantTheme();
  const auth = useAuthSession();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState<string>();
  const [message, setMessage] = useState("");
  async function start() {
    if (!auth.installationId) return;
    try {
      const response = await fetch(`${compiledConfig().apiUrl}/v1/auth/email/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-App-Installation-Key": compiledConfig().tenant.appInstallationKey,
        },
        body: JSON.stringify({ email, installationId: auth.installationId }),
      });
      const body = (await response.json()) as { challengeId?: string };
      if (!response.ok || !body.challengeId) throw new Error("OTP_START_FAILED");
      setChallengeId(body.challengeId);
      setMessage(t("auth.otpSent", { email: email.replace(/^(.).+(@.*)$/, "$1***$2") }));
    } catch {
      setMessage(t("bootstrap.offline"));
    }
  }
  async function verify() {
    if (!auth.installationId || !challengeId) return;
    try {
      const response = await fetch(`${compiledConfig().apiUrl}/v1/auth/email/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-App-Installation-Key": compiledConfig().tenant.appInstallationKey,
        },
        body: JSON.stringify({ challengeId, code, installationId: auth.installationId }),
      });
      if (!response.ok) throw new Error("OTP_VERIFY_FAILED");
      await auth.setSession((await response.json()) as GuestSession);
      router.push("/legal");
    } catch {
      setMessage(t("auth.otpInvalid"));
    }
  }
  return (
    <OnboardingShell eyebrow="SB-G-003" title={t("auth.emailTitle")} body={t("auth.emailBody")}>
      <View>
        <Text style={[onboardingStyles.label, { color: theme.ink }]}>{t("auth.emailLabel")}</Text>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={[onboardingStyles.input, { borderColor: theme.divider, color: theme.ink }]}
        />
      </View>
      {challengeId ? (
        <View>
          <Text style={[onboardingStyles.label, { color: theme.ink }]}>{t("auth.codeLabel")}</Text>
          <TextInput
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={setCode}
            style={[onboardingStyles.input, { borderColor: theme.divider, color: theme.ink }]}
          />
        </View>
      ) : null}
      <Pressable
        style={[onboardingStyles.button, { backgroundColor: theme.primary }]}
        onPress={challengeId ? verify : start}
      >
        <Text style={onboardingStyles.primaryText}>
          {challengeId ? t("auth.verify") : t("auth.sendCode")}
        </Text>
      </Pressable>
      <Text accessibilityLiveRegion="polite" style={[onboardingStyles.message, { color: theme.ink }]}>
        {message}
      </Text>
    </OnboardingShell>
  );
}
