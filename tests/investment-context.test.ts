import assert from "node:assert/strict";

import { extractInvestmentContext } from "../src/lib/investment-context.ts";

const contextFor = (current: string, previous = "") =>
  extractInvestmentContext(previous ? `${previous}\n${current}` : current);

const cases = [
  {
    name: "1 year",
    current: "I have Rs 20,000 for 1 year.",
    expectedValue: 1,
    expectedUnit: "year",
  },
  {
    name: "4 months",
    current: "I have Rs 20,000 for 4 months.",
    expectedValue: 4,
    expectedUnit: "month",
  },
  {
    name: "6 months",
    current: "I have Rs 20,000 for 6 months.",
    expectedValue: 6,
    expectedUnit: "month",
  },
  {
    name: "2 years",
    current: "I have Rs 20,000 for 2 years.",
    expectedValue: 2,
    expectedUnit: "year",
  },
  {
    name: "current 1 year overrides previous 4 months",
    previous: "I have Rs 10,000 for 4 months.",
    current: "I have Rs 20,000 for 1 year.",
    expectedValue: 1,
    expectedUnit: "year",
  },
  {
    name: "current 4 months overrides previous 1 year",
    previous: "I have Rs 10,000 for 1 year.",
    current: "I have Rs 20,000 for 4 months.",
    expectedValue: 4,
    expectedUnit: "month",
  },
  {
    name: "one year words",
    current: "I have Rs 20,000. Which stock should I invest in within one year?",
    expectedValue: 1,
    expectedUnit: "year",
  },
  {
    name: "12 months remains 12 months",
    current: "I have Rs 20,000 for a 12 month horizon.",
    expectedValue: 12,
    expectedUnit: "month",
  },
  {
    name: "1 yr alias",
    current: "I have Rs 20,000 for 1 yr.",
    expectedValue: 1,
    expectedUnit: "year",
  },
];

for (const testCase of cases) {
  const context = contextFor(testCase.current, testCase.previous);
  assert.equal(context.horizonValue, testCase.expectedValue, testCase.name);
  assert.equal(context.horizonUnit, testCase.expectedUnit, testCase.name);
}

const unspecified = extractInvestmentContext("I have Rs 20,000. Which stock is good?");
assert.equal(unspecified.horizonValue, null, "unspecified horizon value");
assert.equal(unspecified.horizonUnit, null, "unspecified horizon unit");

console.log("investment context tests passed");
