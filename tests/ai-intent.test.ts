import assert from "node:assert/strict";
import test from "node:test";

import { classifyIntent } from "../src/lib/ai-intent.ts";

test("routes market questions to market overview even when prior symbols exist", () => {
  assert.equal(classifyIntent("What's today's market?", ["AAPL", "MSFT"]), "MARKET_OVERVIEW");
});

test("routes relative valuation questions to comparison when two symbols are active", () => {
  assert.equal(classifyIntent("Which one has lower P/E?", ["AAPL", "MSFT"]), "STOCK_COMPARISON");
});

test("routes user correction feedback to data-quality verification", () => {
  assert.equal(classifyIntent("Your data is wrong.", ["MSFT"]), "DATA_QUALITY_CORRECTION");
  assert.equal(classifyIntent("Are you sure?", ["MSFT"]), "DATA_QUALITY_CORRECTION");
});

test("routes one-year investment questions away from stale stock context", () => {
  assert.equal(
    classifyIntent("I have Rs 20,000 for one year. What should I consider?", ["MSFT"]),
    "INVESTMENT_RESEARCH",
  );
  assert.equal(
    classifyIntent("Is one year a good duration for stocks?", ["MSFT"]),
    "INVESTMENT_RESEARCH",
  );
});

test("routes indicator definitions to education", () => {
  assert.equal(classifyIntent("What is RSI?", ["AAPL", "MSFT"]), "EDUCATION");
});

test("routes future price prompts to education instead of fabricated quotes", () => {
  assert.equal(classifyIntent("What will Nvidia's price be tomorrow?", ["NVDA"]), "EDUCATION");
});
