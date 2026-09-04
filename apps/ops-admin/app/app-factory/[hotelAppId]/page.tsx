"use client";

import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";

const sample = {
  deepLinks: {
    scheme: "hotelapp",
    universalLinkOrigin: "https://hotel.example.invalid",
    installLandingUrl: "https://hotel.example.invalid/install",
    allowedRoutes: ["welcome", "claim", "concierge", "services", "stay", "requests", "orders", "inbox"],
  },
  assets: {
    status: "SYNTHETIC",
    icon: { path: "assets/icon.png", sha256: "0".repeat(64), width: 1024, height: 1024 },
    adaptiveIcon: { path: "assets/adaptive-icon.png", sha256: "0".repeat(64), width: 1024, height: 1024 },
    splash: { path: "assets/splash.png", sha256: "0".repeat(64), width: 1284, height: 2778 },
  },
  storeListing: {
    privacyUrl: "https://hotel.example.invalid/privacy",
    supportUrl: "https://hotel.example.invalid/support",
    locales: ["en", "th", "zh-CN", "ru"].map((locale) => ({
      locale,
      title: "Hotel Guest App",
      subtitle: "Your hotel concierge",
      description: "A hotel-branded companion for service and support throughout your stay.",
      keywords: ["hotel", "concierge"],
    })),
  },
};

export default function HotelAppBuildConfiguration() {
  const { hotelAppId } = useParams<{ hotelAppId: string }>();
  const [message, setMessage] = useState("Compiled bundle/package IDs remain immutable after onboarding.");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    let payload: unknown;
    try {
      payload = JSON.parse(String(data.get("configuration"))) as unknown;
    } catch {
      return setMessage("Configuration is not valid JSON.");
    }
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/v1/ops/hotel-apps/${hotelAppId}/build-config`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${String(data.get("accessToken"))}`,
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(payload),
      },
    );
    setMessage(
      response.ok
        ? "Build configuration validated and versioned."
        : "Configuration was rejected. Check identity, assets and four-locale metadata.",
    );
  }

  return (
    <>
      <div className="eyebrow">SB-O-018 · Sprint 7</div>
      <h1>Hotel app build configuration</h1>
      <p className="lede">App ID: {hotelAppId}</p>
      <form onSubmit={submit}>
        <label className="full">
          App Ops access token
          <input name="accessToken" type="password" autoComplete="off" required />
        </label>
        <label className="full">
          Versioned build configuration
          <textarea name="configuration" rows={24} defaultValue={JSON.stringify(sample, null, 2)} required />
        </label>
        <button className="button full" type="submit">
          Save &amp; validate
        </button>
      </form>
      <p role="status" className="status-message">
        {message}
      </p>
      <small>Production builds additionally require APPROVED assets and non-placeholder HTTPS URLs.</small>
    </>
  );
}
