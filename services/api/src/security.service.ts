import { createCipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { jwtVerify, SignJWT } from "jose";
import { AppError } from "./errors.js";

@Injectable()
export class SecurityService {
  normalizeEmail(email: string): string {
    return email.trim().normalize("NFKC").toLowerCase();
  }

  emailLookupHash(hotelId: string, email: string): string {
    return createHmac("sha256", this.required("EMAIL_LOOKUP_HMAC_SECRET"))
      .update(`${hotelId}:${this.normalizeEmail(email)}`)
      .digest("hex");
  }

  encryptPii(value: string): string {
    const key = Buffer.from(this.required("PII_ENCRYPTION_KEY_BASE64"), "base64");
    if (key.length !== 32) throw new AppError("INTERNAL_ERROR", 500);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((item) => item.toString("base64url")).join(".");
  }

  otpHash(challengeId: string, code: string): Buffer {
    return createHmac("sha256", this.required("OTP_PEPPER")).update(`${challengeId}:${code}`).digest();
  }

  otpMatches(challengeId: string, code: string, expectedHex: string): boolean {
    const actual = this.otpHash(challengeId, code);
    const expected = Buffer.from(expectedHex, "hex");
    return expected.length === actual.length && timingSafeEqual(actual, expected);
  }

  async issueGuestToken(input: { accountId: string; hotelId: string; sessionId: string }): Promise<string> {
    return new SignJWT({ hotel_id: input.hotelId, session_id: input.sessionId, actor_type: "guest" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(input.accountId)
      .setIssuer("staybuddy-platform")
      .setAudience("staybuddy-mobile")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode(this.required("GUEST_JWT_SECRET")));
  }

  async verifyGuestToken(
    authorization?: string,
  ): Promise<{ accountId: string; hotelId: string; sessionId: string }> {
    if (!authorization?.startsWith("Bearer ")) throw new AppError("UNAUTHENTICATED", 401);
    try {
      const result = await jwtVerify(
        authorization.slice(7),
        new TextEncoder().encode(this.required("GUEST_JWT_SECRET")),
        { issuer: "staybuddy-platform", audience: "staybuddy-mobile" },
      );
      if (
        typeof result.payload.sub !== "string" ||
        typeof result.payload.hotel_id !== "string" ||
        typeof result.payload.session_id !== "string"
      ) {
        throw new Error("invalid claims");
      }
      return {
        accountId: result.payload.sub,
        hotelId: result.payload.hotel_id,
        sessionId: result.payload.session_id,
      };
    } catch {
      throw new AppError("UNAUTHENTICATED", 401);
    }
  }

  private required(name: string): string {
    const value = process.env[name];
    if (!value) throw new AppError("INTERNAL_ERROR", 500, false, { configuration: name });
    return value;
  }
}
