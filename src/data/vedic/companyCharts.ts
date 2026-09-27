// Foundation horoscopes for major public companies — incorporation/founding moment in local civil time.
// Founder birth data sourced from public biographical records. Times marked "12:00" with timeKnown=false
// are noon-chart approximations (Sun + Moon sign reliable; Lagna is a best-estimate placeholder).
//
// All companies use 12:00 local civil time at HQ city when no precise minute is on record — standard
// mundane practice for corporate charts where exact incorporation minute is not publicly logged.

export interface CompanyFoundation {
  symbol: string;       // ticker
  name: string;
  glyph: string;        // mono unicode marker (no colored emoji)
  event: string;        // "Incorporation", "IPO", etc.
  birthDate: string;    // YYYY-MM-DD (local civil)
  birthTime: string;    // HH:MM (local civil, 24h)
  timeKnown: boolean;   // false = noon-chart approximation
  tzOffset: number;     // hours from UTC at that moment (incl. historical DST)
  lat: number;
  lon: number;
  city: string;
}

export interface FounderRecord {
  companySymbol: string;       // matches CompanyFoundation.symbol
  name: string;
  role: string;                // "Co-founder & CEO", "Founder", etc.
  birthDate: string;           // YYYY-MM-DD
  birthTime: string;           // HH:MM 24h local civil
  timeKnown: boolean;
  tzOffset: number;
  lat: number;
  lon: number;
  city: string;
}

export const COMPANY_CHARTS: CompanyFoundation[] = [
  // --- Tech mega-caps ---
  { symbol: "AAPL", name: "Apple", glyph: "◈", event: "Incorporation",
    birthDate: "1977-01-03", birthTime: "12:00", timeKnown: false,
    tzOffset: -8, lat: 37.3318, lon: -122.0312, city: "Cupertino, CA" },
  { symbol: "MSFT", name: "Microsoft", glyph: "◇", event: "Founding",
    birthDate: "1975-04-04", birthTime: "12:00", timeKnown: false,
    tzOffset: -7, lat: 35.0844, lon: -106.6504, city: "Albuquerque, NM" },
  { symbol: "GOOGL", name: "Google (Alphabet)", glyph: "◉", event: "Incorporation",
    birthDate: "1998-09-04", birthTime: "12:00", timeKnown: false,
    tzOffset: -7, lat: 37.4419, lon: -122.1430, city: "Menlo Park, CA" },
  { symbol: "AMZN", name: "Amazon", glyph: "▲", event: "Incorporation",
    birthDate: "1994-07-05", birthTime: "12:00", timeKnown: false,
    tzOffset: -7, lat: 47.6062, lon: -122.3321, city: "Seattle, WA" },
  { symbol: "META", name: "Meta (Facebook)", glyph: "▽", event: "Launch (TheFacebook)",
    birthDate: "2004-02-04", birthTime: "12:00", timeKnown: false,
    tzOffset: -5, lat: 42.3736, lon: -71.1097, city: "Cambridge, MA" },
  { symbol: "NVDA", name: "Nvidia", glyph: "◆", event: "Incorporation",
    birthDate: "1993-04-05", birthTime: "12:00", timeKnown: false,
    tzOffset: -7, lat: 37.3541, lon: -121.9552, city: "Santa Clara, CA" },
  { symbol: "TSLA", name: "Tesla", glyph: "◬", event: "Incorporation",
    birthDate: "2003-07-01", birthTime: "12:00", timeKnown: false,
    tzOffset: -7, lat: 37.3941, lon: -122.1503, city: "San Carlos, CA" },
  { symbol: "PLTR", name: "Palantir Technologies", glyph: "▣", event: "Founding",
    birthDate: "2003-05-06", birthTime: "12:00", timeKnown: false,
    tzOffset: -7, lat: 37.4419, lon: -122.1430, city: "Palo Alto, CA" },
  { symbol: "ORCL", name: "Oracle", glyph: "○", event: "Incorporation",
    birthDate: "1977-06-16", birthTime: "12:00", timeKnown: false,
    tzOffset: -7, lat: 37.5630, lon: -122.3255, city: "Redwood Shores, CA" },
  { symbol: "IBM", name: "IBM", glyph: "□", event: "Incorporation (CTR)",
    birthDate: "1911-06-16", birthTime: "12:00", timeKnown: false,
    tzOffset: -5, lat: 41.0815, lon: -73.8587, city: "Armonk, NY" },
  { symbol: "NFLX", name: "Netflix", glyph: "▶", event: "Founding",
    birthDate: "1997-08-29", birthTime: "12:00", timeKnown: false,
    tzOffset: -7, lat: 36.9741, lon: -122.0308, city: "Scotts Valley, CA" },
  { symbol: "AMD", name: "AMD", glyph: "◐", event: "Incorporation",
    birthDate: "1969-05-01", birthTime: "12:00", timeKnown: false,
    tzOffset: -7, lat: 37.3541, lon: -121.9552, city: "Santa Clara, CA" },
  { symbol: "INTC", name: "Intel", glyph: "◑", event: "Incorporation",
    birthDate: "1968-07-18", birthTime: "12:00", timeKnown: false,
    tzOffset: -7, lat: 37.3875, lon: -121.9647, city: "Mountain View, CA" },
  { symbol: "CRM", name: "Salesforce", glyph: "◍", event: "Founding",
    birthDate: "1999-02-03", birthTime: "12:00", timeKnown: false,
    tzOffset: -8, lat: 37.7749, lon: -122.4194, city: "San Francisco, CA" },
  { symbol: "ADBE", name: "Adobe", glyph: "◎", event: "Founding",
    birthDate: "1982-12-01", birthTime: "12:00", timeKnown: false,
    tzOffset: -8, lat: 37.3306, lon: -121.8929, city: "San Jose, CA" },

  // --- Aerospace / defense / private giants (private = founding date charts) ---
  { symbol: "SPACEX", name: "SpaceX", glyph: "✦", event: "Incorporation",
    birthDate: "2002-03-14", birthTime: "12:00", timeKnown: false,
    tzOffset: -8, lat: 33.9206, lon: -118.3270, city: "Hawthorne, CA" },
  { symbol: "OPENAI", name: "OpenAI", glyph: "◯", event: "Founding",
    birthDate: "2015-12-11", birthTime: "12:00", timeKnown: false,
    tzOffset: -8, lat: 37.7749, lon: -122.4194, city: "San Francisco, CA" },
  { symbol: "ANTHROPIC", name: "Anthropic", glyph: "◌", event: "Founding",
    birthDate: "2021-01-15", birthTime: "12:00", timeKnown: false,
    tzOffset: -8, lat: 37.7749, lon: -122.4194, city: "San Francisco, CA" },

  // --- Finance / Berkshire ---
  { symbol: "BRK", name: "Berkshire Hathaway", glyph: "◧", event: "Buffett Takeover",
    birthDate: "1965-05-10", birthTime: "12:00", timeKnown: false,
    tzOffset: -5, lat: 41.2565, lon: -95.9345, city: "Omaha, NE" },
  { symbol: "JPM", name: "JPMorgan Chase", glyph: "◨", event: "Merger",
    birthDate: "2000-12-31", birthTime: "12:00", timeKnown: false,
    tzOffset: -5, lat: 40.7549, lon: -73.9707, city: "New York, NY" },

  // --- Auto / Industrial ---
  { symbol: "F", name: "Ford Motor Company", glyph: "▤", event: "Incorporation",
    birthDate: "1903-06-16", birthTime: "12:00", timeKnown: false,
    tzOffset: -5, lat: 42.3223, lon: -83.1763, city: "Dearborn, MI" },

  // --- Consumer ---
  { symbol: "DIS", name: "Walt Disney Company", glyph: "❖", event: "Founding (Disney Bros.)",
    birthDate: "1923-10-16", birthTime: "12:00", timeKnown: false,
    tzOffset: -8, lat: 34.1561, lon: -118.3245, city: "Los Angeles, CA" },
  { symbol: "KO", name: "Coca-Cola", glyph: "◖", event: "Invented",
    birthDate: "1886-05-08", birthTime: "12:00", timeKnown: false,
    tzOffset: -5, lat: 33.7490, lon: -84.3880, city: "Atlanta, GA" },
];

export const COMPANY_FOUNDERS: FounderRecord[] = [
  // AAPL
  { companySymbol: "AAPL", name: "Steve Jobs", role: "Co-founder",
    birthDate: "1955-02-24", birthTime: "19:15", timeKnown: true,
    tzOffset: -8, lat: 37.7749, lon: -122.4194, city: "San Francisco, CA" },

  // MSFT
  { companySymbol: "MSFT", name: "Bill Gates", role: "Co-founder",
    birthDate: "1955-10-28", birthTime: "22:00", timeKnown: true,
    tzOffset: -8, lat: 47.6062, lon: -122.3321, city: "Seattle, WA" },

  // GOOGL
  { companySymbol: "GOOGL", name: "Larry Page", role: "Co-founder",
    birthDate: "1973-03-26", birthTime: "12:00", timeKnown: false,
    tzOffset: -5, lat: 42.3314, lon: -83.0458, city: "East Lansing, MI" },

  // AMZN
  { companySymbol: "AMZN", name: "Jeff Bezos", role: "Founder",
    birthDate: "1964-01-12", birthTime: "12:00", timeKnown: false,
    tzOffset: -6, lat: 35.0844, lon: -106.6504, city: "Albuquerque, NM" },

  // META
  { companySymbol: "META", name: "Mark Zuckerberg", role: "Founder & CEO",
    birthDate: "1984-05-14", birthTime: "12:00", timeKnown: false,
    tzOffset: -4, lat: 41.3275, lon: -73.8170, city: "White Plains, NY" },

  // NVDA
  { companySymbol: "NVDA", name: "Jensen Huang", role: "Co-founder & CEO",
    birthDate: "1963-02-17", birthTime: "12:00", timeKnown: false,
    tzOffset: 8, lat: 25.0330, lon: 121.5654, city: "Tainan, Taiwan" },

  // TSLA
  { companySymbol: "TSLA", name: "Elon Musk", role: "CEO / Co-founder",
    birthDate: "1971-06-28", birthTime: "07:30", timeKnown: true,
    tzOffset: 2, lat: -25.7479, lon: 28.2293, city: "Pretoria, ZA" },

  // PLTR
  { companySymbol: "PLTR", name: "Peter Thiel", role: "Co-founder & Chairman",
    birthDate: "1967-10-11", birthTime: "12:00", timeKnown: false,
    tzOffset: 1, lat: 50.1109, lon: 8.6821, city: "Frankfurt, DE" },

  // ORCL
  { companySymbol: "ORCL", name: "Larry Ellison", role: "Co-founder & Chairman",
    birthDate: "1944-08-17", birthTime: "12:00", timeKnown: false,
    tzOffset: -5, lat: 40.7128, lon: -74.0060, city: "New York, NY" },

  // IBM
  { companySymbol: "IBM", name: "Charles Ranlett Flint", role: "Founder",
    birthDate: "1850-01-24", birthTime: "12:00", timeKnown: false,
    tzOffset: -5, lat: 41.6362, lon: -70.9342, city: "Thomaston, ME" },

  // NFLX
  { companySymbol: "NFLX", name: "Reed Hastings", role: "Co-founder",
    birthDate: "1960-10-08", birthTime: "12:00", timeKnown: false,
    tzOffset: -4, lat: 42.3601, lon: -71.0589, city: "Boston, MA" },

  // AMD
  { companySymbol: "AMD", name: "Jerry Sanders", role: "Co-founder",
    birthDate: "1936-09-12", birthTime: "12:00", timeKnown: false,
    tzOffset: -5, lat: 41.8781, lon: -87.6298, city: "Chicago, IL" },

  // INTC
  { companySymbol: "INTC", name: "Gordon Moore", role: "Co-founder",
    birthDate: "1929-01-03", birthTime: "12:00", timeKnown: false,
    tzOffset: -8, lat: 37.7749, lon: -122.4194, city: "San Francisco, CA" },

  // CRM
  { companySymbol: "CRM", name: "Marc Benioff", role: "Founder & CEO",
    birthDate: "1964-09-25", birthTime: "12:00", timeKnown: false,
    tzOffset: -7, lat: 37.7749, lon: -122.4194, city: "San Francisco, CA" },

  // ADBE
  { companySymbol: "ADBE", name: "John Warnock", role: "Co-founder",
    birthDate: "1940-10-06", birthTime: "12:00", timeKnown: false,
    tzOffset: -7, lat: 40.7608, lon: -111.8910, city: "Salt Lake City, UT" },

  // SPACEX (also Musk)
  { companySymbol: "SPACEX", name: "Elon Musk", role: "Founder & CEO",
    birthDate: "1971-06-28", birthTime: "07:30", timeKnown: true,
    tzOffset: 2, lat: -25.7479, lon: 28.2293, city: "Pretoria, ZA" },

  // OPENAI
  { companySymbol: "OPENAI", name: "Sam Altman", role: "Co-founder & CEO",
    birthDate: "1985-04-22", birthTime: "12:00", timeKnown: false,
    tzOffset: -5, lat: 38.6270, lon: -90.1994, city: "St. Louis, MO" },

  // ANTHROPIC
  { companySymbol: "ANTHROPIC", name: "Dario Amodei", role: "Co-founder & CEO",
    birthDate: "1983-01-01", birthTime: "12:00", timeKnown: false,
    tzOffset: -5, lat: 37.7749, lon: -122.4194, city: "San Francisco, CA" },

  // BRK
  { companySymbol: "BRK", name: "Warren Buffett", role: "CEO / Architect",
    birthDate: "1930-08-30", birthTime: "15:00", timeKnown: true,
    tzOffset: -5, lat: 41.2565, lon: -95.9345, city: "Omaha, NE" },

  // JPM
  { companySymbol: "JPM", name: "John Pierpont Morgan", role: "Founder (Predecessor)",
    birthDate: "1837-04-17", birthTime: "12:00", timeKnown: false,
    tzOffset: -5, lat: 41.7637, lon: -72.6851, city: "Hartford, CT" },

  // F
  { companySymbol: "F", name: "Henry Ford", role: "Founder",
    birthDate: "1863-07-30", birthTime: "12:00", timeKnown: false,
    tzOffset: -5, lat: 42.3223, lon: -83.1763, city: "Dearborn, MI" },

  // DIS
  { companySymbol: "DIS", name: "Walt Disney", role: "Co-founder",
    birthDate: "1901-12-05", birthTime: "00:35", timeKnown: true,
    tzOffset: -6, lat: 41.8781, lon: -87.6298, city: "Chicago, IL" },

  // KO
  { companySymbol: "KO", name: "John Stith Pemberton", role: "Inventor",
    birthDate: "1831-07-08", birthTime: "12:00", timeKnown: false,
    tzOffset: -5, lat: 33.5186, lon: -86.8104, city: "Knoxville, GA" },
];

export function getFounderForCompany(symbol: string): FounderRecord | undefined {
  return COMPANY_FOUNDERS.find((f) => f.companySymbol === symbol);
}
