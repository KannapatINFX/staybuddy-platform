import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useGuestExperience } from "../../src/state/GuestExperienceContext";
import { useTenantTheme } from "../../src/theme/useTenantTheme";

export default function TabLayout() {
  const { t } = useGuestExperience();
  const theme = useTenantTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: "#64778B",
        tabBarStyle: {
          height: 78,
          paddingTop: 8,
          paddingBottom: 10,
          backgroundColor: "white",
          borderTopColor: theme.divider,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("navigation.home"),
          tabBarIcon: ({ color }) => <Ionicons name="home-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: t("navigation.services"),
          tabBarIcon: ({ color }) => <Ionicons name="grid-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="concierge"
        options={{
          title: t("navigation.concierge"),
          tabBarIcon: ({ color }) => <Ionicons name="sparkles-outline" size={23} color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: t("navigation.explore"),
          tabBarIcon: ({ color }) => <Ionicons name="compass-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="stay"
        options={{
          title: t("navigation.myStay"),
          tabBarIcon: ({ color }) => <Ionicons name="bed-outline" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
