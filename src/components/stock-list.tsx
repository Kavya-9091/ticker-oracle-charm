import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

type Listing = { symbol: string; name: string };

// Directory of widely traded US-listed tickers. Selecting one loads its live
// quote and financials from the market data provider — no prices are stored here.
const LISTINGS: Listing[] = [
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "MSFT", name: "Microsoft Corporation" },
  { symbol: "NVDA", name: "NVIDIA Corporation" },
  { symbol: "AMZN", name: "Amazon.com, Inc." },
  { symbol: "GOOGL", name: "Alphabet Inc. Class A" },
  { symbol: "META", name: "Meta Platforms, Inc." },
  { symbol: "TSLA", name: "Tesla, Inc." },
  { symbol: "AVGO", name: "Broadcom Inc." },
  { symbol: "BRK.B", name: "Berkshire Hathaway Inc." },
  { symbol: "JPM", name: "JPMorgan Chase & Co." },
  { symbol: "V", name: "Visa Inc." },
  { symbol: "MA", name: "Mastercard Incorporated" },
  { symbol: "LLY", name: "Eli Lilly and Company" },
  { symbol: "UNH", name: "UnitedHealth Group" },
  { symbol: "XOM", name: "Exxon Mobil Corporation" },
  { symbol: "COST", name: "Costco Wholesale Corporation" },
  { symbol: "WMT", name: "Walmart Inc." },
  { symbol: "PG", name: "Procter & Gamble Company" },
  { symbol: "JNJ", name: "Johnson & Johnson" },
  { symbol: "HD", name: "The Home Depot, Inc." },
  { symbol: "ORCL", name: "Oracle Corporation" },
  { symbol: "AMD", name: "Advanced Micro Devices, Inc." },
  { symbol: "NFLX", name: "Netflix, Inc." },
  { symbol: "CRM", name: "Salesforce, Inc." },
  { symbol: "ADBE", name: "Adobe Inc." },
  { symbol: "BAC", name: "Bank of America Corporation" },
  { symbol: "KO", name: "The Coca-Cola Company" },
  { symbol: "PEP", name: "PepsiCo, Inc." },
  { symbol: "CVX", name: "Chevron Corporation" },
  { symbol: "MRK", name: "Merck & Co., Inc." },
  { symbol: "ABBV", name: "AbbVie Inc." },
  { symbol: "PFE", name: "Pfizer Inc." },
  { symbol: "TMO", name: "Thermo Fisher Scientific" },
  { symbol: "MCD", name: "McDonald's Corporation" },
  { symbol: "CSCO", name: "Cisco Systems, Inc." },
  { symbol: "INTC", name: "Intel Corporation" },
  { symbol: "QCOM", name: "QUALCOMM Incorporated" },
  { symbol: "TXN", name: "Texas Instruments" },
  { symbol: "MU", name: "Micron Technology, Inc." },
  { symbol: "AMAT", name: "Applied Materials, Inc." },
  { symbol: "IBM", name: "International Business Machines" },
  { symbol: "NOW", name: "ServiceNow, Inc." },
  { symbol: "UBER", name: "Uber Technologies, Inc." },
  { symbol: "ABNB", name: "Airbnb, Inc." },
  { symbol: "SHOP", name: "Shopify Inc." },
  { symbol: "PYPL", name: "PayPal Holdings, Inc." },
  { symbol: "XYZ", name: "Block, Inc." },
  { symbol: "COIN", name: "Coinbase Global, Inc." },
  { symbol: "PLTR", name: "Palantir Technologies Inc." },
  { symbol: "SNOW", name: "Snowflake Inc." },
  { symbol: "DIS", name: "The Walt Disney Company" },
  { symbol: "NKE", name: "NIKE, Inc." },
  { symbol: "SBUX", name: "Starbucks Corporation" },
  { symbol: "BA", name: "The Boeing Company" },
  { symbol: "CAT", name: "Caterpillar Inc." },
  { symbol: "GE", name: "GE Aerospace" },
  { symbol: "F", name: "Ford Motor Company" },
  { symbol: "GM", name: "General Motors Company" },
  { symbol: "RIVN", name: "Rivian Automotive, Inc." },
  { symbol: "LCID", name: "Lucid Group, Inc." },
  { symbol: "T", name: "AT&T Inc." },
  { symbol: "VZ", name: "Verizon Communications" },
  { symbol: "GS", name: "The Goldman Sachs Group" },
  { symbol: "MS", name: "Morgan Stanley" },
  { symbol: "WFC", name: "Wells Fargo & Company" },
  { symbol: "C", name: "Citigroup Inc." },
  { symbol: "AXP", name: "American Express Company" },
  { symbol: "BLK", name: "BlackRock, Inc." },
  { symbol: "SPGI", name: "S&P Global Inc." },
  { symbol: "LIN", name: "Linde plc" },
  { symbol: "HON", name: "Honeywell International" },
  { symbol: "LMT", name: "Lockheed Martin Corporation" },
  { symbol: "RTX", name: "RTX Corporation" },
  { symbol: "DE", name: "Deere & Company" },
  { symbol: "UPS", name: "United Parcel Service" },
  { symbol: "FDX", name: "FedEx Corporation" },
  { symbol: "TGT", name: "Target Corporation" },
  { symbol: "LOW", name: "Lowe's Companies, Inc." },
  { symbol: "MDT", name: "Medtronic plc" },
  { symbol: "AMGN", name: "Amgen Inc." },
  { symbol: "GILD", name: "Gilead Sciences, Inc." },
  { symbol: "BMY", name: "Bristol-Myers Squibb" },
  { symbol: "CVS", name: "CVS Health Corporation" },
  { symbol: "MMM", name: "3M Company" },
  { symbol: "CL", name: "Colgate-Palmolive Company" },
  { symbol: "MO", name: "Altria Group, Inc." },
  { symbol: "COP", name: "ConocoPhillips" },
  { symbol: "SLB", name: "Schlumberger Limited" },
  { symbol: "OXY", name: "Occidental Petroleum" },
  { symbol: "NEE", name: "NextEra Energy, Inc." },
  { symbol: "DUK", name: "Duke Energy Corporation" },
  { symbol: "SO", name: "The Southern Company" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust" },
  { symbol: "QQQ", name: "Invesco QQQ Trust" },
  { symbol: "DIA", name: "SPDR Dow Jones Industrial ETF" },
  { symbol: "IWM", name: "iShares Russell 2000 ETF" },
];

export function StockList({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (symbol: string) => void;
}) {
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return LISTINGS;
    return LISTINGS.filter(
      (l) => l.symbol.toLowerCase().includes(q) || l.name.toLowerCase().includes(q),
    );
  }, [filter]);

  return (
    <section className="panel-surface flex max-h-[26rem] flex-col rounded-xl p-4">
      <h2 className="text-sm font-semibold tracking-wide text-primary uppercase">Stocks</h2>
      <p className="mt-1 text-xs text-muted-foreground">Pick a ticker to load live data</p>

      <div className="relative mt-3">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter list…"
          aria-label="Filter stock list"
          className="h-9 pl-8 text-sm"
        />
      </div>

      <ul className="mt-3 -mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
        {rows.map((l) => {
          const isActive = l.symbol === active;
          return (
            <li key={l.symbol}>
              <button
                type="button"
                onClick={() => onSelect(l.symbol)}
                aria-current={isActive ? "true" : undefined}
                className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-colors ${
                  isActive ? "bg-primary/15 text-primary" : "hover:bg-accent"
                }`}
              >
                <span className="tabular text-sm font-semibold">{l.symbol}</span>
                <span className="w-full truncate text-xs text-muted-foreground">{l.name}</span>
              </button>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-muted-foreground">No matches</li>
        )}
      </ul>
    </section>
  );
}
