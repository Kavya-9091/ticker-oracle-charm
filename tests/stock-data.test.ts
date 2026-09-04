import assert from "node:assert/strict";
import test from "node:test";

import { normalizeDailyMove, type Snapshot } from "../src/lib/stocks.server.ts";

const baseSnapshot: Snapshot = {
  symbol: "AAPL",
  name: "Apple Inc.",
  exchange: "NASDAQ",
  currency: "USD",
  quoteType: "EQUITY",
  source: "yahoo",
  timestamp: null,
  marketStatus: null,
  isDelayed: true,
  isVerified: true,
  validationWarnings: [],
  price: 105,
  previousClose: 100,
  change: 5,
  changePercent: 5,
  dayHigh: null,
  dayLow: null,
  volume: null,
  fiftyTwoWeekHigh: null,
  fiftyTwoWeekLow: null,
  regularMarketTime: null,
  candles: [],
  annual: [],
  profile: { sector: null, industry: null },
  financials: {
    marketCap: null,
    sharesOutstanding: null,
    enterpriseValue: null,
    trailingPE: null,
    forwardPE: null,
    priceToSales: null,
    priceToBook: null,
    evToEbitda: null,
    eps: null,
    revenue: null,
    netIncome: null,
    grossProfit: null,
    operatingIncome: null,
    ebitda: null,
    freeCashflow: null,
    operatingCashflow: null,
    capex: null,
    revenueGrowth: null,
    grossMargin: null,
    operatingMargin: null,
    profitMargin: null,
    totalCash: null,
    totalDebt: null,
    totalAssets: null,
    totalLiabilities: null,
    equity: null,
    debtToEquity: null,
    returnOnEquity: null,
    fiscalPeriod: null,
  },
};

test("recomputes daily move from current price and previous close", () => {
  const snapshot = normalizeDailyMove({ ...baseSnapshot, change: null, changePercent: null });
  assert.equal(snapshot.change, 5);
  assert.equal(snapshot.changePercent, 5);
  assert.equal(snapshot.isVerified, true);
});

test("calculates positive daily percentage from previous close", () => {
  const snapshot = normalizeDailyMove({
    ...baseSnapshot,
    price: 110,
    previousClose: 100,
    change: 10,
    changePercent: 10,
  });
  assert.equal(snapshot.change, 10);
  assert.equal(snapshot.changePercent, 10);
});

test("calculates negative daily percentage from previous close", () => {
  const snapshot = normalizeDailyMove({
    ...baseSnapshot,
    price: 95,
    previousClose: 100,
    change: -5,
    changePercent: -5,
  });
  assert.equal(snapshot.change, -5);
  assert.equal(snapshot.changePercent, -5);
});

test("rejects implausible daily percentage changes", () => {
  const snapshot = normalizeDailyMove({
    ...baseSnapshot,
    symbol: "^N225",
    price: 120,
    change: 20,
    changePercent: 20,
  });
  assert.equal(snapshot.price, null);
  assert.equal(snapshot.change, null);
  assert.equal(snapshot.changePercent, null);
  assert.equal(snapshot.isVerified, false);
});

test("allows legitimate stock moves over ten percent when provider math is consistent", () => {
  const snapshot = normalizeDailyMove({
    ...baseSnapshot,
    symbol: "NVDA",
    price: 112,
    previousClose: 100,
    change: 12,
    changePercent: 12,
  });
  assert.equal(snapshot.price, 112);
  assert.equal(snapshot.change, 12);
  assert.equal(snapshot.changePercent, 12);
  assert.equal(snapshot.isVerified, true);
});

test("rejects provider percent values that do not match previous close math", () => {
  const snapshot = normalizeDailyMove({
    ...baseSnapshot,
    price: 105,
    previousClose: 100,
    change: 5,
    changePercent: 500,
  });
  assert.equal(snapshot.price, null);
  assert.equal(snapshot.change, null);
  assert.equal(snapshot.changePercent, null);
  assert.equal(snapshot.isVerified, false);
});

test("rejects range-baseline previous close mistakes", () => {
  const snapshot = normalizeDailyMove({
    ...baseSnapshot,
    price: 328.21,
    previousClose: 303.42,
    change: 3.25,
    changePercent: 1,
  });
  assert.equal(snapshot.price, null);
  assert.equal(snapshot.isVerified, false);
});

test("does not calculate daily percentage when previous close is missing", () => {
  const snapshot = normalizeDailyMove({
    ...baseSnapshot,
    previousClose: null,
    change: null,
    changePercent: null,
  });
  assert.equal(snapshot.price, 105);
  assert.equal(snapshot.change, null);
  assert.equal(snapshot.changePercent, null);
  assert.equal(snapshot.isVerified, false);
});

test("rejects zero previous close", () => {
  const snapshot = normalizeDailyMove({
    ...baseSnapshot,
    previousClose: 0,
    change: null,
    changePercent: null,
  });
  assert.equal(snapshot.price, null);
  assert.equal(snapshot.changePercent, null);
  assert.equal(snapshot.isVerified, false);
});

test("rejects negative current price", () => {
  const snapshot = normalizeDailyMove({
    ...baseSnapshot,
    price: -1,
    change: null,
    changePercent: null,
  });
  assert.equal(snapshot.price, null);
  assert.equal(snapshot.changePercent, null);
  assert.equal(snapshot.isVerified, false);
});

test("rejects stale provider timestamps", () => {
  const snapshot = normalizeDailyMove({
    ...baseSnapshot,
    timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000,
  });
  assert.equal(snapshot.price, null);
  assert.equal(snapshot.isVerified, false);
});

test("does not fabricate missing price data", () => {
  const snapshot = normalizeDailyMove({ ...baseSnapshot, price: null, change: null });
  assert.equal(snapshot.price, null);
  assert.equal(snapshot.change, null);
  assert.equal(snapshot.changePercent, null);
  assert.equal(snapshot.isVerified, false);
});
