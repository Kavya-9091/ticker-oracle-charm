// Server-only fallback market data provider (Nasdaq public web APIs, no API key).
// Used when Yahoo Finance throttles our server IP (HTTP 429), so shared links keep
// working for every visitor instead of surfacing a rate-limit error.

import type { AnnualPoint, Candle, SearchHit, Snapshot } from "./stocks.server";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const cache = new Map<string, { at: number; json: any }>();
const inflight = new Map<string, Promise<any>>();

async function nq<T>(path: string, cacheMs = 60_000): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < cacheMs) return hit.json as T;
  const existing = inflight.get(path);
  if (existing) return (await existing) as T;

  const request = (async () => {
    const res = await fetch(`https://api.nasdaq.com${path}`, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`Nasdaq request failed (status ${res.status})`);
    const json = await res.json();
    cache.set(path, { at: Date.now(), json });
    return json;
  })().finally(() => inflight.delete(path));

  inflight.set(path, request);
  try {
    return (await request) as T;
  } catch (error) {
    if (hit) return hit.json as T;
    throw error;
  }
}

const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const neg = /^\(.*\)$/.test(v.trim());
  const cleaned = v.replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
};

type Row = Record<string, string>;
type Table = { headers?: Record<string, string>; rows?: Row[] } | null;

// Nasdaq statement values are reported in thousands.
const K = 1000;

function rowValues(table: Table, label: string): (number | null)[] {
  const row = (table?.rows ?? []).find(
    (r) => (r["value1"] ?? "").trim().toLowerCase() === label.toLowerCase(),
  );
  if (!row) return [];
  return ["value2", "value3", "value4", "value5"].map((k) => num(row[k]));
}

const scale = (v: number | null) => (v === null ? null : v * K);
const first = (arr: (number | null)[]) => (arr.length ? arr[0]! : null);

function windowDays(range: string): number {
  switch (range) {
    case "1d":
      return 5;
    case "5d":
      return 10;
    case "1mo":
      return 40;
    case "1y":
      return 380;
    case "5y":
      return 1850;
    default:
      return 40;
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function fetchCandles(symbol: string, range: string): Promise<Candle[]> {
  if (range === "1d") {
    try {
      const j = await nq<any>(`/api/quote/${symbol}/chart?assetclass=stocks`, 60_000);
      const pts = (j?.data?.chart ?? [])
        .map((p: any) => ({ t: Number(p?.x), c: num(p?.y) }))
        .filter((p: any) => Number.isFinite(p.t) && p.c !== null) as Candle[];
      if (pts.length) return pts;
    } catch {
      /* fall through to daily history */
    }
  }

  const to = new Date();
  const from = new Date(to.getTime() - windowDays(range) * 86_400_000);
  const j = await nq<any>(
    `/api/quote/${symbol}/historical?assetclass=stocks&fromdate=${iso(from)}&todate=${iso(
      to,
    )}&limit=9999`,
    5 * 60_000,
  );
  const rows: Row[] = j?.data?.tradesTable?.rows ?? [];
  return rows
    .map((r) => {
      const [m, d, y] = (r["date"] ?? "").split("/");
      const t = Date.parse(`${y}-${m}-${d}T00:00:00Z`);
      const c = num(r["close"]);
      return { t, c };
    })
    .filter((p) => Number.isFinite(p.t) && p.c !== null)
    .reverse() as Candle[];
}

export async function fetchNasdaqSnapshot(symbolRaw: string, range: string): Promise<Snapshot> {
  const symbol = symbolRaw.trim().toUpperCase();

  const [info, summaryRes, finRes, candles] = await Promise.all([
    nq<any>(`/api/quote/${symbol}/info?assetclass=stocks`, 45_000),
    nq<any>(`/api/quote/${symbol}/summary?assetclass=stocks`, 5 * 60_000).catch(() => null),
    nq<any>(`/api/company/${symbol}/financials?frequency=1`, 30 * 60_000).catch(() => null),
    fetchCandles(symbol, range).catch(() => [] as Candle[]),
  ]);
  const d = info?.data;
  if (!d?.symbol) throw new Error(`No market data found for "${symbol}"`);

  const s: Record<string, any> = summaryRes?.data?.summaryData ?? {};
  const sv = (key: string) => (typeof s[key]?.value === "string" ? (s[key].value as string) : null);

  const fin = finRes?.data ?? null;
  const income: Table = fin?.incomeStatementTable ?? null;
  const balance: Table = fin?.balanceSheetTable ?? null;
  const cash: Table = fin?.cashFlowTable ?? null;

  const price = num(d.primaryData?.lastSalePrice);
  const change = num(d.primaryData?.netChange);
  const changePercent = num(d.primaryData?.percentageChange);
  const down = (d.primaryData?.deltaIndicator ?? "") === "down";
  const signedChange = change === null ? null : down ? -Math.abs(change) : Math.abs(change);
  const signedPct =
    changePercent === null ? null : down ? -Math.abs(changePercent) : Math.abs(changePercent);
  const previousClose =
    num(sv("PreviousClose")) ?? (price !== null && signedChange !== null ? price - signedChange : null);

  const [hi52, lo52] = (sv("FiftTwoWeekHighLow") ?? "").split("/");
  const [dayHi, dayLo] = (d.keyStats?.dayrange?.value ?? sv("TodayHighLow") ?? "").split("-");

  const revenues = rowValues(income, "Total Revenue").map(scale);
  const netIncomes = rowValues(income, "Net Income").map(scale);
  const grossProfits = rowValues(income, "Gross Profit").map(scale);
  const operatingIncomes = rowValues(income, "Operating Income").map(scale);
  const ebit = first(rowValues(income, "Earnings Before Interest and Tax").map(scale));
  const depreciation = first(rowValues(cash, "Depreciation").map(scale));

  const revenue = first(revenues);
  const netIncome = first(netIncomes);
  const grossProfit = first(grossProfits);
  const operatingIncome = first(operatingIncomes);

  const totalCash = first(rowValues(balance, "Cash and Cash Equivalents").map(scale));
  const shortDebt = first(
    rowValues(balance, "Short-Term Debt / Current Portion of Long-Term Debt").map(scale),
  );
  const longDebt = first(rowValues(balance, "Long-Term Debt").map(scale));
  const totalDebt =
    shortDebt === null && longDebt === null ? null : (shortDebt ?? 0) + (longDebt ?? 0);
  const totalAssets = first(rowValues(balance, "Total Assets").map(scale));
  const totalLiabilities = first(rowValues(balance, "Total Liabilities").map(scale));
  const equity =
    first(rowValues(balance, "Total Equity").map(scale)) ??
    first(rowValues(balance, "Stock Holders Equity").map(scale));

  const operatingCashflow = first(rowValues(cash, "Net Cash Flow-Operating").map(scale));
  const capex = first(rowValues(cash, "Capital Expenditures").map(scale));
  const freeCashflow =
    operatingCashflow !== null && capex !== null ? operatingCashflow - Math.abs(capex) : null;
  const ebitda = ebit !== null ? ebit + Math.abs(depreciation ?? 0) : null;

  const marketCap = num(sv("MarketCap"));
  const shares = marketCap !== null && price ? marketCap / price : null;
  const eps = netIncome !== null && shares ? netIncome / shares : null;
  const enterpriseValue =
    marketCap !== null ? marketCap + (totalDebt ?? 0) - (totalCash ?? 0) : null;

  const headers: Record<string, string> = income?.headers ?? {};
  const annual: AnnualPoint[] = ["value5", "value4", "value3", "value2"]
    .map((key, i) => {
      const idx = 3 - i; // value5 -> oldest
      const label = headers[key] ?? "";
      const year = label.split("/").pop() ?? "";
      return { period: year, revenue: revenues[idx] ?? null, netIncome: netIncomes[idx] ?? null };
    })
    .filter((p) => p.period && (p.revenue !== null || p.netIncome !== null));

  const revPrev = revenues[1] ?? null;

  return {
    symbol: d.symbol,
    name: d.companyName ?? d.symbol,
    exchange: d.exchange ?? sv("Exchange") ?? "",
    currency: d.primaryData?.currency ?? "USD",
    quoteType: d.stockType ?? d.assetClass ?? "",
    price,
    previousClose,
    change: signedChange,
    changePercent: signedPct,
    dayHigh: num(dayHi),
    dayLow: num(dayLo),
    volume: num(d.primaryData?.volume) ?? num(sv("ShareVolume")),
    fiftyTwoWeekHigh: num(hi52),
    fiftyTwoWeekLow: num(lo52),
    regularMarketTime: null,
    candles,
    annual,
    profile: { sector: sv("Sector"), industry: sv("Industry") },
    financials: {
      marketCap,
      sharesOutstanding: shares,
      enterpriseValue,
      trailingPE: price !== null && eps && eps > 0 ? price / eps : null,
      forwardPE: null,
      priceToSales: marketCap !== null && revenue ? marketCap / revenue : null,
      priceToBook: marketCap !== null && equity ? marketCap / equity : null,
      evToEbitda: enterpriseValue !== null && ebitda ? enterpriseValue / ebitda : null,
      eps,
      revenue,
      netIncome,
      grossProfit,
      operatingIncome,
      ebitda,
      freeCashflow,
      operatingCashflow,
      capex,
      revenueGrowth: revenue !== null && revPrev ? (revenue - revPrev) / Math.abs(revPrev) : null,
      grossMargin: grossProfit !== null && revenue ? grossProfit / revenue : null,
      operatingMargin: operatingIncome !== null && revenue ? operatingIncome / revenue : null,
      profitMargin: netIncome !== null && revenue ? netIncome / revenue : null,
      totalCash,
      totalDebt,
      totalAssets,
      totalLiabilities,
      equity,
      debtToEquity: totalDebt !== null && equity ? (totalDebt / equity) * 100 : null,
      returnOnEquity: netIncome !== null && equity ? netIncome / equity : null,
      fiscalPeriod: headers["value2"] ?? null,
    },
  };
}

export async function searchNasdaq(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const j = await nq<any>(`/api/autocomplete/slookup/10?search=${encodeURIComponent(q)}`, 5 * 60_000);
  return (j?.data ?? [])
    .filter((x: any) => x?.symbol)
    .map((x: any) => ({
      symbol: String(x.symbol),
      name: String(x.name ?? x.symbol),
      exchange: String(x.exchange ?? ""),
      type: String(x.subCategory || x.asset || ""),
      sector: null,
      industry: x.industry ?? null,
    }));
}
