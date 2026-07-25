// Canonical point/mile valuations for TAP.
// Values are DOLLARS-per-point (0.02 = 2.0¢/point).
// User overrides live in user_cpp_overrides.

export type ValuationBasis = {
  programId: string;
  displayName: string;
  cpp: number; // dollars per point (e.g. 0.02 = 2.0¢)
  source: string; // authoritative source URL
  sourceLabel: string; // human label of the source
};

// TPG monthly valuations, retrieved 2026-07-12 for July 2026.
// Face-value cash-back programs are 1¢ by definition, sourced from card terms.
export const VALUATION_SOURCE_LABEL = "The Points Guy monthly valuations, Jul 2026";
export const VALUATION_SOURCE_URL = "https://thepointsguy.com/loyalty-programs/monthly-valuations/";
export const VALUATIONS_VERIFIED_ON = "2026-07-12";

export const POINT_VALUATIONS: Record<string, ValuationBasis> = {
  chase_ur: {
    programId: "chase_ur",
    displayName: "Chase Ultimate Rewards",
    cpp: 0.0205,
    source: VALUATION_SOURCE_URL,
    sourceLabel: VALUATION_SOURCE_LABEL,
  },
  amex_mr: {
    programId: "amex_mr",
    displayName: "Amex Membership Rewards",
    cpp: 0.02,
    source: VALUATION_SOURCE_URL,
    sourceLabel: VALUATION_SOURCE_LABEL,
  },
  capone_miles: {
    programId: "capone_miles",
    displayName: "Capital One Miles",
    cpp: 0.0185,
    source: VALUATION_SOURCE_URL,
    sourceLabel: VALUATION_SOURCE_LABEL,
  },
  citi_typ: {
    programId: "citi_typ",
    displayName: "Citi ThankYou Points",
    cpp: 0.019,
    source: VALUATION_SOURCE_URL,
    sourceLabel: VALUATION_SOURCE_LABEL,
  },
  hyatt_wob: {
    programId: "hyatt_wob",
    displayName: "World of Hyatt",
    cpp: 0.016,
    source: VALUATION_SOURCE_URL,
    sourceLabel: VALUATION_SOURCE_LABEL,
  },
  united_ma: {
    programId: "united_ma",
    displayName: "United MileagePlus",
    cpp: 0.013,
    source: VALUATION_SOURCE_URL,
    sourceLabel: VALUATION_SOURCE_LABEL,
  },
  delta_sky: {
    programId: "delta_sky",
    displayName: "Delta SkyMiles",
    cpp: 0.012,
    source: VALUATION_SOURCE_URL,
    sourceLabel: VALUATION_SOURCE_LABEL,
  },
  bilt: {
    programId: "bilt",
    displayName: "Bilt Rewards",
    cpp: 0.022,
    source: VALUATION_SOURCE_URL,
    sourceLabel: VALUATION_SOURCE_LABEL,
  },
  cashback: {
    programId: "cashback",
    displayName: "Cash back",
    cpp: 0.01,
    source: "Face value (issuer terms)",
    sourceLabel: "face value",
  },
};

export function defaultCpp(programId: string | null | undefined): number {
  if (!programId) return 0.01;
  return POINT_VALUATIONS[programId]?.cpp ?? 0.01;
}
