"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type AppFactoryItem = {
  hotelId: string;
  hotelName: string;
  hotelAppId: string;
  appName: string;
  iosBundleIdentifier: string;
  androidPackage: string;
  scheme: string;
  buildConfigStatus: string;
  assetStatus: string;
  buildConfigVersion: number;
  latestBuildStatus: string | null;
};

export default function AppFactoryDashboard() {
  const [apps, setApps] = useState<AppFactoryItem[]>([]);
  const [message, setMessage] = useState("Load the app factory with an authorized App Ops token.");

  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = String(new FormData(event.currentTarget).get("accessToken"));
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/v1/ops/app-factory`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) return setMessage("Could not load app factory. Check App Ops access.");
    setApps((await response.json()) as AppFactoryItem[]);
    setMessage("");
  }

  return (
    <>
      <div className="eyebrow">SB-O-017 · Sprint 7</div>
      <h1>App Factory</h1>
      <p className="lede">One compiled identity and an independent build lane for every hotel app.</p>
      <form onSubmit={load} className="compact-form">
        <label>
          App Ops access token
          <input name="accessToken" type="password" autoComplete="off" required />
        </label>
        <button className="button" type="submit">
          Load apps
        </button>
      </form>
      <p role="status" className="status-message">
        {message}
      </p>
      <table>
        <thead>
          <tr>
            <th>Hotel app</th>
            <th>Compiled identities</th>
            <th>Build config</th>
            <th>Latest build</th>
          </tr>
        </thead>
        <tbody>
          {apps.map((app) => (
            <tr key={app.hotelAppId}>
              <td>
                <Link href={`/app-factory/${app.hotelAppId}`}>{app.hotelName}</Link>
                <br />
                <small>{app.appName}</small>
              </td>
              <td>
                <code>{app.iosBundleIdentifier}</code>
                <br />
                <code>{app.androidPackage}</code>
                <br />
                <small>{app.scheme}://</small>
              </td>
              <td>
                <span className="status-pill">{app.buildConfigStatus}</span>
                <br />
                <small>
                  {app.assetStatus} · v{app.buildConfigVersion}
                </small>
              </td>
              <td>{app.latestBuildStatus ?? "No build yet"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 24 }}>
        <Link className="button" href="/app-builds">
          Open build queue
        </Link>
      </p>
    </>
  );
}
