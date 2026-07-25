// Single source of truth for TAP brand strings.
// Used across routes, meta tags, and UI copy.

export const BRAND_NAME = "TAP";
export const BRAND_TAGLINE = "Know which card to tap, before you tap.";
export const BRAND_TITLE = "TAP — your wallet, optimized.";
export const BRAND_DESCRIPTION = "TAP tells you which card to tap, before you pay.";
export const BRAND_CONTACT_EMAIL = "hello@tapthecard.app";

// Utility: build a route-specific document title as "TAP — [page]"
export const pageTitle = (page: string) => `${BRAND_NAME} — ${page}`;
