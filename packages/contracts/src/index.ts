import { z } from "zod";

export const IdentifierSchema = z.string().min(8).max(80);
export const UtcDateTimeSchema = z.string().datetime({ offset: true });
export const LocaleSchema = z.enum(["en", "th", "zh-CN", "ru"]);
export type Locale = z.infer<typeof LocaleSchema>;

export const GuestLifecycleSchema = z.enum([
  "RESERVATION_IMPORTED",
  "UPCOMING",
  "PRE_ARRIVAL_ACTIVATED",
  "IN_HOUSE",
  "DEPARTING",
  "PAST_GUEST",
  "REPEAT_DIRECT_BOOKING",
]);
export type GuestLifecycle = z.infer<typeof GuestLifecycleSchema>;

export const ActorSchema = z
  .object({
    type: z.enum(["GUEST", "HOTEL_STAFF", "STAYBUDDY_STAFF", "SYSTEM"]),
    id: IdentifierSchema.optional(),
    role: z.string().max(80).optional(),
  })
  .strict();

export const DomainEventSchema = z
  .object({
    eventId: IdentifierSchema,
    eventType: z.string().regex(/^[a-z][a-z0-9_.]+$/),
    schemaVersion: z.number().int().positive(),
    hotelId: IdentifierSchema.optional(),
    occurredAt: UtcDateTimeSchema,
    traceId: IdentifierSchema,
    correlationId: IdentifierSchema,
    causationId: IdentifierSchema.optional(),
    idempotencyKey: z.string().min(8).max(200).optional(),
    actor: ActorSchema,
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();
export type DomainEvent = z.infer<typeof DomainEventSchema>;

export const BrandThemeSchema = z
  .object({
    primary: z.string().regex(/^#[0-9A-F]{6}$/i),
    accent: z.string().regex(/^#[0-9A-F]{6}$/i),
    canvas: z.string().regex(/^#[0-9A-F]{6}$/i),
    surfaceWarm: z.string().regex(/^#[0-9A-F]{6}$/i),
    ink: z.string().regex(/^#[0-9A-F]{6}$/i),
    divider: z.string().regex(/^#[0-9A-F]{6}$/i),
    logoUrl: z.string().url(),
    heroImageUrl: z.string().url().optional(),
  })
  .strict();

export const DepartmentConfigurationSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
    name: z.string().min(1).max(100),
    defaultSlaMinutes: z.number().int().positive().max(1440),
  })
  .strict();

export const ServiceCategoryConfigurationSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
    name: z.string().min(1).max(100),
    departmentCode: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
  })
  .strict();

export const PublicHotelConfigSchema = z
  .object({
    appName: z.string().min(1).max(80),
    hotelDisplayName: z.string().min(1).max(120),
    theme: BrandThemeSchema,
    supportedLocales: z.array(LocaleSchema).length(4),
    defaultLocale: LocaleSchema,
    voiceProfile: z.enum(["FIVE_STAR_RESORT", "FIVE_STAR_BOUTIQUE"]),
    features: z.record(z.string().regex(/^[a-z][A-Za-z0-9]*$/), z.boolean()),
    minimumVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    maintenance: z.object({ active: z.boolean(), messageKey: z.string().min(1).optional() }).strict(),
  })
  .strict();

export const CreateHotelInputSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    legalName: z.string().min(1).max(200),
    displayName: z.string().min(1).max(120),
    roomCount: z.coerce.number().int().positive(),
    timezone: z.string().min(3).max(80),
    countryCode: z.string().length(2).default("TH"),
    location: z
      .object({
        name: z.string().min(1).max(120),
        province: z.string().min(1).max(120).optional(),
        district: z.string().min(1).max(120).optional(),
      })
      .strict(),
    primaryContact: z
      .object({
        name: z.string().min(1).max(160),
        email: z.string().email(),
        phone: z.string().min(7).max(40).optional(),
      })
      .strict(),
    salesReference: z.string().min(1).max(120).optional(),
    app: z
      .object({
        appName: z.string().min(1).max(80),
        scheme: z.string().regex(/^[a-z][a-z0-9-]*$/),
        iosBundleIdentifier: z.string().regex(/^com\.[a-z0-9.]+$/),
        androidPackage: z.string().regex(/^com\.[a-z0-9.]+$/),
        minimumVersion: z
          .string()
          .regex(/^\d+\.\d+\.\d+$/)
          .default("1.0.0"),
      })
      .strict(),
    brand: z
      .object({
        theme: BrandThemeSchema,
        supportedLocales: z.array(LocaleSchema).length(4),
        defaultLocale: LocaleSchema,
        voiceProfile: z.enum(["FIVE_STAR_RESORT", "FIVE_STAR_BOUTIQUE"]),
      })
      .strict(),
    departments: z.array(DepartmentConfigurationSchema).min(1).max(30),
    serviceCategories: z.array(ServiceCategoryConfigurationSchema).min(1).max(50),
    features: z.record(z.string().regex(/^[a-z][A-Za-z0-9]*$/), z.boolean()),
    commercial: z
      .object({
        discountMinor: z.number().int().nonnegative().default(0),
        waiverReason: z.string().min(1).max(500).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => validateOperationalCatalog(value, context));
export type CreateHotelInput = z.infer<typeof CreateHotelInputSchema>;

export const PublishHotelConfigSchema = PublicHotelConfigSchema.extend({
  departments: z.array(DepartmentConfigurationSchema).min(1).max(30),
  serviceCategories: z.array(ServiceCategoryConfigurationSchema).min(1).max(50),
})
  .strict()
  .superRefine((value, context) => validateOperationalCatalog(value, context));
export type PublishHotelConfig = z.infer<typeof PublishHotelConfigSchema>;

function validateOperationalCatalog(
  value: {
    departments: Array<{ code: string }>;
    serviceCategories: Array<{ code: string; departmentCode: string }>;
  },
  context: z.RefinementCtx,
) {
  const departmentCodes = new Set(value.departments.map((department) => department.code));
  if (departmentCodes.size !== value.departments.length) {
    context.addIssue({ code: "custom", path: ["departments"], message: "department codes must be unique" });
  }
  const categoryCodes = new Set(value.serviceCategories.map((category) => category.code));
  if (categoryCodes.size !== value.serviceCategories.length) {
    context.addIssue({
      code: "custom",
      path: ["serviceCategories"],
      message: "service category codes must be unique",
    });
  }
  value.serviceCategories.forEach((category, index) => {
    if (!departmentCodes.has(category.departmentCode)) {
      context.addIssue({
        code: "custom",
        path: ["serviceCategories", index, "departmentCode"],
        message: "service category department must exist in this configuration",
      });
    }
  });
}

export const HotelCommercialSchema = z
  .object({
    roomCount: z.number().int().positive(),
    listPricePerRoomThb: z.literal(150),
    minimumBillableRooms: z.literal(50),
    discountMinor: z.number().int().nonnegative().default(0),
    waiverReason: z.string().max(500).optional(),
    commerceCommissionBasisPoints: z.literal(500),
    aiMarkupBasisPoints: z.literal(1250),
  })
  .strict();

export const HotelConfigurationSchema = z
  .object({
    id: IdentifierSchema,
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    legalName: z.string().min(1).max(200),
    displayName: z.string().min(1).max(120),
    status: z.enum(["DRAFT", "ONBOARDING", "PILOT", "LIVE", "SUSPENDED"]),
    timezone: z.string().min(3).max(80),
    countryCode: z.string().length(2),
    supportedLocales: z.array(LocaleSchema).length(4),
    defaultLocale: LocaleSchema,
    voiceProfile: z.enum(["FIVE_STAR_RESORT", "FIVE_STAR_BOUTIQUE"]),
    theme: BrandThemeSchema,
    commercial: HotelCommercialSchema,
    departments: z.array(
      z
        .object({
          id: IdentifierSchema,
          code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
          name: z.string().min(1).max(100),
          defaultSlaMinutes: z.number().int().positive(),
        })
        .strict(),
    ),
    serviceCategories: z.array(ServiceCategoryConfigurationSchema.extend({ id: IdentifierSchema }).strict()),
    features: z.record(z.string(), z.boolean()),
  })
  .strict();
export type HotelConfiguration = z.infer<typeof HotelConfigurationSchema>;

export const BootstrapManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    configVersion: z.number().int().positive(),
    hotelId: IdentifierSchema,
    appId: IdentifierSchema,
    appName: z.string().min(1).max(80),
    hotelDisplayName: z.string().min(1).max(120),
    theme: BrandThemeSchema,
    supportedLocales: z.array(LocaleSchema).length(4),
    defaultLocale: LocaleSchema,
    voiceProfile: z.enum(["FIVE_STAR_RESORT", "FIVE_STAR_BOUTIQUE"]),
    features: z.record(z.string(), z.boolean()),
    minimumVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    maintenance: z.object({ active: z.boolean(), messageKey: z.string().min(1).optional() }).strict(),
    versionPolicy: z.enum(["SUPPORTED", "UPDATE_REQUIRED"]),
    issuedAt: UtcDateTimeSchema,
    expiresAt: UtcDateTimeSchema,
  })
  .strict();
export type BootstrapManifest = z.infer<typeof BootstrapManifestSchema>;

export const SignedBootstrapManifestSchema = z
  .object({
    manifest: BootstrapManifestSchema,
    signature: z.string().regex(/^[0-9a-f]{128}$/),
    algorithm: z.literal("Ed25519"),
  })
  .strict();

export const ReservationStatusSchema = z.enum(["CONFIRMED", "MODIFIED", "CANCELLED", "NO_SHOW"]);
export const CanonicalReservationSchema = z
  .object({
    sourceSystem: z.string().min(1).max(80),
    externalReservationId: z.string().min(1).max(160),
    status: ReservationStatusSchema,
    bookingSource: z.string().min(1).max(80),
    confirmationCode: z.string().min(1).max(120),
    primaryGuest: z
      .object({
        name: z.string().min(1).max(200),
        email: z.string().email().optional(),
        phone: z.string().max(40).optional(),
        nationality: z.string().length(2).optional(),
        preferredLanguage: LocaleSchema.optional(),
      })
      .strict(),
    checkInAt: UtcDateTimeSchema,
    checkOutAt: UtcDateTimeSchema,
    timezone: z.string().min(3).max(80),
    rooms: z
      .array(
        z
          .object({
            externalRoomId: z.string().max(120).optional(),
            roomType: z.string().max(120).optional(),
            roomNumber: z.string().max(40).optional(),
            adults: z.number().int().nonnegative().optional(),
            children: z.number().int().nonnegative().optional(),
          })
          .strict(),
      )
      .min(1),
    rateSummary: z
      .object({ currency: z.string().length(3), totalMinor: z.number().int().nonnegative() })
      .strict()
      .optional(),
    specialRequests: z.array(z.string().max(500)).optional(),
    updatedAtSource: UtcDateTimeSchema,
  })
  .strict()
  .refine((value) => new Date(value.checkOutAt) > new Date(value.checkInAt), {
    message: "checkOutAt must be after checkInAt",
    path: ["checkOutAt"],
  });
export type CanonicalReservation = z.infer<typeof CanonicalReservationSchema>;

export const ImportMappingSchema = z
  .object({
    sourceSystem: z.string().min(1).max(80),
    columns: z.object({
      externalReservationId: z.string(),
      status: z.string(),
      bookingSource: z.string(),
      confirmationCode: z.string(),
      guestName: z.string(),
      guestEmail: z.string().optional(),
      nationality: z.string().optional(),
      preferredLanguage: z.string().optional(),
      checkInAt: z.string(),
      checkOutAt: z.string(),
      roomType: z.string().optional(),
      roomNumber: z.string().optional(),
      adults: z.string().optional(),
      children: z.string().optional(),
      updatedAtSource: z.string().optional(),
    }),
    defaults: z.object({ timezone: z.string().min(3).max(80), bookingSource: z.string().optional() }),
  })
  .strict();

export const ImportPreviewSchema = z
  .object({
    batchId: IdentifierSchema,
    totalRows: z.number().int().nonnegative(),
    validRows: z.number().int().nonnegative(),
    rejectedRows: z.array(
      z
        .object({ rowNumber: z.number().int().positive(), code: z.string(), detail: z.string().max(500) })
        .strict(),
    ),
    reservations: z.array(CanonicalReservationSchema),
  })
  .strict();

export const ClaimScanRequestSchema = z.object({ opaqueToken: z.string().min(32).max(512) }).strict();
export const MaskedStayPreviewSchema = z
  .object({
    hotelDisplayName: z.string(),
    checkInDate: z.string().date(),
    checkOutDate: z.string().date(),
    guestNameMasked: z.string(),
  })
  .strict();
export const ClaimSessionSchema = z
  .object({
    claimSessionId: IdentifierSchema,
    expiresAt: UtcDateTimeSchema,
    preview: MaskedStayPreviewSchema,
  })
  .strict();

export const EmailOtpStartSchema = z
  .object({ email: z.string().email(), installationId: IdentifierSchema })
  .strict();
export const EmailOtpVerifySchema = z
  .object({
    challengeId: IdentifierSchema,
    code: z.string().regex(/^\d{6}$/),
    installationId: IdentifierSchema,
  })
  .strict();
export const OAuthProviderSchema = z.enum(["apple", "google"]);
export const OAuthIdentityAssertionSchema = z
  .object({ provider: OAuthProviderSchema, idToken: z.string().min(20), installationId: IdentifierSchema })
  .strict();

export const ConsentPurposeSchema = z.enum(["TERMS", "PRIVACY", "MARKETING", "PARTNER_OFFERS"]);
export const ConsentChannelSchema = z.enum(["SERVICE", "EMAIL", "PUSH", "IN_APP"]);
export const ConsentCommandSchema = z
  .object({
    purpose: ConsentPurposeSchema,
    channel: ConsentChannelSchema,
    granted: z.boolean(),
    definitionVersion: z.string().min(1).max(40),
    locale: LocaleSchema,
    source: z.enum(["ONBOARDING", "SETTINGS", "POLICY_UPDATE"]),
  })
  .strict();

export const ClaimCompleteCommandSchema = z
  .object({
    claimSessionId: IdentifierSchema,
    accountId: IdentifierSchema,
    acceptedTermsVersion: z.string().min(1),
  })
  .strict();

export const PushPermissionCommandSchema = z
  .object({
    installationId: IdentifierSchema,
    status: z.enum(["GRANTED", "DECLINED", "UNDETERMINED", "REVOKED"]),
  })
  .strict();

export const ApiErrorSchema = z
  .object({
    code: z.enum([
      "INVALID_REQUEST",
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "TENANT_NOT_RESOLVED",
      "NOT_FOUND",
      "CONFLICT",
      "IDEMPOTENCY_KEY_REUSED",
      "IDEMPOTENCY_IN_PROGRESS",
      "RATE_LIMITED",
      "CLAIM_EXPIRED",
      "CLAIM_REPLAYED",
      "CLAIM_REVOKED",
      "OTP_INVALID",
      "OTP_EXPIRED",
      "TERMS_REQUIRED",
      "INTERNAL_ERROR",
    ]),
    traceId: IdentifierSchema,
    retryable: z.boolean(),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  })
  .strict();

export type ApiError = z.infer<typeof ApiErrorSchema>;

export {
  canonicalJson,
  deriveBootstrapPublicKey,
  signBootstrapManifest,
  verifyBootstrapManifest,
} from "./bootstrap-signing.js";
