import { z } from "zod";

const AppFactoryIdentifierSchema = z.string().min(8).max(80);
const AppFactoryLocaleSchema = z.enum(["en", "th", "zh-CN", "ru"]);
const AppFactoryUtcDateTimeSchema = z.string().datetime({ offset: true });
const AppFactoryThemeSchema = z
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

export const AppBuildPlatformSchema = z.enum(["IOS", "ANDROID"]);
export const AppBuildProfileSchema = z.enum(["DEVELOPMENT", "PREVIEW", "PRODUCTION"]);
export const AppBuildStatusSchema = z.enum([
  "QUEUED",
  "VALIDATING",
  "BUILDING",
  "BUILT",
  "FAILED",
  "CANCELLED",
]);

export const AppAssetSchema = z
  .object({
    path: z.string().min(1).max(300),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

export const AppAssetManifestSchema = z
  .object({
    status: z.enum(["SYNTHETIC", "APPROVED"]),
    icon: AppAssetSchema,
    adaptiveIcon: AppAssetSchema,
    splash: AppAssetSchema,
  })
  .strict();

export const AppDeepLinkContractSchema = z
  .object({
    scheme: z.string().regex(/^[a-z][a-z0-9-]*$/),
    universalLinkOrigin: z
      .string()
      .url()
      .refine((value) => new URL(value).protocol === "https:"),
    installLandingUrl: z
      .string()
      .url()
      .refine((value) => new URL(value).protocol === "https:"),
    allowedRoutes: z
      .array(z.enum(["welcome", "claim", "concierge", "services", "stay", "requests", "orders", "inbox"]))
      .min(1),
  })
  .strict();

export const StoreListingLocaleSchema = z
  .object({
    locale: AppFactoryLocaleSchema,
    title: z.string().min(2).max(30),
    subtitle: z.string().min(2).max(30),
    description: z.string().min(20).max(4_000),
    keywords: z.array(z.string().min(2).max(30)).min(1).max(20),
  })
  .strict();

export const StoreListingSchema = z
  .object({
    privacyUrl: z.string().url(),
    supportUrl: z.string().url(),
    locales: z.array(StoreListingLocaleSchema).length(4),
  })
  .strict();

export const TenantAppBuildConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    hotelId: AppFactoryIdentifierSchema,
    appId: AppFactoryIdentifierSchema,
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    appName: z.string().min(1).max(80),
    displayName: z.string().min(1).max(120),
    appInstallationKey: z.string().min(16).max(160),
    iosBundleIdentifier: z.string().regex(/^com\.[a-z0-9.]+$/),
    androidPackage: z.string().regex(/^com\.[a-z0-9.]+$/),
    defaultLocale: AppFactoryLocaleSchema,
    supportedLocales: z.array(AppFactoryLocaleSchema).length(4),
    bootstrapPublicKeyHex: z.string().regex(/^[0-9a-f]{64}$/),
    theme: AppFactoryThemeSchema,
    deepLinks: AppDeepLinkContractSchema,
    assets: AppAssetManifestSchema,
    storeListingPath: z.string().min(1).max(300),
  })
  .strict();
export type TenantAppBuildConfig = z.infer<typeof TenantAppBuildConfigSchema>;

export const ConfigureHotelAppBuildSchema = z
  .object({
    deepLinks: AppDeepLinkContractSchema,
    assets: AppAssetManifestSchema,
    storeListing: StoreListingSchema,
  })
  .strict();
export type ConfigureHotelAppBuild = z.infer<typeof ConfigureHotelAppBuildSchema>;

export const CreateAppBuildSchema = z
  .object({
    hotelId: z.string().uuid(),
    hotelAppId: z.string().uuid(),
    platform: AppBuildPlatformSchema,
    profile: AppBuildProfileSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    commitSha: z.string().regex(/^[0-9a-f]{7,64}$/),
  })
  .strict();
export type CreateAppBuild = z.infer<typeof CreateAppBuildSchema>;

export const UpdateAppBuildStatusSchema = z
  .object({
    status: AppBuildStatusSchema.exclude(["QUEUED"]),
    providerReference: z.string().min(1).max(200).optional(),
    artifactReference: z.string().min(1).max(500).optional(),
    failureCode: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]+$/)
      .optional(),
    validationSummary: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "FAILED" && !value.failureCode) {
      context.addIssue({ code: "custom", path: ["failureCode"], message: "failure code is required" });
    }
    if (value.status === "BUILT" && !value.artifactReference) {
      context.addIssue({
        code: "custom",
        path: ["artifactReference"],
        message: "artifact reference is required",
      });
    }
  });
export type UpdateAppBuildStatus = z.infer<typeof UpdateAppBuildStatusSchema>;

export const AppBuildSchema = z
  .object({
    id: AppFactoryIdentifierSchema,
    hotelId: AppFactoryIdentifierSchema,
    hotelAppId: AppFactoryIdentifierSchema,
    hotelName: z.string().min(1),
    appName: z.string().min(1),
    platform: AppBuildPlatformSchema,
    profile: AppBuildProfileSchema,
    status: AppBuildStatusSchema,
    version: z.string(),
    commitSha: z.string(),
    sourceConfigVersion: z.number().int().positive(),
    providerReference: z.string().nullable(),
    artifactReference: z.string().nullable(),
    failureCode: z.string().nullable(),
    validationSummary: z.record(z.string(), z.unknown()),
    requestedBy: z.string(),
    createdAt: AppFactoryUtcDateTimeSchema,
    updatedAt: AppFactoryUtcDateTimeSchema,
  })
  .strict();
export type AppBuild = z.infer<typeof AppBuildSchema>;
