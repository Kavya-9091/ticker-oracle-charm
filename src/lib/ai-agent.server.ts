import { computeIndicators } from "./indicators";
import { classifyIntent, isEducationQuestion, type AgentIntent } from "./ai-intent.ts";
import {
  extractInvestmentContext,
  formatHorizon,
  horizonMonths,
  horizonStyle,
  type InvestmentContext,
} from "./investment-context";
import { filterRelevantNews } from "./news-relevance";
import type { Snapshot } from "./stocks.server";
import { resolveStockSymbols, type ChatMessage } from "./stock-symbols";
import { INDEXES, UNIVERSE } from "./universe";

export type { InvestmentContext };
type TechnicalResult = Awaited<ReturnType<typeof technical>>;
type ScreeningScore = { u: (typeof UNIVERSE)[number]; snap: Snapshot; score: number };
type ShortlistScore = ScreeningScore & {
  ind: TechnicalResult;
  items: Awaited<ReturnType<typeof news>>;
  risk: string;
};

type Intent = AgentIntent;

export type AgentResponse = {
  intent: Intent;
  symbols: string[];
  toolsUsed: string[];
  dataAsOf: string;
  liveDataAvailable: boolean;
  answer: string;
};

const fmtNum = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? "unavailable"
    : v.toLocaleString("en-US", { maximumFractionDigits: digits });

const fmtPct = (v: number | null | undefined, alreadyPct = false) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? "unavailable"
    : `${(alreadyPct ? v : v * 100).toFixed(2)}%`;

const fmtBig = (v: number | null | undefined, currency = "") => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "unavailable";
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  const unit = units.find(([size]) => Math.abs(v) >= size);
  return unit
    ? `${currency}${(v / unit[0]).toFixed(2)}${unit[1]}`
    : `${currency}${v.toLocaleString("en-US")}`;
};

function mergeConversationRequest(message: string, history: ChatMessage[]) {
  const relevantHistory = history
    .slice(-8)
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
  return `${relevantHistory}\n${message}`;
}

async function quote(symbol: string) {
  const { fetchSnapshot } = await import("./stocks.server");
  return fetchSnapshot(symbol, "1y");
}

async function technical(symbol: string) {
  const { fetchDailyBars } = await import("./stocks.server");
  return computeIndicators(await fetchDailyBars(symbol, "1y"));
}

async function news(symbol: string) {
  const { fetchNews } = await import("./stocks.server");
  return fetchNews(symbol, 5);
}

async function answerQuote(symbol: string) {
  const snap = await quote(symbol);
  return {
    tools: ["get_stock_quote"],
    asOf: snap.regularMarketTime
      ? new Date(snap.regularMarketTime).toISOString()
      : new Date().toISOString(),
    markdown: `### ${snap.symbol} Quote

**Current price:** ${fmtNum(snap.price)} ${snap.currency}  
**Daily change:** ${fmtNum(snap.change)} (${fmtPct(snap.changePercent, true)})  
**Previous close:** ${fmtNum(snap.previousClose)}  
**Day range:** ${fmtNum(snap.dayLow)} - ${fmtNum(snap.dayHigh)}  
**52-week range:** ${fmtNum(snap.fiftyTwoWeekLow)} - ${fmtNum(snap.fiftyTwoWeekHigh)}  
**Volume:** ${fmtBig(snap.volume)}  
**Market cap:** ${fmtBig(snap.financials.marketCap)}
`,
  };
}

async function answerAnalysis(symbol: string) {
  const [snap, ind, items] = await Promise.all([quote(symbol), technical(symbol), news(symbol)]);
  const relevantItems = filterRelevantNews(snap.symbol, snap.name, items);
  const health =
    (snap.financials.revenueGrowth ?? 0) > 0.1 && (snap.financials.profitMargin ?? 0) > 0.1
      ? "Healthy"
      : snap.financials.netIncome && snap.financials.netIncome > 0
        ? "Mixed"
        : "Weak or unavailable";
  return {
    tools: [
      "get_stock_quote",
      "get_company_profile",
      "get_fundamentals",
      "get_technical_indicators",
      "get_stock_news",
    ],
    asOf: snap.regularMarketTime
      ? new Date(snap.regularMarketTime).toISOString()
      : new Date().toISOString(),
    markdown: `## ${snap.symbol} Analysis

### Current Market Data
Price is **${fmtNum(snap.price)} ${snap.currency}**, with a daily move of **${fmtNum(snap.change)} (${fmtPct(
      snap.changePercent,
      true,
    )})**. Market cap is **${fmtBig(snap.financials.marketCap)}** and the 52-week range is **${fmtNum(
      snap.fiftyTwoWeekLow,
    )} - ${fmtNum(snap.fiftyTwoWeekHigh)}**.

### Company Overview
${snap.name} trades on ${snap.exchange || "its listed exchange"}. Sector: **${snap.profile.sector ?? "unavailable"}**. Industry: **${
      snap.profile.industry ?? "unavailable"
    }**.

### Fundamental Health: ${health}
Revenue growth is **${fmtPct(snap.financials.revenueGrowth)}**, profit margin is **${fmtPct(
      snap.financials.profitMargin,
    )}**, ROE is **${fmtPct(snap.financials.returnOnEquity)}**, debt/equity is **${fmtPct(
      snap.financials.debtToEquity,
      true,
    )}**, and trailing P/E is **${fmtNum(snap.financials.trailingPE)}**. This is a research view, not a prediction.

### Technical Picture
Trend is **${ind.trend}**. RSI is **${fmtNum(ind.rsi14)}**, MACD histogram is **${fmtNum(
      ind.macd.histogram,
    )}**, SMA 50 is **${fmtNum(ind.sma50)}**, SMA 200 is **${fmtNum(ind.sma200)}**, support is near **${fmtNum(
      ind.levels.support,
    )}**, and resistance is near **${fmtNum(ind.levels.resistance)}**. Technical indicators describe recent behavior; they do not guarantee future price moves.

### Recent News
${relevantItems.length ? relevantItems.map((n) => `- [${n.title}](${n.link}) - ${n.publisher}`).join("\n") : `- No directly relevant recent ${snap.symbol} news was found from the provider.`}

### Bull Case
Potential positives include improving growth, strong margins, cash generation, or favorable sector momentum where supported by the latest data above.

### Bear Case
Key risks include valuation pressure, slower earnings growth, competition, macro volatility, and company-specific execution risk.

### Overall Research View
The data points to a **${health.toLowerCase()}** research profile with a **${ind.trend}** technical setup.
`,
  };
}

async function answerNews(symbol: string) {
  const snap = await quote(symbol);
  const items = filterRelevantNews(snap.symbol, snap.name, await news(symbol));
  return {
    tools: ["get_stock_quote", "get_stock_news"],
    asOf: new Date().toISOString(),
    markdown: `### Latest ${snap.name} News

${
  items.length
    ? items.map((item) => `- [${item.title}](${item.link}) - ${item.publisher}`).join("\n")
    : "- Stock-specific news is currently unavailable."
}

Only articles with strong evidence of relevance to **${snap.symbol}** are shown. The app does not substitute generic market or technology news when stock-specific articles are unavailable.`,
  };
}

async function answerCompare(symbols: string[]) {
  const rows = await Promise.all(
    symbols.slice(0, 2).map(async (s) => ({ snap: await quote(s), ind: await technical(s) })),
  );
  if (rows.length < 2) throw new Error("Comparison requires two verified symbols.");
  const title = `${rows[0]!.snap.name} vs ${rows[1]!.snap.name}`;
  const header = `| Metric | ${rows.map((r) => r.snap.symbol).join(" | ")} |\n|---|${rows.map(() => "---:|").join("")}`;
  const row = (label: string, vals: string[]) => `| ${label} | ${vals.join(" | ")} |`;
  const availableRow = (
    label: string,
    values: (number | string | null | undefined)[],
    formatter: (value: number | string) => string,
  ) => {
    if (values.every((value) => value === null || value === undefined || value === "")) return null;
    return row(
      label,
      values.map((value) =>
        value === null || value === undefined || value === "" ? "unavailable" : formatter(value),
      ),
    );
  };
  const metricRows = [
    availableRow(
      "Price",
      rows.map((r) => r.snap.price),
      (value) => `${fmtNum(Number(value))}`,
    ),
    availableRow(
      "Market cap",
      rows.map((r) => r.snap.financials.marketCap),
      (value) => fmtBig(Number(value)),
    ),
    availableRow(
      "Revenue growth",
      rows.map((r) => r.snap.financials.revenueGrowth),
      (value) => fmtPct(Number(value)),
    ),
    availableRow(
      "Profit margin",
      rows.map((r) => r.snap.financials.profitMargin),
      (value) => fmtPct(Number(value)),
    ),
    availableRow(
      "ROE",
      rows.map((r) => r.snap.financials.returnOnEquity),
      (value) => fmtPct(Number(value)),
    ),
    availableRow(
      "P/E",
      rows.map((r) => r.snap.financials.trailingPE),
      (value) => fmtNum(Number(value)),
    ),
    availableRow(
      "Debt/equity",
      rows.map((r) => r.snap.financials.debtToEquity),
      (value) => fmtPct(Number(value), true),
    ),
    availableRow(
      "RSI",
      rows.map((r) => r.ind.rsi14),
      (value) => fmtNum(Number(value)),
    ),
    availableRow(
      "1Y momentum",
      rows.map((r) => r.ind.momentum.pct1y),
      (value) => fmtPct(Number(value), true),
    ),
    availableRow(
      "Volatility",
      rows.map((r) => r.ind.annualisedVolatilityPct),
      (value) => fmtPct(Number(value), true),
    ),
    availableRow(
      "Technical trend",
      rows.map((r) => r.ind.trend),
      (value) => String(value),
    ),
  ].filter(Boolean);
  return {
    tools: ["compare_stocks", "get_stock_quote", "get_fundamentals", "get_technical_indicators"],
    asOf: new Date().toISOString(),
    markdown: `## ${title}

${header}
${metricRows.join("\n")}

The stronger candidate depends on the investor's objective: growth investors may prioritize revenue growth and momentum, while quality or income-oriented investors should care more about profitability, balance-sheet risk, valuation, and dividend history. This is research, not a buy or sell instruction.
`,
  };
}

async function answerMarketOverview() {
  const indexesBySymbol = new Map(INDEXES.GLOBAL.map((index) => [index.symbol, index]));
  const symbols = INDEXES.GLOBAL.map((x) => x.symbol);
  const snaps = await Promise.all(symbols.map((s) => quote(s).catch(() => null)));
  const rows = snaps
    .filter((s): s is Snapshot => Boolean(s))
    .map(
      (s) =>
        `| ${indexesBySymbol.get(s.symbol)?.label ?? s.name ?? s.symbol} | ${fmtNum(
          s.price,
        )} | ${fmtPct(s.changePercent, true)} |`,
    );
  if (!rows.length) throw new Error("Index data is unavailable from the market data provider.");
  return {
    tools: ["get_market_overview"],
    asOf: new Date().toISOString(),
    markdown: `### Today's Market

| Index | Level | Daily change |
|---|---:|---:|
${rows.join("\n")}

Markets should be read together with sector performance, breadth, rates, currencies, and major news. If an index value is unavailable, the market data provider did not return it for this request.
`,
  };
}

async function answerDataQualityCorrection(
  message: string,
  history: ChatMessage[],
  symbols: string[],
) {
  const combined = mergeConversationRequest(message, history).toLowerCase();
  if (/\b(market|index|today|overview|nasdaq|s&p|nifty|ftse|nikkei)\b/.test(combined)) {
    const checked = await answerMarketOverview();
    return {
      ...checked,
      tools: ["data_quality_review", ...checked.tools],
      markdown: `### Data Quality Recheck

You are right to flag suspicious market data. I revalidated the overview using the canonical index symbols and the formula:

Daily change % = (current price - previous close) / previous close x 100

${checked.markdown}

If a provider returns an implausible index move, inconsistent math, or an invalid price level, the app now suppresses that value instead of presenting it as verified.`,
    };
  }

  if (symbols[0]) {
    const checked = await answerQuote(symbols[0]);
    return {
      ...checked,
      tools: ["data_quality_review", ...checked.tools],
      markdown: `### Data Quality Recheck

You are right to challenge the number. I revalidated **${symbols[0]}** from the live provider before answering.

${checked.markdown}

If the provider response is inconsistent or fails sanity checks, I will mark the data unavailable rather than inventing a replacement.`,
    };
  }

  return {
    tools: ["data_quality_review"],
    asOf: new Date().toISOString(),
    markdown: `### Data Quality Recheck

You are right to flag that. I need either the market overview or a specific symbol to revalidate the value.

I will not invent prices, daily moves, volume, market cap, or valuation metrics. If live data cannot be verified, I will say it is temporarily unavailable.`,
  };
}

async function answerScreening(message: string) {
  const q = message.toLowerCase();
  const market = /india|indian|nifty|nse|bse|inr/.test(q) ? "IN" : "US";
  const sector = /tech|software|semiconductor/.test(q) ? "Technology" : null;
  const candidates = UNIVERSE.filter(
    (u) => u.market === market && (!sector || u.sector === sector),
  ).slice(0, 8);
  const scored = await Promise.all(
    candidates.map(async (u) => {
      const snap = await quote(u.symbol).catch(() => null);
      if (!snap) return null;
      const score =
        (snap.financials.revenueGrowth ?? 0) * 3 +
        (snap.financials.returnOnEquity ?? 0) +
        ((snap.financials.debtToEquity ?? 200) < 80 ? 0.2 : 0);
      return { u, snap, score };
    }),
  );
  const rows = scored
    .filter((item): item is ScreeningScore => Boolean(item))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(
      (x) =>
        `| ${x.snap.symbol} | ${x.u.name} | ${x.u.sector} | ${fmtPct(x.snap.financials.revenueGrowth)} | ${fmtNum(x.snap.financials.trailingPE)} | ${fmtPct(x.snap.financials.debtToEquity, true)} |`,
    );
  return {
    tools: ["screen_stocks", "get_fundamentals"],
    asOf: new Date().toISOString(),
    markdown: `### AI Stock Screener

Structured filters inferred: **market=${market}**, **sector=${sector ?? "any"}**, profitability/growth quality preferred.

| Symbol | Company | Sector | Revenue growth | P/E | Debt/equity |
|---|---|---|---:|---:|---:|
${rows.join("\n") || "| unavailable | Provider did not return enough data | - | - | - | - |"}

Use this as a research shortlist. Before investing, compare valuation, earnings durability, balance-sheet risk, and recent news for each company.
`,
  };
}

async function answerShortTermResearch(message: string) {
  const context = extractInvestmentContext(message);
  const market = context.market;
  const style = horizonStyle(context);
  const horizonLabel = formatHorizon(context.horizonValue, context.horizonUnit) ?? "unspecified";
  const horizonPhrase =
    formatHorizon(context.horizonValue, context.horizonUnit, true) ?? "unspecified";
  const tools = [
    "get_market_overview",
    "screen_stocks",
    `horizon_${style}_research`,
    "get_stock_quote",
    "get_fundamentals",
    "get_technical_indicators",
    "get_stock_news",
  ];

  if (context.wantsWhichStock && (context.horizonValue === null || context.horizonUnit === null)) {
    return {
      tools: ["investment_profile_intake"],
      asOf: new Date().toISOString(),
      markdown: `### Investment Horizon Needed

I can shortlist stocks only after the investment horizon is clear, because a 1-month trade and a 5-year investment should be researched differently.

You gave:
- Amount: **${context.amount ? `${market === "IN" ? "Rs " : "$"}${context.amount.toLocaleString("en-US")}` : "not specified"}**
- Horizon: **unspecified**
- Market: **${market === "IN" ? "India" : "US"}**
- Goal: **${context.goal ?? "potential capital appreciation"}**

Please tell me the time period, for example 4 months, 1 year, 2 years, or 5 years.`,
    };
  }

  const candidates = UNIVERSE.filter((u) => u.market === market).slice(0, 10);
  const scored = await Promise.all(
    candidates.map(async (u) => {
      const [snap, ind, items] = await Promise.all([
        quote(u.symbol).catch(() => null),
        technical(u.symbol).catch(() => null),
        news(u.symbol).catch(() => []),
      ]);
      if (!snap || !ind) return null;
      const momentumScore =
        (ind.trend === "bullish" ? 2 : ind.trend === "mixed" ? 1 : 0) +
        ((ind.momentum.pct1mo ?? 0) > 0 ? 1 : 0) +
        (ind.volume.volumeTrend === "rising" ? 1 : 0);
      const qualityScore =
        ((snap.financials.revenueGrowth ?? 0) > 0 ? 1 : 0) +
        ((snap.financials.profitMargin ?? 0) > 0.08 ? 1 : 0) +
        ((snap.financials.debtToEquity ?? 200) < 120 ? 1 : 0);
      const valuationScore =
        (snap.financials.trailingPE ?? 100) > 0 && (snap.financials.trailingPE ?? 100) < 45 ? 1 : 0;
      const volatility = ind.annualisedVolatilityPct ?? 50;
      const score =
        style === "short"
          ? momentumScore * 2 + qualityScore + valuationScore - (volatility > 55 ? 1 : 0)
          : style === "medium"
            ? momentumScore + qualityScore * 2 + valuationScore - (volatility > 60 ? 1 : 0)
            : momentumScore * 0.5 +
              qualityScore * 3 +
              valuationScore * 2 -
              (volatility > 70 ? 1 : 0);
      const risk =
        volatility > 65
          ? "Very High"
          : volatility > 45
            ? "High"
            : volatility > 25
              ? "Moderate"
              : "Low";
      return { u, snap, ind, items, score, risk };
    }),
  );
  const picks = scored
    .filter((item): item is ShortlistScore => Boolean(item))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  if (!picks.length) {
    return {
      tools,
      asOf: new Date().toISOString(),
      markdown: `### Live Data Unavailable

I cannot build a current shortlist right now because the market-data tools did not return enough reliable data.

Investment amount: **${context.amount ? `${market === "IN" ? "Rs " : "$"}${context.amount.toLocaleString("en-US")}` : "not specified"}**
Horizon: **${horizonLabel}**
Market: **${market === "IN" ? "India" : "US"}**
Goal: **${context.goal ?? "potential capital appreciation"}**

I will not invent stocks or prices. You can retry live data, or I can teach you how to evaluate ${horizonLabel} stock ideas step by step.`,
    };
  }

  const amount = context.amount ?? 10000;
  const currency = market === "IN" ? "Rs " : "$";
  const emphasis =
    style === "short"
      ? "I weighted momentum, volume, technical indicators, recent catalysts, and news more heavily because the horizon is under 3 months."
      : style === "medium"
        ? "I balanced earnings quality, fundamentals, valuation, technical trend, sector context, and recent news because the horizon is 3-12 months."
        : "I weighted business quality, revenue growth, profitability, cash flow, balance-sheet risk, valuation, and longer-term sector durability more heavily because the horizon is over 1 year.";
  const rows = picks
    .map(
      (p, i) => `### ${i + 1}. ${p.snap.symbol} - ${p.snap.name}

Current price: **${fmtNum(p.snap.price)} ${p.snap.currency}**

Why it appeared:
- Momentum: **${p.ind.trend}**
- 1-month move: **${fmtPct(p.ind.momentum.pct1mo, true)}**
- Volume trend: **${p.ind.volume.volumeTrend ?? "unavailable"}**
- Revenue growth: **${fmtPct(p.snap.financials.revenueGrowth)}**
- Valuation P/E: **${fmtNum(p.snap.financials.trailingPE)}**

Risk: **${p.risk}**

Key risk: returns over a ${horizonLabel} horizon are uncertain, and the investment can gain or lose value if market mood, earnings, valuation, or sector momentum changes.

Actions: Analyze ${p.snap.symbol} | Compare ${p.snap.symbol} | View chart | View news | Add to watchlist`,
    )
    .join("\n\n");

  const allocation = picks
    .slice(0, 3)
    .map(
      (p, i) =>
        `| ${p.snap.symbol} | ${currency}${Math.round(amount * ([0.4, 0.3, 0.2][i] ?? 0.2)).toLocaleString("en-US")} |`,
    )
    .join("\n");

  return {
    tools,
    asOf: new Date().toISOString(),
    markdown: `## ${horizonLabel.replace(/^\d/, (c) => c.toUpperCase())} Research Shortlist

${context.beginner ? "Since you're new to investing, I'll keep this simple. A stock is a small ownership piece of a company. If its price rises, your investment value can increase; if it falls, your value can decrease.\n\n" : ""}You gave:
- Investment amount: **${context.amount ? `${currency}${context.amount.toLocaleString("en-US")}` : "not specified"}**
- Horizon: **${horizonLabel}**
- Market: **${market === "IN" ? "India" : "US"}**
- Goal: **${context.goal ?? "potential capital appreciation"}**

For a ${horizonPhrase} horizon, returns are uncertain and the investment can gain or lose value. ${emphasis} These are research candidates, not guaranteed-profit picks.

${rows}

### Illustrative allocation for research

| Holding | Amount |
|---|---:|
${allocation}
| Cash buffer | ${currency}${Math.round(amount * 0.1).toLocaleString("en-US")} |

This avoids assuming one stock is guaranteed to win. The active investment context remains ${horizonLabel} throughout this research response.`,
  };
}

function answerEducation(message: string) {
  const q = message.toLowerCase();
  const pe = /p\/e|pe ratio|valuation/.test(q);
  const marketCap = /market cap|market capitalization/.test(q);
  const eps = /\beps|earnings per share\b/.test(q);
  const roe = /\broe|return on equity\b/.test(q);
  const debtToEquity = /debt to equity|debt\/equity|debt equity/.test(q);
  const freeCashFlow = /free cash flow|fcf/.test(q);
  const rsi = /\brsi\b/.test(q);
  const macd = /\bmacd\b/.test(q);
  const sma = /\bsma|moving average|sma 50|sma 200\b/.test(q);
  const forecast =
    /\b(tomorrow|next week|next month|forecast|predict|prediction|target price)\b/.test(q);
  const stocksBasics = /stock|share|market|invest|how.*work|work/.test(q);
  return {
    tools: ["education_knowledge_base"],
    asOf: new Date().toISOString(),
    markdown: forecast
      ? `### Price Forecasts

I cannot know a stock's exact future price, and I should not present a tomorrow price as fact.

For short-term moves, traders usually look at verified current price, volume, trend, support/resistance, earnings dates, news, market direction, and volatility. Even then, the result is uncertain.

If you want, ask for current verified data or technical context, and I will use market-data tools first.`
      : pe
        ? `### P/E Ratio

The price-to-earnings ratio compares a company's stock price with its earnings per share. A higher P/E can mean investors expect stronger future growth, but it can also mean the stock is expensive if growth does not arrive.

Use P/E alongside revenue growth, margins, cash flow, debt, competitive position, and interest-rate conditions. It is not a standalone buy or sell signal.`
        : marketCap
          ? `### Market Capitalization

Market capitalization is the total market value of a company's shares.

Formula:

| Metric | Meaning |
|---|---|
| Share price | Current market price of one share |
| Shares outstanding | Number of company shares currently issued |
| Market cap | Share price multiplied by shares outstanding |

Market cap helps classify company size, but it is not the same as revenue, profit, cash, or intrinsic value.`
          : eps
            ? `### EPS

Earnings per share is the company's profit divided by its shares outstanding. It shows how much profit belongs to each share.

Higher EPS can be positive, but compare it with revenue growth, margins, debt, valuation, and whether earnings are repeatable.`
            : roe
              ? `### ROE

Return on equity measures how efficiently a company generates profit from shareholder equity.

Formula: net income / shareholder equity.

High ROE can be attractive, but very high debt can artificially lift it, so check debt/equity and cash flow too.`
              : debtToEquity
                ? `### Debt to Equity

Debt to equity compares a company's debt with shareholder equity. It helps show balance-sheet leverage.

A lower ratio usually means less financial risk, but normal levels vary by sector. Banks, utilities, and industrial companies should not be judged by the same threshold.`
                : freeCashFlow
                  ? `### Free Cash Flow

Free cash flow is cash left after a company pays for operating needs and capital spending.

It matters because companies can use free cash flow for reinvestment, dividends, buybacks, debt reduction, or acquisitions. Positive free cash flow is useful, but consistency matters.`
                  : rsi
                    ? `### RSI

RSI, or Relative Strength Index, is a momentum indicator that compares recent gains with recent losses.

It is commonly read on a 0-100 scale. Above 70 can suggest a stock is stretched upward, while below 30 can suggest it is stretched downward. RSI is not a prediction; it is one context signal.`
                    : macd
                      ? `### MACD

MACD is a momentum indicator based on the difference between shorter and longer moving averages.

Traders often watch the MACD line, signal line, and histogram to understand whether momentum is improving or weakening. It should be used with price trend, volume, support/resistance, and fundamentals.`
                      : sma
                        ? `### Simple Moving Average

SMA is the average closing price over a period, such as 50 days or 200 days.

The SMA 50 is often used for medium-term trend, while the SMA 200 is used for longer-term trend. A price above these averages can show strength, but it does not guarantee future returns.`
                        : stocksBasics
                          ? `### How Stocks Work

A stock is a small ownership share in a company. When you buy a stock, you own a tiny piece of that business.

You can make money in two main ways:

| Way | What it means |
|---|---|
| Price increase | You buy at one price and sell later at a higher price |
| Dividends | Some companies share part of their profit with shareholders |

The price moves because buyers and sellers constantly react to earnings, growth, news, interest rates, sector trends, and market mood. If more investors want to buy than sell, the price usually rises. If more want to sell, it usually falls.

Important basics:
- Higher potential return usually comes with higher risk
- No stock gives guaranteed profit
- Short periods can be unpredictable
- Diversifying across more than one stock can reduce single-company risk
- Before investing, check the company's business, revenue growth, profit, debt, valuation, news, and your time horizon

If you are new, start by learning with small amounts, avoid borrowing money to invest, and keep emergency cash separate from stock investments.`
                          : `### Research Assistant

Ask me for quotes, full stock analysis, comparisons, market summaries, screeners, technical indicators, news context, portfolio risk, or investing research. For current market questions I will call live-data tools first and show data freshness.`,
  };
}

function answerInvestmentResearch(message: string) {
  const context = extractInvestmentContext(message);
  const hasHorizon = context.horizonValue !== null && context.horizonUnit !== null;
  const hasRisk = context.riskTolerance !== null;
  const hasExplicitMarket =
    context.currency !== null ||
    /\b(india|indian|us|usa|global|nifty|nse|bse|nasdaq)\b/i.test(message);
  const hasObjective = context.goal !== null;
  const currency = context.market === "IN" ? "Rs " : "$";
  const q = message.toLowerCase();

  if (
    /\b(duration|horizon|time period)\b/.test(q) &&
    /\b(average profit|better|best|profit)\b/.test(q)
  ) {
    return {
      tools: ["education_knowledge_base"],
      asOf: new Date().toISOString(),
      markdown: `### Investment Duration and Profit

There is no guaranteed "average profit" duration. In general, a longer horizon gives a good business or diversified fund more time to recover from bad market phases, but it still does not guarantee a positive return.

For a one-year horizon, stocks can lose money even when the company is good, because valuation, earnings surprises, interest rates, and market mood can move sharply. For money needed exactly after one year, safer and more liquid choices usually deserve more weight than aggressive stock picks.

The better duration depends on:
- When you need the money
- Risk comfort
- Market/country
- Objective: growth, income, capital preservation, or balanced
- Existing investments and emergency cash

This is educational guidance, not a promise of profit.`,
    };
  }

  if (/\b(one year|1 year)\b/.test(q) && /\bstocks?\b/.test(q)) {
    return {
      tools: ["education_knowledge_base"],
      asOf: new Date().toISOString(),
      markdown: `### Is One Year Good for Stocks?

One year can work for stock research, but it is a short equity horizon. Even strong companies can be negative over one year because earnings, valuation, interest rates, currency moves, and market sentiment can change quickly.

If the money is needed exactly after one year, consider keeping a larger part in safer or more liquid options and only taking stock risk with money you can tolerate seeing fall temporarily.

Before choosing stocks or index funds, clarify:
- Market/country
- Risk comfort
- Objective
- Whether the money is required exactly after one year
- Existing investments and emergency cash

No one-year stock plan has guaranteed average profit.`,
    };
  }

  const missing = [
    !hasHorizon ? "investment horizon" : null,
    !hasRisk ? "risk comfort" : null,
    !hasExplicitMarket ? "market or country" : null,
    !hasObjective ? "investment objective" : null,
    "whether you need the money exactly at the end of the horizon",
    "your existing investments or emergency cash position",
  ].filter(Boolean);

  if (context.wantsWhichStock && missing.length) {
    return {
      tools: ["investment_profile_intake"],
      asOf: new Date().toISOString(),
      markdown: `### I Need Two Details

I understood this much from your question:
- Investment amount: **${context.amount ? `${currency}${context.amount.toLocaleString("en-US")}` : "not specified"}**
- Market: **${context.market === "IN" ? "India" : "US"}**
- Goal: **${context.goal ?? "potential capital appreciation"}**
- Horizon: **${formatHorizon(context.horizonValue, context.horizonUnit) ?? "not specified"}**
- Risk comfort: **${context.riskTolerance ?? "not specified"}**

To shortlist stocks properly, please reply with the missing ${missing.join(" and ")}.

Example: **I want to invest Rs 10,000 for 1 year with moderate risk.**

I will then build a research shortlist using live market data, fundamentals, valuation, technical trend, and risk notes. I will not call any stock “guaranteed profit.”`,
    };
  }

  if (missing.length) {
    return {
      tools: ["investment_profile_intake"],
      asOf: new Date().toISOString(),
      markdown: `### Investment Details Needed

I understood this much:
- Investment amount: **${context.amount ? `${context.currency ?? currency}${context.amount.toLocaleString("en-US")}` : "not specified"}**
- Horizon: **${formatHorizon(context.horizonValue, context.horizonUnit) ?? "not specified"}**
- Market/country: **${hasExplicitMarket ? (context.market === "IN" ? "India" : "US") : "not specified"}**
- Risk comfort: **${context.riskTolerance ?? "not specified"}**
- Objective: **${context.goal ?? "not specified"}**

Before suggesting any research shortlist, please answer:

| Question | Examples |
|---|---|
| Market/country | India, US, global |
| Risk comfort | Low, moderate, high |
| Objective | Growth, dividends, balanced, capital preservation |
| Money needed exactly after one year? | Yes / no |
| Existing investments and emergency cash | None, mutual funds, stocks, FD/debt, emergency fund |

For a one-year horizon especially, I will avoid pretending any stock has guaranteed or average profit. Current market data must be verified before I name live stock candidates.`,
    };
  }

  return {
    tools: ["investment_profile_intake", "screen_stocks"],
    asOf: new Date().toISOString(),
    markdown: `### Research Framework

For a multi-year, moderate-risk plan, research a diversified mix rather than one stock: broad-market exposure, high-quality compounders, profitable technology, resilient financials, consumer staples, and some cash or short-duration debt for flexibility.

A sensible stock shortlist process is: screen for positive cash flow, manageable debt, durable revenue growth, reasonable valuation versus peers, and clean recent news. Then compare 5-8 candidates before deciding position sizes.

No stock is guaranteed to rise. Market performance is uncertain, and this is educational research rather than personalized financial advice.`,
  };
}

type Holding = { symbol: string; qty: number; price: number | null };

function resolveHoldingSymbol(token: string) {
  const upper = token.toUpperCase();
  const universe = UNIVERSE.find((u) => u.symbol === upper || u.symbol.split(".")[0] === upper);
  return universe?.symbol ?? (/^[A-Z]{1,5}(\.[A-Z]{2})?$/.test(upper) ? upper : null);
}

function parseHoldings(text: string): Holding[] {
  const skip = new Set([
    "STOCK",
    "STOCKS",
    "QUANTITY",
    "QTY",
    "PURCHASE",
    "PRICE",
    "SYMBOL",
    "HOLDING",
    "HOLDINGS",
    "SHARE",
    "SHARES",
    "AVG",
    "TOTAL",
    "MY",
    "THE",
    "AND",
    "FOR",
  ]);
  const out: Holding[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\n/)) {
    const line = rawLine.replace(/\|/g, " ").replace(/,/g, "").trim();
    const match = line.match(/^([A-Za-z]{1,5}(?:\.[A-Za-z]{2})?)\s+([\d.]+)(?:\s+([\d.]+))?/);
    if (!match) continue;
    const symbol = resolveHoldingSymbol(match[1]!);
    if (!symbol || skip.has(symbol) || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push({ symbol, qty: Number(match[2]), price: match[3] ? Number(match[3]) : null });
  }

  if (!out.length) {
    for (const match of text
      .replace(/,/g, "")
      .matchAll(/([A-Za-z]{1,5}(?:\.[A-Za-z]{2})?)(\d+(?:\.\d+)?)/g)) {
      const symbol = resolveHoldingSymbol(match[1]!);
      if (!symbol || skip.has(symbol) || seen.has(symbol)) continue;
      seen.add(symbol);
      out.push({ symbol, qty: Number(match[2]), price: null });
    }
  }

  return out.filter((h) => Number.isFinite(h.qty) && h.qty > 0).slice(0, 12);
}

async function answerPortfolio(holdings: Holding[]) {
  const rows = await Promise.all(
    holdings.map(async (h) => ({ h, snap: await quote(h.symbol).catch(() => null) })),
  );
  const valued = rows.map(({ h, snap }) => ({
    h,
    snap,
    live: snap?.price ?? null,
    current: snap?.price != null ? h.qty * snap.price : null,
    invested: h.price != null ? h.qty * h.price : null,
  }));
  const total = valued.reduce((sum, row) => sum + (row.current ?? 0), 0);
  const totalInvested = valued.reduce((sum, row) => sum + (row.invested ?? 0), 0);
  const table = valued
    .map((row) => {
      const weight = row.current != null && total > 0 ? (row.current / total) * 100 : null;
      const pl =
        row.invested != null && row.current != null && row.invested > 0
          ? ((row.current - row.invested) / row.invested) * 100
          : null;
      return `| ${row.h.symbol} | ${row.h.qty} | ${row.h.price != null ? fmtNum(row.h.price) : "not given"} | ${fmtNum(row.live)} | ${row.current != null ? fmtNum(row.current) : "unavailable"} | ${weight != null ? `${weight.toFixed(1)}%` : "-"} | ${pl != null ? `${pl.toFixed(2)}%` : "-"} |`;
    })
    .join("\n");
  const sectors = new Map<string, number>();
  for (const row of valued) {
    if (row.current == null) continue;
    const sector = row.snap?.profile.sector ?? "Unknown";
    sectors.set(sector, (sectors.get(sector) ?? 0) + row.current);
  }
  const sectorRows = [...sectors.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(
      ([sector, value]) =>
        `- **${sector}**: ${total > 0 ? ((value / total) * 100).toFixed(1) : "0"}%`,
    )
    .join("\n");
  const top = valued
    .filter((row) => row.current != null)
    .sort((a, b) => (b.current ?? 0) - (a.current ?? 0))[0];
  const topWeight =
    top?.current != null && total > 0 ? ((top.current / total) * 100).toFixed(1) : null;
  const totalPl =
    totalInvested > 0 && total > 0
      ? (((total - totalInvested) / totalInvested) * 100).toFixed(2)
      : null;
  const missingPrices = valued.filter((row) => row.h.price == null).map((row) => row.h.symbol);

  return {
    tools: ["analyze_portfolio", "get_stock_quote", "get_company_profile"],
    asOf: new Date().toISOString(),
    markdown: `### Portfolio Analysis

| Stock | Qty | Buy price | Live price | Current value | Weight | P/L |
|---|---:|---:|---:|---:|---:|---:|
${table}

**Current portfolio value:** ${total > 0 ? fmtNum(total) : "unavailable"}${totalPl !== null ? `; **Overall P/L:** ${totalPl}%` : ""}

### Sector Exposure
${sectorRows || "- Sector data unavailable"}

### Concentration Risk
${top && topWeight !== null ? `Largest position is **${top.h.symbol}** at **${topWeight}%** of current value.` : "Concentration could not be computed from available data."}

${missingPrices.length ? `Note: purchase price was unclear for ${missingPrices.join(", ")}, so P/L could not be computed for those holdings. Resend as \`SYMBOL quantity buyPrice\` for exact figures.\n\n` : ""}This is educational analysis based only on verified provider data, not investment advice.`,
  };
}

const PORTFOLIO_INTAKE = `### Portfolio Analysis

I can help analyze concentration risk, sector exposure, underperforming positions, volatility, diversification, and allocation.

To start, send holdings like this:

| Stock | Quantity | Purchase price |
|---|---:|---:|
| AAPL | 5 | 180 |
| MSFT | 3 | 310 |

I will not buy or sell anything. I will only provide educational analysis and risk observations.`;

function answerUnavailable(intent: Intent, symbols: string[], error: unknown) {
  const details = (error as Error).message;
  const symbolText = symbols.length ? ` for **${symbols.join(", ")}**` : "";
  const common = `Live market data is temporarily unavailable, so I cannot verify current prices or fresh market metrics right now.\n\nDetails: ${details}`;

  if (intent === "QUOTE") {
    return `### Quote Temporarily Unavailable

I found the quote request${symbolText}, but the live price provider did not return reliable data.

${common}`;
  }

  if (intent === "STOCK_COMPARISON") {
    return `### Comparison Temporarily Unavailable

I found the comparison request${symbolText}, but I cannot compare current prices, fundamentals, and technical indicators without live data.

${common}`;
  }

  if (intent === "MARKET_OVERVIEW") {
    return `### Market Overview Temporarily Unavailable

I understood this as a market-summary request, but index data is not available from the provider right now.

${common}`;
  }

  if (intent === "DATA_QUALITY_CORRECTION") {
    return `### Data Quality Recheck Temporarily Unavailable

You are right to flag suspicious data. I tried to revalidate it, but the live provider did not return reliable data.

I will not replace it with guessed prices, index levels, market cap, volume, or percentage changes.

${common}`;
  }

  if (
    intent === "STOCK_ANALYSIS" ||
    intent === "TECHNICAL_ANALYSIS" ||
    intent === "NEWS" ||
    intent === "RISK_ANALYSIS"
  ) {
    return `### Stock Analysis Temporarily Unavailable

I found the analysis request${symbolText}, but the data needed for a reliable answer is unavailable right now.

${common}`;
  }

  if (intent === "SHORT_TERM_INVESTMENT_RESEARCH" || intent === "STOCK_SCREENING") {
    return `### Stock Screening Temporarily Unavailable

I understood this as a stock-shortlist request, but I cannot build a trustworthy shortlist without current market data.

${common}`;
  }

  return `Market data is temporarily unavailable. I do not have enough reliable live data to answer that accurately right now.\n\nDetails: ${details}`;
}

export async function runStockAgent(
  message: string,
  history: ChatMessage[] = [],
  selectedSymbol?: string,
): Promise<AgentResponse> {
  const effectiveMessage = mergeConversationRequest(message, history);
  const symbols = resolveStockSymbols(message, history, selectedSymbol);
  const intent = classifyIntent(message, symbols);
  try {
    const result =
      intent === "SHORT_TERM_INVESTMENT_RESEARCH"
        ? await answerShortTermResearch(effectiveMessage)
        : intent === "INVESTMENT_RESEARCH"
          ? answerInvestmentResearch(message)
          : intent === "DATA_QUALITY_CORRECTION"
            ? await answerDataQualityCorrection(message, history, symbols)
            : intent === "PORTFOLIO_ANALYSIS"
              ? await (async () => {
                  const holdings = parseHoldings(effectiveMessage);
                  return holdings.length
                    ? await answerPortfolio(holdings)
                    : {
                        tools: ["analyze_portfolio"],
                        asOf: new Date().toISOString(),
                        markdown: PORTFOLIO_INTAKE,
                      };
                })()
              : intent === "QUOTE" && symbols[0]
                ? await answerQuote(symbols[0])
                : intent === "STOCK_COMPARISON" && symbols.length >= 2
                  ? await answerCompare(symbols)
                  : intent === "NEWS" && symbols[0]
                    ? await answerNews(symbols[0])
                    : intent === "MARKET_OVERVIEW"
                      ? await answerMarketOverview()
                      : intent === "STOCK_SCREENING"
                        ? await answerScreening(message)
                        : intent === "EDUCATION"
                          ? answerEducation(message)
                          : symbols[0]
                            ? await answerAnalysis(symbols[0])
                            : answerEducation(message);

    return {
      intent,
      symbols,
      toolsUsed: result.tools,
      dataAsOf: result.asOf,
      liveDataAvailable: true,
      answer: result.markdown,
    };
  } catch (error) {
    return {
      intent,
      symbols,
      toolsUsed: [],
      dataAsOf: new Date().toISOString(),
      liveDataAvailable: false,
      answer: answerUnavailable(intent, symbols, error),
    };
  }
}
