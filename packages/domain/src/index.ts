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

export const platformRoles = [
  "STAYBUDDY_SUPER_ADMIN",
  "STAYBUDDY_APP_OPS",
  "STAYBUDDY_CONTENT_OPS",
  "STAYBUDDY_FINANCE",
  "STAYBUDDY_SUPPORT",
] as const;
export type PlatformRole = (typeof platformRoles)[number];

export const hotelRoles = [
  "HOTEL_OWNER",
  "HOTEL_ADMIN",
  "FRONT_DESK",
  "DEPARTMENT_MANAGER",
  "DEPARTMENT_AGENT",
] as const;
export type HotelRole = (typeof hotelRoles)[number];

export type PlatformPermission =
  | "platform.hotels.read"
  | "platform.hotels.create"
  | "platform.hotels.configure"
  | "platform.app-builds.read"
  | "platform.app-builds.create"
  | "platform.app-builds.update";
export type HotelPermission =
  | "hotel.reservations.read"
  | "hotel.reservations.write"
  | "hotel.stay-claims.issue"
  | "hotel.department-work.manage";

const platformPermissions: Readonly<Record<PlatformPermission, readonly PlatformRole[]>> = {
  "platform.hotels.read": ["STAYBUDDY_SUPER_ADMIN", "STAYBUDDY_SUPPORT"],
  "platform.hotels.create": ["STAYBUDDY_SUPER_ADMIN"],
  "platform.hotels.configure": ["STAYBUDDY_SUPER_ADMIN"],
  "platform.app-builds.read": ["STAYBUDDY_SUPER_ADMIN", "STAYBUDDY_APP_OPS", "STAYBUDDY_SUPPORT"],
  "platform.app-builds.create": ["STAYBUDDY_SUPER_ADMIN", "STAYBUDDY_APP_OPS"],
  "platform.app-builds.update": ["STAYBUDDY_SUPER_ADMIN", "STAYBUDDY_APP_OPS"],
};

export type AppBuildStatus = "QUEUED" | "VALIDATING" | "BUILDING" | "BUILT" | "FAILED" | "CANCELLED";

const appBuildTransitions: Readonly<Record<AppBuildStatus, readonly AppBuildStatus[]>> = {
  QUEUED: ["VALIDATING", "CANCELLED"],
  VALIDATING: ["BUILDING", "FAILED", "CANCELLED"],
  BUILDING: ["BUILT", "FAILED", "CANCELLED"],
  BUILT: [],
  FAILED: [],
  CANCELLED: [],
};

export function assertAppBuildTransition(from: AppBuildStatus, to: AppBuildStatus): void {
  if (!appBuildTransitions[from].includes(to)) {
    throw new DomainRuleError("INVALID_APP_BUILD_TRANSITION", `${from} cannot transition to ${to}`);
  }
}

const hotelPermissions: Readonly<Record<HotelPermission, readonly HotelRole[]>> = {
  "hotel.reservations.read": ["HOTEL_OWNER", "HOTEL_ADMIN", "FRONT_DESK"],
  "hotel.reservations.write": ["HOTEL_OWNER", "HOTEL_ADMIN", "FRONT_DESK"],
  "hotel.stay-claims.issue": ["HOTEL_OWNER", "HOTEL_ADMIN", "FRONT_DESK"],
  "hotel.department-work.manage": ["HOTEL_OWNER", "HOTEL_ADMIN", "DEPARTMENT_MANAGER", "DEPARTMENT_AGENT"],
};

export function isPlatformRole(value: string): value is PlatformRole {
  return platformRoles.some((role) => role === value);
}

export function isHotelRole(value: string): value is HotelRole {
  return hotelRoles.some((role) => role === value);
}

export function canPlatform(role: PlatformRole, permission: PlatformPermission): boolean {
  return platformPermissions[permission].includes(role);
}

export function canHotel(
  principal: { role: HotelRole; departmentId?: string },
  permission: HotelPermission,
  resource?: { departmentId?: string },
): boolean {
  if (!hotelPermissions[permission].includes(principal.role)) return false;
  if (
    permission === "hotel.department-work.manage" &&
    (principal.role === "DEPARTMENT_MANAGER" || principal.role === "DEPARTMENT_AGENT")
  ) {
    return Boolean(
      principal.departmentId && resource?.departmentId && principal.departmentId === resource.departmentId,
    );
  }
  return true;
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
