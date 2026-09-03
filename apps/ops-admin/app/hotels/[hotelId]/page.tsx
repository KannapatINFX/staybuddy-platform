"use client";

import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";

type HotelDetail = {
  hotel: {
    displayName: string;
    legalName: string;
    status: string;
    roomCount?: number;
    commercial: { roomCount: number; discountMinor: number };
    departments: Array<{ id: string; code: string; name: string }>;
    serviceCategories: Array<{ id: string; code: string; name: string }>;
  };
  app: {
    appName: string;
    status: string;
    configVersion: number;
    iosBundleIdentifier: string;
    androidPackage: string;
  };
  location: { name: string; province: string | null; district: string | null };
  primaryContact: { name: string; email: string; phone: string | null };
  salesReference: string | null;
  onboarding: Array<{ step: string; status: string }>;
};

export default function HotelOverview() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const [detail, setDetail] = useState<HotelDetail>();
  const [message, setMessage] = useState("Enter an authorized Staff token to load this tenant.");

  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = String(new FormData(event.currentTarget).get("accessToken"));
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/v1/ops/hotels/${hotelId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) {
      setMessage("Could not load tenant. Check the token and hotel identifier.");
      return;
    }
    setDetail((await response.json()) as HotelDetail);
    setMessage("");
  }

  return (
    <>
      <div className="eyebrow">SB-O-005 · SB-O-006</div>
      <h1>{detail?.hotel.displayName ?? "Hotel onboarding overview"}</h1>
      <p className="lede">Tenant ID: {hotelId}</p>
      <form onSubmit={load}>
        <label className="full">
          Staff access token
          <input name="accessToken" type="password" autoComplete="off" required />
        </label>
        <button className="button" type="submit">
          Load onboarding
        </button>
      </form>
      <p role="status" className="status-message">
        {message}
      </p>
      {detail ? (
        <>
          <section className="grid">
            <article className="card">
              <div className="eyebrow">Tenant</div>
              <div className="metric">{detail.hotel.status}</div>
              <p>
                {detail.location.name}, {detail.location.province}
              </p>
            </article>
            <article className="card">
              <div className="eyebrow">Commercial</div>
              <div className="metric">{detail.hotel.commercial.roomCount}</div>
              <p>rooms · discount {detail.hotel.commercial.discountMinor} satang</p>
            </article>
            <article className="card">
              <div className="eyebrow">Remote config</div>
              <div className="metric">v{detail.app.configVersion}</div>
              <p>
                {detail.app.appName} · {detail.app.status}
              </p>
            </article>
          </section>
          <h2>Onboarding progress</h2>
          <ul className="steps">
            {detail.onboarding.map((item) => (
              <li key={item.step}>
                <span>{item.step.replaceAll("_", " ")}</span>
                <span className="status-pill">{item.status}</span>
              </li>
            ))}
          </ul>
          <section className="grid">
            <article className="card">
              <h2>Primary contact</h2>
              <p>
                {detail.primaryContact.name}
                <br />
                {detail.primaryContact.email}
                <br />
                {detail.primaryContact.phone}
              </p>
            </article>
            <article className="card">
              <h2>App identity</h2>
              <p>
                {detail.app.iosBundleIdentifier}
                <br />
                {detail.app.androidPackage}
              </p>
            </article>
            <article className="card">
              <h2>Departments</h2>
              <p>{detail.hotel.departments.map((department) => department.name).join(", ")}</p>
            </article>
            <article className="card">
              <h2>Initial services</h2>
              <p>{detail.hotel.serviceCategories.map((category) => category.name).join(", ")}</p>
            </article>
          </section>
        </>
      ) : null}
    </>
  );
}
