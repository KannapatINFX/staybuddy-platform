import type { Locale } from "@staybuddy/contracts";
import { translate, type TranslationKey } from "@staybuddy/localization";

const forbiddenGuestCopy = [
  /request submitted/i,
  /ticket created/i,
  /something went wrong/i,
  /processing\.\.\./i,
  /staybuddy concierge/i,
  /i['’]?m staybuddy/i,
];

export function renderGuestMessage(
  locale: Locale,
  key: TranslationKey,
  facts: Record<string, string> = {},
): string {
  const message = translate(locale, key, facts);
  assertConciergeCopy(message);
  return message;
}

export function assertConciergeCopy(message: string): void {
  if (forbiddenGuestCopy.some((pattern) => pattern.test(message))) {
    throw new Error("GUEST_COPY_VOICE_VIOLATION");
  }
}

export function pendingConfirmationEnvelope(subject: string, nextStep: string) {
  return {
    status: "PENDING_CONFIRMATION" as const,
    subject,
    nextStep,
    confirmed: false as const,
  };
}
