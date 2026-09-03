"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type CreateResult = { body?: { hotelId: string; configVersion: number }; code?: string };

export default function CreateHotel() {
  const [message, setMessage] = useState("");
  const [hotelId, setHotelId] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Creating tenant and publishing configuration version 1…");
    const data = new FormData(event.currentTarget);
    const slug = String(data.get("slug"));
    const payload = {
      slug,
      legalName: data.get("legalName"),
      displayName: data.get("displayName"),
      roomCount: Number(data.get("roomCount")),
      timezone: data.get("timezone"),
      countryCode: data.get("countryCode"),
      location: {
        name: data.get("locationName"),
        province: data.get("province"),
        district: data.get("district"),
      },
      primaryContact: {
        name: data.get("contactName"),
        email: data.get("contactEmail"),
        phone: data.get("contactPhone"),
      },
      salesReference: data.get("salesReference"),
      app: {
        appName: data.get("appName"),
        scheme: data.get("scheme"),
        iosBundleIdentifier: data.get("iosBundleIdentifier"),
        androidPackage: data.get("androidPackage"),
        minimumVersion: data.get("minimumVersion"),
      },
      brand: {
        theme: {
          primary: data.get("primary"),
          accent: data.get("accent"),
          canvas: "#FCF9F3",
          surfaceWarm: "#EFE6D7",
          ink: "#152535",
          divider: "#EDF1F3",
          logoUrl: data.get("logoUrl"),
          heroImageUrl: data.get("heroImageUrl"),
        },
        supportedLocales: ["en", "th", "zh-CN", "ru"],
        defaultLocale: data.get("defaultLocale"),
        voiceProfile: data.get("voiceProfile"),
      },
      departments: [
        { code: "FRONT", name: "Front Desk", defaultSlaMinutes: 10 },
        { code: "HOUSEKEEPING", name: "Housekeeping", defaultSlaMinutes: 15 },
        { code: "ENGINEERING", name: "Engineering", defaultSlaMinutes: 15 },
        { code: "FNB", name: "Food & Beverage", defaultSlaMinutes: 15 },
        { code: "SPA", name: "Spa", defaultSlaMinutes: 20 },
      ],
      serviceCategories: [
        { code: "GUEST_REQUESTS", name: "Guest Requests", departmentCode: "FRONT" },
        { code: "ROOM_CARE", name: "Room Care", departmentCode: "HOUSEKEEPING" },
        { code: "MAINTENANCE", name: "Maintenance", departmentCode: "ENGINEERING" },
        { code: "DINING", name: "Dining", departmentCode: "FNB" },
        { code: "WELLNESS", name: "Wellness", departmentCode: "SPA" },
      ],
      features: { guestShell: true, reservationCsv: true, stayClaim: true, emailOtp: true },
      commercial: { discountMinor: Number(data.get("discountMinor")) },
    };
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/v1/ops/hotels`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${String(data.get("accessToken"))}`,
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(payload),
      },
    );
    const result = (await response.json()) as CreateResult;
    if (response.ok && result.body) {
      setHotelId(result.body.hotelId);
      setMessage(`Tenant created. Public configuration v${result.body.configVersion} is signed and ready.`);
    } else {
      setMessage(`Could not create tenant${result.code ? `: ${result.code}` : "."}`);
    }
  }

  return (
    <>
      <div className="eyebrow">SB-O-004 · Sprint 6</div>
      <h1>Create complete hotel tenant</h1>
      <p className="lede">
        Creates location, encrypted primary contact, commercial baseline, app identity, brand, departments and
        signed remote configuration. It never creates guest data.
      </p>
      <form onSubmit={submit}>
        <fieldset className="full">
          <legend>Authorized Ops session</legend>
          <label>
            Staff access token
            <input name="accessToken" type="password" autoComplete="off" required />
          </label>
          <small>Held by this form only and sent as a bearer token; it is not saved in tenant config.</small>
        </fieldset>

        <h2 className="full">Hotel and contact</h2>
        <label>
          Display name
          <input name="displayName" required defaultValue="CC Phuket Residence" />
        </label>
        <label>
          Legal name
          <input name="legalName" required defaultValue="CC Phuket Residence Co., Ltd." />
        </label>
        <label>
          Slug
          <input name="slug" required pattern="[a-z0-9-]+" defaultValue="cc-phuket-residence" />
        </label>
        <label>
          Rooms
          <input name="roomCount" required type="number" min="1" defaultValue="80" />
        </label>
        <label>
          Timezone
          <input name="timezone" required defaultValue="Asia/Bangkok" />
        </label>
        <label>
          Country
          <select name="countryCode" defaultValue="TH">
            <option value="TH">Thailand</option>
          </select>
        </label>
        <label>
          Location name
          <input name="locationName" required defaultValue="CC Phuket Residence" />
        </label>
        <label>
          Province
          <input name="province" required defaultValue="Phuket" />
        </label>
        <label>
          District
          <input name="district" required defaultValue="Mueang Phuket" />
        </label>
        <label>
          Sales reference
          <input name="salesReference" required defaultValue="DIRECT-CC-PHUKET" />
        </label>
        <label>
          Primary contact
          <input name="contactName" required defaultValue="Hotel Owner" />
        </label>
        <label>
          Contact email
          <input name="contactEmail" type="email" required defaultValue="owner@example.com" />
        </label>
        <label>
          Contact phone
          <input name="contactPhone" required defaultValue="+66812345678" />
        </label>
        <label>
          Discount (satang)
          <input name="discountMinor" type="number" min="0" defaultValue="0" />
        </label>

        <h2 className="full">App identity and remote brand</h2>
        <label>
          App name
          <input name="appName" required defaultValue="CC Phuket Residence" />
        </label>
        <label>
          URL scheme
          <input name="scheme" required pattern="[a-z][a-z0-9-]*" defaultValue="ccphuket" />
        </label>
        <label>
          iOS bundle ID
          <input name="iosBundleIdentifier" required defaultValue="com.staybuddy.ccphuketresidence" />
        </label>
        <label>
          Android package
          <input name="androidPackage" required defaultValue="com.staybuddy.ccphuketresidence" />
        </label>
        <label>
          Minimum app version
          <input name="minimumVersion" required defaultValue="1.0.0" />
        </label>
        <label>
          Default language
          <select name="defaultLocale" defaultValue="en">
            <option value="en">English</option>
            <option value="th">Thai</option>
            <option value="zh-CN">Chinese</option>
            <option value="ru">Russian</option>
          </select>
        </label>
        <label>
          Voice profile
          <select name="voiceProfile" defaultValue="FIVE_STAR_RESORT">
            <option value="FIVE_STAR_RESORT">Five-star resort</option>
            <option value="FIVE_STAR_BOUTIQUE">Five-star boutique</option>
          </select>
        </label>
        <label>
          Primary color
          <input name="primary" required defaultValue="#102A43" />
        </label>
        <label>
          Accent color
          <input name="accent" required defaultValue="#C9A45C" />
        </label>
        <label className="full">
          Logo URL
          <input
            name="logoUrl"
            type="url"
            required
            defaultValue="https://assets.example.invalid/cc-phuket-residence/logo.png"
          />
        </label>
        <label className="full">
          Hero image URL
          <input
            name="heroImageUrl"
            type="url"
            required
            defaultValue="https://assets.example.invalid/cc-phuket-residence/hero.jpg"
          />
        </label>
        <button className="button full" type="submit">
          Create tenant and publish config v1
        </button>
      </form>
      <p role="status" className="status-message">
        {message}
      </p>
      {hotelId ? (
        <Link className="button" href={`/hotels/${hotelId}`}>
          Open onboarding progress
        </Link>
      ) : null}
    </>
  );
}
