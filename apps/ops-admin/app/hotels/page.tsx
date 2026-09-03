"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type HotelSummary = {
  id: string;
  displayName: string;
  status: string;
  roomCount: number;
  appStatus: string | null;
};

export default function HotelDirectory() {
  const [hotels, setHotels] = useState<HotelSummary[]>([]);
  const [message, setMessage] = useState("Load the live directory with an authorized Staff token.");

  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = String(new FormData(event.currentTarget).get("accessToken"));
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/v1/ops/hotels`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) {
      setMessage("Could not load the directory. Check your access token.");
      return;
    }
    setHotels((await response.json()) as HotelSummary[]);
    setMessage("");
  }

  return (
    <>
      <div className="eyebrow">SB-O-003 · Sprint 6</div>
      <h1>Hotel directory</h1>
      <p className="lede">Tenant, room, app and onboarding status from the platform API.</p>
      <form onSubmit={load}>
        <label>
          Staff access token
          <input name="accessToken" type="password" autoComplete="off" required />
        </label>
        <button className="button" type="submit">
          Load directory
        </button>
      </form>
      <p role="status" className="status-message">
        {message}
      </p>
      <table>
        <thead>
          <tr>
            <th>Hotel</th>
            <th>Status</th>
            <th>Rooms</th>
            <th>App</th>
          </tr>
        </thead>
        <tbody>
          {hotels.map((hotel) => (
            <tr key={hotel.id}>
              <td>
                <Link href={`/hotels/${hotel.id}`}>{hotel.displayName}</Link>
              </td>
              <td>{hotel.status}</td>
              <td>{hotel.roomCount}</td>
              <td>{hotel.appStatus ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 24 }}>
        <Link className="button" href="/hotels/new">
          Create hotel
        </Link>
      </p>
    </>
  );
}
