import type { CompiledTenant } from "../config/compiled";

export type HotelDeepLinkIntent = { route: string; segments: string[] };

export function resolveHotelDeepLink(url: string, tenant: CompiledTenant): HotelDeepLinkIntent {
  const parsed = new URL(url);
  const expectedOrigin = new URL(tenant.deepLinks.universalLinkOrigin);
  let parts: string[];
  if (parsed.protocol === `${tenant.deepLinks.scheme}:`) {
    parts = [parsed.host, ...parsed.pathname.split("/")].filter(Boolean);
  } else if (parsed.protocol === "https:" && parsed.host === expectedOrigin.host) {
    parts = parsed.pathname.split("/").filter(Boolean);
  } else {
    throw new Error("DEEP_LINK_APP_IDENTITY_MISMATCH");
  }
  const [route, ...segments] = parts;
  if (!route || !tenant.deepLinks.allowedRoutes.includes(route)) {
    throw new Error("DEEP_LINK_ROUTE_NOT_ALLOWED");
  }
  for (const key of parsed.searchParams.keys()) {
    if (/^(hotel|hotelId|tenant|tenantId)$/i.test(key))
      throw new Error("DEEP_LINK_TENANT_OVERRIDE_PROHIBITED");
  }
  return { route, segments: segments.map((segment) => decodeURIComponent(segment)) };
}
