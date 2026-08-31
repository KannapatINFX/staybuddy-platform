import { StyleSheet, Text, View } from "react-native";
import { HotelHeader } from "./HotelHeader";
import { useTenantTheme } from "../theme/useTenantTheme";

export function PlaceholderScreen({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  const theme = useTenantTheme();
  return (
    <View style={[styles.screen, { backgroundColor: theme.canvas }]}>
      <HotelHeader />
      <View style={styles.copy}>
        <Text style={[styles.eyebrow, { color: theme.accent }]}>{eyebrow}</Text>
        <Text style={[styles.title, { color: theme.ink }]}>{title}</Text>
        <Text style={[styles.body, { color: theme.ink }]}>{body}</Text>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  copy: { padding: 20, gap: 12 },
  eyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  title: { fontSize: 30, fontWeight: "800" },
  body: { fontSize: 16, lineHeight: 24, opacity: 0.72 },
});
