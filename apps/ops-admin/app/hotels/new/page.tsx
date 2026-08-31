"use client";

import { useState, type FormEvent } from "react";

export default function CreateHotel() {
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/v1/ops/hotels`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
          "X-Platform-Role": "STAYBUDDY_SUPER_ADMIN",
        },
        body: JSON.stringify(values),
      },
    );
    setMessage(
      response.ok
        ? "Hotel workspace created and ready for configuration."
        : "The hotel could not be created yet. Please review the details or contact platform support.",
    );
  }
  return (
    <>
      <div className="eyebrow">SB-O-004</div>
      <h1>Create hotel tenant</h1>
      <p className="lede">Creates platform configuration only—never guest data.</p>
      <form onSubmit={submit}>
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
        <button className="button full" type="submit">
          Create tenant and onboarding workspace
        </button>
      </form>
      <p role="status">{message}</p>
    </>
  );
}
