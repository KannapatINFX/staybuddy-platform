import type { GuestLifecycle } from "@staybuddy/contracts";

export class DomainRuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainRuleError";
  }
}

const lifecycleTransitions: Readonly<Record<GuestLifecycle, readonly GuestLifecycle[]>> = {
  RESERVATION_IMPORTED: ["UPCOMING"],
  UPCOMING: ["PRE_ARRIVAL_ACTIVATED", "IN_HOUSE"],
  PRE_ARRIVAL_ACTIVATED: ["IN_HOUSE", "UPCOMING"],
  IN_HOUSE: ["DEPARTING"],
  DEPARTING: ["PAST_GUEST"],
  PAST_GUEST: ["REPEAT_DIRECT_BOOKING"],
  REPEAT_DIRECT_BOOKING: ["UPCOMING"],
};

export function assertGuestLifecycleTransition(from: GuestLifecycle, to: GuestLifecycle): void {
  if (!lifecycleTransitions[from].includes(to)) {
    throw new DomainRuleError("INVALID_GUEST_LIFECYCLE_TRANSITION", `${from} cannot transition to ${to}`);
  }
}

export type RequestStatus =
  | "NEW"
  | "ACKNOWLEDGED"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "NEEDS_GUEST_INFO"
  | "ESCALATED"
  | "RESOLVED"
  | "CLOSED"
  | "CANCELLED";

const requestTransitions: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  NEW: ["ACKNOWLEDGED", "ASSIGNED", "ESCALATED", "CANCELLED"],
  ACKNOWLEDGED: ["ASSIGNED", "IN_PROGRESS", "NEEDS_GUEST_INFO", "ESCALATED", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "NEEDS_GUEST_INFO", "ESCALATED", "CANCELLED"],
  IN_PROGRESS: ["NEEDS_GUEST_INFO", "ESCALATED", "RESOLVED", "CANCELLED"],
  NEEDS_GUEST_INFO: ["ASSIGNED", "IN_PROGRESS", "ESCALATED", "CANCELLED"],
  ESCALATED: ["ASSIGNED", "IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: [],
  CANCELLED: [],
};

export function assertRequestTransition(from: RequestStatus, to: RequestStatus): void {
  if (!requestTransitions[from].includes(to)) {
    throw new DomainRuleError("INVALID_REQUEST_TRANSITION", `${from} cannot transition to ${to}`);
  }
}

export function platformSubscriptionMinor(roomCount: number, discountMinor = 0): number {
  if (
    !Number.isInteger(roomCount) ||
    roomCount <= 0 ||
    !Number.isInteger(discountMinor) ||
    discountMinor < 0
  ) {
    throw new DomainRuleError("INVALID_COMMERCIAL_INPUT", "Room count and discount must be valid integers");
  }
  const listMinor = Math.max(roomCount, 50) * 15_000;
  return Math.max(0, listMinor - discountMinor);
}

export function hotelCommerceCommissionMinor(finalNetMinor: number): number {
  if (!Number.isInteger(finalNetMinor) || finalNetMinor < 0) {
    throw new DomainRuleError("INVALID_MONEY", "Final net amount must be a non-negative minor-unit integer");
  }
  return Math.round((finalNetMinor * 500) / 10_000);
}

export function aiWalletChargeMinor(providerCostMinor: number): number {
  if (!Number.isInteger(providerCostMinor) || providerCostMinor < 0) {
    throw new DomainRuleError("INVALID_MONEY", "Provider cost must be a non-negative minor-unit integer");
  }
  return Math.ceil((providerCostMinor * 11_250) / 10_000);
}
