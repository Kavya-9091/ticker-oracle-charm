import type { NewsItem } from "./stocks.server.ts";

export function filterRelevantNews(symbol: string, companyName: string, items: NewsItem[]) {
  const normalizedSymbol = symbol.toUpperCase();
  const entityAliases: Record<string, { strong: string[]; supporting: string[] }> = {
    AAPL: {
      strong: ["apple", "aapl", "apple inc", "tim cook"],
      supporting: [
        "iphone",
        "ipad",
        "mac",
        "apple watch",
        "app store",
        "apple services",
        "apple earnings",
        "apple revenue",
      ],
    },
    MSFT: {
      strong: ["microsoft", "msft", "microsoft corporation", "satya nadella"],
      supporting: [
        "azure",
        "microsoft ai",
        "microsoft cloud",
        "microsoft earnings",
        "microsoft revenue",
        "windows",
        "copilot",
        "xbox",
      ],
    },
    NVDA: {
      strong: ["nvidia", "nvda", "jensen huang"],
      supporting: ["geforce", "cuda", "blackwell", "nvidia ai", "nvidia earnings"],
    },
    TSLA: {
      strong: ["tesla", "tsla", "elon musk"],
      supporting: ["model y", "model 3", "cybertruck", "tesla earnings", "tesla revenue"],
    },
    AMZN: {
      strong: ["amazon", "amzn", "andy jassy"],
      supporting: ["aws", "amazon earnings", "amazon revenue", "prime"],
    },
    GOOGL: {
      strong: ["alphabet", "google", "googl", "sundar pichai"],
      supporting: ["youtube", "gemini", "google cloud", "alphabet earnings"],
    },
    META: {
      strong: ["meta", "facebook", "mark zuckerberg"],
      supporting: ["instagram", "whatsapp", "meta earnings", "meta ai"],
    },
  };
  const genericAliases = new Set(["ai", "cloud", "technology", "tech", "revenue", "earnings"]);
  const nameTokens = companyName
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(
      (token) =>
        token.length > 3 &&
        !genericAliases.has(token) &&
        !["inc", "corp", "corporation", "limited", "company", "common", "stock"].includes(token),
    );
  const entity = entityAliases[normalizedSymbol];
  const strongAliases = new Set([
    normalizedSymbol.toLowerCase(),
    ...nameTokens,
    ...(entity?.strong ?? []),
  ]);
  const supportingAliases = new Set(entity?.supporting ?? []);
  const seen = new Set<string>();

  return items
    .map((item) => {
      const tickers = item.relatedTickers.map((ticker) => ticker.toUpperCase());
      const text = `${item.title} ${item.summary ?? ""}`.toLowerCase();
      const title = item.title.toLowerCase();
      let score = 0;
      let strongHits = 0;
      let nonTickerStrongHits = 0;
      let supportingHits = 0;
      if (tickers.includes(normalizedSymbol)) score += 2;
      for (const alias of strongAliases) {
        if (!hasAlias(text, alias)) continue;
        strongHits++;
        if (alias !== normalizedSymbol.toLowerCase()) nonTickerStrongHits++;
        score += alias === normalizedSymbol.toLowerCase() ? 4 : 5;
      }
      for (const alias of supportingAliases) {
        if (!hasAlias(text, alias)) continue;
        supportingHits++;
        score += 2;
      }
      const tickerOnlyCentered =
        strongHits > 0 &&
        nonTickerStrongHits === 0 &&
        new RegExp(`^\\s*${escapeRegExp(normalizedSymbol.toLowerCase())}([^a-z0-9]|$)`, "i").test(
          title,
        );
      return { item, score, strongHits, nonTickerStrongHits, supportingHits, tickerOnlyCentered };
    })
    .filter(({ item, nonTickerStrongHits, supportingHits, tickerOnlyCentered }) => {
      const key = item.link || item.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return nonTickerStrongHits > 0 || supportingHits >= 2 || tickerOnlyCentered;
    })
    .sort((a, b) => b.score - a.score || (b.item.publishedAt ?? 0) - (a.item.publishedAt ?? 0))
    .map(({ item }) => item);
}

function hasAlias(text: string, alias: string) {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(alias)}([^a-z0-9]|$)`, "i").test(text);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
