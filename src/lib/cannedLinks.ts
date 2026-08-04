export const COMBO_VERSION = 1 as const;

export type ComboMode = "child" | "parents";

/**
 * Lightweight “canned link” payload for parent/child lookup results.
 * Stored in the URL hash so it works without any backend state.
 */
export type ComboPayloadV1 = {
  v: typeof COMBO_VERSION;
  mode: ComboMode;
  /** child mode */
  a?: string;
  b?: string;
  /** parents mode */
  t?: string;
};

function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  const b64 =
    typeof btoa === "function"
      ? btoa(bin)
      : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const b64 = padded + pad;
  if (typeof atob === "function") {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(b64, "base64").toString("utf8");
}

function compactComboPayload(payload: ComboPayloadV1): ComboPayloadV1 {
  const out: ComboPayloadV1 = { v: 1, mode: payload.mode };
  if (payload.mode === "child") {
    if (payload.a?.trim()) out.a = payload.a.trim();
    if (payload.b?.trim()) out.b = payload.b.trim();
  } else {
    if (payload.t?.trim()) out.t = payload.t.trim();
  }
  return out;
}

export function encodeComboPayload(payload: ComboPayloadV1): string {
  return encodeBase64Url(JSON.stringify(compactComboPayload(payload)));
}

export function buildComboHash(payload: ComboPayloadV1): string {
  return `#combo=${encodeComboPayload(payload)}`;
}

export function buildComboUrl(
  payload: ComboPayloadV1,
  origin?: string,
): string {
  const hash = buildComboHash(payload);
  if (origin) return `${origin.replace(/\/$/, "")}/${hash}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/${hash}`;
  }
  return hash;
}

export function parseComboFromLocation(hash: string): ComboPayloadV1 | null {
  try {
    const hashBody = hash.startsWith("#") ? hash.slice(1) : hash;
    const hashParams = new URLSearchParams(hashBody);
    const raw = hashParams.get("combo");
    if (!raw) return null;

    const parsed = JSON.parse(decodeBase64Url(raw)) as ComboPayloadV1;
    if (!parsed || parsed.v !== 1) return null;
    if (parsed.mode !== "child" && parsed.mode !== "parents") return null;

    if (parsed.mode === "child") {
      if (typeof parsed.a !== "string" || !parsed.a.trim()) return null;
      if (typeof parsed.b !== "string" || !parsed.b.trim()) return null;
    } else {
      if (typeof parsed.t !== "string" || !parsed.t.trim()) return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

