import { describe, it, expect, vi } from "vitest";
import {
  haversineMeters,
  parseOverpass,
  requestNearby,
  resolveCandidate,
  type NearbyCandidate,
} from "./nearby";

describe("nearby helpers", () => {
  it("haversine distance is roughly correct", () => {
    // ~111km per degree latitude
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it("parses Overpass elements, sorts by distance, dedupes, caps at limit", () => {
    const origin = { lat: 40.0, lng: -74.0 };
    const el = (name: string, lat: number, lon: number) => ({
      type: "node",
      lat,
      lon,
      tags: { name },
    });
    const json = {
      elements: [
        el("Far Store", 40.01, -74.0),
        el("Close Store", 40.0005, -74.0),
        el("Close Store", 40.0006, -74.0), // dupe by name
        { type: "node", lat: 40, lon: -74, tags: {} }, // no name — skipped
      ],
    };
    const out = parseOverpass(json, origin, 8);
    expect(out.map((c) => c.name)).toEqual(["Close Store", "Far Store"]);
    expect(out[0].distanceMeters).toBeLessThan(out[1].distanceMeters);
  });

  it("resolves 'Sam's Club' candidate to wholesale_clubs via merchantMap", () => {
    const candidate: NearbyCandidate = { name: "Sam's Club", distanceMeters: 40 };
    const m = resolveCandidate(candidate.name);
    expect(m?.category).toBe("wholesale_clubs");
    expect(m?.name).toBe("Sam's Club");
  });

  it("unresolved candidate returns null so the UI can fall back to free text", () => {
    const candidate: NearbyCandidate = {
      name: "Unknown Corner Bodega",
      distanceMeters: 20,
    };
    expect(resolveCandidate(candidate.name)).toBeNull();
  });
});

describe("requestNearby orchestration", () => {
  it("does NOT call the fetcher when geolocation permission is denied", async () => {
    const fetchCandidates = vi.fn(async () => [] as NearbyCandidate[]);
    const getPosition = vi.fn(async () => {
      throw Object.assign(new Error("denied"), { code: 1 });
    });
    const result = await requestNearby({ getPosition, fetchCandidates });
    expect(result).toEqual({ ok: false, error: "denied" });
    expect(fetchCandidates).not.toHaveBeenCalled();
  });

  it("returns candidates on the happy path", async () => {
    const candidates: NearbyCandidate[] = [
      { name: "Sam's Club", distanceMeters: 40 },
      { name: "Starbucks", distanceMeters: 80 },
    ];
    const result = await requestNearby({
      getPosition: async () => ({ lat: 1, lng: 2 }),
      fetchCandidates: async () => candidates,
    });
    expect(result).toEqual({ ok: true, candidates });
  });

  it("returns empty error when the fetcher returns []", async () => {
    const result = await requestNearby({
      getPosition: async () => ({ lat: 1, lng: 2 }),
      fetchCandidates: async () => [],
    });
    expect(result).toEqual({ ok: false, error: "empty" });
  });

  it("returns unavailable when the fetcher throws", async () => {
    const result = await requestNearby({
      getPosition: async () => ({ lat: 1, lng: 2 }),
      fetchCandidates: async () => {
        throw new Error("boom");
      },
    });
    expect(result).toEqual({ ok: false, error: "unavailable" });
  });

  it("times out when geolocation hangs", async () => {
    const fetchCandidates = vi.fn();
    const result = await requestNearby({
      getPosition: () => new Promise(() => {}),
      fetchCandidates,
      timeoutMs: 20,
    });
    expect(result).toEqual({ ok: false, error: "timeout" });
    expect(fetchCandidates).not.toHaveBeenCalled();
  });
});
