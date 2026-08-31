import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  SignedBootstrapManifestSchema,
  verifyBootstrapManifest,
  type BootstrapManifest,
} from "@staybuddy/contracts";
import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from "react";
import { compiledConfig } from "../config/compiled";

const compiled = compiledConfig();

export type BootstrapStatus =
  "IDLE" | "LOADING" | "CURRENT" | "CACHED" | "MAINTENANCE" | "UPDATE_REQUIRED" | "UNAVAILABLE";

type BootstrapState = {
  status: BootstrapStatus;
  manifest?: BootstrapManifest;
  refresh: () => Promise<BootstrapStatus>;
};

const Context = createContext<BootstrapState | undefined>(undefined);

function isBelow(current: string, minimum: string): boolean {
  const left = current.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = minimum.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference < 0;
  }
  return false;
}

export function BootstrapProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<BootstrapStatus>("IDLE");
  const [manifest, setManifest] = useState<BootstrapManifest>();

  const accept = useCallback(async (raw: unknown, source: "CURRENT" | "CACHED"): Promise<BootstrapStatus> => {
    const signed = SignedBootstrapManifestSchema.parse(raw);
    if (!verifyBootstrapManifest(signed, compiled.tenant.bootstrapPublicKeyHex)) {
      throw new Error("BOOTSTRAP_SIGNATURE_INVALID");
    }
    if (
      signed.manifest.appInstallationKey !== compiled.tenant.appInstallationKey ||
      signed.manifest.hotelId !== compiled.tenant.hotelId ||
      signed.manifest.appId !== compiled.tenant.appId
    ) {
      throw new Error("BOOTSTRAP_APP_IDENTITY_MISMATCH");
    }
    if (new Date(signed.manifest.expiresAt).valueOf() <= Date.now()) {
      throw new Error("BOOTSTRAP_EXPIRED");
    }
    setManifest(signed.manifest);
    const next = signed.manifest.maintenance.active
      ? "MAINTENANCE"
      : isBelow(compiled.appVersion, signed.manifest.minimumVersion)
        ? "UPDATE_REQUIRED"
        : source;
    setStatus(next);
    return next;
  }, []);

  const refresh = useCallback(async (): Promise<BootstrapStatus> => {
    setStatus("LOADING");
    const cacheKey = `staybuddy.bootstrap.${compiled.tenant.appId}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      const response = await fetch(`${compiled.apiUrl}/v1/mobile/bootstrap`, {
        headers: { "X-App-Installation-Key": compiled.tenant.appInstallationKey },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error("BOOTSTRAP_REQUEST_FAILED");
      const raw: unknown = await response.json();
      const next = await accept(raw, "CURRENT");
      await AsyncStorage.setItem(cacheKey, JSON.stringify(raw));
      return next;
    } catch {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        try {
          return await accept(JSON.parse(cached) as unknown, "CACHED");
        } catch {
          await AsyncStorage.removeItem(cacheKey);
        }
      }
      setStatus("UNAVAILABLE");
      return "UNAVAILABLE";
    }
  }, [accept]);

  const value = useMemo(
    () => ({ status, ...(manifest ? { manifest } : {}), refresh }),
    [manifest, refresh, status],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useBootstrap(): BootstrapState {
  const value = useContext(Context);
  if (!value) throw new Error("BootstrapProvider is missing");
  return value;
}
