import assert from "node:assert/strict";
import test from "node:test";

import { filterRelevantNews } from "../src/lib/news-relevance.ts";
import type { NewsItem } from "../src/lib/stocks.server.ts";

const item = (title: string, summary: string | null, relatedTickers: string[] = []): NewsItem => ({
  title,
  summary,
  publisher: "Test Publisher",
  publishedAt: Date.now(),
  link: `https://example.test/${encodeURIComponent(title)}`,
  relatedTickers,
});

test("filters unrelated Apple news even when provider metadata is noisy", () => {
  const filtered = filterRelevantNews("AAPL", "Apple Inc.", [
    item("Apple faces UK lawsuit over App Store fees", "The case targets Apple services.", [
      "AAPL",
    ]),
    item("How many employees does UnitedHealth have in 2026?", "UnitedHealth workforce data.", [
      "AAPL",
    ]),
    item("Tim Cook discusses iPhone roadmap", "Apple product strategy remains in focus."),
  ]);

  assert.deepEqual(filtered.map((news) => news.title).sort(), [
    "Apple faces UK lawsuit over App Store fees",
    "Tim Cook discusses iPhone roadmap",
  ]);
});

test("filters generic Microsoft-adjacent AI articles", () => {
  const filtered = filterRelevantNews("MSFT", "Microsoft Corporation", [
    item("Microsoft expands Azure AI tools", "Satya Nadella highlighted cloud demand.", ["MSFT"]),
    item("OpenAI revenue increases sharply", "The AI startup reported stronger sales.", ["MSFT"]),
    item("QuantumCore participates in IEEE Quantum Week", "Quantum hardware research update.", [
      "MSFT",
    ]),
    item("Rezolve revenue surge surprises analysts", "Retail AI vendor shares jumped.", ["MSFT"]),
  ]);

  assert.deepEqual(
    filtered.map((news) => news.title),
    ["Microsoft expands Azure AI tools"],
  );
});

test("keeps stock-specific news for Nvidia, Tesla, and Amazon", () => {
  assert.equal(
    filterRelevantNews("NVDA", "NVIDIA Corporation", [
      item("Nvidia AI demand lifts Blackwell outlook", "Jensen Huang discussed data-center chips."),
    ]).length,
    1,
  );
  assert.equal(
    filterRelevantNews("TSLA", "Tesla, Inc.", [
      item("Tesla reports Model Y delivery update", "Investors watched Tesla margins."),
    ]).length,
    1,
  );
  assert.equal(
    filterRelevantNews("AMZN", "Amazon.com, Inc.", [
      item("Amazon AWS growth accelerates", "Andy Jassy discussed cloud spending."),
    ]).length,
    1,
  );
});

test("rejects ticker-only list articles that are not centered on the company", () => {
  assert.deepEqual(
    filterRelevantNews("AMZN", "Amazon.com, Inc.", [
      item(
        "OpenAI declares AGI era as MSFT and AMZN both win",
        "Generic AI industry update with several tickers.",
        ["AMZN"],
      ),
    ]),
    [],
  );
  assert.deepEqual(
    filterRelevantNews("TSLA", "Tesla, Inc.", [
      item("Nasdaq futures edge higher: TSLA, LULU, ORCL in focus", null, ["TSLA"]),
      item("TSLA slides premarket as Cybercab event draws analyst concern", null, ["TSLA"]),
    ]).map((news) => news.title),
    ["TSLA slides premarket as Cybercab event draws analyst concern"],
  );
});
