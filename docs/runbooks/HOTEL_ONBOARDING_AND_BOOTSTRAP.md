# Hotel Onboarding and Bootstrap Operations

## Purpose and boundary

This runbook covers the Sprint 6 code path for creating a hotel tenant, publishing remote public configuration, and verifying mobile bootstrap. It does not authorize or configure AWS, Hostinger, DNS, production data, app-store publishing, or app signing.

## Prerequisites

- Apply migrations through the approved migrator identity; API runtime must remain `staybuddy_runtime`.
- Configure `PII_ENCRYPTION_KEY_BASE64`, `EMAIL_LOOKUP_HMAC_SECRET`, and `BOOTSTRAP_PRIVATE_KEY_HEX` in the API runtime through the approved secret mechanism.
- Use an active platform Staff identity with `STAYBUDDY_SUPER_ADMIN`. Debug headers are valid only in automated tests.
- Obtain approved app identifiers and brand asset URLs. Placeholder assets may be used only for synthetic/non-production tenants.

## Create a hotel

Use the Ops create-hotel screen or `POST /v1/ops/hotels` with the complete `CreateHotelInput` contract, bearer authorization, and a unique `Idempotency-Key`. The transaction creates:

- hotel and location;
- encrypted primary-contact profile and sales reference;
- app identity and one-way installation-key hash;
- brand/voice/four locales, departments, initial service categories, feature flags, and commercial baseline;
- immutable public configuration version 1;
- all onboarding progress rows;
- `hotel.created` audit and outbox evidence.

The raw app installation key is returned once in the creation receipt. Store it only in the approved app-factory input; the database cannot recover it. Repeating exactly the same command with the same idempotency key returns the original receipt. Changed input with the same key returns `IDEMPOTENCY_KEY_REUSED`.

For the synthetic CC Phuket fixture against a local/authorized API:

```bash
STAYBUDDY_API_URL=http://localhost:4000 \
STAYBUDDY_OPS_ACCESS_TOKEN='<staff-token>' \
pnpm tenant:onboard:synthetic cc-phuket-residence
```

The fixture contains synthetic contact details and placeholder assets. It is not production-ready hotel data.

## Review onboarding status

Use `GET /v1/ops/hotels/{hotelId}` or the onboarding overview. Confirm tenant, location, room count, app IDs, contact, commercial baseline, departments, initial service categories, and config version.

Sprint 6 may complete only `TENANT_CREATED`, `BRAND_APP_CONFIG`, `DEPARTMENTS_STAFF`, and `SERVICE_CATALOG`. Reservation mapping, knowledge, automations, billing/wallet, build, QA/UAT, publish, pilot, and live stay pending until their owning sprint supplies evidence.

## Publish a configuration change

Call `PATCH /v1/ops/hotels/{hotelId}/config` with the complete public configuration plus department/service-category set, Staff bearer authorization, and a new idempotency key. Publication:

1. locks the app configuration row;
2. creates the next brand/config version and reconciles departments, service categories, and features;
3. updates the active app version pointer atomically;
4. records `hotel.config.updated` audit and outbox evidence.

Never edit or delete a published row. To restore older values, read the approved previous version and publish those values as a new, higher version.

## Verify mobile bootstrap

Request `GET /v1/mobile/bootstrap` with `X-App-Installation-Key` and `X-App-Version`. Verify:

- HTTP 200 and an Ed25519 signature that matches the compiled public key;
- signed `hotelId` and `appId` match the compiled tenant identity;
- `configVersion` is expected and monotonic;
- `versionPolicy` is `SUPPORTED`, or the app blocks normal entry on `UPDATE_REQUIRED`;
- maintenance state is honored;
- `Cache-Control`, `Vary`, and `ETag` are present; the matching `If-None-Match` returns 304;
- payload contains no installation key, contact, commercial, credential, private-key, or token field.

The mobile app may use an unexpired, previously signature-verified local cache if the API is temporarily unavailable. An invalid signature, mismatched hotel/app ID, or expired cache must produce the unavailable state, never a fallback to another tenant.

## Incident handling

- **Wrong hotel/app identity:** pause the affected app, retain response/trace evidence, inspect the app-key hash and current config pointer, and do not bypass mobile identity pinning.
- **Suspected config tampering:** retain the signed response and ETag, compare canonical payload/signature, pause publication, and rotate the server signing key only through an approved key-rotation procedure. Existing builds require a compatible public-key transition plan.
- **Contact exposure:** disable affected Ops access, preserve audit logs, rotate PII/HMAC material only with a re-encryption/reindex plan, and follow the privacy incident process.
- **Bad published values:** publish last known-good values as the next version. Published facts remain immutable.
- **Idempotency conflict:** retrieve the original command/receipt. Never retry changed input under the old key.

## Verification commands

```bash
pnpm onboarding:check
pnpm migrations:check
pnpm contracts:check
pnpm typecheck
pnpm test
DATABASE_URL='<fresh-postgres-url>' pnpm test:integration
pnpm build
pnpm secrets:check
```
