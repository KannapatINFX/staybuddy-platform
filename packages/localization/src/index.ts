import type { Locale } from "@staybuddy/contracts";
import { en, type TranslationKey } from "./locales/en.js";
import { ru } from "./locales/ru.js";
import { th } from "./locales/th.js";
import { zhCN } from "./locales/zh-CN.js";

export { type TranslationKey } from "./locales/en.js";

export const translations: Record<Locale, Record<TranslationKey, string>> = { en, th, "zh-CN": zhCN, ru };

export function resolveLocale(input: {
  explicit?: string;
  reservation?: string;
  device?: string;
  nationality?: string;
}): Locale {
  for (const value of [
    input.explicit,
    input.reservation,
    input.device,
    localeFromNationality(input.nationality),
  ]) {
    const normalized = normalizeLocale(value);
    if (normalized) return normalized;
  }
  return "en";
}

export function translate(locale: Locale, key: TranslationKey, values: Record<string, string> = {}): string {
  return Object.entries(values).reduce(
    (message, [name, value]) => message.replaceAll(`{{${name}}}`, value),
    translations[locale][key],
  );
}

function normalizeLocale(value?: string): Locale | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized.startsWith("th")) return "th";
  if (normalized.startsWith("zh")) return "zh-CN";
  if (normalized.startsWith("ru")) return "ru";
  if (normalized.startsWith("en")) return "en";
  return undefined;
}

function localeFromNationality(value?: string): string | undefined {
  const country = value?.toUpperCase();
  if (country === "TH") return "th";
  if (country === "CN") return "zh-CN";
  if (country === "RU") return "ru";
  return undefined;
}
