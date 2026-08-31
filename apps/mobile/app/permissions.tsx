import { Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { OnboardingShell, onboardingStyles } from "../src/components/OnboardingShell";
import { compiledConfig } from "../src/config/compiled";
import { useAuthSession } from "../src/state/AuthSessionContext";
import { useGuestExperience } from "../src/state/GuestExperienceContext";
import { useTenantTheme } from "../src/theme/useTenantTheme";
export default function Permissions() {
  const router = useRouter();
  const { t } = useGuestExperience();
  const theme = useTenantTheme();
  const auth = useAuthSession();

  async function record(status: "GRANTED" | "DECLINED") {
    if (auth.session && auth.installationId) {
      await fetch(`${compiledConfig().apiUrl}/v1/me/devices/push-permission`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-App-Installation-Key": compiledConfig().tenant.appInstallationKey,
          Authorization: `Bearer ${auth.session.accessToken}`,
        },
        body: JSON.stringify({ installationId: auth.installationId, status }),
      }).catch(() => undefined);
    }
    router.push("/claim");
  }

  async function requestPush() {
    const permission = await Notifications.requestPermissionsAsync();
    await record(permission.granted ? "GRANTED" : "DECLINED");
  }
  return (
    <OnboardingShell eyebrow="PUSH PERMISSION" title={t("push.title")} body={t("push.value")}>
      <Pressable
        style={[onboardingStyles.button, { backgroundColor: theme.primary }]}
        onPress={() => void requestPush()}
      >
        <Text style={onboardingStyles.primaryText}>{t("push.allow")}</Text>
      </Pressable>
      <Pressable style={onboardingStyles.button} onPress={() => void record("DECLINED")}>
        <Text style={[onboardingStyles.secondaryText, { color: theme.ink }]}>{t("push.notNow")}</Text>
      </Pressable>
    </OnboardingShell>
  );
}
