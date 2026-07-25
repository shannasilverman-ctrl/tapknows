// Map issuer + product name to a face-tint class defined in styles.css,
// plus a finish-tier modifier ("cs-face--metal") for premium metal cards.
// Amex is special: Gold / Platinum / Green have distinct visual traditions.
export function issuerFaceClass(issuer: string, name: string = ""): string {
  const iss = issuer.toLowerCase();
  const prod = name.toLowerCase();
  const tint = pickTint(iss, prod);
  const metal = isMetalTier(iss, prod);
  return metal ? `${tint} cs-face--metal` : tint;
}

function pickTint(iss: string, prod: string): string {
  if (iss.includes("american express") || iss === "amex") {
    if (prod.includes("gold")) return "cs-face--amex-gold";
    if (prod.includes("platinum")) return "cs-face--amex-plat";
    return "cs-face--amex";
  }
  if (iss.includes("chase")) {
    if (prod.includes("sapphire reserve")) return "cs-face--chase-reserve";
    return "cs-face--chase";
  }
  if (iss.includes("citi")) return "cs-face--citi";
  if (iss.includes("capital one")) return "cs-face--capitalone";
  if (iss.includes("bank of america")) return "cs-face--bofa";
  if (iss.includes("discover")) return "cs-face--discover";
  if (iss.includes("wells")) return "cs-face--wells";
  if (iss.includes("us bank")) return "cs-face--usbank";
  if (iss.includes("bilt")) return "cs-face--bilt";
  return "cs-face--default";
}

/** True for products that are physically metal in the real world. */
function isMetalTier(iss: string, prod: string): boolean {
  if (iss.includes("american express") || iss === "amex") {
    if (prod.includes("gold") || prod.includes("platinum")) return true;
  }
  if (iss.includes("chase") && prod.includes("sapphire reserve")) return true;
  if (iss.includes("capital one") && prod.includes("venture x")) return true;
  if (iss.includes("bilt")) return true; // Bilt is metal
  return false;
}
