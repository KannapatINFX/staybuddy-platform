import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import type { GuestLifecycle, Locale } from "@staybuddy/contracts";
import { resolveLocale, translate, type TranslationKey } from "@staybuddy/localization";
import { compiledConfig } from "../config/compiled";

type GuestExperience = {
  locale: Locale;
  lifecycle: GuestLifecycle;
  setLocale: (locale: Locale) => void;
  setLifecycle: (lifecycle: GuestLifecycle) => void;
  t: (key: TranslationKey, values?: Record<string, string>) => string;
};

const Context = createContext<GuestExperience | undefined>(undefined);

export function GuestExperienceProvider({ children }: PropsWithChildren) {
  const tenant = compiledConfig().tenant;
  const [locale, setLocaleState] = useState<Locale>(tenant.defaultLocale);
  const [lifecycle, setLifecycle] = useState<GuestLifecycle>("IN_HOUSE");

  useEffect(() => {
    void AsyncStorage.getItem("staybuddy.locale").then((saved) => {
      const explicit = saved ?? undefined;
      const device = getLocales()[0]?.languageTag;
      setLocaleState(resolveLocale({ ...(explicit ? { explicit } : {}), ...(device ? { device } : {}) }));
    });
  }, []);

  const value = useMemo<GuestExperience>(
    () => ({
      locale,
      lifecycle,
      setLocale(next) {
        setLocaleState(next);
        void AsyncStorage.setItem("staybuddy.locale", next);
      },
      setLifecycle,
      t: (key, values) => translate(locale, key, values),
    }),
    [lifecycle, locale],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useGuestExperience(): GuestExperience {
  const value = useContext(Context);
  if (!value) throw new Error("GuestExperienceProvider is missing");
  return value;
}
