import { Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { OnboardingShell, onboardingStyles } from "../src/components/OnboardingShell";
import { useGuestExperience } from "../src/state/GuestExperienceContext";
import { useTenantTheme } from "../src/theme/useTenantTheme";
export default function Welcome() {
  const router = useRouter();
  const { t } = useGuestExperience();
  const theme = useTenantTheme();
  return (
    <OnboardingShell eyebrow="SB-G-002" title={t("auth.welcome")} body={t("auth.welcomeBody")}>
      <Pressable
        style={[onboardingStyles.button, { backgroundColor: theme.primary }]}
        onPress={() => router.push("/auth-email")}
      >
        <Text style={onboardingStyles.primaryText}>{t("auth.continueEmail")}</Text>
      </Pressable>
      <Pressable style={[onboardingStyles.button, { borderWidth: 1, borderColor: theme.divider }]}>
        <Text style={[onboardingStyles.secondaryText, { color: theme.ink }]}>{t("auth.continueApple")}</Text>
      </Pressable>
      <Pressable style={[onboardingStyles.button, { borderWidth: 1, borderColor: theme.divider }]}>
        <Text style={[onboardingStyles.secondaryText, { color: theme.ink }]}>{t("auth.continueGoogle")}</Text>
      </Pressable>
    </OnboardingShell>
  );
}
