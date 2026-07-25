// Pure, testable helpers for the "Near me" flow.
// The server-side fetch lives in `nearby.functions.ts`. This module
// owns geolocation orchestration, distance math, Overpass parsing, and
// the merchantMap resolution path so the UI can stay dumb.

import { resolveMerchant, type MerchantEntry } from "./merchantMap";

export type NearbyCandidate = {
  name: string;
  distanceMeters: number;
  brand?: string | null;
};

export type NearbyError = "denied" | "timeout" | "unavailable" | "empty";

export type NearbyResult =
  | { ok: true; candidates: NearbyCandidate[] }
  | { ok: false; error: NearbyError };

// ---------- distance ----------

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

// ---------- Overpass parsing ----------

type OverpassElement = {
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export function parseOverpass(
  json: { elements?: OverpassElement[] } | null | undefined,
  origin: { lat: number; lng: number },
  limit = 8,
): NearbyCandidate[] {
  const els = json?.elements ?? [];
  const seen = new Set<string>();
  const out: NearbyCandidate[] = [];
  for (const el of els) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    const tags = el.tags ?? {};
    const name = tags.brand ?? tags.name;
    if (!name || lat == null || lon == null) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      brand: tags.brand ?? null,
      distanceMeters: haversineMeters(origin, { lat, lng: lon }),
    });
  }
  out.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return out.slice(0, limit);
}

// ---------- candidate → merchant ----------

export function resolveCandidate(name: string): MerchantEntry | null {
  return resolveMerchant(name);
}

// ---------- orchestrator ----------

// Injectable geolocation + fetcher so the flow is testable without a real
// browser or network. Guarantees: `fetchCandidates` is only invoked when
// `getPosition` resolves. Permission denial short-circuits BEFORE any
// server call.

export type GetPositionFn = () => Promise<{ lat: number; lng: number }>;
export type FetchCandidatesFn = (coords: {
  lat: number;
  lng: number;
}) => Promise<NearbyCandidate[]>;

export async function requestNearby(opts: {
  getPosition: GetPositionFn;
  fetchCandidates: FetchCandidatesFn;
  timeoutMs?: number;
}): Promise<NearbyResult> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  let coords: { lat: number; lng: number };
  try {
    coords = await withTimeout(opts.getPosition(), timeoutMs);
  } catch (e) {
    const err = classifyGeoError(e);
    return { ok: false, error: err };
  }
  try {
    const candidates = await withTimeout(opts.fetchCandidates(coords), timeoutMs);
    if (candidates.length === 0) return { ok: false, error: "empty" };
    return { ok: true, candidates };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

function classifyGeoError(e: unknown): NearbyError {
  if (!e || typeof e !== "object") return "unavailable";
  const code = (e as { code?: number }).code;
  // GeolocationPositionError codes: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
  if (code === 1) return "denied";
  if (code === 3) return "timeout";
  const name = (e as { name?: string }).name;
  if (name === "TimeoutError") return "timeout";
  return "unavailable";
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      const err = new Error("timeout");
      (err as { name: string }).name = "TimeoutError";
      reject(err);
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// Standard browser geolocation wrapper. Kept here so the UI stays thin.
export function browserGetPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(Object.assign(new Error("unavailable"), { code: 2 }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 9_000, maximumAge: 60_000 },
    );
  });
}
