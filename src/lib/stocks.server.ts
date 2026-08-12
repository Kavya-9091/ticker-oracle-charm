// Server-only market data access (Yahoo Finance public endpoints, no API key).
// Only crumb-free endpoints are used: /v8/finance/chart, /ws/fundamentals-timeseries,
// and /v1/finance/search. Requests deliberately send no custom User-Agent —
// these endpoints reject browser-like agents from server IPs.

const HOSTS = ["query1", "query2"] as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// In-isolate cache keeps entries after expiry so we can serve stale data when
// Yahoo rate-limits us instead of failing the request for every visitor.
const cache = new Map<string, { at: number; json: any }>();
const inflight = new Map<string, Promise<any>>();
const CACHE_MS = 60_000;

// Cloudflare's Cache API is shared across isolates/requests, so one upstream
// fetch serves every visitor instead of one per worker instance.
async function edgeCache(): Promise<Cache | null> {
  try {
    const c = (globalThis as any).caches?.default;
    return c ?? null;
  } catch {
    return null;
  }
}

const cacheKeyUrl = (path: string) => `https://stock-proxy.local${path}`;

async function fetchFresh(path: string, cacheMs: number): Promise<any> {
  const edge = await edgeCache();
  const req = new Request(cacheKeyUrl(path));

  if (edge) {
    try {
      const cached = await edge.match(req);
      if (cached) {
        const json = await cached.json();
        cache.set(path, { at: Date.now(), json });
        return json;
      }
    } catch {
      /* cache read is best-effort */
    }
  }

  let lastStatus = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    const host = HOSTS[attempt % HOSTS.length]!;
    const res = await fetch(`https://${host}.finance.yahoo.com${path}`);
    lastStatus = res.status;
    const text = await res.text();

    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    if (json) {
      if (json?.chart?.error) throw new Error(json.chart.error.description ?? "Symbol not found");
      if (json?.finance?.error && !json?.timeseries)
        throw new Error(json.finance.error.description ?? "Market data unavailable");

      cache.set(path, { at: Date.now(), json });
      if (edge) {
        try {
          await edge.put(
            req,
            new Response(JSON.stringify(json), {
              headers: {
                "content-type": "application/json",
                "cache-control": `public, max-age=${Math.round(cacheMs / 1000)}`,
              },
            }),
          );
        } catch {
          /* cache write is best-effort */
        }
      }
      return json;
    }

    if (res.status === 404) throw new Error("Symbol not found");
    await sleep(350 * (attempt + 1));
  }

  if (lastStatus === 429)
    throw new Error("The market data provider is rate-limiting us right now — try again shortly.");
  throw new Error(`Could not reach market data provider (status ${lastStatus}).`);
}

async function yahoo<T>(path: string, cacheMs = CACHE_MS): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < cacheMs) return hit.json as T;

  // Coalesce concurrent requests for the same resource into one upstream call.
  const existing = inflight.get(path);
  if (existing) return (await existing) as T;

  const p = fetchFresh(path, cacheMs).finally(() => inflight.delete(path));
  inflight.set(path, p);

  try {
    return (await p) as T;
  } catch (err) {
    // Serve stale data rather than an error when the upstream is throttling.
    if (hit && !/not found/i.test(String((err as Error).message))) return hit.json as T;
    throw err;
  }
}


const fin = (v: number | null | undefined) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export type Candle = { t: number; c: number };
export type AnnualPoint = { period: string; revenue: number | null; netIncome: number | null };

export type Snapshot = {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  quoteType: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  regularMarketTime: number | null;
  candles: Candle[];
  annual: AnnualPoint[];
  profile: { sector: string | null; industry: string | null };
  financials: {
    marketCap: number | null;
    sharesOutstanding: number | null;
    enterpriseValue: number | null;
    trailingPE: number | null;
    forwardPE: number | null;
    priceToSales: number | null;
    priceToBook: number | null;
    evToEbitda: number | null;
    eps: number | null;
    revenue: number | null;
    netIncome: number | null;
    grossProfit: number | null;
    operatingIncome: number | null;
    ebitda: number | null;
    freeCashflow: number | null;
    operatingCashflow: number | null;
    capex: number | null;
    revenueGrowth: number | null;
    grossMargin: number | null;
    operatingMargin: number | null
    profitMargin: number | null;
    totalCash: number | null;
    totalDebt: number | null;
    totalAssets: number | null;
    totalLiabilities: number | null;
    equity: number | null;
    debtToEquity: number | null;
    returnOnEquity: number | null;
    fiscalPeriod: string | null;
  };
};

type TsPoint = { asOfDate?: string; reportedValue?: { raw?: number } };

function parseTimeseries(json: any): Map<string, TsPoint[]> {
  const out = new Map<string, TsPoint[]>();
  for (const entry of json?.timeseries?.result ?? []) {
    const type = entry?.meta?.type?.[0];
    if (!type) continue;
    const points = (entry[type] ?? []).filter(Boolean) as TsPoint[];
    if (points.length) out.set(type, points);
  }
  return out;
}

const last = (m: Map<string, TsPoint[]>, key: string): number | null => {
  const arr = m.get(key);
  if (!arr?.length) return null;
  return fin(arr[arr.length - 1]?.reportedValue?.raw);
};

const TRAILING = [
  "trailingPeRatio",
  "trailingForwardPeRatio",
  "trailingPsRatio",
  "trailingPbRatio",
  "trailingEnterprisesValueEBITDARatio",
  "trailingTotalRevenue",
  "trailingNetIncome",
  "trailingGrossProfit",
  "trailingOperatingIncome",
  "trailingEBITDA",
  "trailingDilutedEPS",
  "trailingFreeCashFlow",
  "trailingOperatingCashFlow",
  "trailingCapitalExpenditure",
  "quarterlyMarketCap",
  "quarterlyEnterpriseValue",
  "quarterlyOrdinarySharesNumber",
  "quarterlyTotalDebt",
  "quarterlyCashAndCashEquivalents",
  "quarterlyStockholdersEquity",
  "quarterlyTotalAssets",
  "quarterlyTotalLiabilitiesNetMinorityInterest",
];

const ANNUAL = [
  "annualTotalRevenue",
  "annualNetIncome",
  "annualTotalDebt",
  "annualCashAndCashEquivalents",
  "annualStockholdersEquity",
  "annualTotalAssets",
  "annualTotalLiabilitiesNetMinorityInterest",
  "annualDilutedEPS",
  "annualEBITDA",
  "annualGrossProfit",
  "annualOperatingIncome",
  "annualFreeCashFlow",
  "annualOperatingCashFlow",
  "annualCapitalExpenditure",
];

async function fetchYahooSnapshot(symbolRaw: string, range: string): Promise<Snapshot> {
  const symbol = symbolRaw.trim().toUpperCase();
  const interval = range === "1d" ? "5m" : range === "5d" ? "30m" : range === "1mo" ? "1d" : "1wk";

  const chart = await yahoo<any>(
    `/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`,
  );
  const result = chart?.chart?.result?.[0];
  if (!result?.meta) throw new Error(`No market data found for "${symbol}"`);
  const meta = result.meta;

  const stamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
  const candles: Candle[] = [];
  for (let i = 0; i < stamps.length; i++) {
    const c = closes[i];
    if (typeof c === "number" && Number.isFinite(c)) candles.push({ t: stamps[i]! * 1000, c });
  }

  const period2 = Math.floor(Date.now() / 1000) + 86400;
  const tsPath = (types: string[], years: number) =>
    `/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?symbol=${encodeURIComponent(
      symbol,
    )}&type=${types.join(",")}&period1=${period2 - years * 31_536_000}&period2=${period2}`;

  let m = new Map<string, TsPoint[]>();
  try {
    const [t1, t2] = await Promise.all([
      yahoo<any>(tsPath(TRAILING, 3), 5 * 60_000),
      yahoo<any>(tsPath(ANNUAL, 7), 30 * 60_000),
    ]);
    m = new Map([...parseTimeseries(t1), ...parseTimeseries(t2)]);
  } catch {
    m = new Map();
  }

  let profile = { sector: null as string | null, industry: null as string | null };
  try {
    const hits = await searchYahooSymbols(symbol);
    const match = hits.find((h) => h.symbol === (meta.symbol ?? symbol));
    if (match) profile = { sector: match.sector, industry: match.industry };
  } catch {
    /* profile is optional */
  }

  const price = fin(meta.regularMarketPrice);
  const prev = fin(meta.chartPreviousClose) ?? fin(meta.previousClose);
  const change = price !== null && prev !== null ? price - prev : null;

  const revenue = last(m, "trailingTotalRevenue") ?? last(m, "annualTotalRevenue");
  const netIncome = last(m, "trailingNetIncome") ?? last(m, "annualNetIncome");
  const grossProfit = last(m, "trailingGrossProfit") ?? last(m, "annualGrossProfit");
  const operatingIncome = last(m, "trailingOperatingIncome") ?? last(m, "annualOperatingIncome");
  const equity = last(m, "quarterlyStockholdersEquity") ?? last(m, "annualStockholdersEquity");
  const totalDebt = last(m, "quarterlyTotalDebt") ?? last(m, "annualTotalDebt");
  const shares = last(m, "quarterlyOrdinarySharesNumber");

  const annualRevenue = m.get("annualTotalRevenue") ?? [];
  const annualIncome = m.get("annualNetIncome") ?? [];
  const annual: AnnualPoint[] = annualRevenue.slice(-6).map((p) => {
    const period = (p.asOfDate ?? "").slice(0, 4);
    const income = annualIncome.find((q) => q.asOfDate === p.asOfDate);
    return {
      period,
      revenue: fin(p.reportedValue?.raw),
      netIncome: fin(income?.reportedValue?.raw),
    };
  });

  const revLast = annualRevenue.length
    ? fin(annualRevenue[annualRevenue.length - 1]?.reportedValue?.raw)
    : null;
  const revPrev =
    annualRevenue.length > 1
      ? fin(annualRevenue[annualRevenue.length - 2]?.reportedValue?.raw)
      : null;

  const marketCap =
    price !== null && shares !== null ? price * shares : last(m, "quarterlyMarketCap");

  return {
    symbol: meta.symbol ?? symbol,
    name: meta.longName ?? meta.shortName ?? symbol,
    exchange: meta.fullExchangeName ?? meta.exchangeName ?? "",
    currency: meta.currency ?? "USD",
    quoteType: meta.instrumentType ?? "",
    price,
    previousClose: prev,
    change,
    changePercent: change !== null && prev ? (change / prev) * 100 : null,
    dayHigh: fin(meta.regularMarketDayHigh),
    dayLow: fin(meta.regularMarketDayLow),
    volume: fin(meta.regularMarketVolume),
    fiftyTwoWeekHigh: fin(meta.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: fin(meta.fiftyTwoWeekLow),
    regularMarketTime:
      typeof meta.regularMarketTime === "number" ? meta.regularMarketTime * 1000 : null,
    candles,
    annual,
    profile,
    financials: {
      marketCap,
      sharesOutstanding: shares,
      enterpriseValue: last(m, "quarterlyEnterpriseValue"),
      trailingPE: last(m, "trailingPeRatio"),
      forwardPE: last(m, "trailingForwardPeRatio"),
      priceToSales: last(m, "trailingPsRatio"),
      priceToBook: last(m, "trailingPbRatio"),
      evToEbitda: last(m, "trailingEnterprisesValueEBITDARatio"),
      eps: last(m, "trailingDilutedEPS") ?? last(m, "annualDilutedEPS"),
      revenue,
      netIncome,
      grossProfit,
      operatingIncome,
      ebitda: last(m, "trailingEBITDA") ?? last(m, "annualEBITDA"),
      freeCashflow: last(m, "trailingFreeCashFlow") ?? last(m, "annualFreeCashFlow"),
      operatingCashflow: last(m, "trailingOperatingCashFlow") ?? last(m, "annualOperatingCashFlow"),
      capex: last(m, "trailingCapitalExpenditure") ?? last(m, "annualCapitalExpenditure"),
      revenueGrowth: revLast !== null && revPrev ? (revLast - revPrev) / Math.abs(revPrev) : null,
      grossMargin: grossProfit !== null && revenue ? grossProfit / revenue : null,
      operatingMargin: operatingIncome !== null && revenue ? operatingIncome / revenue : null,
      profitMargin: netIncome !== null && revenue ? netIncome / revenue : null,
      totalCash: last(m, "quarterlyCashAndCashEquivalents") ?? last(m, "annualCashAndCashEquivalents"),
      totalDebt,
      totalAssets: last(m, "quarterlyTotalAssets") ?? last(m, "annualTotalAssets"),
      totalLiabilities:
        last(m, "quarterlyTotalLiabilitiesNetMinorityInterest") ??
        last(m, "annualTotalLiabilitiesNetMinorityInterest"),
      equity,
      debtToEquity: totalDebt !== null && equity ? (totalDebt / equity) * 100 : null,
      returnOnEquity: netIncome !== null && equity ? netIncome / equity : null,
      fiscalPeriod:
        (m.get("trailingTotalRevenue")?.slice(-1)[0]?.asOfDate ?? null) ||
        (annualRevenue.slice(-1)[0]?.asOfDate ?? null),
    },
  };
}

export type SearchHit = {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
  sector: string | null;
  industry: string | null;
};

async function searchYahooSymbols(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const json = await yahoo<any>(
    `/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`,
    5 * 60_000,
  );
  return (json?.quotes ?? [])
    .filter((x: any) => x?.symbol)
    .map((x: any) => ({
      symbol: x.symbol as string,
      name: (x.longname ?? x.shortname ?? x.symbol) as string,
      exchange: (x.exchDisp ?? x.exchange ?? "") as string,
      type: (x.typeDisp ?? x.quoteType ?? "") as string,
      sector: x.sector ?? null,
      industry: x.industry ?? null,
    }));
}

const notFound = (err: unknown) =>
  /not found|no market data|no data|unknown symbol|invalid symbol/i.test(
    String((err as Error)?.message ?? ""),
  );

// Nasdaq is primary because Yahoo aggressively rate-limits shared server IPs.
// Yahoo remains a fallback for symbols or temporary failures Nasdaq cannot serve.
const snapCache = new Map<string, { at: number; snap: Snapshot }>();
const snapInflight = new Map<string, Promise<Snapshot>>();
const SNAP_MS = 25_000;

// One assembled snapshot is reused for every visitor asking for the same
// symbol/range within the TTL, so N concurrent viewers cost one upstream fetch.
export async function fetchSnapshot(symbolRaw: string, range: string): Promise<Snapshot> {
  const key = `${symbolRaw.trim().toUpperCase()}|${range}`;
  const hit = snapCache.get(key);
  if (hit && Date.now() - hit.at < SNAP_MS) return hit.snap;

  const existing = snapInflight.get(key);
  if (existing) return await existing;

  const p = buildSnapshot(symbolRaw, range)
    .then((snap) => {
      snapCache.set(key, { at: Date.now(), snap });
      return snap;
    })
    .finally(() => snapInflight.delete(key));
  snapInflight.set(key, p);

  try {
    return await p;
  } catch (err) {
    if (hit && !notFound(err)) return hit.snap;
    throw err;
  }
}

async function buildSnapshot(symbolRaw: string, range: string): Promise<Snapshot> {
  const { fetchNasdaqSnapshot } = await import("./nasdaq.server");
  try {
    return await fetchNasdaqSnapshot(symbolRaw, range);
  } catch (primaryError) {
    try {
      return await fetchYahooSnapshot(symbolRaw, range);
    } catch (fallbackError) {
      if (notFound(primaryError) || notFound(fallbackError)) {
        throw new Error(
          `We couldn\u2019t find market data for \u201C${symbolRaw.trim().toUpperCase()}\u201D. Check the symbol and try again.`,
        );
      }
      throw new Error("Live market data is temporarily unavailable. Please try again shortly.");
    }
  }
}

export async function searchSymbols(query: string): Promise<SearchHit[]> {
  try {
    const { searchNasdaq } = await import("./nasdaq.server");
    const hits = await searchNasdaq(query);
    if (hits.length) return hits;
  } catch {
    /* fall through to Yahoo */
  }
  try {
    return await searchYahooSymbols(query);
  } catch {
    return [];
  }
}

