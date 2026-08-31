import { Injectable } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { AppError } from "./errors.js";

export type VerifiedOAuthIdentity = { provider: "APPLE" | "GOOGLE"; subject: string; email: string };

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

@Injectable()
export class OAuthService {
  async verify(provider: "apple" | "google", idToken: string): Promise<VerifiedOAuthIdentity> {
    if (process.env.ALLOW_TEST_OAUTH === "true" && idToken.startsWith("test:")) {
      const [, email, subject] = idToken.split(":");
      if (!email || !subject) throw new AppError("UNAUTHENTICATED", 401);
      return { provider: provider.toUpperCase() as "APPLE" | "GOOGLE", email, subject };
    }
    try {
      if (provider === "google") {
        const audiences = this.audiences("GOOGLE_CLIENT_IDS");
        const result = await jwtVerify(idToken, googleJwks, {
          issuer: ["https://accounts.google.com", "accounts.google.com"],
          audience: audiences,
        });
        if (typeof result.payload.email !== "string" || typeof result.payload.sub !== "string")
          throw new Error();
        return { provider: "GOOGLE", email: result.payload.email, subject: result.payload.sub };
      }
      const result = await jwtVerify(idToken, appleJwks, {
        issuer: "https://appleid.apple.com",
        audience: this.audiences("APPLE_CLIENT_IDS"),
      });
      if (typeof result.payload.email !== "string" || typeof result.payload.sub !== "string")
        throw new Error();
      return { provider: "APPLE", email: result.payload.email, subject: result.payload.sub };
    } catch {
      throw new AppError("UNAUTHENTICATED", 401);
    }
  }

  private audiences(name: string): string[] {
    const value = process.env[name];
    if (!value) throw new AppError("INTERNAL_ERROR", 500, false, { configuration: name });
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
