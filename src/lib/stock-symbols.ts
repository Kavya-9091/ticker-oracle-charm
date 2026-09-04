import { UNIVERSE } from "./universe.ts";

export type ChatMessage = { role: "user" | "assistant"; content: string };

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
  for (const match of text.matchAll(/\b[A-Z]{1,5}(?:\.[A-Z]{1,3})?\b/g)) {
    const raw = match[0]!.toUpperCase();
    if (["AI", "I", "ME", "MY", "PE", "RSI", "US", "IN", "NSE", "BSE", "CEO", "OK"].includes(raw))
      continue;
    const universe = UNIVERSE.find((u) => u.symbol === raw || u.symbol.split(".")[0] === raw);
    if (universe) out.add(universe.symbol);
  }
  return Array.from(out).slice(0, 5);
};

function latestComparisonSymbols(history: ChatMessage[]) {
  for (const item of history.slice(-10).reverse()) {
    const pair = explicitComparisonPair(item.content);
    if (pair.length >= 2) return pair;
    if (
      !/\b(compare|comparison| vs |versus|which one|lower|higher|more volatile)\b/i.test(
        item.content,
      )
    )
      continue;
    const symbols = tokeniseSymbols(item.content);
    if (symbols.length >= 2) return symbols.slice(0, 2);
  }
  return [];
}

function explicitComparisonPair(text: string) {
  const vsMatch = text.match(/(.+?)\b(?:vs\.?|versus)\b(.+)/i);
  if (vsMatch) {
    const left = tokeniseSymbols(vsMatch[1] ?? "");
    const right = tokeniseSymbols(vsMatch[2] ?? "");
    if (left[0] && right[0]) return [left[0], right[0]];
  }

  const compareMatch = text.match(/\bcompare\b(.+?)\b(?:with|to|against)\b(.+)/i);
  if (compareMatch) {
    const left = tokeniseSymbols(compareMatch[1] ?? "");
    const right = tokeniseSymbols(compareMatch[2] ?? "");
    if (left[0] && right[0]) return [left[0], right[0]];
  }

  return [];
}

export function resolveStockSymbols(
  message: string,
  history: ChatMessage[] = [],
  selectedSymbol?: string,
): string[] {
  const context = history
    .slice(-6)
    .map((m) => m.content)
    .join(" ");
  const directSymbols = tokeniseSymbols(message);
  const contextSymbols = tokeniseSymbols(context);
  const comparisonSymbols = latestComparisonSymbols(history);
  const usesCurrentSymbol = /\b(it|this stock|that company|current stock|selected stock)\b/i.test(
    message,
  );
  const asksAboutComparison =
    /\b(which one|lower|higher|more volatile|performing better|stronger technical momentum)\b/i.test(
      message,
    );

  if (asksAboutComparison && comparisonSymbols.length >= 2 && directSymbols.length === 0) {
    return comparisonSymbols;
  }

  if (
    /\b(first one|first stock|the first)\b/i.test(message) &&
    (comparisonSymbols[0] || contextSymbols[0])
  ) {
    const first = comparisonSymbols[0] ?? contextSymbols[0];
    return first ? Array.from(new Set([first, ...directSymbols])).slice(0, 5) : directSymbols;
  }

  if (
    /\b(second one|second stock|the second)\b/i.test(message) &&
    (comparisonSymbols[1] || contextSymbols[1])
  ) {
    const second = comparisonSymbols[1] ?? contextSymbols[1];
    return second ? Array.from(new Set([second, ...directSymbols])).slice(0, 5) : directSymbols;
  }

  const selectedSymbols =
    usesCurrentSymbol && selectedSymbol
      ? [selectedSymbol.toUpperCase()]
      : usesCurrentSymbol && contextSymbols[0]
        ? [contextSymbols[0]]
        : [];

  return Array.from(
    new Set(
      directSymbols.length > 0
        ? [...selectedSymbols, ...directSymbols]
        : selectedSymbols.length > 0
          ? selectedSymbols
          : contextSymbols,
    ),
  ).slice(0, 5);
}
