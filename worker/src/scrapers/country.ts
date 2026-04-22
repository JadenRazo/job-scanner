/**
 * Best-effort extractor for country codes from free-text location strings
 * produced by ATS/aggregator APIs. Returns one of:
 *
 *   "US"       — United States
 *   "CA"       — Canada
 *   "REMOTE"   — remote, no country scope given
 *   "EU"       — remote EMEA / European-only role
 *   "APAC"     — remote APAC-only role
 *   "UK"       — United Kingdom specifically
 *   "MX" / "BR" / "DE" / ...  — other countries
 *   null       — genuinely unknown
 *
 * The Stage-1 SQL filter accepts US, CA, REMOTE (and null + remote=true).
 * Everything else is filtered out. Being permissive here is fine — if we
 * mis-label a US job as unknown-REMOTE it still gets through.
 */

// US state / territory postal codes (incl DC + PR)
const US_STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC","PR",
]);

// Canadian provinces / territories
const CA_PROVINCE_CODES = new Set([
  "ON","QC","BC","AB","MB","SK","NS","NB","NL","PE","NT","YT","NU",
]);

// Major US cities (fallback when no state code — common in 'Remote - NYC' etc.)
const US_CITIES = [
  "new york","new york city","nyc","san francisco","sf","los angeles","la",
  "seattle","boston","austin","chicago","denver","portland","atlanta","miami",
  "houston","dallas","washington","philadelphia","phoenix","salt lake city",
  "minneapolis","detroit","san diego","san jose","palo alto","mountain view",
  "cupertino","sunnyvale","redmond","bellevue","irvine","santa monica",
  "san mateo","brooklyn","jersey city","bellevue","cambridge","nashville",
  "raleigh","durham","charlotte","tampa","orlando","pittsburgh","indianapolis",
  "columbus","kansas city","st louis","cincinnati","cleveland","milwaukee",
];

const CA_CITIES = [
  "toronto","vancouver","montreal","calgary","ottawa","edmonton","waterloo",
  "halifax","quebec","winnipeg","kitchener","london on","mississauga",
];

const COUNTRY_PATTERNS: Array<[RegExp, string]> = [
  [/\b(united states|u\.?s\.?a?|usa|us-based|us only|americas)\b/i, "US"],
  [/\b(canada|canadian)\b/i, "CA"],
  [/\b(mexico|mx-)\b/i, "MX"],
  [/\b(united kingdom|u\.?k\.?|england|scotland|wales|northern ireland)\b/i, "UK"],
  [/\b(ireland|dublin)\b/i, "IE"],
  [/\b(germany|deutschland|berlin|munich|frankfurt)\b/i, "DE"],
  [/\b(france|paris|lyon)\b/i, "FR"],
  [/\b(spain|madrid|barcelona)\b/i, "ES"],
  [/\b(portugal|lisbon|porto)\b/i, "PT"],
  [/\b(italy|rome|milan)\b/i, "IT"],
  [/\b(netherlands|amsterdam|rotterdam|holland)\b/i, "NL"],
  [/\b(belgium|brussels)\b/i, "BE"],
  [/\b(switzerland|zurich|geneva)\b/i, "CH"],
  [/\b(austria|vienna)\b/i, "AT"],
  [/\b(sweden|stockholm)\b/i, "SE"],
  [/\b(denmark|copenhagen)\b/i, "DK"],
  [/\b(norway|oslo)\b/i, "NO"],
  [/\b(finland|helsinki)\b/i, "FI"],
  [/\b(poland|warsaw|krakow)\b/i, "PL"],
  [/\b(czech|prague)\b/i, "CZ"],
  [/\b(hungary|budapest)\b/i, "HU"],
  [/\b(romania|bucharest)\b/i, "RO"],
  [/\b(greece|athens)\b/i, "GR"],
  [/\b(turkey|istanbul|ankara)\b/i, "TR"],
  [/\b(israel|tel aviv|jerusalem)\b/i, "IL"],
  [/\b(uae|dubai|abu dhabi)\b/i, "AE"],
  [/\b(india|bangalore|bengaluru|mumbai|hyderabad|pune|chennai|delhi|gurgaon|noida|gurugram)\b/i, "IN"],
  [/\b(singapore)\b/i, "SG"],
  [/\b(japan|tokyo|osaka)\b/i, "JP"],
  [/\b(korea|seoul)\b/i, "KR"],
  [/\b(china|beijing|shanghai|shenzhen)\b/i, "CN"],
  [/\b(hong kong)\b/i, "HK"],
  [/\b(taiwan|taipei)\b/i, "TW"],
  [/\b(australia|sydney|melbourne|brisbane)\b/i, "AU"],
  [/\b(new zealand|auckland|wellington)\b/i, "NZ"],
  [/\b(brazil|são paulo|sao paulo|rio de janeiro)\b/i, "BR"],
  [/\b(argentina|buenos aires)\b/i, "AR"],
  [/\b(colombia|bogotá|bogota)\b/i, "CO"],
  [/\b(chile|santiago)\b/i, "CL"],
  [/\b(south africa|cape town|johannesburg)\b/i, "ZA"],
  [/\b(nigeria|lagos|abuja)\b/i, "NG"],
  [/\b(kenya|nairobi)\b/i, "KE"],
  [/\b(egypt|cairo)\b/i, "EG"],
];

const REGION_PATTERNS: Array<[RegExp, string]> = [
  [/\b(emea|europe|eu-based|eu only|european)\b/i, "EU"],
  [/\b(apac|asia[- ]pacific|asia)\b/i, "APAC"],
  [/\b(latam|latin america)\b/i, "LATAM"],
  [/\b(north america|na-based)\b/i, "NA"],
];

export function deriveCountry(
  location: string | null | undefined,
  remote?: boolean | null,
): string | null {
  if (!location) {
    return remote === true ? "REMOTE" : null;
  }
  const raw = location.trim();
  if (raw.length === 0) return remote === true ? "REMOTE" : null;

  const lower = raw.toLowerCase();
  const isRemote = /\b(remote|anywhere|worldwide|wfh|work[-\s]?from[-\s]?home|distributed|virtual)\b/i.test(raw);

  // Pass 1: explicit country mentions beat everything
  for (const [rx, code] of COUNTRY_PATTERNS) {
    if (rx.test(lower)) return code;
  }

  // Pass 2: US state codes (comma-separated or at end)
  const stateMatch = raw.match(/,\s*([A-Z]{2})(?:\s*,?\s*(?:USA|US|United States)?)?\s*$/);
  if (stateMatch) {
    const code = stateMatch[1].toUpperCase();
    if (US_STATE_CODES.has(code)) return "US";
    if (CA_PROVINCE_CODES.has(code)) return "CA";
  }

  // Pass 2b: state codes not at end but properly comma-separated
  const anyCodeMatch = raw.matchAll(/(?:^|,\s*)([A-Z]{2})(?=\s|,|$)/g);
  for (const m of anyCodeMatch) {
    const code = m[1].toUpperCase();
    if (US_STATE_CODES.has(code)) return "US";
    if (CA_PROVINCE_CODES.has(code)) return "CA";
  }

  // Pass 3: major cities
  for (const city of US_CITIES) {
    if (lower.includes(city)) return "US";
  }
  for (const city of CA_CITIES) {
    if (lower.includes(city)) return "CA";
  }

  // Pass 4: regional markers (less specific than countries above)
  for (const [rx, code] of REGION_PATTERNS) {
    if (rx.test(lower)) return code;
  }

  // Pass 5: still unknown — remote → REMOTE, otherwise null
  if (isRemote) return "REMOTE";
  return null;
}
