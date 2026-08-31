import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  ClaimCompleteCommandSchema,
  ClaimScanRequestSchema,
  ConsentCommandSchema,
  EmailOtpStartSchema,
  EmailOtpVerifySchema,
  OAuthIdentityAssertionSchema,
  PushPermissionCommandSchema,
  type Locale,
} from "@staybuddy/contracts";
import {
  appendAuditAndOutbox,
  type DatabaseClient,
  type DatabasePool,
  withTenantTransaction,
} from "@staybuddy/db";
import { z } from "zod";
import { DATABASE_POOL } from "./database.module.js";
import { EmailDeliveryService } from "./email-delivery.service.js";
import { AppError } from "./errors.js";
import { MobileContextService } from "./mobile-context.service.js";
import { OAuthService } from "./oauth.service.js";
import type { HotelPrincipal } from "./principal.service.js";
import { SecurityService } from "./security.service.js";

const IssueAccessSchema = z
  .object({
    roomNumber: z.string().max(40).optional(),
    ttlMinutes: z.number().int().min(5).max(120).default(30),
  })
  .strict();
const InvitationCompleteSchema = z
  .object({ invitationSessionId: z.string().min(8), acceptedTermsVersion: z.string().min(1) })
  .strict();

@Injectable()
export class IdentityService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: DatabasePool,
    private readonly mobileContext: MobileContextService,
    private readonly security: SecurityService,
    private readonly oauth: OAuthService,
    private readonly email: EmailDeliveryService,
  ) {}

  async issueStayClaim(stayId: string, input: unknown, principal: HotelPrincipal) {
    const values = IssueAccessSchema.parse(input);
    return this.tenant(principal.hotelId, principal.actorId, async (client) => {
      const stay = await client.query<{ id: string; lifecycle: string }>(
        "SELECT id, lifecycle FROM stays WHERE id=$1 AND hotel_id=$2 FOR UPDATE",
        [stayId, principal.hotelId],
      );
      if (!stay.rows[0] || !["UPCOMING", "PRE_ARRIVAL_ACTIVATED"].includes(stay.rows[0].lifecycle)) {
        throw new AppError("NOT_FOUND", 404);
      }
      if (values.roomNumber) {
        await client.query(
          `UPDATE reservation_rooms rr SET room_number=$3
           FROM stays s WHERE s.id=$1 AND s.hotel_id=$2 AND rr.reservation_id=s.reservation_id`,
          [stayId, principal.hotelId, values.roomNumber],
        );
      }
      await client.query(
        "UPDATE stay_claims SET revoked_at=now() WHERE hotel_id=$1 AND stay_id=$2 AND claimed_at IS NULL AND revoked_at IS NULL",
        [principal.hotelId, stayId],
      );
      const token = randomBytes(32).toString("base64url");
      const claimId = randomUUID();
      const expiresAt = new Date(Date.now() + values.ttlMinutes * 60_000);
      await client.query(
        `INSERT INTO stay_claims (id, hotel_id, stay_id, token_hash, expires_at, issued_by_staff_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [claimId, principal.hotelId, stayId, this.tokenHash(token), expiresAt, principal.actorId],
      );
      await appendAuditAndOutbox(client, {
        hotelId: principal.hotelId,
        actor: { type: "HOTEL_STAFF", id: principal.actorId, role: principal.role },
        action: "stay.claim_issued",
        resource: { type: "stay_claim", id: claimId },
        event: {
          type: "stay.claim_issued",
          aggregateType: "stay",
          aggregateId: stayId,
          payload: { expiresAt },
        },
        traceId: randomUUID(),
        correlationId: stayId,
      });
      return { claimId, opaqueToken: token, expiresAt: expiresAt.toISOString() };
    });
  }

  async issuePrearrivalInvitation(stayId: string, principal: HotelPrincipal) {
    return this.tenant(principal.hotelId, principal.actorId, async (client) => {
      const stay = await client.query(
        "SELECT id FROM stays WHERE id=$1 AND hotel_id=$2 AND lifecycle='UPCOMING'",
        [stayId, principal.hotelId],
      );
      if (!stay.rowCount) throw new AppError("NOT_FOUND", 404);
      await client.query(
        "UPDATE prearrival_invitations SET revoked_at=now() WHERE hotel_id=$1 AND stay_id=$2 AND claimed_at IS NULL AND revoked_at IS NULL",
        [principal.hotelId, stayId],
      );
      const token = randomBytes(32).toString("base64url");
      const invitationId = randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 86_400_000);
      await client.query(
        `INSERT INTO prearrival_invitations (id, hotel_id, stay_id, token_hash, expires_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [invitationId, principal.hotelId, stayId, this.tokenHash(token), expiresAt],
      );
      return { invitationId, opaqueToken: token, expiresAt: expiresAt.toISOString() };
    });
  }

  async scanStayClaim(appKey: string, input: unknown, installationId?: string) {
    const { opaqueToken } = ClaimScanRequestSchema.parse(input);
    const app = await this.mobileContext.resolve(appKey);
    return this.tenant(app.hotelId, installationId ?? "anonymous-device", async (client) => {
      const result = await client.query<{
        claim_id: string;
        expires_at: Date;
        claimed_at: Date | null;
        revoked_at: Date | null;
        stay_id: string;
        display_name: string;
        primary_guest_name: string;
        check_in_at: Date;
        check_out_at: Date;
      }>(
        `SELECT c.id AS claim_id, c.expires_at, c.claimed_at, c.revoked_at, c.stay_id,
                h.display_name, r.primary_guest_name, r.check_in_at, r.check_out_at
         FROM stay_claims c
         JOIN stays s ON s.id=c.stay_id AND s.hotel_id=c.hotel_id
         JOIN reservations r ON r.id=s.reservation_id AND r.hotel_id=c.hotel_id
         JOIN hotels h ON h.id=c.hotel_id
         WHERE c.hotel_id=$1 AND c.token_hash=$2 FOR UPDATE OF c`,
        [app.hotelId, this.tokenHash(opaqueToken)],
      );
      const row = result.rows[0];
      if (!row) throw new AppError("NOT_FOUND", 404);
      if (row.revoked_at) throw new AppError("CLAIM_REVOKED", 410);
      if (row.claimed_at) throw new AppError("CLAIM_REPLAYED", 409);
      if (row.expires_at.valueOf() <= Date.now()) throw new AppError("CLAIM_EXPIRED", 410);
      const claimSessionId = randomUUID();
      const expiresAt = new Date(Date.now() + 10 * 60_000);
      await client.query(
        `INSERT INTO stay_claim_sessions (id, hotel_id, stay_claim_id, expires_at, installation_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [claimSessionId, app.hotelId, row.claim_id, expiresAt, installationId],
      );
      return {
        claimSessionId,
        expiresAt: expiresAt.toISOString(),
        preview: {
          hotelDisplayName: row.display_name,
          checkInDate: row.check_in_at.toISOString().slice(0, 10),
          checkOutDate: row.check_out_at.toISOString().slice(0, 10),
          guestNameMasked: this.maskName(row.primary_guest_name),
        },
      };
    });
  }

  async scanPrearrivalInvitation(appKey: string, input: unknown, installationId?: string) {
    const { opaqueToken } = ClaimScanRequestSchema.parse(input);
    const app = await this.mobileContext.resolve(appKey);
    return this.tenant(app.hotelId, installationId ?? "anonymous-device", async (client) => {
      const result = await client.query<{
        invitation_id: string;
        expires_at: Date;
        claimed_at: Date | null;
        revoked_at: Date | null;
        display_name: string;
        primary_guest_name: string;
        check_in_at: Date;
        check_out_at: Date;
      }>(
        `SELECT i.id AS invitation_id, i.expires_at, i.claimed_at, i.revoked_at,
                h.display_name, r.primary_guest_name, r.check_in_at, r.check_out_at
         FROM prearrival_invitations i
         JOIN stays s ON s.id=i.stay_id AND s.hotel_id=i.hotel_id
         JOIN reservations r ON r.id=s.reservation_id AND r.hotel_id=i.hotel_id
         JOIN hotels h ON h.id=i.hotel_id
         WHERE i.hotel_id=$1 AND i.token_hash=$2 FOR UPDATE OF i`,
        [app.hotelId, this.tokenHash(opaqueToken)],
      );
      const row = result.rows[0];
      if (!row) throw new AppError("NOT_FOUND", 404);
      if (row.revoked_at) throw new AppError("CLAIM_REVOKED", 410);
      if (row.claimed_at) throw new AppError("CLAIM_REPLAYED", 409);
      if (row.expires_at.valueOf() <= Date.now()) throw new AppError("CLAIM_EXPIRED", 410);
      const invitationSessionId = randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 60_000);
      await client.query(
        `INSERT INTO prearrival_invitation_sessions
          (id, hotel_id, prearrival_invitation_id, expires_at, installation_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [invitationSessionId, app.hotelId, row.invitation_id, expiresAt, installationId],
      );
      return {
        invitationSessionId,
        expiresAt: expiresAt.toISOString(),
        preview: {
          hotelDisplayName: row.display_name,
          checkInDate: row.check_in_at.toISOString().slice(0, 10),
          checkOutDate: row.check_out_at.toISOString().slice(0, 10),
          guestNameMasked: this.maskName(row.primary_guest_name),
        },
      };
    });
  }

  async startEmailOtp(appKey: string, input: unknown) {
    const values = EmailOtpStartSchema.parse(input);
    const app = await this.mobileContext.resolve(appKey);
    const normalized = this.security.normalizeEmail(values.email);
    const emailHash = this.security.emailLookupHash(app.hotelId, normalized);
    const code = randomInt(100_000, 1_000_000).toString();
    const challengeId = randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    const hotel = await this.tenant(app.hotelId, values.installationId, async (client) => {
      const recent = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM email_otp_challenges
         WHERE hotel_id=$1 AND normalized_email_hash=$2 AND created_at > now()-interval '10 minutes'`,
        [app.hotelId, emailHash],
      );
      if (Number(recent.rows[0]?.count ?? 0) >= 5) throw new AppError("RATE_LIMITED", 429, true);
      await client.query(
        `INSERT INTO email_otp_challenges
          (id, hotel_id, normalized_email_hash, encrypted_email, code_hash, installation_id, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          challengeId,
          app.hotelId,
          emailHash,
          this.security.encryptPii(normalized),
          this.security.otpHash(challengeId, code).toString("hex"),
          values.installationId,
          expiresAt,
        ],
      );
      const result = await client.query<{ display_name: string }>(
        "SELECT display_name FROM hotels WHERE id=$1",
        [app.hotelId],
      );
      return result.rows[0]!.display_name;
    });
    await this.email.sendOtp({ email: normalized, code, hotelDisplayName: hotel });
    return {
      challengeId,
      expiresAt: expiresAt.toISOString(),
      ...(process.env.ALLOW_TEST_OTP === "true" ? { debugCode: code } : {}),
    };
  }

  async verifyEmailOtp(appKey: string, input: unknown) {
    const values = EmailOtpVerifySchema.parse(input);
    const app = await this.mobileContext.resolve(appKey);
    const result = await this.tenant(app.hotelId, values.installationId, async (client) => {
      const challenge = await client.query<{
        normalized_email_hash: string;
        encrypted_email: string;
        code_hash: string;
        expires_at: Date;
        attempts: number;
        max_attempts: number;
        consumed_at: Date | null;
      }>("SELECT * FROM email_otp_challenges WHERE id=$1 AND hotel_id=$2 FOR UPDATE", [
        values.challengeId,
        app.hotelId,
      ]);
      const row = challenge.rows[0];
      if (!row || row.consumed_at || row.expires_at.valueOf() <= Date.now())
        return { error: "OTP_EXPIRED" as const };
      if (row.attempts >= row.max_attempts) return { error: "RATE_LIMITED" as const };
      if (!this.security.otpMatches(values.challengeId, values.code, row.code_hash)) {
        await client.query("UPDATE email_otp_challenges SET attempts=attempts+1 WHERE id=$1", [
          values.challengeId,
        ]);
        return { error: "OTP_INVALID" as const };
      }
      await client.query("UPDATE email_otp_challenges SET consumed_at=now() WHERE id=$1", [
        values.challengeId,
      ]);
      const session = await this.upsertGuestIdentity(client, {
        hotelId: app.hotelId,
        emailHash: row.normalized_email_hash,
        encryptedEmail: row.encrypted_email,
        provider: "EMAIL",
        providerSubject: row.normalized_email_hash,
        installationId: values.installationId,
        locale: "en",
      });
      return { session };
    });
    if ("error" in result) throw new AppError(result.error, result.error === "RATE_LIMITED" ? 429 : 401);
    return result.session;
  }

  async verifyOAuth(appKey: string, input: unknown) {
    const values = OAuthIdentityAssertionSchema.parse(input);
    const app = await this.mobileContext.resolve(appKey);
    const verified = await this.oauth.verify(values.provider, values.idToken);
    const normalized = this.security.normalizeEmail(verified.email);
    return this.tenant(app.hotelId, values.installationId, (client) =>
      this.upsertGuestIdentity(client, {
        hotelId: app.hotelId,
        emailHash: this.security.emailLookupHash(app.hotelId, normalized),
        encryptedEmail: this.security.encryptPii(normalized),
        provider: verified.provider,
        providerSubject: verified.subject,
        installationId: values.installationId,
        locale: "en",
      }),
    );
  }

  async recordConsent(appKey: string, authorization: string | undefined, input: unknown) {
    const command = ConsentCommandSchema.parse(input);
    const app = await this.mobileContext.resolve(appKey);
    const guest = await this.security.verifyGuestToken(authorization);
    if (guest.hotelId !== app.hotelId) throw new AppError("FORBIDDEN", 403);
    return this.tenant(app.hotelId, guest.accountId, async (client) => {
      const definition = await client.query<{ id: string; required: boolean }>(
        `SELECT id, required FROM consent_definitions
         WHERE hotel_id=$1 AND purpose=$2 AND channel=$3 AND version=$4
           AND effective_at<=now() AND retired_at IS NULL`,
        [app.hotelId, command.purpose, command.channel, command.definitionVersion],
      );
      const row = definition.rows[0];
      if (!row) throw new AppError("INVALID_REQUEST", 400, false, { field: "definitionVersion" });
      if (row.required && !command.granted) throw new AppError("TERMS_REQUIRED", 409);
      const eventId = randomUUID();
      await client.query(
        `INSERT INTO consent_events
          (id, hotel_id, hotel_guest_account_id, consent_definition_id, purpose, channel, granted,
           definition_version, locale, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          eventId,
          app.hotelId,
          guest.accountId,
          row.id,
          command.purpose,
          command.channel,
          command.granted,
          command.definitionVersion,
          command.locale,
          command.source,
        ],
      );
      await client.query(
        `INSERT INTO consent_current
          (hotel_id, hotel_guest_account_id, purpose, channel, consent_event_id, granted, definition_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (hotel_id, hotel_guest_account_id, purpose, channel) DO UPDATE SET
          consent_event_id=EXCLUDED.consent_event_id, granted=EXCLUDED.granted,
          definition_version=EXCLUDED.definition_version, updated_at=now()`,
        [
          app.hotelId,
          guest.accountId,
          command.purpose,
          command.channel,
          eventId,
          command.granted,
          command.definitionVersion,
        ],
      );
      await appendAuditAndOutbox(client, {
        hotelId: app.hotelId,
        actor: { type: "GUEST", id: guest.accountId },
        action: "guest.consent_changed",
        resource: { type: "consent_event", id: eventId },
        event: {
          type: command.purpose === "TERMS" ? "guest.terms_accepted" : "guest.consent_changed",
          aggregateType: "guest_account",
          aggregateId: guest.accountId,
          payload: command,
        },
        traceId: randomUUID(),
        correlationId: guest.sessionId,
      });
      return { ...command, consentEventId: eventId };
    });
  }

  async completeStayClaim(appKey: string, authorization: string | undefined, input: unknown) {
    const command = ClaimCompleteCommandSchema.parse(input);
    const app = await this.mobileContext.resolve(appKey);
    const guest = await this.security.verifyGuestToken(authorization);
    if (guest.hotelId !== app.hotelId || guest.accountId !== command.accountId)
      throw new AppError("FORBIDDEN", 403);
    return this.tenant(app.hotelId, guest.accountId, async (client) => {
      await this.assertTerms(client, app.hotelId, guest.accountId, command.acceptedTermsVersion);
      const result = await client.query<{
        session_id: string;
        session_expires_at: Date;
        completed_at: Date | null;
        claim_id: string;
        claim_expires_at: Date;
        claimed_at: Date | null;
        revoked_at: Date | null;
        stay_id: string;
      }>(
        `SELECT cs.id AS session_id, cs.expires_at AS session_expires_at, cs.completed_at,
                c.id AS claim_id, c.expires_at AS claim_expires_at, c.claimed_at, c.revoked_at, c.stay_id
         FROM stay_claim_sessions cs JOIN stay_claims c ON c.id=cs.stay_claim_id AND c.hotel_id=cs.hotel_id
         WHERE cs.id=$1 AND cs.hotel_id=$2 FOR UPDATE OF cs,c`,
        [command.claimSessionId, app.hotelId],
      );
      const row = result.rows[0];
      if (!row) throw new AppError("NOT_FOUND", 404);
      if (row.completed_at || row.claimed_at) throw new AppError("CLAIM_REPLAYED", 409);
      if (row.revoked_at) throw new AppError("CLAIM_REVOKED", 410);
      if (row.session_expires_at.valueOf() <= Date.now() || row.claim_expires_at.valueOf() <= Date.now()) {
        throw new AppError("CLAIM_EXPIRED", 410);
      }
      await client.query(
        `INSERT INTO stay_guest_memberships (hotel_id, stay_id, hotel_guest_account_id, relationship)
         VALUES ($1,$2,$3,'PRIMARY') ON CONFLICT DO NOTHING`,
        [app.hotelId, row.stay_id, guest.accountId],
      );
      await client.query("UPDATE stay_claims SET claimed_at=now() WHERE id=$1", [row.claim_id]);
      await client.query("UPDATE stay_claim_sessions SET completed_at=now() WHERE id=$1", [row.session_id]);
      await client.query(
        "UPDATE stays SET lifecycle='IN_HOUSE', activated_at=now(), updated_at=now() WHERE id=$1",
        [row.stay_id],
      );
      await appendAuditAndOutbox(client, {
        hotelId: app.hotelId,
        actor: { type: "GUEST", id: guest.accountId },
        action: "guest.stay_activated",
        resource: { type: "stay", id: row.stay_id },
        event: {
          type: "guest.stay_activated",
          aggregateType: "stay",
          aggregateId: row.stay_id,
          payload: { accountId: guest.accountId, claimId: row.claim_id },
        },
        traceId: randomUUID(),
        correlationId: row.stay_id,
      });
      return { stayId: row.stay_id, lifecycle: "IN_HOUSE" as const };
    });
  }

  async completePrearrivalInvitation(appKey: string, authorization: string | undefined, input: unknown) {
    const command = InvitationCompleteSchema.parse(input);
    const app = await this.mobileContext.resolve(appKey);
    const guest = await this.security.verifyGuestToken(authorization);
    if (guest.hotelId !== app.hotelId) throw new AppError("FORBIDDEN", 403);
    return this.tenant(app.hotelId, guest.accountId, async (client) => {
      await this.assertTerms(client, app.hotelId, guest.accountId, command.acceptedTermsVersion);
      const result = await client.query<{
        session_id: string;
        session_expires_at: Date;
        completed_at: Date | null;
        invitation_id: string;
        invitation_expires_at: Date;
        claimed_at: Date | null;
        revoked_at: Date | null;
        stay_id: string;
      }>(
        `SELECT s.id AS session_id, s.expires_at AS session_expires_at, s.completed_at,
                i.id AS invitation_id, i.expires_at AS invitation_expires_at, i.claimed_at, i.revoked_at, i.stay_id
         FROM prearrival_invitation_sessions s
         JOIN prearrival_invitations i ON i.id=s.prearrival_invitation_id AND i.hotel_id=s.hotel_id
         WHERE s.id=$1 AND s.hotel_id=$2 FOR UPDATE OF s,i`,
        [command.invitationSessionId, app.hotelId],
      );
      const row = result.rows[0];
      if (!row) throw new AppError("NOT_FOUND", 404);
      if (row.completed_at || row.claimed_at) throw new AppError("CLAIM_REPLAYED", 409);
      if (row.revoked_at) throw new AppError("CLAIM_REVOKED", 410);
      if (
        row.session_expires_at.valueOf() <= Date.now() ||
        row.invitation_expires_at.valueOf() <= Date.now()
      ) {
        throw new AppError("CLAIM_EXPIRED", 410);
      }
      await client.query(
        `INSERT INTO stay_guest_memberships (hotel_id, stay_id, hotel_guest_account_id, relationship)
         VALUES ($1,$2,$3,'PRIMARY') ON CONFLICT DO NOTHING`,
        [app.hotelId, row.stay_id, guest.accountId],
      );
      await client.query(
        "UPDATE prearrival_invitations SET claimed_at=now(), claimed_by_account_id=$2 WHERE id=$1",
        [row.invitation_id, guest.accountId],
      );
      await client.query("UPDATE prearrival_invitation_sessions SET completed_at=now() WHERE id=$1", [
        row.session_id,
      ]);
      await client.query(
        "UPDATE stays SET lifecycle='PRE_ARRIVAL_ACTIVATED', updated_at=now() WHERE id=$1 AND lifecycle='UPCOMING'",
        [row.stay_id],
      );
      return {
        stayId: row.stay_id,
        lifecycle: "PRE_ARRIVAL_ACTIVATED" as const,
        sensitiveRoomDataUnlocked: false,
      };
    });
  }

  async updatePushPermission(appKey: string, authorization: string | undefined, input: unknown) {
    const command = PushPermissionCommandSchema.parse(input);
    const app = await this.mobileContext.resolve(appKey);
    const guest = await this.security.verifyGuestToken(authorization);
    if (guest.hotelId !== app.hotelId) throw new AppError("FORBIDDEN", 403);
    return this.tenant(app.hotelId, guest.accountId, async (client) => {
      const device = await client.query<{ id: string; platform: string }>(
        `SELECT id, platform FROM guest_devices
         WHERE hotel_id=$1 AND hotel_guest_account_id=$2 AND installation_id=$3`,
        [app.hotelId, guest.accountId, command.installationId],
      );
      const row = device.rows[0];
      if (!row) throw new AppError("NOT_FOUND", 404);
      await client.query(
        `INSERT INTO push_subscriptions (hotel_id, guest_device_id, provider, permission_status)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (hotel_id, guest_device_id) DO UPDATE SET permission_status=EXCLUDED.permission_status, updated_at=now()`,
        [app.hotelId, row.id, row.platform === "IOS" ? "APNS" : "FCM", command.status],
      );
      await appendAuditAndOutbox(client, {
        hotelId: app.hotelId,
        actor: { type: "GUEST", id: guest.accountId },
        action: "guest.push_permission_updated",
        resource: { type: "guest_device", id: row.id },
        event: {
          type: "guest.push_permission_updated",
          aggregateType: "guest_device",
          aggregateId: row.id,
          payload: { status: command.status },
        },
        traceId: randomUUID(),
        correlationId: guest.sessionId,
      });
      return command;
    });
  }

  private async upsertGuestIdentity(
    client: DatabaseClient,
    input: {
      hotelId: string;
      emailHash: string;
      encryptedEmail: string;
      provider: "EMAIL" | "APPLE" | "GOOGLE";
      providerSubject: string;
      installationId: string;
      locale: Locale;
    },
  ) {
    const account = await client.query<{ id: string; created: boolean }>(
      `INSERT INTO hotel_guest_accounts
        (hotel_id, normalized_email_hash, encrypted_email, preferred_locale, status)
       VALUES ($1,$2,$3,$4,'ACTIVE')
       ON CONFLICT (hotel_id, normalized_email_hash) DO UPDATE SET updated_at=now()
       RETURNING id, (xmax = 0) AS created`,
      [input.hotelId, input.emailHash, input.encryptedEmail, input.locale],
    );
    const accountId = account.rows[0]!.id;
    await client.query(
      `INSERT INTO guest_auth_identities
        (hotel_id, hotel_guest_account_id, provider, provider_subject, provider_email_encrypted)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (hotel_id, provider, provider_subject) DO UPDATE SET hotel_guest_account_id=EXCLUDED.hotel_guest_account_id`,
      [input.hotelId, accountId, input.provider, input.providerSubject, input.encryptedEmail],
    );
    const device = await client.query<{ id: string }>(
      `INSERT INTO guest_devices
        (hotel_id, hotel_guest_account_id, installation_id, platform, app_version, locale, status)
       VALUES ($1,$2,$3,'WEB_TEST','1.0.0',$4,'ACTIVE')
       ON CONFLICT (hotel_id, installation_id) DO UPDATE SET
        hotel_guest_account_id=EXCLUDED.hotel_guest_account_id, locale=EXCLUDED.locale, status='ACTIVE', last_seen_at=now()
       RETURNING id`,
      [input.hotelId, accountId, input.installationId, input.locale],
    );
    const sessionId = randomUUID();
    const refreshToken = randomBytes(32).toString("base64url");
    await client.query(
      `INSERT INTO guest_sessions
        (id, hotel_id, hotel_guest_account_id, guest_device_id, refresh_token_hash, expires_at)
       VALUES ($1,$2,$3,$4,$5,now()+interval '30 days')`,
      [sessionId, input.hotelId, accountId, device.rows[0]!.id, this.tokenHash(refreshToken)],
    );
    await appendAuditAndOutbox(client, {
      hotelId: input.hotelId,
      actor: { type: "GUEST", id: accountId },
      action: account.rows[0]!.created ? "guest.account_created" : "guest.session_created",
      resource: { type: "guest_account", id: accountId },
      event: {
        type: account.rows[0]!.created ? "guest.account_created" : "guest.session_created",
        aggregateType: "guest_account",
        aggregateId: accountId,
        payload: { provider: input.provider },
      },
      traceId: randomUUID(),
      correlationId: sessionId,
    });
    return {
      accountId,
      sessionId,
      accessToken: await this.security.issueGuestToken({ accountId, hotelId: input.hotelId, sessionId }),
      refreshToken,
      expiresInSeconds: 900,
    };
  }

  private async assertTerms(client: DatabaseClient, hotelId: string, accountId: string, version: string) {
    const terms = await client.query(
      `SELECT 1 FROM consent_current
       WHERE hotel_id=$1 AND hotel_guest_account_id=$2 AND purpose='TERMS' AND channel='SERVICE'
         AND granted=true AND definition_version=$3`,
      [hotelId, accountId, version],
    );
    if (!terms.rowCount) throw new AppError("TERMS_REQUIRED", 409);
  }

  private tenant<T>(hotelId: string, actorId: string, action: (client: DatabaseClient) => Promise<T>) {
    return withTenantTransaction(
      this.pool,
      {
        hotelId,
        actorId,
        traceId: randomUUID(),
      },
      action,
    );
  }

  private tokenHash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private maskName(value: string): string {
    return value
      .trim()
      .split(/\s+/)
      .map((part) => `${part.slice(0, 1)}***`)
      .join(" ");
  }
}
