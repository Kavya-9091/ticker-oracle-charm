import { extractInvestmentContext } from "./investment-context.ts";

export type AgentIntent =
  | "QUOTE"
  | "STOCK_ANALYSIS"
  | "TECHNICAL_ANALYSIS"
  | "NEWS"
  | "MARKET_OVERVIEW"
  | "STOCK_COMPARISON"
  | "STOCK_SCREENING"
  | "PORTFOLIO_ANALYSIS"
  | "EDUCATION"
  | "DATA_QUALITY_CORRECTION"
  | "INVESTMENT_RESEARCH"
  | "SHORT_TERM_INVESTMENT_RESEARCH"
  | "RISK_ANALYSIS";

export const isEducationQuestion = (message: string) =>
  /\b(what is|explain|meaning|teach|how (?:do|does|it|stocks?|stock market)|basics|learn|works?|work)\b/i.test(
    message,
  );

export function classifyIntent(message: string, symbols: string[]): AgentIntent {
  const q = message.toLowerCase();
  const profile = extractInvestmentContext(message);
  if (/\b(tomorrow|next week|next month|forecast|predict|prediction|target price)\b/.test(q))
    return "EDUCATION";
  if (
    (/\b(wrong|incorrect|inaccurate|bad|invalid|implausible|not accurate|giving wrong)\b/.test(q) &&
      /\b(data|market|price|quote|index|level|change|percent|percentage|number|value)\b/.test(q)) ||
    (/\b(are you sure|is this today|today's data|todays data|doesn't look correct|does not look correct)\b/.test(
      q,
    ) &&
      message.trim().length > 0)
  )
    return "DATA_QUALITY_CORRECTION";
  if (
    /\b(market today|today's market|todays market|market summary|nifty|sensex|nasdaq|s&p|dow)\b/.test(
      q,
    )
  )
    return "MARKET_OVERVIEW";
  if (
    /\b(invest|investing|buy|lakh|₹|rs\.?|duration|horizon|one year|1 year|recommend|average profit|index funds?)\b/.test(
      q,
    ) &&
    !/\b(analy[sz]e|compare)\b/.test(q)
  )
    return profile.wantsWhichStock && profile.horizonValue !== null
      ? "SHORT_TERM_INVESTMENT_RESEARCH"
      : "INVESTMENT_RESEARCH";
  if (
    /\b(compare|versus|better|which one|more volatile|less volatile|lower p\/e|lower pe|higher revenue growth|lowest p\/e|lowest pe)\b| vs /.test(
      q,
    ) &&
    symbols.length >= 2
  )
    return "STOCK_COMPARISON";
  if (
    symbols.length &&
    /\b(p\/e|pe ratio|market cap|market capitalization|52.?week|week high|week low|high|low)\b/.test(
      q,
    )
  )
    return "STOCK_ANALYSIS";
  if (
    isEducationQuestion(message) &&
    !/\b(analy[sz]e|compare|price|quote|current|news|moving|fall|fell|risk)\b/i.test(message)
  ) {
    return "EDUCATION";
  }
  if (/portfolio|holding|allocation|diversif/.test(q)) return "PORTFOLIO_ANALYSIS";
  if (/screen|find|filter|strong growth|dividend|profitable|low debt/.test(q))
    return "STOCK_SCREENING";
  if (/why|fall|fell|down|news|happened|week|today/.test(q) && symbols.length) return "NEWS";
  if (/technical|rsi|macd|moving average|support|resistance|momentum/.test(q))
    return "TECHNICAL_ANALYSIS";
  if (/invest|buy|lakh|long.?term|risk|horizon|recommend/.test(q)) return "INVESTMENT_RESEARCH";
  if (/risk|overvalued|valuation/.test(q) && symbols.length) return "RISK_ANALYSIS";
  if (/what is|explain|meaning|p\/e|pe ratio|eps|roe/.test(q) && !symbols.length)
    return "EDUCATION";
  if (/price|quote|current/.test(q) && symbols.length) return "QUOTE";
  return symbols.length ? "STOCK_ANALYSIS" : "EDUCATION";
}
