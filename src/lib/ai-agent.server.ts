import { computeIndicators } from "./indicators";
import { INDEXES, UNIVERSE } from "./universe";

type ChatMessage = { role: "user" | "assistant"; content: string };

type Intent =
  | "QUOTE"
  | "STOCK_ANALYSIS"
  | "TECHNICAL_ANALYSIS"
  | "NEWS"
  | "MARKET_OVERVIEW"
  | "STOCK_COMPARISON"
  | "STOCK_SCREENING"
  | "PORTFOLIO_ANALYSIS"
  | "EDUCATION"
  | "INVESTMENT_RESEARCH"
  | "SHORT_TERM_INVESTMENT_RESEARCH"
  | "RISK_ANALYSIS";

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
  return unit ? `${currency}${(v / unit[0]).toFixed(2)}${unit[1]}` : `${currency}${v.toLocaleString("en-US")}`;
};

const tokeniseSymbols = (text: string) => {
  const knownNames = new Map([
    ["APPLE", "AAPL"],
    ["MICROSOFT", "MSFT"],
    ["NVIDIA", "NVDA"],
    ["TESLA", "TSLA"],
    ["GOOGLE", "GOOGL"],
    ["AMAZON", "AMZN"],
    ["SOUTHERN COMPANY", "SO"],
    ["RELIANCE", "RELIANCE.NS"],
    ["TCS", "TCS.NS"],
    ["INFOSYS", "INFY.NS"],
    ["INFY", "INFY.NS"],
    ["HDFC", "HDFCBANK.NS"],
    ["ICICI", "ICICIBANK.NS"],
    ["SBIN", "SBIN.NS"],
    ["ITC", "ITC.NS"],
  ]);
  const out = new Set<string>();
  const upper = text.toUpperCase();
  for (const [name, symbol] of knownNames) if (upper.includes(name)) out.add(symbol);
  for (const match of text.matchAll(/\b[A-Z]{2,5}(?:\.NS)?\b/g)) {
    const raw = match[0]!.toUpperCase();
    if (
      [
        "AI",
        "I",
        "ME",
        "MY",
        "PE",
        "RSI",
        "US",
        "IN",
        "NSE",
        "BSE",
        "CEO",
        "OK",
      ].includes(raw)
    )
      continue;
    const universe = UNIVERSE.find((u) => u.symbol === raw || u.symbol.replace(".NS", "") === raw);
    if (universe) out.add(universe.symbol);
  }
  return Array.from(out).slice(0, 5);
};

function extractProfile(message: string) {
  const normalized = message.replace(/,/g, "");
  const amountMatches = [
    ...normalized.matchAll(/(?:rs\.?|inr)\s*(\d+(?:\.\d+)?\s*(?:lakh|lac|k)?|\d+)/gi),
    ...normalized.matchAll(/\b(\d+(?:\.\d+)?\s*(?:lakh|lac|k))\b/gi),
    ...normalized.matchAll(
      /\b(?:amount|invest|investment|capital|budget|have|given|make it|change it to)\s*(?:is|to|as)?\s*(\d+(?:\.\d+)?)\b/gi,
    ),
  ].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const amountText = amountMatches.at(-1)?.[1]?.trim() ?? null;
  const amount =
    amountText && /lakh|lac/i.test(amountText)
      ? Number.parseFloat(amountText) * 100000
      : amountText && /k/i.test(amountText)
        ? Number.parseFloat(amountText) * 1000
        : amountText
          ? Number.parseFloat(amountText)
          : null;
  const horizonMatches = [...normalized.matchAll(/\b(\d+)\s*(day|days|week|weeks|month|months|year|years)\b/gi)].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  );
  const horizonMatch = horizonMatches.at(-1);
  const horizon = horizonMatch ? `${horizonMatch[1]} ${horizonMatch[2]}` : null;
  const currency =
    /rs\.?|inr|lakh|lac/i.test(message) || (amount !== null && !/\$|usd/i.test(message))
      ? "INR"
      : /\$|usd/i.test(message)
        ? "USD"
        : null;
  const beginner = /don't know|dont know|beginner|new to|explain how|how it work|how does.*work/i.test(message);
  const wantsWhichStock =
    /which stock|what stock|should i buy|stock.*buy|research.*stock|make profit|profit|shortlist|candidate/i.test(
      message,
    );
  const months = horizonMatch && /month/i.test(horizonMatch[2]!) ? Number(horizonMatch[1]) : null;
  return {
    amount,
    currency,
    horizon,
    beginner,
    wantsWhichStock,
    shortTerm: wantsWhichStock && (months !== null ? months <= 12 : /short.?term|few months/i.test(message)),
  };
}

function mergeConversationRequest(message: string, history: ChatMessage[]) {
  const relevantHistory = history
    .slice(-8)
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
  return `${relevantHistory}\n${message}`;
}
function classify(message: string, symbols: string[]): Intent {
  const q = message.toLowerCase();
  const profile = extractProfile(message);
  if (profile.shortTerm) return "SHORT_TERM_INVESTMENT_RESEARCH";
  if (/portfolio|holding|allocation|diversif/.test(q)) return "PORTFOLIO_ANALYSIS";
  if (/compare| vs | versus |better/.test(q) && symbols.length >= 2) return "STOCK_COMPARISON";
  if (/screen|find|filter|strong growth|dividend|profitable|low debt/.test(q)) return "STOCK_SCREENING";
  if (/market today|summary|nifty|sensex|nasdaq|s&p|dow|sector/.test(q)) return "MARKET_OVERVIEW";
  if (/why|fall|fell|down|news|happened|week|today/.test(q) && symbols.length) return "NEWS";
  if (/technical|rsi|macd|moving average|support|resistance|momentum/.test(q)) return "TECHNICAL_ANALYSIS";
  if (/invest|buy|lakh|long.?term|risk|horizon|recommend/.test(q)) return "INVESTMENT_RESEARCH";
  if (/risk|overvalued|valuation/.test(q) && symbols.length) return "RISK_ANALYSIS";
  if (/what is|explain|meaning|p\/e|pe ratio|eps|roe/.test(q) && !symbols.length) return "EDUCATION";
  if (/price|quote|current/.test(q) && symbols.length) return "QUOTE";
  return symbols.length ? "STOCK_ANALYSIS" : "EDUCATION";
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
    asOf: snap.regularMarketTime ? new Date(snap.regularMarketTime).toISOString() : new Date().toISOString(),
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
  const health =
    (snap.financials.revenueGrowth ?? 0) > 0.1 && (snap.financials.profitMargin ?? 0) > 0.1
      ? "Healthy"
      : snap.financials.netIncome && snap.financials.netIncome > 0
        ? "Mixed"
        : "Weak or unavailable";
  return {
    tools: ["get_stock_quote", "get_company_profile", "get_fundamentals", "get_technical_indicators", "get_stock_news"],
    asOf: snap.regularMarketTime ? new Date(snap.regularMarketTime).toISOString() : new Date().toISOString(),
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
${items.length ? items.map((n) => `- [${n.title}](${n.link}) - ${n.publisher}`).join("\n") : "- Recent news is unavailable from the provider right now."}

### Bull Case
Potential positives include improving growth, strong margins, cash generation, or favorable sector momentum where supported by the latest data above.

### Bear Case
Key risks include valuation pressure, slower earnings growth, competition, macro volatility, and company-specific execution risk.

### Overall Research View
The data points to a **${health.toLowerCase()}** research profile with a **${ind.trend}** technical setup.
`,
  };
}

async function answerCompare(symbols: string[]) {
  const rows = await Promise.all(symbols.map(async (s) => ({ snap: await quote(s), ind: await technical(s) })));
  const header = `| Metric | ${rows.map((r) => r.snap.symbol).join(" | ")} |\n|---|${rows.map(() => "---|").join("")}`;
  const row = (label: string, vals: string[]) => `| ${label} | ${vals.join(" | ")} |`;
  return {
    tools: ["compare_stocks", "get_stock_quote", "get_fundamentals", "get_technical_indicators"],
    asOf: new Date().toISOString(),
    markdown: `### Stock Comparison

${header}
${row("Price", rows.map((r) => `${fmtNum(r.snap.price)} ${r.snap.currency}`))}
${row("Market cap", rows.map((r) => fmtBig(r.snap.financials.marketCap)))}
${row("Revenue growth", rows.map((r) => fmtPct(r.snap.financials.revenueGrowth)))}
${row("P/E", rows.map((r) => fmtNum(r.snap.financials.trailingPE)))}
${row("ROE", rows.map((r) => fmtPct(r.snap.financials.returnOnEquity)))}
${row("Debt/equity", rows.map((r) => fmtPct(r.snap.financials.debtToEquity, true)))}
${row("Free cash flow", rows.map((r) => fmtBig(r.snap.financials.freeCashflow)))}
${row("1Y momentum", rows.map((r) => fmtPct(r.ind.momentum.pct1y, true)))}
${row("Technical trend", rows.map((r) => r.ind.trend))}

The stronger candidate depends on the investor's objective: growth investors may prioritize revenue growth and momentum, while quality or income-oriented investors should care more about profitability, balance-sheet risk, valuation, and dividend history. This is research, not a buy or sell instruction.
`,
  };
}

async function answerMarketOverview() {
  const symbols = INDEXES.GLOBAL.map((x) => x.symbol);
  const snaps = await Promise.all(symbols.map((s) => quote(s).catch(() => null)));
  const rows = snaps.filter(Boolean).map((s: any) => `| ${s.name || s.symbol} | ${fmtNum(s.price)} | ${fmtPct(s.changePercent, true)} |`);
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

async function answerScreening(message: string) {
  const q = message.toLowerCase();
  const market = /india|indian|nifty|nse|bse|inr/.test(q) ? "IN" : "US";
  const sector = /tech|software|semiconductor/.test(q) ? "Technology" : null;
  const candidates = UNIVERSE.filter((u) => u.market === market && (!sector || u.sector === sector)).slice(0, 8);
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
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 5)
    .map((x: any) => `| ${x.snap.symbol} | ${x.u.name} | ${x.u.sector} | ${fmtPct(x.snap.financials.revenueGrowth)} | ${fmtNum(x.snap.financials.trailingPE)} | ${fmtPct(x.snap.financials.debtToEquity, true)} |`);
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
  const profile = extractProfile(message);
  const market = profile.currency === "INR" || /india|indian|nse|bse|nifty/i.test(message) ? "IN" : "US";
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
        ((ind.volume.volumeTrend === "rising" ? 1 : 0));
      const qualityScore =
        ((snap.financials.revenueGrowth ?? 0) > 0 ? 1 : 0) +
        ((snap.financials.profitMargin ?? 0) > 0.08 ? 1 : 0) +
        ((snap.financials.debtToEquity ?? 200) < 120 ? 1 : 0);
      const volatility = ind.annualisedVolatilityPct ?? 50;
      const score = momentumScore + qualityScore - (volatility > 55 ? 1 : 0);
      const risk = volatility > 65 ? "Very High" : volatility > 45 ? "High" : volatility > 25 ? "Moderate" : "Low";
      return { u, snap, ind, items, score, risk };
    }),
  );
  const picks = scored
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 4) as NonNullable<(typeof scored)[number]>[];

  if (!picks.length) {
    return {
      tools: ["screen_short_term_stocks"],
      asOf: new Date().toISOString(),
      markdown: `### Live Data Unavailable

I cannot build a current shortlist right now because the market-data tools did not return enough reliable data.

I will not invent stocks or prices. You can retry live data, or I can teach you how to evaluate short-term stock ideas step by step.`,
    };
  }

  const amount = profile.amount ?? 10000;
  const currency = market === "IN" ? "Rs " : "$";
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

Key risk: short-term prices can move sharply, especially if market mood, earnings news, or sector momentum changes.

Actions: Analyze ${p.snap.symbol} | Compare ${p.snap.symbol} | View chart | View news | Add to watchlist`,
    )
    .join("\n\n");

  const allocation = picks
    .slice(0, 3)
    .map((p, i) => `| ${p.snap.symbol} | ${currency}${Math.round(amount * ([0.4, 0.3, 0.2][i] ?? 0.2)).toLocaleString("en-US")} |`)
    .join("\n");

  return {
    tools: ["get_market_overview", "screen_short_term_stocks", "get_stock_quote", "get_fundamentals", "get_technical_indicators", "get_stock_news"],
    asOf: new Date().toISOString(),
    markdown: `## 4-Month Research Shortlist

${profile.beginner ? "Since you're new to investing, I'll keep this simple. A stock is a small ownership piece of a company. If its price rises, your investment value can increase; if it falls, your value can decrease.\n\n" : ""}You gave:
- Amount: **${profile.amount ? `${currency}${profile.amount.toLocaleString("en-US")}` : "not specified"}**
- Horizon: **${profile.horizon ?? "short term"}**
- Market: **${market === "IN" ? "India, inferred from INR/Rs" : "US"}**
- Goal: **potential capital appreciation**

For a 4-month horizon, profit is possible but not predictable. I ranked candidates using momentum, volume, fundamentals, valuation, volatility, and recent news. These are research candidates, not guaranteed-profit picks.

${rows}

### Illustrative allocation for research

| Holding | Amount |
|---|---:|
${allocation}
| Cash buffer | ${currency}${Math.round(amount * 0.1).toLocaleString("en-US")} |

This avoids assuming one stock is guaranteed to win. Four months is a short period, and losses are possible.`,
  };
}

function answerEducation(message: string) {
  const pe = /p\/e|pe ratio|valuation/.test(message.toLowerCase());
  return {
    tools: ["education_knowledge_base"],
    asOf: new Date().toISOString(),
    markdown: pe
      ? `### P/E Ratio

The price-to-earnings ratio compares a company's stock price with its earnings per share. A higher P/E can mean investors expect stronger future growth, but it can also mean the stock is expensive if growth does not arrive.

Use P/E alongside revenue growth, margins, cash flow, debt, competitive position, and interest-rate conditions. It is not a standalone buy or sell signal.`
      : `### Research Assistant

Ask me for quotes, full stock analysis, comparisons, market summaries, screeners, technical indicators, news context, portfolio risk, or investing research. For current market questions I will call live-data tools first and show data freshness.`,
  };
}

function answerInvestmentResearch(message: string) {
  const hasHorizon = /\b(1 year|3 years|5 years|long|short|month|horizon)\b/i.test(message);
  const hasRisk = /\b(low|moderate|medium|high|risk)\b/i.test(message);
  if (!hasHorizon || !hasRisk) {
    return {
      tools: ["investment_profile_intake"],
      asOf: new Date().toISOString(),
      markdown: `### How Investing Works

Investing means buying assets that may grow in value or produce income over time. Stocks can create wealth, but their prices move up and down, so the first step is not picking a random company. The first step is deciding your goal, time horizon, and risk comfort.

For beginners, a sensible path is:

| Step | What to decide |
|---|---|
| Emergency money | Keep cash for 3-6 months of expenses before risky investing |
| Time horizon | Less than 1 year, 1-3 years, 3-5 years, or 5+ years |
| Risk level | Low, moderate, or high |
| Style | Diversified funds, quality stocks, growth stocks, dividend stocks, or balanced |
| Position size | Avoid putting all money into one stock |

Before I shortlist stocks, tell me:

| Question | Options |
|---|---|
| Investment horizon | Less than 1 year, 1-3 years, 3-5 years, 5+ years |
| Risk tolerance | Low, Moderate, High |
| Preferred market | India, US, Global |
| Objective | Growth, income/dividends, capital preservation, balanced |

Share those details and I can build a research-based shortlist with risks and alternatives. This will remain educational research, not guaranteed investment advice.`,
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

export async function runStockAgent(
  message: string,
  history: ChatMessage[] = [],
  selectedSymbol?: string,
): Promise<AgentResponse> {
  const effectiveMessage = mergeConversationRequest(message, history);
  const context = history.slice(-6).map((m) => m.content).join(" ");
  const directSymbols = tokeniseSymbols(message);
  const usesCurrentSymbol = /\b(it|this stock|current stock|selected stock)\b/i.test(message);
  const symbols =
    directSymbols.length > 0
      ? directSymbols
      : usesCurrentSymbol && selectedSymbol
        ? [selectedSymbol.toUpperCase()]
        : tokeniseSymbols(context);
  const intent = classify(effectiveMessage, symbols);
  try {
    const result =
      intent === "SHORT_TERM_INVESTMENT_RESEARCH"
        ? await answerShortTermResearch(effectiveMessage)
        : intent === "INVESTMENT_RESEARCH"
        ? answerInvestmentResearch(effectiveMessage)
        : intent === "PORTFOLIO_ANALYSIS"
          ? {
              tools: ["analyze_portfolio"],
              asOf: new Date().toISOString(),
              markdown: `### Portfolio Analysis

I can help analyze concentration risk, sector exposure, underperforming positions, volatility, diversification, and allocation.

To start, send holdings like this:

| Stock | Quantity | Purchase price |
|---|---:|---:|
| AAPL | 5 | 180 |
| MSFT | 3 | 310 |

I will not buy or sell anything. I will only provide educational analysis and risk observations.`,
            }
          : intent === "QUOTE" && symbols[0]
        ? await answerQuote(symbols[0])
        : intent === "STOCK_COMPARISON" && symbols.length >= 2
          ? await answerCompare(symbols)
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
      answer: `Market data is temporarily unavailable. I do not have enough reliable live data to answer that accurately right now.\n\nDetails: ${
        (error as Error).message
      }`,
    };
  }
}



