"use client";

import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";

type Detail = {
  build: {
    id: string;
    hotelName: string;
    appName: string;
    platform: string;
    status: string;
    version: string;
    artifactReference: string | null;
    failureCode: string | null;
  };
  events: Array<{
    id: string;
    priorStatus: string | null;
    status: string;
    failureCode: string | null;
    occurredAt: string;
  }>;
};

export default function BuildDetail() {
  const { buildJobId } = useParams<{ buildJobId: string }>();
  const [detail, setDetail] = useState<Detail>();
  const [message, setMessage] = useState("Load immutable build history.");
  async function load(token: string) {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/v1/ops/app-builds/${buildJobId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) return setMessage("Could not load build.");
    setDetail((await response.json()) as Detail);
    setMessage("");
  }
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const token = String(data.get("accessToken"));
    const status = String(data.get("status"));
    const payload = {
      status,
      ...(data.get("providerReference") ? { providerReference: data.get("providerReference") } : {}),
      ...(status === "BUILT" ? { artifactReference: data.get("artifactReference") } : {}),
      ...(status === "FAILED" ? { failureCode: data.get("failureCode") } : {}),
    };
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/v1/ops/app-builds/${buildJobId}/status`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) return setMessage("Transition rejected. Follow the deterministic build lifecycle.");
    await load(token);
  }
  return (
    <>
      <div className="eyebrow">SB-O-020 · Sprint 7</div>
      <h1>{detail ? `${detail.build.hotelName} · ${detail.build.platform}` : "Build detail"}</h1>
      <p className="lede">Build ID: {buildJobId}</p>
      <form onSubmit={update}>
        <label className="full">
          App Ops access token
          <input name="accessToken" type="password" autoComplete="off" required />
        </label>
        <label>
          Next status
          <select name="status">
            <option>VALIDATING</option>
            <option>BUILDING</option>
            <option>BUILT</option>
            <option>FAILED</option>
            <option>CANCELLED</option>
          </select>
        </label>
        <label>
          Provider reference
          <input name="providerReference" />
        </label>
        <label>
          Artifact reference
          <input name="artifactReference" />
        </label>
        <label>
          Failure code
          <input name="failureCode" pattern="[A-Z][A-Z0-9_]+" />
        </label>
        <button className="button" type="submit">
          Record transition
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={(event) => {
            const form = event.currentTarget.form;
            if (form) void load(String(new FormData(form).get("accessToken")));
          }}
        >
          Load detail
        </button>
      </form>
      <p role="status" className="status-message">
        {message}
      </p>
      {detail ? (
        <>
          <section className="grid">
            <article className="card">
              <span>Status</span>
              <div className="metric">{detail.build.status}</div>
            </article>
            <article className="card">
              <span>Version</span>
              <div className="metric">{detail.build.version}</div>
            </article>
            <article className="card">
              <span>Result</span>
              <p>{detail.build.artifactReference ?? detail.build.failureCode ?? "In progress"}</p>
            </article>
          </section>
          <h2>Append-only status history</h2>
          <ul className="steps">
            {detail.events.map((event) => (
              <li key={event.id}>
                <span>
                  {event.priorStatus ?? "CREATED"} → {event.status}
                </span>
                <span>{new Date(event.occurredAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
