// Curated map of ~150 well-known US merchants to the engine's category slugs.
// Category slugs must exist in the card catalog earn_rules so recommendations
// resolve correctly. Special slugs used here: amazon, whole_foods,
// wholesale_clubs, dining, groceries, hotels, flights, travel, gas,
// drugstores, streaming, entertainment, transit, everything_else.

export type MerchantEntry = {
  id: string; // stable local id, prefixed "local_"
  name: string;
  aliases: string[];
  category: string;
  note?: string;
};

const m = (
  id: string,
  name: string,
  category: string,
  aliases: string[] = [],
  note?: string,
): MerchantEntry => ({ id: `local_${id}`, name, category, aliases, note });

export const MERCHANTS: MerchantEntry[] = [
  // Warehouse clubs
  m("sams_club", "Sam's Club", "wholesale_clubs", ["sams", "sams club", "samsclub"]),
  m(
    "costco",
    "Costco",
    "wholesale_clubs",
    ["costco wholesale"],
    "In-store Costco codes as wholesale. Costco Gas codes as gas — search 'Costco Gas' for that.",
  ),
  m("costco_gas", "Costco Gas", "gas", ["costco fuel", "costco gasoline"]),
  m("bjs", "BJ's Wholesale Club", "wholesale_clubs", ["bjs", "bjs wholesale"]),

  // Big box
  m(
    "walmart",
    "Walmart",
    "everything_else",
    ["wal mart", "walmart supercenter"],
    "Groceries at Walmart usually code as general retail, not groceries.",
  ),
  m(
    "target",
    "Target",
    "everything_else",
    [],
    "Groceries at Target usually code as general retail, not groceries.",
  ),

  // Grocers
  m("whole_foods", "Whole Foods", "whole_foods", ["whole foods market", "wholefoods", "wfm"]),
  m("kroger", "Kroger", "groceries", []),
  m("publix", "Publix", "groceries", []),
  m("safeway", "Safeway", "groceries", []),
  m("aldi", "Aldi", "groceries", []),
  m("trader_joes", "Trader Joe's", "groceries", ["trader joes", "traderjoes", "tjs"]),
  m("wegmans", "Wegmans", "groceries", []),
  m("heb", "H-E-B", "groceries", ["heb", "h e b"]),
  m("albertsons", "Albertsons", "groceries", []),
  m("meijer", "Meijer", "groceries", []),
  m("giant", "Giant", "groceries", ["giant food"]),
  m("stop_shop", "Stop & Shop", "groceries", ["stop and shop"]),
  m("harris_teeter", "Harris Teeter", "groceries", []),
  m("food_lion", "Food Lion", "groceries", []),
  m("sprouts", "Sprouts Farmers Market", "groceries", ["sprouts"]),
  m("winco", "WinCo Foods", "groceries", ["winco"]),
  m("shoprite", "ShopRite", "groceries", ["shop rite"]),

  // Pharmacies / drugstores
  m("cvs", "CVS", "drugstores", ["cvs pharmacy"]),
  m("walgreens", "Walgreens", "drugstores", []),
  m("rite_aid", "Rite Aid", "drugstores", ["riteaid"]),
  m("duane_reade", "Duane Reade", "drugstores", []),

  // Gas
  m("shell", "Shell", "gas", []),
  m("exxon", "Exxon", "gas", ["exxonmobil", "exxon mobil"]),
  m("mobil", "Mobil", "gas", []),
  m("chevron", "Chevron", "gas", []),
  m("bp", "BP", "gas", ["british petroleum"]),
  m("wawa", "Wawa", "gas", []),
  m("circle_k", "Circle K", "gas", ["circlek"]),
  m("seven_eleven", "7-Eleven", "gas", ["7 eleven", "7eleven", "seven eleven"]),
  m("sheetz", "Sheetz", "gas", []),
  m("speedway", "Speedway", "gas", []),
  m("marathon", "Marathon", "gas", []),
  m("sunoco", "Sunoco", "gas", []),
  m("valero", "Valero", "gas", []),
  m("citgo", "Citgo", "gas", []),
  m("phillips_66", "Phillips 66", "gas", ["phillips66"]),
  m("arco", "Arco", "gas", []),
  m("qt", "QuikTrip", "gas", ["quiktrip"]),
  m("racetrac", "RaceTrac", "gas", []),
  m("buc_ees", "Buc-ee's", "gas", ["bucees", "buc ees"]),

  // Dining chains
  m("chipotle", "Chipotle", "dining", []),
  m("starbucks", "Starbucks", "dining", []),
  m("dunkin", "Dunkin'", "dining", ["dunkin donuts"]),
  m("mcdonalds", "McDonald's", "dining", ["mcdonalds", "mickey ds"]),
  m("chickfila", "Chick-fil-A", "dining", ["chick fil a", "chickfila"]),
  m("olive_garden", "Olive Garden", "dining", []),
  m("panera", "Panera Bread", "dining", ["panera"]),
  m("subway", "Subway", "dining", []),
  m("burger_king", "Burger King", "dining", ["bk"]),
  m("wendys", "Wendy's", "dining", ["wendys"]),
  m("taco_bell", "Taco Bell", "dining", []),
  m("kfc", "KFC", "dining", ["kentucky fried chicken"]),
  m("popeyes", "Popeyes", "dining", []),
  m("dominos", "Domino's", "dining", ["dominos"]),
  m("pizza_hut", "Pizza Hut", "dining", []),
  m("papa_johns", "Papa John's", "dining", ["papa johns"]),
  m("shake_shack", "Shake Shack", "dining", []),
  m("five_guys", "Five Guys", "dining", []),
  m("in_n_out", "In-N-Out", "dining", ["in n out", "innout"]),
  m("cheesecake", "The Cheesecake Factory", "dining", ["cheesecake factory"]),
  m("outback", "Outback Steakhouse", "dining", ["outback"]),
  m("applebees", "Applebee's", "dining", ["applebees"]),
  m("texas_roadhouse", "Texas Roadhouse", "dining", []),
  m("doordash", "DoorDash", "dining", []),
  m("uber_eats", "Uber Eats", "dining", ["ubereats"]),
  m("grubhub", "Grubhub", "dining", []),

  // Airlines
  m("delta", "Delta Air Lines", "flights", ["delta"]),
  m("united", "United Airlines", "flights", ["united"]),
  m("american_air", "American Airlines", "flights", ["american", "aa"]),
  m("southwest", "Southwest Airlines", "flights", ["southwest"]),
  m("jetblue", "JetBlue", "flights", ["jet blue"]),
  m("alaska_air", "Alaska Airlines", "flights", ["alaska"]),
  m("spirit", "Spirit Airlines", "flights", []),
  m("frontier", "Frontier Airlines", "flights", []),
  m("hawaiian", "Hawaiian Airlines", "flights", []),

  // Hotels
  m("hyatt", "Hyatt", "hotels", ["world of hyatt"]),
  m("marriott", "Marriott", "hotels", ["marriott bonvoy"]),
  m("hilton", "Hilton", "hotels", ["hilton honors"]),
  m("ihg", "IHG", "hotels", ["holiday inn", "intercontinental"]),
  m("wyndham", "Wyndham", "hotels", []),
  m("choice_hotels", "Choice Hotels", "hotels", ["comfort inn"]),
  m("best_western", "Best Western", "hotels", []),
  m("airbnb", "Airbnb", "travel", []),
  m("vrbo", "Vrbo", "travel", []),
  m("booking", "Booking.com", "travel", ["bookingcom"]),
  m("expedia", "Expedia", "travel", []),
  m("hotels_com", "Hotels.com", "hotels", ["hotelscom"]),

  // Online retail
  m("amazon", "Amazon", "amazon", ["amzn"]),
  m("chewy", "Chewy", "everything_else", []),
  m("ebay", "eBay", "everything_else", []),
  m("etsy", "Etsy", "everything_else", []),
  m("wayfair", "Wayfair", "everything_else", []),
  m("newegg", "Newegg", "everything_else", []),

  // Streaming / subscriptions
  m("netflix", "Netflix", "streaming", []),
  m("spotify", "Spotify", "streaming", []),
  m("disney_plus", "Disney+", "streaming", ["disney plus", "disneyplus"]),
  m("hulu", "Hulu", "streaming", []),
  m("hbo_max", "Max", "streaming", ["hbo max", "hbomax"]),
  m("apple_tv", "Apple TV+", "streaming", ["apple tv plus"]),
  m("prime_video", "Prime Video", "streaming", ["amazon prime video"]),
  m("youtube_tv", "YouTube TV", "streaming", ["youtubetv"]),
  m("peacock", "Peacock", "streaming", []),
  m("paramount", "Paramount+", "streaming", ["paramount plus"]),

  // Rideshare / transit
  m("uber", "Uber", "transit", []),
  m("lyft", "Lyft", "transit", []),
  m("amtrak", "Amtrak", "travel", []),
  m("mta", "MTA", "transit", ["metro card", "metrocard"]),

  // Home improvement
  m("home_depot", "Home Depot", "everything_else", ["homedepot", "the home depot"]),
  m("lowes", "Lowe's", "everything_else", ["lowes"]),
  m("ace_hardware", "Ace Hardware", "everything_else", []),
  m("menards", "Menards", "everything_else", []),

  // Electronics
  m("best_buy", "Best Buy", "everything_else", ["bestbuy"]),
  m("apple", "Apple", "everything_else", ["apple store"]),
  m("microcenter", "Micro Center", "everything_else", ["microcenter"]),
  m("gamestop", "GameStop", "everything_else", []),

  // Department / apparel
  m("macys", "Macy's", "everything_else", ["macys"]),
  m("nordstrom", "Nordstrom", "everything_else", []),
  m("tj_maxx", "TJ Maxx", "everything_else", ["tjmaxx", "t j maxx"]),
  m("marshalls", "Marshalls", "everything_else", []),
  m("homegoods", "HomeGoods", "everything_else", ["home goods"]),
  m("old_navy", "Old Navy", "everything_else", ["oldnavy"]),
  m("gap", "Gap", "everything_else", []),
  m("banana_republic", "Banana Republic", "everything_else", []),
  m("jcpenney", "JCPenney", "everything_else", ["jc penney"]),
  m("kohls", "Kohl's", "everything_else", ["kohls"]),
  m("uniqlo", "Uniqlo", "everything_else", []),
  m("hm", "H&M", "everything_else", ["h and m", "hm"]),
  m("zara", "Zara", "everything_else", []),
  m("lululemon", "Lululemon", "everything_else", []),
  m("nike", "Nike", "everything_else", []),
  m("adidas", "Adidas", "everything_else", []),
  m("dsw", "DSW", "everything_else", []),
  m("ross", "Ross", "everything_else", ["ross dress for less"]),

  // Fitness
  m("planet_fitness", "Planet Fitness", "everything_else", ["planetfitness"]),
  m("equinox", "Equinox", "everything_else", []),
  m("peloton", "Peloton", "everything_else", []),
  m("la_fitness", "LA Fitness", "everything_else", ["lafitness"]),
  m("orangetheory", "Orangetheory Fitness", "everything_else", ["orange theory"]),

  // Entertainment
  m("amc", "AMC Theatres", "entertainment", ["amc", "amc theaters"]),
  m("regal", "Regal Cinemas", "entertainment", ["regal"]),
  m("cinemark", "Cinemark", "entertainment", []),
  m("ticketmaster", "Ticketmaster", "entertainment", []),
  m("stubhub", "StubHub", "entertainment", []),
  m("live_nation", "Live Nation", "entertainment", ["livenation"]),
  m("seatgeek", "SeatGeek", "entertainment", []),
];

// ---------- fuzzy resolver ----------

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[] = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

type Scored = { entry: MerchantEntry; score: number };

function scoreEntry(entry: MerchantEntry, nq: string): number {
  if (!nq) return 0;
  const candidates = [entry.name, ...entry.aliases].map(normalize);
  let best = 0;
  for (const c of candidates) {
    if (!c) continue;
    let s = 0;
    if (c === nq) s = 100;
    else if (c.startsWith(nq)) s = 85 - Math.max(0, c.length - nq.length);
    else if (nq.startsWith(c) && c.length >= 3) s = 80 - (nq.length - c.length);
    else if (c.includes(nq) && nq.length >= 3) s = 65;
    else if (nq.includes(c) && c.length >= 4) s = 55;
    else if (nq.length >= 4 && c.length >= 4) {
      const d = levenshtein(nq, c);
      if (d === 1) s = 45;
      else if (d === 2 && Math.max(nq.length, c.length) >= 6) s = 30;
    }
    if (s > best) best = s;
  }
  return best;
}

export function searchMerchants(query: string, limit = 6): MerchantEntry[] {
  const nq = normalize(query);
  if (!nq) return [];
  const scored: Scored[] = [];
  for (const entry of MERCHANTS) {
    const score = scoreEntry(entry, nq);
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.name.length - b.entry.name.length);
  return scored.slice(0, limit).map((s) => s.entry);
}

export function resolveMerchant(query: string): MerchantEntry | null {
  const results = searchMerchants(query, 1);
  return results[0] ?? null;
}
