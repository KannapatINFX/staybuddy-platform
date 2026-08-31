import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GuestExperienceProvider } from "../src/state/GuestExperienceContext";
import { AuthSessionProvider } from "../src/state/AuthSessionContext";
import { BootstrapProvider } from "../src/state/BootstrapContext";

export default function RootLayout() {
  return (
    <BootstrapProvider>
      <AuthSessionProvider>
        <GuestExperienceProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </GuestExperienceProvider>
      </AuthSessionProvider>
    </BootstrapProvider>
  );
}
