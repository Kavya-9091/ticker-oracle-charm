type HorizonUnit = "day" | "week" | "month" | "year";

export type InvestmentContext = {
  amount: number | null;
  currency: "INR" | "USD" | null;
  market: "IN" | "US";
  horizonValue: number | null;
  horizonUnit: HorizonUnit | null;
  horizonText: string | null;
  goal: "potential capital appreciation" | null;
  riskTolerance: "low" | "moderate" | "high" | null;
  beginner: boolean;
  wantsWhichStock: boolean;
};

const numberWords = new Map([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12],
]);

const singularUnit = (unit: string): HorizonUnit => {
  const u = unit.toLowerCase();
  if (u.startsWith("day")) return "day";
  if (u.startsWith("week")) return "week";
  if (u.startsWith("month")) return "month";
  return "year";
};

export const formatHorizon = (
  value: number | null,
  unit: HorizonUnit | null,
  hyphenated = false,
) => {
  if (value === null || !unit) return null;
  const label = `${value} ${unit}${value === 1 ? "" : "s"}`;
  return hyphenated ? label.replace(" ", "-") : label;
};

export const horizonMonths = (context: InvestmentContext) => {
  if (context.horizonValue === null || !context.horizonUnit) return null;
  if (context.horizonUnit === "day") return context.horizonValue / 30;
  if (context.horizonUnit === "week") return context.horizonValue / 4.345;
  if (context.horizonUnit === "month") return context.horizonValue;
  return context.horizonValue * 12;
};

export const horizonStyle = (context: InvestmentContext) => {
  const months = horizonMonths(context);
  if (months === null) return "unspecified";
  if (months < 3) return "short";
  if (months <= 12) return "medium";
  return "long";
};

const parseHorizon = (message: string) => {
  const normalized = message.replace(/,/g, "").toLowerCase();
  const matches: { index: number; value: number; unit: HorizonUnit }[] = [];
  const valuePattern = String.raw`(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)`;
  const unitPattern = String.raw`(day|days|week|weeks|month|months|year|years|yr|yrs)`;

  for (const match of normalized.matchAll(
    new RegExp(String.raw`\b${valuePattern}\s*${unitPattern}\b`, "gi"),
  )) {
    const rawValue = match[1]!.toLowerCase();
    const value = /^\d+$/.test(rawValue) ? Number(rawValue) : numberWords.get(rawValue);
    if (value) matches.push({ index: match.index ?? 0, value, unit: singularUnit(match[2]!) });
  }

  for (const match of normalized.matchAll(/\b(?:for|within|over|next)\s+(?:a|an)\s+year\b/gi)) {
    matches.push({ index: match.index ?? 0, value: 1, unit: "year" });
  }

  if (!matches.length) return { value: null, unit: null, text: null };
  const latest = matches.sort((a, b) => a.index - b.index).at(-1)!;
  return { value: latest.value, unit: latest.unit, text: formatHorizon(latest.value, latest.unit) };
};

export function extractInvestmentContext(message: string): InvestmentContext {
  const normalized = message.replace(/,/g, "");
  const amountMatches = [
    ...normalized.matchAll(/(?:rs\.?|inr|₹)\s*(\d+(?:\.\d+)?\s*(?:lakh|lac|k)?|\d+)/gi),
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
  const horizon = parseHorizon(message);
  const hasInrMarker = /rs\.?|inr|₹|lakh|lac/i.test(message);
  const currency =
    hasInrMarker || (amount !== null && !/\$|usd/i.test(message))
      ? "INR"
      : /\$|usd/i.test(message)
        ? "USD"
        : null;
  const beginner =
    /don't know|dont know|beginner|new to|explain how|how it work|how does.*work/i.test(message);
  const wantsWhichStock =
    /which stock|what stock|best (?:stock|investment)|should i buy|stock.*buy|research.*stock|make profit|profit|shortlist|candidate/i.test(
      message,
    );
  const market = currency === "INR" || /india|indian|nifty|nse|bse/i.test(message) ? "IN" : "US";
  const riskTolerance = /\blow(?:er)? risk\b/i.test(message)
    ? "low"
    : /\bmoderate|medium risk\b/i.test(message)
      ? "moderate"
      : /\bhigh risk\b/i.test(message)
        ? "high"
        : null;
  return {
    amount,
    currency,
    market,
    horizonValue: horizon.value,
    horizonUnit: horizon.unit,
    horizonText: horizon.text,
    goal:
      wantsWhichStock || /capital appreciation|growth|profit/i.test(message)
        ? "potential capital appreciation"
        : null,
    riskTolerance,
    beginner,
    wantsWhichStock,
  };
}
