import assert from "node:assert/strict";
import test from "node:test";

import { resolveStockSymbols } from "../src/lib/stock-symbols.ts";

const history = [
  { role: "user" as const, content: "Tell me about Apple." },
  { role: "assistant" as const, content: "Apple is AAPL." },
  { role: "user" as const, content: "Compare it with Microsoft." },
  { role: "assistant" as const, content: "Comparison: AAPL and MSFT." },
];

test("resolves selected stock pronoun with another company", () => {
  assert.deepEqual(resolveStockSymbols("Compare it with Microsoft.", history, "AAPL"), [
    "AAPL",
    "MSFT",
  ]);
});

test("resolves pronoun with another company from history without selected stock", () => {
  assert.deepEqual(resolveStockSymbols("Compare it with Microsoft.", history), ["AAPL", "MSFT"]);
});

test("resolves the first one from comparison history", () => {
  assert.deepEqual(resolveStockSymbols("What about the first one?", history), ["AAPL"]);
});

test("resolves ordinal comparison with a new company", () => {
  assert.deepEqual(resolveStockSymbols("Compare the first one with Nvidia.", history), [
    "AAPL",
    "NVDA",
  ]);
});

test("uses latest comparison pair for relative follow-up metrics", () => {
  const updatedHistory = [
    ...history,
    { role: "user" as const, content: "Compare the first one with Nvidia." },
    { role: "assistant" as const, content: "Comparison request for AAPL, NVDA." },
  ];
  assert.deepEqual(resolveStockSymbols("Which one has higher revenue growth?", updatedHistory), [
    "AAPL",
    "NVDA",
  ]);
});

test("resolves the second one from comparison history", () => {
  assert.deepEqual(resolveStockSymbols("What about the second one?", history), ["MSFT"]);
});

test("keeps two-symbol context for relative comparison", () => {
  assert.deepEqual(resolveStockSymbols("Which one is more volatile?", history), ["AAPL", "MSFT"]);
});

test("maps common company names to tickers", () => {
  assert.deepEqual(resolveStockSymbols("Tell me about Tesla.", []), ["TSLA"]);
});

test("keeps Apple and Microsoft for real comparison follow-ups", () => {
  const userHistory = [
    { role: "user" as const, content: "Analyze Apple" },
    { role: "assistant" as const, content: "## AAPL Analysis" },
    { role: "user" as const, content: "Compare it with Microsoft" },
    { role: "assistant" as const, content: "## Apple Inc. vs Microsoft Corporation" },
  ];

  assert.deepEqual(resolveStockSymbols("Which one has lower P/E?", userHistory), ["AAPL", "MSFT"]);
  assert.deepEqual(resolveStockSymbols("Which one has higher profit margin?", userHistory), [
    "AAPL",
    "MSFT",
  ]);
});

test("replaces current comparison pair when the first stock is compared with Nvidia", () => {
  const userHistory = [
    { role: "user" as const, content: "Analyze Apple" },
    { role: "assistant" as const, content: "## AAPL Analysis" },
    { role: "user" as const, content: "Compare it with Microsoft" },
    { role: "assistant" as const, content: "## Apple Inc. vs Microsoft Corporation" },
    { role: "user" as const, content: "Compare the first one with Nvidia" },
    { role: "assistant" as const, content: "## Apple Inc. vs NVIDIA Corporation" },
  ];

  assert.deepEqual(resolveStockSymbols("Which one has higher revenue growth?", userHistory), [
    "AAPL",
    "NVDA",
  ]);
});
