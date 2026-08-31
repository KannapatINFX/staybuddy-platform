import { describe, expect, it } from "vitest";
import { resolveLocale, translate, translations } from "./index.js";

describe("localization", () => {
  it("contains exactly the same keys in all four locales", () => {
    const baseline = Object.keys(translations.en).sort();
    expect(Object.keys(translations.th).sort()).toEqual(baseline);
    expect(Object.keys(translations["zh-CN"]).sort()).toEqual(baseline);
    expect(Object.keys(translations.ru).sort()).toEqual(baseline);
  });

  it("resolves explicit preference before weaker signals", () => {
    expect(resolveLocale({ explicit: "ru", reservation: "th", device: "zh-CN" })).toBe("ru");
    expect(resolveLocale({ device: "fr-FR", nationality: "TH" })).toBe("th");
    expect(resolveLocale({ device: "fr-FR" })).toBe("en");
  });

  it("interpolates structured facts without changing them", () => {
    expect(translate("th", "auth.otpSent", { email: "a***@example.com" })).toContain("a***@example.com");
  });
});
