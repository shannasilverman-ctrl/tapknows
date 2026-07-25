// Card benefits catalog.
//
// HONESTY RULE: only include benefits that were verified against the live
// issuer product page cited in `source`. A card with no verifiable benefit
// has an empty array — that is correct. Standing benefits (protections,
// memberships) have value_cents null and never enter money math.
//
// Verification pass (2026-07-17): every redeemable-credit entry was confirmed
// by fetching the URL in `source`. Standing protections/memberships pass
// (2026-07-18): each `standing` entry with `group`/`terms`/`verified_on` was
// confirmed against the issuer product page at `source_url`. Cards without
// verified protection data have no standing entries — that is correct.

export type BenefitCadence = "monthly" | "quarterly" | "semiannual" | "annual" | "one-time";

export type BenefitKind = "redeemable" | "standing";

// Standing benefits are reference only — never redeemable, never enter money
// math. Group tag drives the section they appear in on the card detail.
export type BenefitGroup = "protection" | "travel" | "purchase" | "membership";

export type CardBenefit = {
  id: string;
  card_catalog_id: string;
  label: string;
  kind: BenefitKind;
  cadence: BenefitCadence;
  value_cents: number | null;
  merchants?: string[];
  categories?: string[];
  source: string;
  note?: string;
  // Standing-benefit display fields. Optional so existing redeemable entries
  // stay valid. When present, the UI uses `title` + `summary` in the row and
  // `terms` + `coverage_cap` inside the detail sheet.
  group?: BenefitGroup;
  title?: string;
  summary?: string;
  terms?: string;
  coverage_cap?: string;
  source_url?: string;
  verified_on?: string;
};

export const BENEFITS: CardBenefit[] = [
  // ── American Express Gold ────────────────────────────────────────────────
  {
    id: "amex_gold_uber_cash",
    card_catalog_id: "amex_gold",
    label: "$10 monthly Uber Cash",
    kind: "redeemable",
    cadence: "monthly",
    value_cents: 1000,
    merchants: ["local_uber", "local_uber_eats", "uber"],
    source: "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
    note: "Add your Gold Card to your Uber account.",
  },
  {
    id: "amex_gold_dining_credit",
    card_catalog_id: "amex_gold",
    label: "$10 monthly dining credit",
    kind: "redeemable",
    cadence: "monthly",
    value_cents: 1000,
    merchants: [
      "grubhub",
      "seamless",
      "buffalo wild wings",
      "five guys",
      "cheesecake factory",
      "wonder",
    ],
    source: "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
    note: "Enrollment required. Grubhub/Seamless, Buffalo Wild Wings, Five Guys, The Cheesecake Factory, Wonder.",
  },
  {
    id: "amex_gold_resy",
    card_catalog_id: "amex_gold",
    label: "$100 annual Resy credit",
    kind: "redeemable",
    cadence: "semiannual",
    value_cents: 5000,
    merchants: ["resy"],
    source: "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
    note: "Up to $50 in statement credits Jan–Jun and Jul–Dec at U.S. Resy restaurants.",
  },
  {
    id: "amex_gold_dunkin",
    card_catalog_id: "amex_gold",
    label: "$7 monthly Dunkin' credit",
    kind: "redeemable",
    cadence: "monthly",
    value_cents: 700,
    merchants: ["local_dunkin", "dunkin"],
    source: "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
    note: "Enrollment required.",
  },

  // ── American Express Platinum ────────────────────────────────────────────
  {
    id: "amex_plat_uber_cash",
    card_catalog_id: "amex_platinum",
    label: "$15 monthly Uber Cash",
    kind: "redeemable",
    cadence: "monthly",
    value_cents: 1500,
    merchants: ["local_uber", "local_uber_eats", "uber"],
    source: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    note: "Bonus $20 in December. Add Platinum as an Uber payment method.",
  },
  {
    id: "amex_plat_digital_ent",
    card_catalog_id: "amex_platinum",
    label: "$25 monthly digital entertainment credit",
    kind: "redeemable",
    cadence: "monthly",
    value_cents: 2500,
    merchants: [
      "peacock",
      "nyt",
      "new york times",
      "disney+",
      "hulu",
      "espn+",
      "wall street journal",
      "wsj",
    ],
    source: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    note: "Enrollment required. $300 annual across participating partners.",
  },
  {
    id: "amex_plat_resy",
    card_catalog_id: "amex_platinum",
    label: "$100 quarterly Resy credit",
    kind: "redeemable",
    cadence: "quarterly",
    value_cents: 10000,
    merchants: ["resy"],
    source: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    note: "$400 annual, disbursed quarterly. Enrollment required.",
  },
  {
    id: "amex_plat_hotel",
    card_catalog_id: "amex_platinum",
    label: "$300 semiannual hotel credit",
    kind: "redeemable",
    cadence: "semiannual",
    value_cents: 30000,
    merchants: ["amex travel", "fine hotels + resorts", "hotel collection"],
    categories: ["hotels", "travel_portal"],
    source: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    note: "Prepaid Fine Hotels + Resorts or Hotel Collection bookings via Amex Travel.",
  },
  {
    id: "amex_plat_airline_fee",
    card_catalog_id: "amex_platinum",
    label: "$200 annual airline fee credit",
    kind: "redeemable",
    cadence: "annual",
    value_cents: 20000,
    categories: ["flights"],
    source: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    note: "Incidental fees on one selected qualifying airline.",
  },
  {
    id: "amex_plat_uber_one",
    card_catalog_id: "amex_platinum",
    label: "$120 annual Uber One credit",
    kind: "redeemable",
    cadence: "annual",
    value_cents: 12000,
    merchants: ["uber one"],
    source: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    note: "Auto-renewing Uber One membership purchased with the card.",
  },
  {
    id: "amex_plat_clear",
    card_catalog_id: "amex_platinum",
    label: "$219 annual CLEAR+ credit",
    kind: "redeemable",
    cadence: "annual",
    value_cents: 21900,
    merchants: ["clear", "clear+"],
    source: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
  },
  {
    id: "amex_plat_walmart",
    card_catalog_id: "amex_platinum",
    label: "$12.95 monthly Walmart+ credit",
    kind: "redeemable",
    cadence: "monthly",
    value_cents: 1295,
    merchants: ["walmart+", "walmart plus"],
    source: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    note: "Monthly Walmart+ membership fee (auto-renewing).",
  },
  // ── American Express Platinum — standing (verified 2026-07-18) ──────────
  {
    id: "amex_plat_lounges",
    card_catalog_id: "amex_platinum",
    label: "Global Lounge Collection",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    group: "travel",
    title: "Global Lounge Collection",
    summary: "Access to 1,550+ airport lounges worldwide.",
    terms:
      "Access to Centurion Lounges, 10 Delta Sky Club visits per year when flying on an eligible Delta flight, Priority Pass Select membership (enrollment required), and other select partner lounges.",
    source_url: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    verified_on: "2026-07-18",
  },
  {
    id: "amex_plat_global_entry",
    card_catalog_id: "amex_platinum",
    label: "Global Entry / TSA PreCheck credit",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    group: "travel",
    title: "Global Entry or TSA PreCheck fee credit",
    summary: "Statement credit for the application fee.",
    terms:
      "Statement credit every 4 years after you apply for Global Entry ($120), or every 5 years for TSA PreCheck (up to $85 through a TSA PreCheck official enrollment provider), when the fee is paid with the Platinum Card.",
    coverage_cap: "$120 every 4 years",
    source_url: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    verified_on: "2026-07-18",
  },
  {
    id: "amex_plat_no_fx",
    card_catalog_id: "amex_platinum",
    label: "No foreign transaction fees",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    group: "travel",
    title: "No foreign transaction fees",
    summary: "Nothing extra on purchases made abroad.",
    terms:
      "American Express charges no foreign transaction fee on purchases made outside the United States with the Platinum Card.",
    source_url: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    verified_on: "2026-07-18",
  },
  {
    id: "amex_plat_global_assist",
    card_catalog_id: "amex_platinum",
    label: "Premium Global Assist Hotline",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    group: "travel",
    title: "Premium Global Assist Hotline",
    summary: "24/7 travel assistance when you are 100+ miles from home.",
    terms:
      "24/7 emergency assistance and coordination services — medical, legal, and financial referrals — whenever you travel more than 100 miles from home. Emergency medical transportation assistance may be provided at no cost only if approved and coordinated by Premium Global Assist Hotline. Card Members may be responsible for third-party service costs.",
    source_url: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    verified_on: "2026-07-18",
  },
  {
    id: "amex_plat_car_rental_privileges",
    card_catalog_id: "amex_platinum",
    label: "Car rental privileges: Avis, Hertz, National",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    group: "travel",
    title: "Car rental status: Avis, Hertz, National",
    summary: "Complimentary premium status with three rental programs.",
    terms:
      "Complimentary premium status with Avis, Hertz, and National for Platinum Card Members. Enrollment required through your American Express online account. Terms and limitations apply.",
    source_url: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    verified_on: "2026-07-18",
  },
  {
    id: "amex_plat_purchase_protection",
    card_catalog_id: "amex_platinum",
    label: "Purchase Protection",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    group: "purchase",
    title: "Purchase Protection",
    summary: "Covers accidental damage, theft, or loss for 90 days.",
    terms:
      "Covered Purchases charged to your Eligible Card are protected for up to 90 days from the Covered Purchase date against accidental damage, theft, or loss.",
    coverage_cap: "Up to $10,000 per purchase, up to $50,000 per calendar year",
    source_url: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    verified_on: "2026-07-18",
  },
  {
    id: "amex_plat_extended_warranty",
    card_catalog_id: "amex_platinum",
    label: "Extended Warranty",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    group: "purchase",
    title: "Extended Warranty",
    summary: "Adds up to one extra year to the manufacturer's warranty.",
    terms:
      "For Covered Purchases charged to an Eligible Card, adds up to one additional year to the Original Manufacturer's Warranty on warranties of 5 years or less.",
    coverage_cap:
      "Up to the amount charged, max $10,000 per item and $50,000 per Card Member account per calendar year",
    source_url: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    verified_on: "2026-07-18",
  },
  {
    id: "amex_plat_return_protection",
    card_catalog_id: "amex_platinum",
    label: "Return Protection",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    group: "purchase",
    title: "Return Protection",
    summary: "Refund on eligible items if the seller won't take them back.",
    terms:
      "American Express may refund the full purchase price (excluding shipping and handling) on eligible items the seller won't accept for return within 90 days of the date of purchase. Purchases must be made in the U.S. or its territories, entirely on an eligible Amex Card.",
    coverage_cap: "Up to $300 per item, up to $1,000 per calendar year per Card account",
    source_url: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    verified_on: "2026-07-18",
  },
  {
    id: "amex_plat_cell_phone",
    card_catalog_id: "amex_platinum",
    label: "Cell Phone Protection",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    group: "protection",
    title: "Cell Phone Protection",
    summary: "Repair or replacement if your phone is damaged or stolen.",
    terms:
      "Reimburses the lesser of the cost to repair or replace your damaged or stolen cell phone, when the wireless bill for that line was paid in the prior month by an Eligible Card Account. Two approved claims per 12-month period. $50 deductible per approved claim. Coverage provided by New Hampshire Insurance Company, an AIG Company.",
    coverage_cap: "Up to $800 per claim, 2 claims per 12 months, $50 deductible",
    source_url: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    verified_on: "2026-07-18",
  },

  // ── American Express Gold — standing (verified 2026-07-18) ──────────────
  {
    id: "amex_gold_trip_delay",
    card_catalog_id: "amex_gold",
    label: "Trip Delay Insurance",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
    group: "travel",
    title: "Trip Delay Insurance",
    summary: "Reimbursement when a covered delay exceeds 12 hours.",
    terms:
      "If a round-trip is paid for entirely with your Eligible Card and a covered reason delays your trip more than 12 hours, Trip Delay Insurance can reimburse certain additional expenses purchased on the same Eligible Card. Coverage provided by New Hampshire Insurance Company, an AIG Company.",
    coverage_cap: "Up to $300 per trip, 2 claims per Eligible Card per 12 consecutive months",
    source_url: "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
    verified_on: "2026-07-18",
  },
  {
    id: "amex_gold_baggage",
    card_catalog_id: "amex_gold",
    label: "Baggage Insurance Plan",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
    group: "travel",
    title: "Baggage Insurance Plan",
    summary: "Coverage for lost, damaged, or stolen baggage.",
    terms:
      "When the entire common carrier ticket (plane, train, ship, or bus) is purchased on an Eligible Card, coverage is provided for lost, damaged, or stolen baggage in excess of coverage provided by the common carrier. For New York State residents, a $10,000 aggregate maximum applies for all Covered Persons per Covered Trip.",
    coverage_cap: "Up to $1,250 carry-on and $500 checked baggage per Covered Person",
    source_url: "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
    verified_on: "2026-07-18",
  },
  {
    id: "amex_gold_car_rental",
    card_catalog_id: "amex_gold",
    label: "Car Rental Loss and Damage Insurance",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
    group: "travel",
    title: "Car Rental Loss and Damage Insurance",
    summary: "Secondary coverage when you decline the rental company's CDW.",
    terms:
      "When you use your Eligible Card to reserve and pay for the entire rental and decline the collision damage waiver at the rental counter, coverage is provided for damage to or theft of a Rental Vehicle in a Covered Territory. Secondary coverage; does not include liability. Not available for rentals in Australia, Italy, or New Zealand.",
    source_url: "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
    verified_on: "2026-07-18",
  },
  {
    id: "amex_gold_global_assist",
    card_catalog_id: "amex_gold",
    label: "Global Assist Hotline",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
    group: "travel",
    title: "Global Assist Hotline",
    summary: "24/7 assistance when you are 100+ miles from home.",
    terms:
      "24/7 emergency assistance and coordination services — medical and legal referrals, emergency cash wires, and missing luggage assistance — whenever you travel more than 100 miles from home. Card Members are responsible for third-party service costs.",
    source_url: "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
    verified_on: "2026-07-18",
  },
  {
    id: "amex_gold_no_fx",
    card_catalog_id: "amex_gold",
    label: "No foreign transaction fees",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
    group: "travel",
    title: "No foreign transaction fees",
    summary: "Nothing extra on purchases made abroad.",
    terms:
      "American Express charges no foreign transaction fee on purchases made outside the United States with the Gold Card.",
    source_url: "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
    verified_on: "2026-07-18",
  },
  {
    id: "amex_gold_purchase_protection",
    card_catalog_id: "amex_gold",
    label: "Purchase Protection",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
    group: "purchase",
    title: "Purchase Protection",
    summary: "Covers accidental damage, theft, or loss for 90 days.",
    terms:
      "Covered Purchases charged to your Eligible Card are protected for up to 90 days from the Covered Purchase date against accidental damage, theft, or loss.",
    coverage_cap: "Up to $10,000 per purchase, up to $50,000 per calendar year",
    source_url: "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
    verified_on: "2026-07-18",
  },
  {
    id: "amex_gold_extended_warranty",
    card_catalog_id: "amex_gold",
    label: "Extended Warranty",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
    group: "purchase",
    title: "Extended Warranty",
    summary: "Adds up to one extra year to the manufacturer's warranty.",
    terms:
      "For Covered Purchases charged to an Eligible Card, adds up to one additional year to the Original Manufacturer's Warranty on warranties of 5 years or less.",
    coverage_cap:
      "Up to the amount charged, max $10,000 per item and $50,000 per Card Member account per calendar year",
    source_url: "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
    verified_on: "2026-07-18",
  },

  // ── Capital One Venture X ────────────────────────────────────────────────
  {
    id: "capone_vx_travel_credit",
    card_catalog_id: "capone_venture_x",
    label: "$300 annual Capital One Travel credit",
    kind: "redeemable",
    cadence: "annual",
    value_cents: 30000,
    merchants: ["capital one travel"],
    categories: ["travel_portal"],
    source: "https://www.capitalone.com/credit-cards/venture-x/",
    note: "Bookings made through Capital One Travel.",
  },
  {
    id: "capone_vx_priority_pass",
    card_catalog_id: "capone_venture_x",
    label: "Priority Pass lounge access",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.capitalone.com/credit-cards/venture-x/",
    group: "travel",
    title: "Priority Pass lounge access",
    summary: "Complimentary access to 1,300+ lounges worldwide.",
    terms:
      "Venture X primary cardholders can enjoy access to 1,300+ participating Priority Pass lounges worldwide.",
    source_url: "https://www.capitalone.com/credit-cards/venture-x/",
    verified_on: "2026-07-18",
  },
  {
    id: "capone_vx_capital_one_lounges",
    card_catalog_id: "capone_venture_x",
    label: "Capital One Lounges",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.capitalone.com/credit-cards/venture-x/",
    group: "travel",
    title: "Capital One Lounges",
    summary: "Access to Capital One Lounge and Landing locations.",
    terms:
      "Venture X primary cardholders can enjoy access to Capital One Lounge and Landing locations.",
    source_url: "https://www.capitalone.com/credit-cards/venture-x/",
    verified_on: "2026-07-18",
  },
  {
    id: "capone_vx_cell_phone",
    card_catalog_id: "capone_venture_x",
    label: "Cell Phone Protection",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.capitalone.com/credit-cards/venture-x/",
    group: "protection",
    title: "Cell Phone Protection",
    summary: "Reimbursement if your phone is stolen or damaged.",
    terms:
      "Protects your cell phone when you pay your monthly wireless bill with your Venture X card. If it's stolen or damaged, you're reimbursed. Certain terms, conditions, and exclusions apply.",
    coverage_cap: "Up to $800",
    source_url: "https://www.capitalone.com/credit-cards/venture-x/",
    verified_on: "2026-07-18",
  },
  {
    id: "capone_vx_no_fx",
    card_catalog_id: "capone_venture_x",
    label: "No foreign transaction fees",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.capitalone.com/credit-cards/venture-x/",
    group: "travel",
    title: "No foreign transaction fees",
    summary: "Nothing extra on purchases outside the U.S.",
    terms:
      "No transaction fee when making purchases outside the United States with the Venture X card.",
    source_url: "https://www.capitalone.com/credit-cards/venture-x/",
    verified_on: "2026-07-18",
  },

  // ── Chase Sapphire Preferred ─────────────────────────────────────────────
  {
    id: "chase_csp_hotel_credit",
    card_catalog_id: "chase_csp",
    label: "$100 annual Chase Travel hotel credit",
    kind: "redeemable",
    cadence: "annual",
    value_cents: 10000,
    merchants: ["chase travel"],
    categories: ["hotels", "travel_portal"],
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred",
    note: "Hotel stays purchased through Chase Travel.",
  },
  {
    id: "chase_csp_dashpass",
    card_catalog_id: "chase_csp",
    label: "Complimentary DashPass",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred",
    group: "membership",
    title: "Complimentary DashPass",
    summary: "12 months of DashPass on DoorDash and Caviar.",
    terms:
      "Complimentary 12-month DashPass membership when activated by 12/31/27. DashPass provides $0 delivery fees and reduced service fees on eligible DoorDash and Caviar orders.",
    source_url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred",
    verified_on: "2026-07-18",
  },

  // ── Chase Sapphire Reserve ───────────────────────────────────────────────
  {
    id: "chase_csr_travel_credit",
    card_catalog_id: "chase_csr",
    label: "$300 annual travel credit",
    kind: "redeemable",
    cadence: "annual",
    value_cents: 30000,
    categories: ["travel", "travel_portal", "flights", "hotels", "transit"],
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    note: "Applies to a broad range of travel purchases automatically.",
  },
  {
    id: "chase_csr_edit_hotel",
    card_catalog_id: "chase_csr",
    label: "$500 annual The Edit hotel credit",
    kind: "redeemable",
    cadence: "semiannual",
    value_cents: 25000,
    merchants: ["the edit", "chase travel"],
    categories: ["hotels", "travel_portal"],
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    note: "$250 per prepaid Edit booking, up to $500 annually. Two-night minimum.",
  },
  {
    id: "chase_csr_dining_credit",
    card_catalog_id: "chase_csr",
    label: "$300 annual dining credit",
    kind: "redeemable",
    cadence: "semiannual",
    value_cents: 15000,
    merchants: ["opentable", "sapphire exclusive tables"],
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    note: "$150 semiannual at Sapphire Exclusive Tables restaurants on OpenTable.",
  },
  {
    id: "chase_csr_dashpass",
    card_catalog_id: "chase_csr",
    label: "$10 monthly DoorDash restaurant credit",
    kind: "redeemable",
    cadence: "monthly",
    value_cents: 1000,
    merchants: ["local_doordash", "doordash"],
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    note: "$5 monthly restaurant promo + two $10 grocery/retail promos. Through 12/31/27.",
  },
  {
    id: "chase_csr_lyft",
    card_catalog_id: "chase_csr",
    label: "$10 monthly Lyft credit",
    kind: "redeemable",
    cadence: "monthly",
    value_cents: 1000,
    merchants: ["lyft"],
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    note: "In-app Lyft credit through 9/30/27.",
  },
  // ── Chase Sapphire Reserve — standing (verified 2026-07-18) ─────────────
  {
    id: "chase_csr_lounges",
    card_catalog_id: "chase_csr",
    label: "Sapphire Reserve Lounge Network",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    group: "travel",
    title: "Airport lounge access",
    summary: "Sapphire Lounges by The Club plus 1,300+ Priority Pass lounges.",
    terms:
      "Complimentary access to Chase Sapphire Lounges by The Club and 1,300+ Priority Pass airport lounges worldwide, with up to two complimentary guests. Includes select Air Canada Maple Leaf Lounges and Air Canada Cafés in the U.S., Canada, and Europe with an eligible boarding pass.",
    source_url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    verified_on: "2026-07-18",
  },
  {
    id: "chase_csr_global_entry",
    card_catalog_id: "chase_csr",
    label: "Global Entry, TSA PreCheck, or NEXUS fee credit",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    group: "travel",
    title: "Global Entry, TSA PreCheck, or NEXUS fee credit",
    summary: "Statement credit for the application fee.",
    terms:
      "One statement credit as reimbursement for the Global Entry, TSA PreCheck, or NEXUS application fee charged to your card.",
    coverage_cap: "Up to $120 every 4 years",
    source_url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    verified_on: "2026-07-18",
  },
  {
    id: "chase_csr_ihg_status",
    card_catalog_id: "chase_csr",
    label: "IHG One Rewards Platinum Elite Status",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    group: "membership",
    title: "IHG One Rewards Platinum Elite Status",
    summary: "Complimentary hotel elite status through 12/31/27.",
    terms:
      "Complimentary IHG One Rewards Platinum Elite Status with your Sapphire Reserve card through December 31, 2027.",
    source_url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    verified_on: "2026-07-18",
  },
  {
    id: "chase_csr_auto_rental",
    card_catalog_id: "chase_csr",
    label: "Auto Rental Collision Damage Waiver",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    group: "travel",
    title: "Auto Rental Collision Damage Waiver",
    summary: "Primary coverage for theft and collision damage.",
    terms:
      "Decline the rental company's collision insurance and charge the entire rental cost to your card. Primary coverage for most rental vehicles in the U.S. and abroad. New York residents: inside the U.S., coverage is secondary to your personal automobile insurance.",
    coverage_cap: "Up to $75,000 for theft and collision damage",
    source_url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    verified_on: "2026-07-18",
  },
  {
    id: "chase_csr_trip_cancellation",
    card_catalog_id: "chase_csr",
    label: "Trip Cancellation and Interruption Insurance",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    group: "travel",
    title: "Trip Cancellation and Interruption Insurance",
    summary: "Reimbursement for prepaid, non-refundable expenses.",
    terms:
      "If your trip is canceled or cut short by sickness, severe weather, or other covered situations, reimbursement for pre-paid, non-refundable travel expenses including passenger fares, tours, and hotels.",
    coverage_cap: "Up to $10,000 per covered traveler and $20,000 per trip",
    source_url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    verified_on: "2026-07-18",
  },
  {
    id: "chase_csr_trip_delay",
    card_catalog_id: "chase_csr",
    label: "Trip Delay Reimbursement",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    group: "travel",
    title: "Trip Delay Reimbursement",
    summary: "Meals and lodging when your travel is delayed 6+ hours.",
    terms:
      "If common carrier travel is delayed more than 6 hours or requires an overnight stay, coverage for unreimbursed expenses such as meals and lodging.",
    coverage_cap: "Up to $500 per covered traveler",
    source_url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    verified_on: "2026-07-18",
  },
  {
    id: "chase_csr_lost_luggage",
    card_catalog_id: "chase_csr",
    label: "Lost Luggage Reimbursement",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    group: "travel",
    title: "Lost Luggage Reimbursement",
    summary: "Coverage for checked or carry-on baggage that is lost or stolen.",
    terms:
      "Reimbursement for the cost to repair or replace checked or carry-on baggage that is lost, damaged, or stolen during a covered trip. New York residents: additionally limited to $2,000 per bag and $10,000 for all covered travelers per trip.",
    coverage_cap: "Up to $3,000 per covered traveler",
    source_url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    verified_on: "2026-07-18",
  },
  {
    id: "chase_csr_baggage_delay",
    card_catalog_id: "chase_csr",
    label: "Baggage Delay Insurance",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    group: "travel",
    title: "Baggage Delay Insurance",
    summary: "Essentials when baggage is delayed over 6 hours.",
    terms:
      "Reimbursement for essential purchases like toiletries and clothing when baggage is delayed over 6 hours.",
    coverage_cap: "Up to $100 per day for up to 5 days",
    source_url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    verified_on: "2026-07-18",
  },
  {
    id: "chase_csr_emergency_evac",
    card_catalog_id: "chase_csr",
    label: "Emergency Evacuation and Transportation",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    group: "travel",
    title: "Emergency Evacuation and Transportation",
    summary: "Coverage for evacuation when injured or sick 100+ miles from home.",
    terms:
      "If you or a covered traveler are injured or become sick during a trip 100 miles or more from home that results in an emergency evacuation, coverage is provided for medical services and transportation.",
    coverage_cap: "Up to $100,000",
    source_url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    verified_on: "2026-07-18",
  },
  {
    id: "chase_csr_roadside",
    card_catalog_id: "chase_csr",
    label: "Roadside Assistance",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    group: "travel",
    title: "Roadside Assistance",
    summary: "Tow, battery, tire, locksmith, or gas dispatch.",
    terms:
      "Call for a tow, battery assistance, tire change, locksmith, or gas when you have a roadside emergency.",
    coverage_cap: "Up to $50 per incident, 4 incidents per year",
    source_url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    verified_on: "2026-07-18",
  },
  {
    id: "chase_csr_emergency_medical",
    card_catalog_id: "chase_csr",
    label: "Emergency Medical and Dental",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    group: "travel",
    title: "Emergency Medical and Dental",
    summary: "Coverage when sick or injured 100+ miles from home.",
    terms:
      "If you or an immediate family member become sick or injured while you're 100 miles or more from home on a trip, reimbursement for medical expenses, subject to a $50 deductible.",
    coverage_cap: "Up to $2,500 (subject to $50 deductible)",
    source_url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    verified_on: "2026-07-18",
  },
  {
    id: "chase_csr_purchase_protection",
    card_catalog_id: "chase_csr",
    label: "Purchase Protection",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    group: "purchase",
    title: "Purchase Protection",
    summary: "Eligible new purchases covered against damage or theft.",
    terms:
      "Covers eligible new purchases for 120 days from the date of purchase against damage or theft.",
    coverage_cap: "Up to $10,000 per item",
    source_url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    verified_on: "2026-07-18",
  },
  {
    id: "chase_csr_return_protection",
    card_catalog_id: "chase_csr",
    label: "Return Protection",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    group: "purchase",
    title: "Return Protection",
    summary: "Reimbursement for eligible items the store won't take back.",
    terms:
      "Reimbursement for eligible items that the store won't accept within 90 days of purchase.",
    coverage_cap: "Up to $500 per item, $1,000 per 12-month period",
    source_url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    verified_on: "2026-07-18",
  },
  {
    id: "chase_csr_extended_warranty",
    card_catalog_id: "chase_csr",
    label: "Extended Warranty Protection",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    group: "purchase",
    title: "Extended Warranty Protection",
    summary: "Adds one year to eligible manufacturer warranties.",
    terms:
      "Extends the time period of the U.S. manufacturer's warranty by one additional year, on eligible warranties of three years or less, up to four years from the date of purchase.",
    source_url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    verified_on: "2026-07-18",
  },
  {
    id: "chase_csr_travel_assistance",
    card_catalog_id: "chase_csr",
    label: "Travel and Emergency Assistance",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    group: "travel",
    title: "Travel and Emergency Assistance Services",
    summary: "Legal and medical referrals while traveling.",
    terms:
      "Provides legal and medical referrals and access to other travel and emergency assistance services when you run into a problem while traveling away from home. You are responsible for the cost of any goods or services obtained.",
    source_url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    verified_on: "2026-07-18",
  },
  {
    id: "chase_csr_travel_accident",
    card_catalog_id: "chase_csr",
    label: "Travel Accident Insurance",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    group: "travel",
    title: "Travel Accident Insurance",
    summary: "Accidental death or dismemberment coverage.",
    terms:
      "When you pay for your air, bus, train, or cruise transportation with your card, coverage for accidental death or dismemberment.",
    coverage_cap: "Up to $1,000,000",
    source_url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    verified_on: "2026-07-18",
  },

  // ── Bilt Mastercard (Bilt Blue) — standing (verified 2026-07-18) ────────
  {
    id: "bilt_rent_no_fee",
    card_catalog_id: "bilt_mastercard",
    label: "No transaction fee on housing payments",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.bilt.com/card",
    group: "membership",
    title: "No transaction fee on rent, mortgage, or HOA",
    summary: "Pay housing through Bilt with no card processing fee.",
    terms:
      "Every Bilt Card lets you earn rewards on rent and mortgage payments made through Bilt with no transaction fee. If your landlord doesn't accept credit cards or charges a fee, Bilt provides ACH, Venmo, or check on your behalf.",
    source_url: "https://www.bilt.com/card",
    verified_on: "2026-07-18",
  },
  {
    id: "bilt_no_fx",
    card_catalog_id: "bilt_mastercard",
    label: "No foreign transaction fees",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.bilt.com/card",
    group: "travel",
    title: "No foreign transaction fees",
    summary: "Nothing extra on purchases outside the U.S.",
    terms: "No foreign transaction fees on purchases made outside the United States.",
    source_url: "https://www.bilt.com/card",
    verified_on: "2026-07-18",
  },
  {
    id: "bilt_cell_phone",
    card_catalog_id: "bilt_mastercard",
    label: "Cellular Wireless Telephone Protection",
    kind: "standing",
    cadence: "annual",
    value_cents: null,
    source: "https://www.biltrewards.com/terms/blue-card-guide-to-benefits",
    group: "protection",
    title: "Cellular Wireless Telephone Protection",
    summary: "Coverage when your monthly wireless bill is paid with the card.",
    terms:
      "Cellular Wireless Telephone Protection when your cell phone bill is paid with your Bilt Blue Card. See the Bilt Blue Card Guide to Benefits for coverage caps, deductibles, and exclusions.",
    source_url: "https://www.biltrewards.com/terms/blue-card-guide-to-benefits",
    verified_on: "2026-07-18",
  },
];

// Audited on 2026-07-17 with no dollar-value credits verifiable from the
// issuer product page — empty benefit arrays are intentional and correct:
//   amex_blue_cash_everyday, amex_blue_cash_preferred, amex_delta_gold,
//   boa_customized_cash, boa_premium_rewards,
//   capone_savor, capone_venture,
//   chase_amazon_prime_visa, chase_freedom_flex, chase_freedom_unlimited,
//   chase_united_explorer, chase_world_of_hyatt,
//   citi_custom_cash, citi_double_cash, citi_strata_premier,
//   discover_it_cash_back,
//   usbank_altitude_go,
//   wf_active_cash, wf_autograph.

export const BENEFITS_BY_CARD: Record<string, CardBenefit[]> = (() => {
  const m: Record<string, CardBenefit[]> = {};
  for (const b of BENEFITS) {
    (m[b.card_catalog_id] ??= []).push(b);
  }
  return m;
})();

// ── period helpers ─────────────────────────────────────────────────────────

export function currentPeriod(
  cadence: BenefitCadence,
  now = new Date(),
): { key: string; endsAt: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  switch (cadence) {
    case "monthly": {
      const end = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59));
      return { key: `${y}-${String(m + 1).padStart(2, "0")}`, endsAt: end };
    }
    case "quarterly": {
      const q = Math.floor(m / 3);
      const end = new Date(Date.UTC(y, q * 3 + 3, 0, 23, 59, 59));
      return { key: `${y}-Q${q + 1}`, endsAt: end };
    }
    case "semiannual": {
      const h = m < 6 ? 0 : 1;
      const end = new Date(Date.UTC(y, h * 6 + 6, 0, 23, 59, 59));
      return { key: `${y}-H${h + 1}`, endsAt: end };
    }
    case "annual":
    case "one-time": {
      const end = new Date(Date.UTC(y, 12, 0, 23, 59, 59));
      return { key: `${y}`, endsAt: end };
    }
  }
}

/** Previous-period key for a benefit, used to detect roll-over. */
export function previousPeriodKey(cadence: BenefitCadence, now = new Date()): string {
  const before = new Date(now);
  switch (cadence) {
    case "monthly":
      before.setUTCMonth(before.getUTCMonth() - 1);
      break;
    case "quarterly":
      before.setUTCMonth(before.getUTCMonth() - 3);
      break;
    case "semiannual":
      before.setUTCMonth(before.getUTCMonth() - 6);
      break;
    case "annual":
    case "one-time":
      before.setUTCFullYear(before.getUTCFullYear() - 1);
      break;
  }
  return currentPeriod(cadence, before).key;
}

export function benefitMatches(
  b: CardBenefit,
  merchant: { id?: string | null; name?: string | null } | null,
  category: string,
): boolean {
  if (b.categories?.includes(category)) return true;
  const mid = merchant?.id?.toLowerCase() ?? "";
  const mname = (merchant?.name ?? "").toLowerCase().trim();
  if (!b.merchants?.length) return false;
  return b.merchants.some((token) => {
    const t = token.toLowerCase();
    if (t.startsWith("local_")) return mid === t;
    if (!t) return false;
    return mname.includes(t) || mid.includes(t);
  });
}
