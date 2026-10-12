// Run with: node --test
const test = require("node:test");
const assert = require("node:assert");
const { computeShares, computeBalances, summarize, settle } = require("./split.js");

const people = [{ id: "a" }, { id: "b" }, { id: "c" }];

test("equal split spreads leftover cents", () => {
  const s = computeShares({ amount: 100, mode: "equal", participants: ["a", "b", "c"] });
  assert.deepStrictEqual(s, { a: 3334, b: 3333, c: 3333 });
});

test("exact split must add up", () => {
  assert.throws(() => computeShares({ amount: 50, mode: "exact", participants: ["a", "b"], shares: { a: 10, b: 20 } }));
  const s = computeShares({ amount: 50, mode: "exact", participants: ["a", "b"], shares: { a: 20, b: 30 } });
  assert.deepStrictEqual(s, { a: 2000, b: 3000 });
});

test("percent split", () => {
  const s = computeShares({ amount: 10, mode: "percent", participants: ["a", "b"], shares: { a: 70, b: 30 } });
  assert.deepStrictEqual(s, { a: 700, b: 300 });
});

test("balances and settlement", () => {
  const expenses = [
    { amount: 90, paidBy: "a", mode: "equal", participants: ["a", "b", "c"] }, // b,c owe a 30 each
    { amount: 30, paidBy: "b", mode: "equal", participants: ["b", "c"] },      // c owes b 15
  ];
  const bal = computeBalances(people, expenses);
  assert.deepStrictEqual(bal, { a: 6000, b: -1500, c: -4500 });
  const t = settle(bal);
  assert.deepStrictEqual(t, [
    { from: "c", to: "a", amount: 45 },
    { from: "b", to: "a", amount: 15 },
  ]);
});

test("payments reduce what is owed", () => {
  const expenses = [{ amount: 20, paidBy: "a", mode: "equal", participants: ["a", "b"] }];
  const bal = computeBalances(people, expenses, [{ from: "b", to: "a", amount: 10 }]);
  assert.deepStrictEqual(settle(bal), []);
});

test("summary matches balances", () => {
  const expenses = [
    { amount: 90, paidBy: "a", mode: "equal", participants: ["a", "b", "c"] },
    { amount: 30, paidBy: "b", mode: "equal", participants: ["b", "c"] },
  ];
  const payments = [{ from: "c", to: "a", amount: 20 }];
  const s = summarize(people, expenses, payments);
  assert.deepStrictEqual(s.a, { paid: 9000, share: 3000, sent: 0, received: 2000, net: 4000 });
  assert.deepStrictEqual(s.c, { paid: 0, share: 4500, sent: 2000, received: 0, net: -2500 });
  const bal = computeBalances(people, expenses, payments);
  for (const id in bal) assert.strictEqual(s[id].net, bal[id]);
});

test("negative shares are rejected", () => {
  assert.throws(() => computeShares({ amount: 10, mode: "exact", participants: ["a", "b"], shares: { a: 20, b: -10 } }));
  assert.throws(() => computeShares({ amount: 10, mode: "percent", participants: ["a", "b"], shares: { a: 150, b: -50 } }));
});
