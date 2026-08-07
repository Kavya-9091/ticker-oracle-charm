// Server-only Yahoo Finance access. No API key required.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type Session = { cookie: string; crumb: string; at: number };
let session: Session | null = null;

async function newSession(): Promise<Session> {
  const res = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA } });
  const raw = res.headers.get("set-cookie") ?? "";
  const cookie = raw
    .split(/,(?=[^;]+=[^;]+)/)
    .map((c) => c.split(";")[0]!.trim())
    .filter(Boolean)
    .join("; ");
  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, cookie },
  });
  const crumb = (await crumbRes.text()).trim();
  return { cookie, crumb, at: Date.now() };
}

async function getSession(force = false): Promise<Session> {
  if (force || !session || Date.now() - session.at > 30 * 60_000) {
    session = await newSession();
  }
  return session;
}

const HOSTS = ["query1", "query2"] as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Short-lived response cache so repeated lookups/polling don't hammer the provider.
const cache = new Map<string, { at: number; json: any }>();
const CACHE_MS = 20_000;

async function yahoo<T>(path: string, withCrumb: boolean): Promise<T> {
  const cached = cache.get(path + String(withCrumb));
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.json as T;

  let lastStatus = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    const host = HOSTS[attempt % HOSTS.length]!;
    const s = await getSession(attempt > 1);
    const url =
      `https://${host}.finance.yahoo.com${path}` +
      (withCrumb ? `&crumb=${encodeURIComponent(s.crumb)}` : "");
    const res = await fetch(url, { headers: { "User-Agent": UA, cookie: s.cookie } });
    const text = await res.text();
    lastStatus = res.status;

    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    if (json) {
      const unauthorized =
        res.status === 401 ||
        res.status === 403 ||
        json?.finance?.error?.code === "Unauthorized" ||
        (withCrumb && json?.quoteSummary?.error?.code === "Unauthorized");
      if (!unauthorized) {
        if (json?.chart?.error) throw new Error(json.chart.error.description ?? "Symbol not found");
        if (json?.quoteSummary?.error)
          throw new Error(json.quoteSummary.error.description ?? "Financials unavailable");
        cache.set(path + String(withCrumb), { at: Date.now(), json });
        return json as T;
      }
    }

    if (res.status === 404) throw new Error("Symbol not found");
    await sleep(400 * (attempt + 1));
  }

  if (lastStatus === 429)
    throw new Error("The market data provider is rate-limiting us right now — try again shortly.");
  throw new Error(`Could not reach market data provider (status ${lastStatus}).`);
}


const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && "raw" in (v as any)) {
    const r = (v as any).raw;
    return typeof r === "number" && Number.isFinite(r) ? r : null;
  }
  return null;
};

export type Candle = { t: number; c: number };

export type Snapshot = {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  open: number | null;
  volume: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  marketState: string;
  regularMarketTime: number | null;
  candles: Candle[];
  profile: {
    sector: string | null;
    industry: string | null;
    website: string | null;
    country: string | null;
    employees: number | null;
    summary: string | null;
  };
  financials: {
    marketCap: number | null;
    trailingPE: number | null;
    forwardPE: number | null;
    eps: number | null;
    beta: number | null;
    dividendYield: number | null;
    revenue: number | null;
    revenueGrowth: number | null;
    grossMargin: number | null;
    profitMargin: number | null;
    operatingMargin: number | null;
    ebitda: number | null;
    freeCashflow: number | null;
    totalCash: number | null;
    totalDebt: number | null;
    debtToEquity: number | null;
    returnOnEquity: number | null;
    bookValue: number | null;
    priceToBook: number | null;
    targetMeanPrice: number | null;
    recommendation: string | null;
    numberOfAnalysts: number | null;
  };
};

export async function fetchSnapshot(symbolRaw: string, range: string): Promise<Snapshot> {
  const symbol = symbolRaw.trim().toUpperCase();
  const interval = range === "1d" ? "5m" : range === "5d" ? "30m" : range === "1mo" ? "1d" : "1wk";

  const chart = await yahoo<any>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`,
    false,
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

  let summary: any = {};
  try {
    const qs = await yahoo<any>(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile,summaryDetail,financialData,defaultKeyStatistics,price`,
      true,
    );
    summary = qs?.quoteSummary?.result?.[0] ?? {};
  } catch {
    summary = {};
  }

  const sd = summary.summaryDetail ?? {};
  const fd = summary.financialData ?? {};
  const ks = summary.defaultKeyStatistics ?? {};
  const ap = summary.assetProfile ?? {};
  const pr = summary.price ?? {};

  const price = num(meta.regularMarketPrice) ?? num(pr.regularMarketPrice);
  const prev = num(meta.chartPreviousClose) ?? num(sd.previousClose);
  const change = price !== null && prev !== null ? price - prev : null;

  return {
    symbol: meta.symbol ?? symbol,
    name: meta.longName ?? meta.shortName ?? symbol,
    exchange: meta.fullExchangeName ?? meta.exchangeName ?? "",
    currency: meta.currency ?? "USD",
    price,
    previousClose: prev,
    change,
    changePercent: change !== null && prev ? (change / prev) * 100 : null,
    dayHigh: num(meta.regularMarketDayHigh),
    dayLow: num(meta.regularMarketDayLow),
    open: num(sd.open) ?? num(pr.regularMarketOpen),
    volume: num(meta.regularMarketVolume),
    fiftyTwoWeekHigh: num(meta.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: num(meta.fiftyTwoWeekLow),
    marketState: pr.marketState ?? "",
    regularMarketTime: typeof meta.regularMarketTime === "number" ? meta.regularMarketTime * 1000 : null,
    candles,
    profile: {
      sector: ap.sector ?? null,
      industry: ap.industry ?? null,
      website: ap.website ?? null,
      country: ap.country ?? null,
      employees: num(ap.fullTimeEmployees),
      summary: ap.longBusinessSummary ?? null,
    },
    financials: {
      marketCap: num(sd.marketCap) ?? num(pr.marketCap),
      trailingPE: num(sd.trailingPE),
      forwardPE: num(sd.forwardPE) ?? num(ks.forwardPE),
      eps: num(ks.trailingEps),
      beta: num(sd.beta) ?? num(ks.beta),
      dividendYield: num(sd.dividendYield),
      revenue: num(fd.totalRevenue),
      revenueGrowth: num(fd.revenueGrowth),
      grossMargin: num(fd.grossMargins),
      profitMargin: num(fd.profitMargins),
      operatingMargin: num(fd.operatingMargins),
      ebitda: num(fd.ebitda),
      freeCashflow: num(fd.freeCashflow),
      totalCash: num(fd.totalCash),
      totalDebt: num(fd.totalDebt),
      debtToEquity: num(fd.debtToEquity),
      returnOnEquity: num(fd.returnOnEquity),
      bookValue: num(ks.bookValue),
      priceToBook: num(ks.priceToBook),
      targetMeanPrice: num(fd.targetMeanPrice),
      recommendation: fd.recommendationKey ?? null,
      numberOfAnalysts: num(fd.numberOfAnalystOpinions),
    },
  };
}

export type SearchHit = {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
};

export async function searchSymbols(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const json = await yahoo<any>(
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`,
    false,
  );
  return (json?.quotes ?? [])
    .filter((x: any) => x?.symbol)
    .map((x: any) => ({
      symbol: x.symbol as string,
      name: (x.longname ?? x.shortname ?? x.symbol) as string,
      exchange: (x.exchDisp ?? x.exchange ?? "") as string,
      type: (x.typeDisp ?? x.quoteType ?? "") as string,
    }));
}
