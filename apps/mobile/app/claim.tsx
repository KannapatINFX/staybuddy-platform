import { useState } from "react";
import { Pressable, Text, TextInput } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { compiledConfig } from "../src/config/compiled";
import { OnboardingShell, onboardingStyles } from "../src/components/OnboardingShell";
import { useAuthSession } from "../src/state/AuthSessionContext";
import { useGuestExperience } from "../src/state/GuestExperienceContext";
import { useTenantTheme } from "../src/theme/useTenantTheme";

type ClaimPreview = {
  hotelDisplayName: string;
  checkInDate: string;
  checkOutDate: string;
  guestNameMasked: string;
};

export default function Claim() {
  const router = useRouter();
  const { t } = useGuestExperience();
  const theme = useTenantTheme();
  const auth = useAuthSession();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const prearrival = mode === "prearrival";
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [claimSessionId, setClaimSessionId] = useState<string>();
  const [preview, setPreview] = useState<ClaimPreview>();

  async function scan() {
    if (!auth.installationId) return;
    try {
      const response = await fetch(
        `${compiledConfig().apiUrl}/v1/${prearrival ? "prearrival-invitations" : "stay-claims"}/scan`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-App-Installation-Key": compiledConfig().tenant.appInstallationKey,
            "X-Installation-Id": auth.installationId,
          },
          body: JSON.stringify({ opaqueToken: token }),
        },
      );
      const body = (await response.json()) as {
        code?: string;
        claimSessionId?: string;
        invitationSessionId?: string;
        preview?: ClaimPreview;
      };
      if (!response.ok) {
        setMessage(
          body.code === "CLAIM_EXPIRED"
            ? t("claim.expired")
            : body.code === "CLAIM_REPLAYED"
              ? t("claim.replayed")
              : t("common.humanHelp"),
        );
        return;
      }
      const nextSessionId = prearrival ? body.invitationSessionId : body.claimSessionId;
      if (!nextSessionId || !body.preview) throw new Error("CLAIM_SESSION_MISSING");
      setClaimSessionId(nextSessionId);
      setPreview(body.preview);
      setMessage("");
    } catch {
      setMessage(t("bootstrap.offline"));
    }
  }

  async function complete() {
    if (!auth.session || !claimSessionId) {
      router.replace("/welcome");
      return;
    }
    try {
      const response = await fetch(
        `${compiledConfig().apiUrl}/v1/${prearrival ? "prearrival-invitations" : "stay-claims"}/complete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-App-Installation-Key": compiledConfig().tenant.appInstallationKey,
            Authorization: `Bearer ${auth.session.accessToken}`,
          },
          body: JSON.stringify(
            prearrival
              ? { invitationSessionId: claimSessionId, acceptedTermsVersion: "2026-08" }
              : {
                  claimSessionId,
                  accountId: auth.session.accountId,
                  acceptedTermsVersion: "2026-08",
                },
          ),
        },
      );
      const body = (await response.json()) as { code?: string };
      if (!response.ok) {
        setMessage(body.code === "CLAIM_REPLAYED" ? t("claim.replayed") : t("common.humanHelp"));
        return;
      }
      router.replace("/(tabs)");
    } catch {
      setMessage(t("bootstrap.offline"));
    }
  }

  return (
    <OnboardingShell
      eyebrow={t(prearrival ? "claim.prearrivalEyebrow" : "claim.stayEyebrow")}
      title={t("claim.prompt")}
      body={t("claim.security")}
    >
      <TextInput
        autoCapitalize="none"
        value={token}
        onChangeText={setToken}
        placeholder={t(prearrival ? "claim.invitationToken" : "claim.stayToken")}
        editable={!claimSessionId}
        style={[onboardingStyles.input, { borderColor: theme.divider, color: theme.ink }]}
      />
      {preview ? (
        <Text style={[onboardingStyles.message, { color: theme.ink }]}>
          {preview.guestNameMasked} · {preview.checkInDate} – {preview.checkOutDate}
        </Text>
      ) : null}
      <Pressable
        disabled={!claimSessionId && token.length < 32}
        style={[
          onboardingStyles.button,
          { backgroundColor: theme.primary, opacity: claimSessionId || token.length >= 32 ? 1 : 0.4 },
        ]}
        onPress={() => void (claimSessionId ? complete() : scan())}
      >
        <Text style={onboardingStyles.primaryText}>
          {claimSessionId ? t("claim.confirm") : t("claim.link")}
        </Text>
      </Pressable>
      <Text accessibilityLiveRegion="polite" style={[onboardingStyles.message, { color: theme.ink }]}>
        {message}
      </Text>
    </OnboardingShell>
  );
}
