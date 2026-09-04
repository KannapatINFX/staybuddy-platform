import { z } from "zod";
import {
  ApiErrorSchema,
  AppBuildSchema,
  BootstrapManifestSchema,
  CanonicalReservationSchema,
  ClaimCompleteCommandSchema,
  ClaimScanRequestSchema,
  ClaimSessionSchema,
  ConfigureHotelAppBuildSchema,
  ConsentCommandSchema,
  CreateAppBuildSchema,
  EmailOtpStartSchema,
  EmailOtpVerifySchema,
  HotelConfigurationSchema,
  CreateHotelInputSchema,
  PublishHotelConfigSchema,
  IdentifierSchema,
  ImportMappingSchema,
  ImportPreviewSchema,
  OAuthIdentityAssertionSchema,
  PushPermissionCommandSchema,
  SignedBootstrapManifestSchema,
  UpdateAppBuildStatusSchema,
  UtcDateTimeSchema,
} from "./index.js";

const OtpChallengeSchema = z.object({ challengeId: IdentifierSchema, expiresAt: UtcDateTimeSchema });
const GuestSessionSchema = z.object({
  accountId: IdentifierSchema,
  hotelId: IdentifierSchema,
  sessionId: IdentifierSchema,
  accessToken: z.string().min(20),
  expiresAt: UtcDateTimeSchema,
});
const ConsentReceiptSchema = ConsentCommandSchema.extend({ consentEventId: IdentifierSchema });
const InvitationCompleteCommandSchema = z.object({
  invitationSessionId: IdentifierSchema,
  acceptedTermsVersion: z.string().min(1),
});
const StayActivationSchema = z.object({
  stayId: IdentifierSchema,
  lifecycle: z.enum(["IN_HOUSE", "PRE_ARRIVAL_ACTIVATED"]),
  sensitiveRoomDataUnlocked: z.boolean().optional(),
});
const IssueAccessSchema = z.object({
  roomNumber: z.string().max(40).optional(),
  ttlMinutes: z.number().int().min(5).max(120).default(30),
});
const IssuedAccessSchema = z.object({ opaqueToken: z.string().min(32), expiresAt: UtcDateTimeSchema });
const ReservationPreviewInputSchema = z.object({
  csv: z.string().min(1),
  mapping: ImportMappingSchema.optional(),
  mappingProfileId: IdentifierSchema.optional(),
});
const ReservationCommitInputSchema = z.object({
  previewId: IdentifierSchema,
  mappingName: z.string().min(1).max(120).optional(),
  saveMapping: z.boolean().default(false),
});
const ServerImportPreviewSchema = ImportPreviewSchema.omit({ batchId: true }).extend({
  previewId: IdentifierSchema,
  expiresAt: UtcDateTimeSchema,
});
const ReservationCommitResultSchema = z.object({
  batchId: IdentifierSchema,
  status: z.enum(["COMPLETED", "PARTIALLY_REJECTED"]),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  conflicted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
});
const ReservationImportSummarySchema = z.object({
  id: IdentifierSchema,
  sourceSystem: z.string(),
  status: z.string(),
  totalRows: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  conflicted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  retryOfBatchId: IdentifierSchema.nullable(),
  createdAt: UtcDateTimeSchema,
  completedAt: UtcDateTimeSchema.nullable(),
});
const ImportRejectionSchema = z.object({
  rowNumber: z.number().int().positive(),
  code: z.string(),
  detail: z.string(),
  createdAt: UtcDateTimeSchema,
});
const ReservationImportDetailSchema = ReservationImportSummarySchema.extend({
  rejections: z.array(ImportRejectionSchema),
});
const MappingProfileSchema = z.object({
  id: IdentifierSchema,
  name: z.string(),
  sourceSystem: z.string(),
  version: z.number().int().positive(),
  mapping: ImportMappingSchema,
  createdAt: UtcDateTimeSchema,
});
const SaveMappingSchema = z.object({ name: z.string().min(1).max(120), mapping: ImportMappingSchema });
const SavedMappingReceiptSchema = z.object({ id: IdentifierSchema });
const IntegrationHealthSchema = z.object({
  hotelId: IdentifierSchema,
  hotelName: z.string(),
  status: z.enum(["HEALTHY", "STALE", "PARTIAL", "FAILED", "FALLBACK_ONLY"]),
  lastStatus: z.string().nullable(),
  lastAttemptAt: UtcDateTimeSchema.nullable(),
  lastRejected: z.number().int().nonnegative().nullable(),
});
const CreatedHotelBodySchema = z.object({
  hotelId: IdentifierSchema,
  appId: IdentifierSchema,
  appInstallationKey: z.string().min(16),
  status: z.literal("ONBOARDING"),
  nextStep: z.string(),
  configVersion: z.number().int().positive(),
});
const CreatedHotelSchema = z.object({
  status: z.literal(201),
  body: CreatedHotelBodySchema,
  replayed: z.boolean(),
});
const HotelDetailSchema = z.object({
  hotel: HotelConfigurationSchema,
  app: z.object({
    id: IdentifierSchema,
    appName: z.string(),
    scheme: z.string(),
    iosBundleIdentifier: z.string(),
    androidPackage: z.string(),
    status: z.string(),
    configVersion: z.number().int().positive(),
  }),
  location: z.object({ name: z.string(), province: z.string().nullable(), district: z.string().nullable() }),
  primaryContact: z.object({ name: z.string(), email: z.string().email(), phone: z.string().nullable() }),
  salesReference: z.string().nullable(),
  onboarding: z.array(z.object({ step: z.string(), status: z.string() })),
});
const PublishedConfigBodySchema = z.object({
  hotelId: IdentifierSchema,
  configVersion: z.number().int().positive(),
  publishedAt: UtcDateTimeSchema,
});
const PublishedConfigSchema = z.object({
  status: z.literal(200),
  body: PublishedConfigBodySchema,
  replayed: z.boolean(),
});
const HotelSummarySchema = z.object({
  id: IdentifierSchema,
  slug: z.string(),
  displayName: z.string(),
  status: z.string(),
  roomCount: z.number().int().positive(),
  appStatus: z.string().nullable(),
  appUpdatedAt: UtcDateTimeSchema.nullable(),
});
const ReservationSummarySchema = z.object({
  id: IdentifierSchema,
  externalReservationId: z.string(),
  status: z.string(),
  bookingSource: z.string(),
  confirmationCode: z.string(),
  primaryGuestName: z.string(),
  nationality: z.string().nullable(),
  preferredLocale: z.string().nullable(),
  checkInAt: UtcDateTimeSchema,
  checkOutAt: UtcDateTimeSchema,
  stayId: IdentifierSchema,
  lifecycle: z.string(),
  roomType: z.string().nullable(),
  roomNumber: z.string().nullable(),
});
const ReservationDetailSchema = ReservationSummarySchema.extend({
  sourceSystem: z.string(),
  sourceVersion: z.string(),
  sourceUpdatedAt: UtcDateTimeSchema,
  importBatchId: IdentifierSchema.nullable(),
  createdAt: UtcDateTimeSchema,
  updatedAt: UtcDateTimeSchema,
  rooms: z.array(z.record(z.string(), z.unknown())),
});
const AppBuildMutationReceiptSchema = z.object({
  status: z.number().int(),
  body: z.record(z.string(), z.unknown()),
  replayed: z.boolean(),
});
const AppFactorySummarySchema = z.object({
  hotelId: IdentifierSchema,
  hotelName: z.string(),
  hotelAppId: IdentifierSchema,
  appName: z.string(),
  iosBundleIdentifier: z.string(),
  androidPackage: z.string(),
  scheme: z.string(),
  buildConfigStatus: z.string(),
  assetStatus: z.string(),
  buildConfigVersion: z.number().int().positive(),
  latestBuildStatus: z.string().nullable(),
  latestBuildUpdatedAt: UtcDateTimeSchema.nullable(),
});
const AppBuildEventSchema = z.object({
  id: IdentifierSchema,
  priorStatus: z.string().nullable(),
  status: z.string(),
  providerReference: z.string().nullable(),
  artifactReference: z.string().nullable(),
  failureCode: z.string().nullable(),
  validationSummary: z.record(z.string(), z.unknown()),
  actorId: z.string(),
  occurredAt: UtcDateTimeSchema,
});
const AppBuildDetailSchema = z.object({ build: AppBuildSchema, events: z.array(AppBuildEventSchema) });

const schemas = {
  ApiError: ApiErrorSchema,
  BootstrapManifest: BootstrapManifestSchema,
  SignedBootstrapManifest: SignedBootstrapManifestSchema,
  HotelConfiguration: HotelConfigurationSchema,
  CreateHotelInput: CreateHotelInputSchema,
  PublishHotelConfig: PublishHotelConfigSchema,
  CreatedHotel: CreatedHotelSchema,
  HotelDetail: HotelDetailSchema,
  PublishedConfig: PublishedConfigSchema,
  HotelSummary: HotelSummarySchema,
  ConfigureHotelAppBuild: ConfigureHotelAppBuildSchema,
  CreateAppBuild: CreateAppBuildSchema,
  UpdateAppBuildStatus: UpdateAppBuildStatusSchema,
  AppFactorySummary: AppFactorySummarySchema,
  AppBuild: AppBuildSchema,
  AppBuildDetail: AppBuildDetailSchema,
  AppBuildMutationReceipt: AppBuildMutationReceiptSchema,
  CanonicalReservation: CanonicalReservationSchema,
  ReservationPreviewInput: ReservationPreviewInputSchema,
  ServerImportPreview: ServerImportPreviewSchema,
  ReservationCommitInput: ReservationCommitInputSchema,
  ReservationCommitResult: ReservationCommitResultSchema,
  ReservationSummary: ReservationSummarySchema,
  ReservationDetail: ReservationDetailSchema,
  ReservationImportSummary: ReservationImportSummarySchema,
  ReservationImportDetail: ReservationImportDetailSchema,
  MappingProfile: MappingProfileSchema,
  SaveMapping: SaveMappingSchema,
  SavedMappingReceipt: SavedMappingReceiptSchema,
  IntegrationHealth: IntegrationHealthSchema,
  ImportMapping: ImportMappingSchema,
  ImportPreview: ImportPreviewSchema,
  IssueAccess: IssueAccessSchema,
  IssuedAccess: IssuedAccessSchema,
  ClaimScanRequest: ClaimScanRequestSchema,
  ClaimSession: ClaimSessionSchema,
  InvitationCompleteCommand: InvitationCompleteCommandSchema,
  EmailOtpStart: EmailOtpStartSchema,
  EmailOtpVerify: EmailOtpVerifySchema,
  OtpChallenge: OtpChallengeSchema,
  OAuthIdentityAssertion: OAuthIdentityAssertionSchema,
  GuestSession: GuestSessionSchema,
  ConsentCommand: ConsentCommandSchema,
  ConsentReceipt: ConsentReceiptSchema,
  ClaimCompleteCommand: ClaimCompleteCommandSchema,
  StayActivation: StayActivationSchema,
  PushPermissionCommand: PushPermissionCommandSchema,
};

export function createOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: { title: "StayBuddy API", version: "0.1.0" },
    servers: [{ url: "/v1" }],
    paths: {
      "/health": { get: { operationId: "getHealth", responses: { "200": { description: "Healthy" } } } },
      "/mobile/bootstrap": {
        get: {
          operationId: "getMobileBootstrap",
          parameters: [header("X-App-Installation-Key", true), header("X-App-Version", false)],
          responses: { "200": response("SignedBootstrapManifest"), "404": response("ApiError") },
        },
      },
      "/ops/hotels": {
        get: securedGet("listHotels", "HotelSummary", true),
        ...post("createHotel", "CreateHotelInput", "CreatedHotel", {
          secured: true,
          idempotent: true,
          status: "201",
        }),
      },
      "/ops/hotels/{hotelId}": {
        get: securedGetWithPath("getHotel", "HotelDetail", "hotelId"),
      },
      "/ops/hotels/{hotelId}/config": patch(
        "publishHotelConfig",
        "PublishHotelConfig",
        "PublishedConfig",
        "hotelId",
      ),
      "/ops/app-factory": { get: securedGet("listAppFactory", "AppFactorySummary", true) },
      "/ops/hotel-apps/{hotelAppId}/build-config": patch(
        "configureHotelAppBuild",
        "ConfigureHotelAppBuild",
        "AppBuildMutationReceipt",
        "hotelAppId",
      ),
      "/ops/app-builds": {
        get: securedGet("listAppBuilds", "AppBuild", true),
        ...post("createAppBuild", "CreateAppBuild", "AppBuildMutationReceipt", {
          secured: true,
          idempotent: true,
          status: "201",
        }),
      },
      "/ops/app-builds/{buildJobId}": {
        get: securedGetWithPath("getAppBuild", "AppBuildDetail", "buildJobId"),
      },
      "/ops/app-builds/{buildJobId}/status": patch(
        "updateAppBuildStatus",
        "UpdateAppBuildStatus",
        "AppBuildMutationReceipt",
        "buildJobId",
      ),
      "/admin/reservation-imports/preview": post(
        "previewReservationImport",
        "ReservationPreviewInput",
        "ServerImportPreview",
        { secured: true },
      ),
      "/admin/reservation-imports/commit": post(
        "commitReservationImport",
        "ReservationCommitInput",
        "ReservationCommitResult",
        { secured: true, idempotent: true, status: "201" },
      ),
      "/admin/reservation-imports": {
        get: securedGet("listReservationImports", "ReservationImportSummary", true),
      },
      "/admin/reservation-imports/health": {
        get: securedGet("getReservationImportHealth", "IntegrationHealth"),
      },
      "/admin/reservation-imports/{batchId}": {
        get: securedGetWithPath("getReservationImport", "ReservationImportDetail", "batchId"),
      },
      "/admin/reservation-imports/{batchId}/retry": post(
        "retryReservationImport",
        undefined,
        "ReservationCommitResult",
        { secured: true, idempotent: true, pathIdentifier: "batchId", status: "201" },
      ),
      "/admin/reservation-mappings": {
        get: securedGet("listReservationMappings", "MappingProfile", true),
        ...post("saveReservationMapping", "SaveMapping", "SavedMappingReceipt", {
          secured: true,
          status: "201",
        }),
      },
      "/admin/reservations/manual": post(
        "createManualReservation",
        "CanonicalReservation",
        "ReservationCommitResult",
        { secured: true, idempotent: true, status: "201" },
      ),
      "/admin/reservations": { get: securedGet("listReservations", "ReservationSummary", true) },
      "/admin/reservations/{reservationId}": {
        get: securedGetWithPath("getReservation", "ReservationDetail", "reservationId"),
      },
      "/ops/integrations/health": { get: securedGet("listIntegrationHealth", "IntegrationHealth", true) },
      "/admin/stays/{stayId}/claims": post("issueStayClaim", "IssueAccess", "IssuedAccess", {
        secured: true,
        pathIdentifier: "stayId",
        status: "201",
      }),
      "/admin/stays/{stayId}/prearrival-invitations": post(
        "issuePrearrivalInvitation",
        undefined,
        "IssuedAccess",
        { secured: true, pathIdentifier: "stayId", status: "201" },
      ),
      "/stay-claims/scan": mobilePost("scanStayClaim", "ClaimScanRequest", "ClaimSession"),
      "/prearrival-invitations/scan": mobilePost(
        "scanPrearrivalInvitation",
        "ClaimScanRequest",
        "ClaimSession",
      ),
      "/auth/email/start": mobilePost("startEmailOtp", "EmailOtpStart", "OtpChallenge"),
      "/auth/email/verify": mobilePost("verifyEmailOtp", "EmailOtpVerify", "GuestSession"),
      "/auth/oauth": mobilePost("verifyOAuth", "OAuthIdentityAssertion", "GuestSession"),
      "/consents": mobilePost("recordConsent", "ConsentCommand", "ConsentReceipt", true),
      "/stay-claims/complete": mobilePost(
        "completeStayClaim",
        "ClaimCompleteCommand",
        "StayActivation",
        true,
      ),
      "/prearrival-invitations/complete": mobilePost(
        "completePrearrivalInvitation",
        "InvitationCompleteCommand",
        "StayActivation",
        true,
      ),
      "/me/devices/push-permission": mobilePost(
        "updatePushPermission",
        "PushPermissionCommand",
        "PushPermissionCommand",
        true,
      ),
    },
    components: {
      schemas: Object.fromEntries(
        Object.entries(schemas).map(([name, schema]) => [
          name,
          z.toJSONSchema(schema, { target: "draft-2020-12" }),
        ]),
      ),
      parameters: {
        IdempotencyKey: {
          name: "Idempotency-Key",
          in: "header",
          required: true,
          schema: { type: "string", minLength: 8, maxLength: 200 },
        },
      },
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    },
  };
}

function response(schemaName: string, array = false) {
  const schema = array
    ? { type: "array", items: { $ref: `#/components/schemas/${schemaName}` } }
    : { $ref: `#/components/schemas/${schemaName}` };
  return { description: schemaName, content: { "application/json": { schema } } };
}

function header(name: string, required: boolean) {
  return { name, in: "header", required, schema: { type: "string" } };
}

function securedGet(operationId: string, responseSchema: string, array = false) {
  return {
    operationId,
    security: [{ bearerAuth: [] }],
    responses: { "200": response(responseSchema, array), "401": response("ApiError") },
  };
}

function securedGetWithPath(operationId: string, responseSchema: string, pathIdentifier: string) {
  return {
    operationId,
    parameters: [{ name: pathIdentifier, in: "path", required: true, schema: { type: "string" } }],
    security: [{ bearerAuth: [] }],
    responses: { "200": response(responseSchema), "401": response("ApiError"), "404": response("ApiError") },
  };
}

function patch(operationId: string, requestSchema: string, responseSchema: string, pathIdentifier: string) {
  return {
    patch: {
      operationId,
      parameters: [
        { name: pathIdentifier, in: "path", required: true, schema: { type: "string" } },
        { $ref: "#/components/parameters/IdempotencyKey" },
      ],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: `#/components/schemas/${requestSchema}` } } },
      },
      responses: {
        "200": response(responseSchema),
        "400": response("ApiError"),
        "401": response("ApiError"),
        "404": response("ApiError"),
        "409": response("ApiError"),
      },
    },
  };
}

function post(
  operationId: string,
  requestSchema: string | undefined,
  responseSchema: string,
  options: { idempotent?: boolean; pathIdentifier?: string; secured?: boolean; status?: string } = {},
) {
  const parameters: object[] = [];
  if (options.pathIdentifier) {
    parameters.push({
      name: options.pathIdentifier,
      in: "path",
      required: true,
      schema: { type: "string" },
    });
  }
  if (options.idempotent) parameters.push({ $ref: "#/components/parameters/IdempotencyKey" });
  return {
    post: {
      operationId,
      ...(parameters.length ? { parameters } : {}),
      ...(options.secured ? { security: [{ bearerAuth: [] }] } : {}),
      ...(requestSchema
        ? {
            requestBody: {
              required: true,
              content: {
                "application/json": { schema: { $ref: `#/components/schemas/${requestSchema}` } },
              },
            },
          }
        : {}),
      responses: {
        [options.status ?? "200"]: response(responseSchema),
        "400": response("ApiError"),
        "401": response("ApiError"),
        "409": response("ApiError"),
      },
    },
  };
}

function mobilePost(operationId: string, requestSchema: string, responseSchema: string, secured = false) {
  const operation = post(operationId, requestSchema, responseSchema, { secured });
  return { post: { ...operation.post, parameters: [header("X-App-Installation-Key", true)] } };
}
