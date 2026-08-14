// Screening universe: symbols + static classification only. No prices, no
// fundamentals — every number the app shows comes from the live data provider.

export type Market = "US" | "IN";

export type UniverseEntry = {
  symbol: string;
  name: string;
  sector: string;
  market: Market;
};

export const UNIVERSE: UniverseEntry[] = [
  // --- United States -------------------------------------------------------
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technology", market: "US" },
  { symbol: "MSFT", name: "Microsoft Corporation", sector: "Technology", market: "US" },
  { symbol: "NVDA", name: "NVIDIA Corporation", sector: "Technology", market: "US" },
  { symbol: "AVGO", name: "Broadcom Inc.", sector: "Technology", market: "US" },
  { symbol: "AMD", name: "Advanced Micro Devices", sector: "Technology", market: "US" },
  { symbol: "ORCL", name: "Oracle Corporation", sector: "Technology", market: "US" },
  { symbol: "CRM", name: "Salesforce, Inc.", sector: "Technology", market: "US" },
  { symbol: "ADBE", name: "Adobe Inc.", sector: "Technology", market: "US" },
  { symbol: "NOW", name: "ServiceNow, Inc.", sector: "Technology", market: "US" },
  { symbol: "PLTR", name: "Palantir Technologies", sector: "Technology", market: "US" },
  { symbol: "MU", name: "Micron Technology", sector: "Technology", market: "US" },
  { symbol: "QCOM", name: "QUALCOMM Incorporated", sector: "Technology", market: "US" },
  { symbol: "TXN", name: "Texas Instruments", sector: "Technology", market: "US" },
  { symbol: "AMAT", name: "Applied Materials", sector: "Technology", market: "US" },
  { symbol: "IBM", name: "IBM", sector: "Technology", market: "US" },
  { symbol: "CSCO", name: "Cisco Systems", sector: "Technology", market: "US" },
  { symbol: "INTC", name: "Intel Corporation", sector: "Technology", market: "US" },
  { symbol: "GOOGL", name: "Alphabet Inc.", sector: "Communication Services", market: "US" },
  { symbol: "META", name: "Meta Platforms", sector: "Communication Services", market: "US" },
  { symbol: "NFLX", name: "Netflix, Inc.", sector: "Communication Services", market: "US" },
  { symbol: "DIS", name: "The Walt Disney Company", sector: "Communication Services", market: "US" },
  { symbol: "AMZN", name: "Amazon.com, Inc.", sector: "Consumer Discretionary", market: "US" },
  { symbol: "TSLA", name: "Tesla, Inc.", sector: "Consumer Discretionary", market: "US" },
  { symbol: "HD", name: "The Home Depot", sector: "Consumer Discretionary", market: "US" },
  { symbol: "MCD", name: "McDonald's Corporation", sector: "Consumer Discretionary", market: "US" },
  { symbol: "NKE", name: "NIKE, Inc.", sector: "Consumer Discretionary", market: "US" },
  { symbol: "SBUX", name: "Starbucks Corporation", sector: "Consumer Discretionary", market: "US" },
  { symbol: "COST", name: "Costco Wholesale", sector: "Consumer Staples", market: "US" },
  { symbol: "WMT", name: "Walmart Inc.", sector: "Consumer Staples", market: "US" },
  { symbol: "PG", name: "Procter & Gamble", sector: "Consumer Staples", market: "US" },
  { symbol: "KO", name: "The Coca-Cola Company", sector: "Consumer Staples", market: "US" },
  { symbol: "PEP", name: "PepsiCo, Inc.", sector: "Consumer Staples", market: "US" },
  { symbol: "JNJ", name: "Johnson & Johnson", sector: "Healthcare", market: "US" },
  { symbol: "LLY", name: "Eli Lilly and Company", sector: "Healthcare", market: "US" },
  { symbol: "UNH", name: "UnitedHealth Group", sector: "Healthcare", market: "US" },
  { symbol: "MRK", name: "Merck & Co.", sector: "Healthcare", market: "US" },
  { symbol: "ABBV", name: "AbbVie Inc.", sector: "Healthcare", market: "US" },
  { symbol: "PFE", name: "Pfizer Inc.", sector: "Healthcare", market: "US" },
  { symbol: "TMO", name: "Thermo Fisher Scientific", sector: "Healthcare", market: "US" },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", sector: "Financials", market: "US" },
  { symbol: "BAC", name: "Bank of America", sector: "Financials", market: "US" },
  { symbol: "V", name: "Visa Inc.", sector: "Financials", market: "US" },
  { symbol: "MA", name: "Mastercard Incorporated", sector: "Financials", market: "US" },
  { symbol: "GS", name: "The Goldman Sachs Group", sector: "Financials", market: "US" },
  { symbol: "BRK.B", name: "Berkshire Hathaway", sector: "Financials", market: "US" },
  { symbol: "XOM", name: "Exxon Mobil Corporation", sector: "Energy", market: "US" },
  { symbol: "CVX", name: "Chevron Corporation", sector: "Energy", market: "US" },
  { symbol: "COP", name: "ConocoPhillips", sector: "Energy", market: "US" },
  { symbol: "CAT", name: "Caterpillar Inc.", sector: "Industrials", market: "US" },
  { symbol: "GE", name: "GE Aerospace", sector: "Industrials", market: "US" },
  { symbol: "BA", name: "The Boeing Company", sector: "Industrials", market: "US" },
  { symbol: "UPS", name: "United Parcel Service", sector: "Industrials", market: "US" },
  { symbol: "LIN", name: "Linde plc", sector: "Materials", market: "US" },
  { symbol: "NEE", name: "NextEra Energy", sector: "Utilities", market: "US" },
  { symbol: "AMT", name: "American Tower", sector: "Real Estate", market: "US" },

  // --- India (NSE, Yahoo ".NS" suffix) ------------------------------------
  { symbol: "RELIANCE.NS", name: "Reliance Industries", sector: "Energy", market: "IN" },
  { symbol: "TCS.NS", name: "Tata Consultancy Services", sector: "Technology", market: "IN" },
  { symbol: "INFY.NS", name: "Infosys Limited", sector: "Technology", market: "IN" },
  { symbol: "WIPRO.NS", name: "Wipro Limited", sector: "Technology", market: "IN" },
  { symbol: "HCLTECH.NS", name: "HCL Technologies", sector: "Technology", market: "IN" },
  { symbol: "TECHM.NS", name: "Tech Mahindra", sector: "Technology", market: "IN" },
  { symbol: "HDFCBANK.NS", name: "HDFC Bank", sector: "Financials", market: "IN" },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank", sector: "Financials", market: "IN" },
  { symbol: "SBIN.NS", name: "State Bank of India", sector: "Financials", market: "IN" },
  { symbol: "KOTAKBANK.NS", name: "Kotak Mahindra Bank", sector: "Financials", market: "IN" },
  { symbol: "AXISBANK.NS", name: "Axis Bank", sector: "Financials", market: "IN" },
  { symbol: "BAJFINANCE.NS", name: "Bajaj Finance", sector: "Financials", market: "IN" },
  { symbol: "ITC.NS", name: "ITC Limited", sector: "Consumer Staples", market: "IN" },
  { symbol: "HINDUNILVR.NS", name: "Hindustan Unilever", sector: "Consumer Staples", market: "IN" },
  { symbol: "NESTLEIND.NS", name: "Nestle India", sector: "Consumer Staples", market: "IN" },
  { symbol: "MARUTI.NS", name: "Maruti Suzuki India", sector: "Consumer Discretionary", market: "IN" },
  { symbol: "TATAMOTORS.NS", name: "Tata Motors", sector: "Consumer Discretionary", market: "IN" },
  { symbol: "TITAN.NS", name: "Titan Company", sector: "Consumer Discretionary", market: "IN" },
  { symbol: "ASIANPAINT.NS", name: "Asian Paints", sector: "Materials", market: "IN" },
  { symbol: "ULTRACEMCO.NS", name: "UltraTech Cement", sector: "Materials", market: "IN" },
  { symbol: "TATASTEEL.NS", name: "Tata Steel", sector: "Materials", market: "IN" },
  { symbol: "SUNPHARMA.NS", name: "Sun Pharmaceutical", sector: "Healthcare", market: "IN" },
  { symbol: "DRREDDY.NS", name: "Dr. Reddy's Laboratories", sector: "Healthcare", market: "IN" },
  { symbol: "CIPLA.NS", name: "Cipla Limited", sector: "Healthcare", market: "IN" },
  { symbol: "LT.NS", name: "Larsen & Toubro", sector: "Industrials", market: "IN" },
  { symbol: "ONGC.NS", name: "Oil & Natural Gas Corp", sector: "Energy", market: "IN" },
  { symbol: "NTPC.NS", name: "NTPC Limited", sector: "Utilities", market: "IN" },
  { symbol: "POWERGRID.NS", name: "Power Grid Corporation", sector: "Utilities", market: "IN" },
  { symbol: "BHARTIARTL.NS", name: "Bharti Airtel", sector: "Communication Services", market: "IN" },
];

export const INDEXES: Record<Market | "GLOBAL", { symbol: string; label: string }[]> = {
  US: [
    { symbol: "^GSPC", label: "S&P 500" },
    { symbol: "^IXIC", label: "NASDAQ Composite" },
    { symbol: "^DJI", label: "Dow Jones" },
    { symbol: "^VIX", label: "VIX" },
  ],
  IN: [
    { symbol: "^NSEI", label: "NIFTY 50" },
    { symbol: "^BSESN", label: "SENSEX" },
    { symbol: "^NSEBANK", label: "BANK NIFTY" },
  ],
  GLOBAL: [
    { symbol: "^GSPC", label: "S&P 500" },
    { symbol: "^IXIC", label: "NASDAQ Composite" },
    { symbol: "^NSEI", label: "NIFTY 50" },
    { symbol: "^FTSE", label: "FTSE 100" },
    { symbol: "^N225", label: "Nikkei 225" },
  ],
};

export const SECTORS = Array.from(new Set(UNIVERSE.map((u) => u.sector))).sort();

export const findUniverse = (symbol: string) =>
  UNIVERSE.find((u) => u.symbol.toUpperCase() === symbol.trim().toUpperCase()) ?? null;
