// Persistence for Splitbook.
// With Supabase configured (config.js), data is stored online per signed-in user and
// shared across devices. A copy is cached in localStorage so the page opens instantly.
// Without Supabase configured, the app works offline in this browser only.
const Store = (() => {
  const CACHE_KEY = "expense-splitter-v1";
  const cfg = window.SPLITBOOK_CONFIG || {};
  const enabled = Boolean(cfg.supabaseUrl && !cfg.supabaseUrl.startsWith("YOUR_") && window.supabase);
  const db = enabled ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

  const LIST_OF_KIND = { person: "people", expense: "expenses", payment: "payments" };
  const empty = () => ({ currency: "₹", people: [], expenses: [], payments: [] });

  let onStatus = () => {};

  function readCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY)) || empty();
    } catch {
      return empty();
    }
  }
  function writeCache(state) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(state)); } catch {}
  }
  function clearCache() {
    try { localStorage.removeItem(CACHE_KEY); } catch {}
  }

  function fromRows(rows) {
    const state = empty();
    for (const r of rows) {
      if (r.kind === "settings") state.currency = r.data.currency || state.currency;
      else state[LIST_OF_KIND[r.kind]].push(r.data);
    }
    state.people.sort((a, b) => (a.created || 0) - (b.created || 0));
    return state;
  }
  function toRows(state) {
    return [
      { id: "settings", kind: "settings", data: { currency: state.currency } },
      ...state.people.map((d) => ({ id: d.id, kind: "person", data: d })),
      ...state.expenses.map((d) => ({ id: d.id, kind: "expense", data: d })),
      ...state.payments.map((d) => ({ id: d.id, kind: "payment", data: d })),
    ];
  }

  async function fetchAll() {
    const rows = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db.from("items").select("id,kind,data").range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < PAGE) return rows;
    }
  }

  // Runs a write, reporting progress through the status callback.
  async function write(fn) {
    if (!enabled) return;
    onStatus("Saving…");
    const { error } = await fn();
    if (error) {
      onStatus("Couldn't save. Check your connection and reload.", true);
      throw error;
    }
    onStatus("Saved");
  }

  return {
    enabled,
    cached: readCache,
    setStatusHandler(fn) { onStatus = fn; },

    async user() {
      if (!enabled) return null;
      const { data } = await db.auth.getSession();
      return data.session?.user ?? null;
    },
    onAuthChange(cb) {
      if (enabled) db.auth.onAuthStateChange((_event, session) => cb(session?.user ?? null));
    },
    async signIn(email, password) {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    // Returns true when the account still needs email confirmation.
    async signUp(email, password) {
      const { data, error } = await db.auth.signUp({ email, password });
      if (error) throw error;
      return !data.session;
    },
    async signOut() {
      clearCache();
      await db.auth.signOut();
    },

    // Loads the latest data from Supabase. If the account is empty but this browser
    // has data from before syncing was set up, that data is uploaded once.
    async pull() {
      if (!enabled) return readCache();
      let rows = await fetchAll();
      if (rows.length === 0) {
        const local = readCache();
        if (local.people.length || local.expenses.length || local.payments.length) {
          await write(() => db.from("items").upsert(toRows(local)));
          rows = toRows(local);
        }
      }
      const state = fromRows(rows);
      writeCache(state);
      onStatus("Up to date");
      return state;
    },

    // Each save/remove updates the local cache immediately, then Supabase.
    save(kind, item, state) {
      writeCache(state);
      const row = kind === "settings" ? { id: "settings", kind, data: item } : { id: item.id, kind, data: item };
      return write(() => db.from("items").upsert({ ...row, updated_at: new Date().toISOString() }));
    },
    remove(id, state) {
      writeCache(state);
      return write(() => db.from("items").delete().eq("id", id));
    },
    removeAll(state) {
      writeCache(state);
      // RLS limits this to the signed-in user's rows; the filter is required by the API.
      return write(() => db.from("items").delete().neq("id", ""));
    },
  };
})();
