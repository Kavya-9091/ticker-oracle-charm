import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Loader2, Search } from "lucide-react";

import { hasRemoteApi, remoteApi } from "@/lib/frontend-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StockList } from "@/components/stock-list";
import { AiStockAgent } from "@/components/ai-stock-agent";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tickerscope — Live Stock Prices & Company Financials" },
      {
        name: "description",
        content:
          "Enter any stock symbol to see the live price, price chart, valuation multiples, margins and balance-sheet figures — real market data, no signup.",
      },
      { property: "og:title", content: "Tickerscope — Live Stock Prices & Financials" },
      {
        property: "og:description",
        content:
          "Real-time quotes, charts and fundamentals for any listed company. Search a ticker and get the numbers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const RANGES = ["1d", "5d", "1mo", "1y", "5y"] as const;
type Range = (typeof RANGES)[number];

const fmtNum = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? "—"
    : v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const fmtBig = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, suffix] of units) {
    if (abs >= size) return `${(v / size).toFixed(2)}${suffix}`;
  }
  return v.toLocaleString("en-US");
};

const fmtPct = (v: number | null | undefined, alreadyPct = false) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? "—"
    : `${(alreadyPct ? v : v * 100).toFixed(2)}%`;

function Home() {
  const [input, setInput] = useState("AAPL");
  const [symbol, setSymbol] = useState("AAPL");
  const [range, setRange] = useState<Range>("1mo");
  const [showHits, setShowHits] = useState(false);

  const snapshot = useQuery({
    queryKey: ["snapshot", symbol, range],
    queryFn: async () => {
      if (hasRemoteApi) return remoteApi.getSnapshot({ symbol, range });
      const { getSnapshot } = await import("@/lib/stocks.functions");
      return getSnapshot({ data: { symbol, range } });
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    retry: 2,
    retryDelay: 600,
  });


  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(input.trim()), 400);
    return () => clearTimeout(id);
  }, [input]);

  const hits = useQuery({
    queryKey: ["search", debounced],
    queryFn: async () => {
      if (hasRemoteApi) return remoteApi.searchTickers(debounced);
      const { searchTickers } = await import("@/lib/stocks.functions");
      return searchTickers({ data: { query: debounced } });
    },
    enabled: debounced.length >= 1 && showHits,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: false,
  });

  const data = snapshot.data;
  const up = (data?.change ?? 0) >= 0;
  const toneClass = up ? "text-bull" : "text-bear";

  const chartData = useMemo(
    () => (data?.candles ?? []).map((c) => ({ t: c.t, c: c.c })),
    [data?.candles],
  );

  const submit = (value?: string) => {
    const next = (value ?? input).trim().toUpperCase();
    if (!next) return;
    setInput(next);
    setSymbol(next);
    setShowHits(false);
  };

  const rangeLabel: Record<Range, string> = {
    "1d": "1D",
    "5d": "5D",
    "1mo": "1M",
    "1y": "1Y",
    "5y": "5Y",
  };

  return (
    <div className="mx-auto grid w-full max-w-[92rem] gap-6 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1fr)_18rem] lg:grid-cols-[minmax(0,1fr)_20rem] lg:py-14">
    <main className="min-w-0">
      <header className="flex flex-col items-center gap-6 text-center">

        <div className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Stock <span className="text-primary">Lookup</span>
          </h1>
          <p className="mx-auto max-w-md text-base text-muted-foreground sm:text-lg">
            Enter any stock symbol to get real-time price and financial metrics
          </p>
        </div>
      </header>

      <section className="mt-10">
        <div className="relative w-full max-w-2xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="panel-surface flex items-center gap-2 rounded-2xl p-2"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setShowHits(true);
                }}
                onFocus={() => setShowHits(true)}
                onBlur={() => setTimeout(() => setShowHits(false), 150)}
                placeholder="Enter symbol — AAPL, MSFT, TSLA"
                aria-label="Stock symbol"
                className="tabular h-11 border-0 bg-transparent pl-9 text-base uppercase shadow-none focus-visible:ring-0 placeholder:normal-case placeholder:font-sans"
              />
            </div>
            <Button type="submit" className="h-11 rounded-xl px-6 font-semibold">
              Search
            </Button>
          </form>

          {showHits && (hits.data?.length ?? 0) > 0 && (
            <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-border bg-popover text-left shadow-xl">
              {hits.data!.slice(0, 7).map((h) => (
                <li key={h.symbol}>
                  <button
                    type="button"
                    onMouseDown={() => submit(h.symbol)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="tabular font-semibold text-primary">{h.symbol}</span>
                      <span className="truncate text-muted-foreground">{h.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {h.exchange} · {h.type}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {snapshot.isError && (
        <div
          role="alert"
          className="mt-8 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
        >
          {(snapshot.error as Error).message || "Market data is temporarily unavailable."}
        </div>
      )}

      {snapshot.isPending && !data && (
        <div className="mt-16 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading market data…
        </div>
      )}

      {data && (
        <div className="mt-8 space-y-6">
          <section className="panel-surface rounded-xl p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="tabular text-2xl font-semibold">{data.symbol}</h2>
                  <span className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    {data.exchange}
                  </span>
                  {data.quoteType && (
                    <span className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {data.quoteType}
                    </span>
                  )}

                </div>
                <p className="mt-1 text-sm text-muted-foreground">{data.name}</p>
              </div>
              <div className="text-right">
                <p className="tabular text-4xl font-semibold">
                  {fmtNum(data.price)}{" "}
                  <span className="text-base text-muted-foreground">{data.currency}</span>
                </p>
                <p className={`tabular mt-1 flex items-center justify-end gap-1 text-sm ${toneClass}`}>
                  {up ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
                  {fmtNum(data.change)} ({fmtPct(data.changePercent, true)})
                </p>
                {data.regularMarketTime && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    as of {new Date(data.regularMarketTime).toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex gap-1.5">
              {RANGES.map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant={r === range ? "default" : "secondary"}
                  onClick={() => setRange(r)}
                  className="tabular h-8 px-3 text-xs"
                >
                  {rangeLabel[r]}
                </Button>
              ))}
            </div>

            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor={up ? "var(--bull)" : "var(--bear)"}
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="100%"
                        stopColor={up ? "var(--bull)" : "var(--bear)"}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="t"
                    tickFormatter={(t: number) =>
                      range === "1d"
                        ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : new Date(t).toLocaleDateString([], { month: "short", day: "numeric" })
                    }
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    stroke="var(--grid)"
                    minTickGap={40}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    stroke="var(--grid)"
                    width={58}
                    tickFormatter={(v: number) => v.toFixed(2)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
                    formatter={(v) => [`${fmtNum(Number(v))} ${data.currency}`, "Close"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="c"
                    stroke={up ? "var(--bull)" : "var(--bear)"}
                    strokeWidth={2}
                    fill="url(#priceFill)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-5 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Prev close" value={fmtNum(data.previousClose)} />
              <Stat label="Day range" value={`${fmtNum(data.dayLow)} – ${fmtNum(data.dayHigh)}`} />
              <Stat
                label="52-week range"
                value={`${fmtNum(data.fiftyTwoWeekLow)} – ${fmtNum(data.fiftyTwoWeekHigh)}`}
              />
              <Stat label="Volume" value={fmtBig(data.volume)} />
              <Stat label="Market cap" value={fmtBig(data.financials.marketCap)} />
              <Stat label="Shares out" value={fmtBig(data.financials.sharesOutstanding)} />
            </dl>
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Valuation">
              <Row label="Market cap" value={fmtBig(data.financials.marketCap)} />
              <Row label="Enterprise value" value={fmtBig(data.financials.enterpriseValue)} />
              <Row label="P/E (trailing)" value={fmtNum(data.financials.trailingPE)} />
              <Row label="P/E (forward)" value={fmtNum(data.financials.forwardPE)} />
              <Row label="Price / sales" value={fmtNum(data.financials.priceToSales)} />
              <Row label="Price / book" value={fmtNum(data.financials.priceToBook)} />
              <Row label="EV / EBITDA" value={fmtNum(data.financials.evToEbitda)} />
              <Row label="EPS (diluted)" value={fmtNum(data.financials.eps)} />
            </Panel>

            <Panel title="Performance">
              <Row label="Revenue (TTM)" value={fmtBig(data.financials.revenue)} />
              <Row label="Revenue growth (YoY)" value={fmtPct(data.financials.revenueGrowth)} />
              <Row label="Net income" value={fmtBig(data.financials.netIncome)} />
              <Row label="Gross margin" value={fmtPct(data.financials.grossMargin)} />
              <Row label="Operating margin" value={fmtPct(data.financials.operatingMargin)} />
              <Row label="Profit margin" value={fmtPct(data.financials.profitMargin)} />
              <Row label="EBITDA" value={fmtBig(data.financials.ebitda)} />
              <Row label="Free cash flow" value={fmtBig(data.financials.freeCashflow)} />
            </Panel>

            <Panel title="Balance sheet">
              <Row label="Total cash" value={fmtBig(data.financials.totalCash)} />
              <Row label="Total debt" value={fmtBig(data.financials.totalDebt)} />
              <Row label="Total assets" value={fmtBig(data.financials.totalAssets)} />
              <Row label="Total liabilities" value={fmtBig(data.financials.totalLiabilities)} />
              <Row label="Shareholder equity" value={fmtBig(data.financials.equity)} />
              <Row label="Debt / equity" value={fmtPct(data.financials.debtToEquity, true)} />
              <Row label="Return on equity" value={fmtPct(data.financials.returnOnEquity)} />
              <Row label="Sector" value={data.profile.sector ?? "—"} />
            </Panel>
          </div>

          {data.annual.length > 0 && (
            <section className="panel-surface rounded-xl p-5 sm:p-6">
              <h3 className="text-sm font-semibold tracking-wide text-primary uppercase">
                Annual results {data.profile.industry ? `· ${data.profile.industry}` : ""}
              </h3>
              <div className="mt-4 overflow-x-auto">
                <table className="tabular w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="text-xs tracking-wide text-muted-foreground uppercase">
                      <th className="py-2 text-left font-medium">Fiscal year</th>
                      <th className="py-2 text-right font-medium">Revenue</th>
                      <th className="py-2 text-right font-medium">Net income</th>
                      <th className="py-2 text-right font-medium">Net margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[...data.annual].reverse().map((row) => (
                      <tr key={row.period}>
                        <td className="py-2 text-left">{row.period}</td>
                        <td className="py-2 text-right">{fmtBig(row.revenue)}</td>
                        <td className="py-2 text-right">{fmtBig(row.netIncome)}</td>
                        <td className="py-2 text-right">
                          {row.revenue && row.netIncome !== null
                            ? fmtPct(row.netIncome / row.revenue)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.financials.fiscalPeriod && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Latest reported period: {data.financials.fiscalPeriod}
                </p>
              )}
            </section>
          )}


          <p className="pb-4 text-center text-xs text-muted-foreground">
            Market data from Yahoo Finance. Quotes may be delayed by up to 15 minutes depending on
            the exchange. Not investment advice.
          </p>
        </div>
      )}
    </main>
    <StockList active={symbol} onSelect={(s) => submit(s)} />
    <AiStockAgent
      selectedSymbol={symbol}
      {...(data?.name ? { selectedName: data.name } : {})}
      onSelectStock={(s) => submit(s)}
    />
    </div>
  );
}


function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="tabular mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel-surface rounded-xl p-5">
      <h3 className="text-sm font-semibold tracking-wide text-primary uppercase">{title}</h3>
      <dl className="mt-3 divide-y divide-border">{children}</dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="tabular text-sm font-medium capitalize">{value}</dd>
    </div>
  );
}

