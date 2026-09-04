"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type Build = {
  id: string;
  hotelName: string;
  appName: string;
  platform: string;
  profile: string;
  status: string;
  version: string;
  commitSha: string;
  updatedAt: string;
};

export default function BuildQueue() {
  const [builds, setBuilds] = useState<Build[]>([]);
  const [message, setMessage] = useState(
    "Queued, validating and building lanes remain isolated per hotel and platform.",
  );

  async function load(token: string) {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/v1/ops/app-builds`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) return setMessage("Could not load the queue.");
    setBuilds((await response.json()) as Build[]);
    setMessage("");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const token = String(data.get("accessToken"));
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/v1/ops/app-builds`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          hotelId: data.get("hotelId"),
          hotelAppId: data.get("hotelAppId"),
          platform: data.get("platform"),
          profile: data.get("profile"),
          version: data.get("version"),
          commitSha: data.get("commitSha"),
        }),
      },
    );
    if (!response.ok) return setMessage("Build was not queued. Validate config or wait for the active lane.");
    setMessage("Build queued independently for this hotel and platform.");
    await load(token);
  }
  return (
    <>
      <div className="eyebrow">SB-O-019 · Sprint 7</div>
      <h1>Build queue</h1>
      <p className="lede">Code-only queue foundation. No store submission is performed here.</p>
      <form onSubmit={submit}>
        <label className="full">
          App Ops access token
          <input name="accessToken" type="password" autoComplete="off" required />
        </label>
        <label>
          Hotel ID
          <input name="hotelId" required />
        </label>
        <label>
          Hotel app ID
          <input name="hotelAppId" required />
        </label>
        <label>
          Platform
          <select name="platform">
            <option>IOS</option>
            <option>ANDROID</option>
          </select>
        </label>
        <label>
          Profile
          <select name="profile">
            <option>PREVIEW</option>
            <option>DEVELOPMENT</option>
            <option>PRODUCTION</option>
          </select>
        </label>
        <label>
          Version
          <input name="version" defaultValue="1.0.0" required />
        </label>
        <label>
          Commit SHA
          <input name="commitSha" pattern="[0-9a-f]{7,64}" required />
        </label>
        <button className="button" type="submit">
          Queue build
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={(event) => {
            const form = event.currentTarget.form;
            if (form) void load(String(new FormData(form).get("accessToken")));
          }}
        >
          Refresh queue
        </button>
      </form>
      <p role="status" className="status-message">
        {message}
      </p>
      <table>
        <thead>
          <tr>
            <th>Hotel app</th>
            <th>Lane</th>
            <th>Version</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {builds.map((build) => (
            <tr key={build.id}>
              <td>
                <Link href={`/app-builds/${build.id}`}>{build.hotelName}</Link>
                <br />
                <small>{build.appName}</small>
              </td>
              <td>
                {build.platform} · {build.profile}
              </td>
              <td>
                {build.version}
                <br />
                <code>{build.commitSha.slice(0, 12)}</code>
              </td>
              <td>
                <span className="status-pill">{build.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
