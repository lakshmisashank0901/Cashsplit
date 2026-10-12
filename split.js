// Core splitting logic. All money is handled in integer cents to avoid
// floating-point rounding errors. Works in the browser (window.Split) and Node.
(function (root) {
  const toCents = (amount) => Math.round(Number(amount) * 100);
  const fromCents = (cents) => cents / 100;

  // Returns { personId: cents } — how much of the expense each participant owes.
  //   mode "equal":   split evenly; leftover cents go to the first participants
  //   mode "exact":   shares = { personId: amount }, must add up to the total
  //   mode "percent": shares = { personId: percent }, must add up to 100
  function computeShares(expense) {
    const total = toCents(expense.amount);
    const ids = expense.participants;
    if (!ids || ids.length === 0) throw new Error("Pick at least one person to split with");
    if (!(total > 0)) throw new Error("Amount must be greater than zero");

    const result = {};
    if (expense.mode === "exact") {
      let sum = 0;
      for (const id of ids) {
        result[id] = toCents(expense.shares[id] || 0);
        sum += result[id];
      }
      if (sum !== total) {
        throw new Error(`Exact amounts add up to ${fromCents(sum).toFixed(2)}, not ${fromCents(total).toFixed(2)}`);
      }
      return result;
    }

    if (expense.mode === "percent") {
      const pctSum = ids.reduce((s, id) => s + Number(expense.shares[id] || 0), 0);
      if (Math.abs(pctSum - 100) > 0.001) throw new Error(`Percentages add up to ${pctSum}%, not 100%`);
      let assigned = 0;
      for (const id of ids) {
        result[id] = Math.floor((total * Number(expense.shares[id] || 0)) / 100);
        assigned += result[id];
      }
      distributeRemainder(result, ids, total - assigned);
      return result;
    }

    // equal
    const base = Math.floor(total / ids.length);
    for (const id of ids) result[id] = base;
    distributeRemainder(result, ids, total - base * ids.length);
    return result;
  }

  function distributeRemainder(result, ids, remainder) {
    for (let i = 0; remainder > 0; i = (i + 1) % ids.length, remainder--) result[ids[i]] += 1;
  }

  // Net balance per person in cents: positive = is owed money, negative = owes money.
  // Payments (settle-ups) move money from `from` to `to`.
  function computeBalances(people, expenses, payments = []) {
    const bal = {};
    for (const p of people) bal[p.id] = 0;
    for (const e of expenses) {
      bal[e.paidBy] = (bal[e.paidBy] || 0) + toCents(e.amount);
      const shares = computeShares(e);
      for (const id in shares) bal[id] = (bal[id] || 0) - shares[id];
    }
    for (const p of payments) {
      const c = toCents(p.amount);
      bal[p.from] = (bal[p.from] || 0) + c;
      bal[p.to] = (bal[p.to] || 0) - c;
    }
    return bal;
  }

  // Per-person breakdown in cents: what they paid, their share of expenses,
  // settle-up payments sent/received, and the resulting net balance.
  function summarize(people, expenses, payments = []) {
    const rows = {};
    for (const p of people) rows[p.id] = { paid: 0, share: 0, sent: 0, received: 0, net: 0 };
    const row = (id) => (rows[id] ||= { paid: 0, share: 0, sent: 0, received: 0, net: 0 });
    for (const e of expenses) {
      row(e.paidBy).paid += toCents(e.amount);
      const shares = computeShares(e);
      for (const id in shares) row(id).share += shares[id];
    }
    for (const p of payments) {
      row(p.from).sent += toCents(p.amount);
      row(p.to).received += toCents(p.amount);
    }
    for (const id in rows) {
      const r = rows[id];
      r.net = r.paid - r.share + r.sent - r.received;
    }
    return rows;
  }

  // Minimal-ish list of transfers that settles every balance: repeatedly match the
  // biggest debtor with the biggest creditor. Returns [{ from, to, amount }] in currency units.
  function settle(balances) {
    const creditors = [];
    const debtors = [];
    for (const id in balances) {
      if (balances[id] > 0) creditors.push({ id, amt: balances[id] });
      else if (balances[id] < 0) debtors.push({ id, amt: -balances[id] });
    }
    const transfers = [];
    while (creditors.length && debtors.length) {
      creditors.sort((a, b) => b.amt - a.amt);
      debtors.sort((a, b) => b.amt - a.amt);
      const c = creditors[0];
      const d = debtors[0];
      const amt = Math.min(c.amt, d.amt);
      transfers.push({ from: d.id, to: c.id, amount: fromCents(amt) });
      c.amt -= amt;
      d.amt -= amt;
      if (c.amt === 0) creditors.shift();
      if (d.amt === 0) debtors.shift();
    }
    return transfers;
  }

  const api = { toCents, fromCents, computeShares, computeBalances, summarize, settle };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Split = api;
})(typeof window !== "undefined" ? window : globalThis);
