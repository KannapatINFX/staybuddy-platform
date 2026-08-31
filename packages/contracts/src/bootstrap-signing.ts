import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import type { BootstrapManifest } from "./index.js";

ed.hashes.sha512 = sha512;

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function signBootstrapManifest(manifest: BootstrapManifest, privateKeyHex: string) {
  const privateKey = ed.etc.hexToBytes(privateKeyHex);
  return {
    manifest,
    signature: ed.etc.bytesToHex(ed.sign(new TextEncoder().encode(canonicalJson(manifest)), privateKey)),
    algorithm: "Ed25519" as const,
  };
}

export function verifyBootstrapManifest(
  signed: { manifest: BootstrapManifest; signature: string; algorithm: "Ed25519" },
  publicKeyHex: string,
): boolean {
  return ed.verify(
    ed.etc.hexToBytes(signed.signature),
    new TextEncoder().encode(canonicalJson(signed.manifest)),
    ed.etc.hexToBytes(publicKeyHex),
  );
}

export function deriveBootstrapPublicKey(privateKeyHex: string): string {
  return ed.etc.bytesToHex(ed.getPublicKey(ed.etc.hexToBytes(privateKeyHex)));
}
