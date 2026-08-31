import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

export type GuestSession = {
  accountId: string;
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
};

type AuthSessionState = {
  hydrated: boolean;
  installationId?: string;
  session?: GuestSession;
  setSession: (session: GuestSession) => Promise<void>;
  clearSession: () => Promise<void>;
};

const Context = createContext<AuthSessionState | undefined>(undefined);
const sessionKey = "staybuddy.guest-session.v1";
const installationKey = "staybuddy.installation-id.v1";

const secureSessionStorage = {
  get: () =>
    Platform.OS === "web" ? AsyncStorage.getItem(sessionKey) : SecureStore.getItemAsync(sessionKey),
  set: (value: string) =>
    Platform.OS === "web"
      ? AsyncStorage.setItem(sessionKey, value)
      : SecureStore.setItemAsync(sessionKey, value),
  remove: () =>
    Platform.OS === "web" ? AsyncStorage.removeItem(sessionKey) : SecureStore.deleteItemAsync(sessionKey),
};

export function AuthSessionProvider({ children }: PropsWithChildren) {
  const [hydrated, setHydrated] = useState(false);
  const [installationId, setInstallationId] = useState<string>();
  const [session, setSessionState] = useState<GuestSession>();

  useEffect(() => {
    void Promise.all([AsyncStorage.getItem(installationKey), secureSessionStorage.get()]).then(
      async ([savedInstallation, savedSession]) => {
        const nextInstallation = savedInstallation ?? Crypto.randomUUID();
        if (!savedInstallation) await AsyncStorage.setItem(installationKey, nextInstallation);
        setInstallationId(nextInstallation);
        if (savedSession) setSessionState(JSON.parse(savedSession) as GuestSession);
        setHydrated(true);
      },
    );
  }, []);

  const value = useMemo<AuthSessionState>(
    () => ({
      hydrated,
      ...(installationId ? { installationId } : {}),
      ...(session ? { session } : {}),
      async setSession(next) {
        await secureSessionStorage.set(JSON.stringify(next));
        setSessionState(next);
      },
      async clearSession() {
        await secureSessionStorage.remove();
        setSessionState(undefined);
      },
    }),
    [hydrated, installationId, session],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuthSession(): AuthSessionState {
  const value = useContext(Context);
  if (!value) throw new Error("AuthSessionProvider is missing");
  return value;
}
