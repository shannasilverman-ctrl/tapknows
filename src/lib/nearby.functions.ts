// Server function for the "Near me" flow. Fetches nearby named commercial
// POIs from Overpass, falls back to Nominatim reverse geocode for a
// locality-name candidate. Caches per rounded coordinate for 5 minutes to
// respect Overpass/Nominatim rate limits. No location data is persisted.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseOverpass, type NearbyCandidate } from "./nearby";

const UA = "TAP-Planner/1.0 (+https://tapknows.com; nearby-merchants)";
const TTL_MS = 5 * 60 * 1000;

type CacheEntry = { at: number; value: NearbyCandidate[] };
const cache = new Map<string, CacheEntry>();

function cacheKey(lat: number, lng: number) {
  // ~110m grid at the equator — matches Overpass ~200m radius intent
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

const InputSchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
});

export const fetchNearbyMerchantsFn = createServerFn({ method: "POST" })
  .inputValidator((data) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const key = cacheKey(data.lat, data.lng);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) {
      return { candidates: hit.value };
    }

    const candidates = await queryOverpass(data.lat, data.lng);
    if (candidates.length > 0) {
      cache.set(key, { at: Date.now(), value: candidates });
      return { candidates };
    }

    // Fallback: reverse-geocode for a locality label so the UI still has
    // something to show.
    const locality = await reverseGeocode(data.lat, data.lng);
    const fallback: NearbyCandidate[] = locality ? [{ name: locality, distanceMeters: 0 }] : [];
    cache.set(key, { at: Date.now(), value: fallback });
    return { candidates: fallback };
  });

async function queryOverpass(lat: number, lng: number): Promise<NearbyCandidate[]> {
  const radius = 200;
  // Named commercial POIs only — filter for name or brand tag.
  const q = `
[out:json][timeout:8];
(
  nwr(around:${radius},${lat},${lng})[shop][name];
  nwr(around:${radius},${lat},${lng})[amenity~"^(fuel|restaurant|cafe|fast_food|bar|pub|pharmacy)$"][name];
  nwr(around:${radius},${lat},${lng})[tourism=hotel][name];
);
out center 30;
  `.trim();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9_000);
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA,
      },
      body: `data=${encodeURIComponent(q)}`,
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const json = (await res.json()) as Parameters<typeof parseOverpass>[0];
    return parseOverpass(json, { lat, lng }, 8);
  } catch (e) {
    console.error("[nearby] overpass failed", e);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      address?: Record<string, string>;
      name?: string;
    };
    const a = json.address ?? {};
    return json.name || a.neighbourhood || a.suburb || a.village || a.town || a.city || null;
  } catch (e) {
    console.error("[nearby] nominatim failed", e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
