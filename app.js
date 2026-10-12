// UI for CashSplit. Persistence is in store.js; all maths is in split.js.
const $ = (id) => document.getElementById(id);

let state = Store.cached();

// ---------- Formatting helpers ----------
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const nameOf = (id) => state.people.find((p) => p.id === id)?.name ?? "Unknown";
const initials = (name) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

function numberFmt() {
  return new Intl.NumberFormat(state.currency === "₹" ? "en-IN" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
// Plain number for table cells (currency shown in the column header).
const num = (v) => numberFmt().format(Math.abs(v));
// With currency symbol, for prose and headline figures.
const money = (v) => `${esc(state.currency)}${num(v)}`;
// Signed, for balances.
const signed = (v) => (v > 0 ? `+${num(v)}` : v < 0 ? `−${num(v)}` : num(0));
const cents = Split.fromCents;

// Old entries stored a timestamp; new ones store a YYYY-MM-DD string.
const dateValue = (d) => (typeof d === "number" ? d : new Date(`${d}T00:00`).getTime());
// DD/MM/YYYY
const dateLabel = (d) => {
  const t = new Date(dateValue(d));
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(t.getDate())}/${pad(t.getMonth() + 1)}/${t.getFullYear()}`;
};

function setMsg(el, text, isError = false) {
  el.textContent = text;
  el.classList.toggle("error", isError);
}

// ---------- Friends ----------
$("person-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("person-name").value.trim().replace(/\s+/g, " ");
  if (!name) return;
  if (state.people.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    setMsg($("person-msg"), `${name} is already in the group.`, true);
    return;
  }
  setMsg($("person-msg"), "");
  const person = { id: uid(), created: Date.now(), name };
  state.people.push(person);
  $("person-name").value = "";
  render();
  Store.save("person", person, state).catch(() => {});
});

function removePerson(id) {
  const used =
    state.expenses.some((x) => x.paidBy === id || x.participants.includes(id)) ||
    state.payments.some((x) => x.from === id || x.to === id);
  if (used) {
    setMsg($("person-msg"), `${nameOf(id)} is part of existing expenses or payments. Remove those first.`, true);
    return;
  }
  setMsg($("person-msg"), "");
  state.people = state.people.filter((p) => p.id !== id);
  render();
  Store.remove(id, state).catch(() => {});
}

// ---------- Expense form ----------
$("exp-date").value = today();
$("exp-mode").addEventListener("change", renderSplitEditor);
$("exp-amount").addEventListener("input", updateSplitPreview);
$("exp-participants").addEventListener("input", updateSplitPreview);

// Builds the split editor table. Only called when people or the split mode change,
// so typing into the share inputs never loses focus.
function renderSplitEditor() {
  const mode = $("exp-mode").value;
  const shareHead = mode === "exact" ? `Amount (${esc(state.currency)})` : mode === "percent" ? "Percent" : "";
  if (state.people.length === 0) {
    $("exp-participants").innerHTML = `<tbody><tr><td class="empty">Add friends to split an expense.</td></tr></tbody>`;
    return;
  }
  $("exp-participants").innerHTML = `
    <thead><tr>
      <th>Split between</th>
      ${mode === "equal" ? "" : `<th class="num">${shareHead}</th>`}
      <th class="num">Owes (${esc(state.currency)})</th>
    </tr></thead>
    <tbody>${state.people
      .map(
        (p) => `<tr>
          <td><label><input type="checkbox" data-id="${esc(p.id)}" checked>${esc(p.name)}</label></td>
          ${mode === "equal" ? "" : `<td class="num"><input type="number" step="0.01" min="0" data-share="${esc(p.id)}" placeholder="0"></td>`}
          <td class="num" data-owes="${esc(p.id)}">–</td>
        </tr>`
      )
      .join("")}</tbody>
    <tfoot><tr><td colspan="3" id="split-status"></td></tr></tfoot>`;
  updateSplitPreview();
}

function readExpenseForm() {
  const mode = $("exp-mode").value;
  const participants = [...document.querySelectorAll("#exp-participants input[type=checkbox]:checked")].map((c) => c.dataset.id);
  const shares = {};
  for (const id of participants) {
    const input = document.querySelector(`[data-share="${id}"]`);
    if (input) shares[id] = Number(input.value || 0);
  }
  return {
    description: $("exp-desc").value.trim(),
    amount: Number($("exp-amount").value),
    paidBy: $("exp-paidby").value,
    date: $("exp-date").value || today(),
    mode,
    participants,
    shares,
  };
}

// Fills the "Owes" column and the running total under the split editor.
function updateSplitPreview() {
  const x = readExpenseForm();
  const owes = {};
  if (x.mode === "equal" && x.amount > 0 && x.participants.length) {
    const s = Split.computeShares(x);
    for (const id in s) owes[id] = cents(s[id]);
  } else if (x.mode === "exact") {
    for (const id of x.participants) owes[id] = x.shares[id] || 0;
  } else if (x.mode === "percent" && x.amount > 0) {
    for (const id of x.participants) owes[id] = (x.amount * (x.shares[id] || 0)) / 100;
  }
  document.querySelectorAll("[data-owes]").forEach((td) => {
    const v = owes[td.dataset.owes];
    td.textContent = v ? num(v) : "–";
    td.classList.toggle("dim", !v);
  });

  const status = $("split-status");
  if (!status) return;
  const n = x.participants.length;
  if (x.mode === "equal") {
    status.textContent = n ? `Split equally between ${n} ${n === 1 ? "person" : "people"}` : "Select at least one person";
  } else if (x.mode === "exact") {
    const assigned = x.participants.reduce((s, id) => s + (x.shares[id] || 0), 0);
    const left = (x.amount || 0) - assigned;
    const plain = (v) => `${state.currency}${num(v)}`; // textContent, so no escaping
    status.textContent = `Assigned ${plain(assigned)} of ${plain(x.amount || 0)}` +
      (Math.abs(left) >= 0.005 ? ` · ${left > 0 ? "Remaining" : "Over by"} ${plain(left)}` : "");
  } else {
    const pct = x.participants.reduce((s, id) => s + (x.shares[id] || 0), 0);
    const left = 100 - pct;
    status.textContent = `Assigned ${+pct.toFixed(2)}%` +
      (Math.abs(left) >= 0.001 ? ` · ${left > 0 ? "Remaining" : "Over by"} ${+Math.abs(left).toFixed(2)}%` : "");
  }
}

$("expense-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = $("exp-msg");
  if (state.people.length === 0) return setMsg(msg, "Add friends first.", true);
  const expense = { id: uid(), created: Date.now(), ...readExpenseForm() };
  if (!expense.description) return setMsg(msg, "Add a description.", true);
  if (expense.amount > Store.MAX_AMOUNT) return setMsg(msg, "That amount is too large.", true);
  try {
    Split.computeShares(expense); // validates
  } catch (err) {
    return setMsg(msg, err.message + ".", true);
  }
  state.expenses.push(expense);
  setMsg(msg, `Added “${expense.description}”.`);
  $("exp-desc").value = "";
  $("exp-amount").value = "";
  render();
  Store.save("expense", expense, state).catch(() => {});
  $("exp-desc").focus();
});

// ---------- Settle up / history ----------
function recordPayment(from, to, amount) {
  const payment = { id: uid(), created: Date.now(), date: today(), from, to, amount };
  state.payments.push(payment);
  render();
  Store.save("payment", payment, state).catch(() => {});
}
function deleteEntry(kind, id) {
  if (kind !== "expenses" && kind !== "payments") return;
  state[kind] = state[kind].filter((x) => x.id !== id);
  render();
  Store.remove(id, state).catch(() => {});
}

$("currency").addEventListener("change", (e) => {
  if (!Store.CURRENCIES.includes(e.target.value)) return;
  state.currency = e.target.value;
  render();
  Store.save("settings", { currency: state.currency }, state).catch(() => {});
});

// Two-step reset instead of a browser confirm dialog.
let resetTimer;
$("reset").addEventListener("click", (e) => {
  const btn = e.currentTarget;
  if (!btn.dataset.armed) {
    btn.dataset.armed = "1";
    btn.textContent = "Click again to erase all data";
    resetTimer = setTimeout(() => { delete btn.dataset.armed; btn.textContent = "Reset"; }, 3000);
    return;
  }
  clearTimeout(resetTimer);
  delete btn.dataset.armed;
  btn.textContent = "Reset";
  state = { currency: state.currency, people: [], expenses: [], payments: [] };
  render();
  Store.removeAll(state)
    .then(() => Store.save("settings", { currency: state.currency }, state))
    .catch(() => {});
});

document.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-action]");
  if (!b) return;
  const { action, id, kind, from, to, amount } = b.dataset;
  if (action === "remove-person") removePerson(id);
  if (action === "delete") deleteEntry(kind, id);
  if (action === "pay") recordPayment(from, to, Number(amount));
});

// ---------- Render ----------
const byDateDesc = (a, b) => dateValue(b.date) - dateValue(a.date) || (b.created || 0) - (a.created || 0);
const emptyRow = (cols, text) => `<tbody><tr class="empty-row"><td colspan="${cols}">${text}</td></tr></tbody>`;
const cur = () => esc(state.currency);

function render() {
  $("currency").value = state.currency;
  const summary = Split.summarize(state.people, state.expenses, state.payments);
  const balances = Object.fromEntries(Object.entries(summary).map(([id, r]) => [id, r.net]));
  const transfers = Split.settle(balances);

  renderStats(transfers);
  renderPeople(summary);
  renderPaidBy();
  renderSplitEditor();
  renderSettle(transfers);
  renderSummary(summary);
  renderExpenses();
  renderPayments();
}

function renderStats(transfers) {
  const total = state.expenses.reduce((s, x) => s + Split.toCents(x.amount), 0);
  const outstanding = transfers.reduce((s, t) => s + t.amount, 0);
  const stats = [
    ["Total spent", money(cents(total))],
    ["Expenses", state.expenses.length],
    ["Outstanding", money(outstanding)],
    ["Payments to settle", transfers.length],
  ];
  $("stats").innerHTML = stats
    .map(([label, value]) => `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`)
    .join("");
}

function renderPeople(summary) {
  $("people-count").textContent = state.people.length ? `${state.people.length} ${state.people.length === 1 ? "person" : "people"}` : "";
  $("people").innerHTML =
    state.people
      .map((p) => {
        const net = summary[p.id]?.net || 0;
        const status = net > 0 ? `<span class="pos">gets back ${money(cents(net))}</span>`
          : net < 0 ? `<span class="neg">owes ${money(cents(net))}</span>`
          : `<span class="dim">settled</span>`;
        return `<li>
          <span class="person"><span class="avatar">${esc(initials(p.name))}</span>${esc(p.name)}</span>
          <span>${status} <button class="btn-text" data-action="remove-person" data-id="${esc(p.id)}">Remove</button></span>
        </li>`;
      })
      .join("") || `<li class="empty">No one here yet. Add the people you're splitting with.</li>`;
}

function renderPaidBy() {
  const sel = $("exp-paidby");
  const prev = sel.value;
  sel.innerHTML = state.people.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  if (state.people.some((p) => p.id === prev)) sel.value = prev;
}

function renderSettle(transfers) {
  if (!transfers.length) {
    $("settle-table").innerHTML = emptyRow(4, state.expenses.length ? "Everyone is settled up." : "Nothing to settle yet.");
    return;
  }
  $("settle-table").innerHTML = `
    <thead><tr><th>From</th><th>To</th><th class="num">Amount (${cur()})</th><th class="action"></th></tr></thead>
    <tbody>${transfers
      .map(
        (t) => `<tr>
          <td data-label="From">${esc(nameOf(t.from))}</td>
          <td data-label="To">${esc(nameOf(t.to))}</td>
          <td class="num" data-label="Amount (${cur()})">${num(t.amount)}</td>
          <td class="action"><button class="btn btn-ghost btn-sm" data-action="pay" data-from="${esc(t.from)}" data-to="${esc(t.to)}" data-amount="${t.amount}">Record payment</button></td>
        </tr>`
      )
      .join("")}</tbody>`;
}

function renderSummary(summary) {
  if (!state.people.length) {
    $("summary-table").innerHTML = emptyRow(6, "No one in the group yet.");
    return;
  }
  const rows = state.people.map((p) => ({ name: p.name, ...summary[p.id] }));
  const cell = (c, label) => `<td class="num${c ? "" : " dim"}" data-label="${label}">${num(cents(c))}</td>`;
  $("summary-table").innerHTML = `
    <thead><tr>
      <th>Person</th><th class="num">Paid</th><th class="num">Share</th>
      <th class="num">Sent</th><th class="num">Received</th><th class="num">Balance (${cur()})</th>
    </tr></thead>
    <tbody>${rows
      .map(
        (r) => `<tr>
          <td class="title">${esc(r.name)}</td>
          ${cell(r.paid, "Paid")}${cell(r.share, "Share")}${cell(r.sent, "Sent")}${cell(r.received, "Received")}
          <td class="num ${r.net > 0 ? "pos" : r.net < 0 ? "neg" : "dim"}" data-label="Balance (${cur()})">${signed(cents(r.net))}</td>
        </tr>`
      )
      .join("")}</tbody>`;
}

function renderExpenses() {
  const people = state.people;
  const cols = 5 + people.length;
  if (!state.expenses.length) {
    $("expense-table").innerHTML = emptyRow(cols, "No expenses yet.");
    return;
  }
  const totals = Object.fromEntries(people.map((p) => [p.id, 0]));
  let grand = 0;
  const rows = [...state.expenses].sort(byDateDesc).map((x) => {
    const shares = Split.computeShares(x);
    grand += Split.toCents(x.amount);
    for (const id in shares) if (id in totals) totals[id] += shares[id];
    const tag = x.mode === "exact" ? `<span class="tag">exact</span>` : x.mode === "percent" ? `<span class="tag">%</span>` : "";
    return `<tr>
      <td class="dim" data-label="Date">${dateLabel(x.date ?? x.created)}</td>
      <td class="wrap title">${esc(x.description)}${tag}</td>
      <td data-label="Paid by">${esc(nameOf(x.paidBy))}</td>
      <td class="num" data-label="Amount (${cur()})">${num(x.amount)}</td>
      ${people
        .map((p) =>
          shares[p.id]
            ? `<td class="col-person" data-label="${esc(p.name)}">${num(cents(shares[p.id]))}</td>`
            : `<td class="col-person dim none" data-label="${esc(p.name)}">–</td>`
        )
        .join("")}
      <td class="action"><button class="btn-text" data-action="delete" data-kind="expenses" data-id="${esc(x.id)}">Delete</button></td>
    </tr>`;
  });
  $("expense-table").innerHTML = `
    <thead><tr>
      <th>Date</th><th>Description</th><th>Paid by</th><th class="num">Amount (${cur()})</th>
      ${people.map((p) => `<th class="num">${esc(p.name)}</th>`).join("")}
      <th class="action"></th>
    </tr></thead>
    <tbody>${rows.join("")}</tbody>
    <tfoot><tr>
      <td class="title">Total</td><td class="none"></td><td class="none"></td>
      <td class="num" data-label="Amount (${cur()})">${num(cents(grand))}</td>
      ${people.map((p) => `<td class="num" data-label="${esc(p.name)}">${num(cents(totals[p.id]))}</td>`).join("")}
      <td class="none"></td>
    </tr></tfoot>`;
}

function renderPayments() {
  if (!state.payments.length) {
    $("payment-table").innerHTML = emptyRow(5, "No payments recorded. Use “Record payment” in Settle up when someone pays back.");
    return;
  }
  $("payment-table").innerHTML = `
    <thead><tr><th>Date</th><th>From</th><th>To</th><th class="num">Amount (${cur()})</th><th class="action"></th></tr></thead>
    <tbody>${[...state.payments]
      .sort(byDateDesc)
      .map(
        (x) => `<tr>
          <td class="dim" data-label="Date">${dateLabel(x.date ?? x.created)}</td>
          <td data-label="From">${esc(nameOf(x.from))}</td>
          <td data-label="To">${esc(nameOf(x.to))}</td>
          <td class="num" data-label="Amount (${cur()})">${num(x.amount)}</td>
          <td class="action"><button class="btn-text" data-action="delete" data-kind="payments" data-id="${esc(x.id)}">Delete</button></td>
        </tr>`
      )
      .join("")}</tbody>`;
}

// ---------- Sign-in and sync ----------
let currentUserId = null;

function setStatus(text, isError = false) {
  setMsg($("sync-status"), text, isError);
}
Store.setStatusHandler(setStatus);

async function refresh() {
  try {
    state = await Store.pull();
    render();
  } catch {
    setStatus("Offline. Showing the last saved copy.", true);
  }
}

function showApp(signedIn) {
  $("auth").hidden = signedIn;
  $("app").hidden = !signedIn;
  $("sign-out").hidden = !(signedIn && Store.enabled);
  $("sync-status").hidden = !(signedIn && Store.enabled);
  $("currency").closest("label").hidden = !signedIn;
  $("reset").hidden = !signedIn;
}

function setPasswordVisible(visible) {
  $("auth-password").type = visible ? "text" : "password";
  $("pw-toggle").textContent = visible ? "Hide" : "Show";
  $("pw-toggle").setAttribute("aria-pressed", String(visible));
  $("pw-toggle").setAttribute("aria-label", visible ? "Hide password" : "Show password");
}
$("pw-toggle").addEventListener("click", () => {
  const input = $("auth-password");
  setPasswordVisible(input.type === "password");
  input.focus();
});

let creatingAccount = false;
$("auth-switch").addEventListener("click", () => {
  creatingAccount = !creatingAccount;
  $("auth-title").textContent = creatingAccount ? "Create account" : "Sign in";
  $("auth-submit").textContent = creatingAccount ? "Create account" : "Sign in";
  $("auth-switch").textContent = creatingAccount ? "I already have an account" : "Create an account";
  $("auth-password").autocomplete = creatingAccount ? "new-password" : "current-password";
  setMsg($("auth-msg"), "");
});

$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  setPasswordVisible(false);
  const btn = $("auth-submit");
  btn.disabled = true;
  setMsg($("auth-msg"), creatingAccount ? "Creating account…" : "Signing in…");
  try {
    if (creatingAccount) {
      const needsConfirm = await Store.signUp(email, password);
      if (needsConfirm) setMsg($("auth-msg"), "Check your email and click the confirmation link, then sign in here.");
    } else {
      await Store.signIn(email, password);
    }
  } catch (err) {
    setMsg($("auth-msg"), err.message, true);
  } finally {
    btn.disabled = false;
  }
});

$("sign-out").addEventListener("click", async () => {
  await Store.signOut();
  state = Store.cached();
  render();
});

// Pick up changes made on other devices whenever the app comes back into view.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && currentUserId) refresh();
});

render();
if (!Store.enabled) {
  showApp(true);
} else {
  // Fires once on load with the saved session, then on every sign-in/out.
  Store.onAuthChange((user) => {
    showApp(Boolean(user));
    const id = user?.id ?? null;
    if (id && id !== currentUserId) {
      $("auth-password").value = "";
      setMsg($("auth-msg"), "");
      setTimeout(refresh, 0); // don't call Supabase from inside its auth callback
    }
    currentUserId = id;
  });
}

// Installable app (PWA). Service workers need https or localhost, not file://.
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
