import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTenantTheme } from "../theme/useTenantTheme";

type StateKind = "loading" | "offline" | "empty" | "validation" | "permission" | "maintenance" | "update";

const icons: Record<StateKind, keyof typeof Ionicons.glyphMap> = {
  loading: "sparkles-outline",
  offline: "cloud-offline-outline",
  empty: "leaf-outline",
  validation: "information-circle-outline",
  permission: "lock-closed-outline",
  maintenance: "construct-outline",
  update: "arrow-up-circle-outline",
};

export function GuestStateCard(props: {
  kind: StateKind;
  title: string;
  detail: string;
  action?: string;
  onAction?: () => void;
}) {
  const theme = useTenantTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.card, { backgroundColor: theme.surfaceWarm, borderColor: theme.divider }]}
    >
      <Ionicons name={icons[props.kind]} size={28} color={theme.primary} />
      <View style={styles.copy}>
        <Text style={[styles.title, { color: theme.ink }]}>{props.title}</Text>
        <Text style={[styles.detail, { color: theme.ink }]}>{props.detail}</Text>
      </View>
      {props.action ? (
        <Pressable
          accessibilityRole="button"
          style={[styles.action, { backgroundColor: theme.primary }]}
          onPress={props.onAction}
        >
          <Text style={styles.actionText}>{props.action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 20, gap: 14 },
  copy: { gap: 6 },
  title: { fontSize: 18, fontWeight: "800" },
  detail: { fontSize: 16, lineHeight: 23, opacity: 0.78 },
  action: {
    alignSelf: "flex-start",
    minHeight: 48,
    borderRadius: 14,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  actionText: { color: "white", fontSize: 16, fontWeight: "700" },
});
