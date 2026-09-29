// Supabase-backed document store with the small API the app uses:
//   db.collection(name).onSnapshot(next, error) · .doc(id?) · .add(data)
//   db.doc("collection/id").onSnapshot(next, error) · .set(data) · .update(patch) · .delete()
// Every collection is cached in memory, kept live through one realtime channel, and reloaded
// after the connection drops, so all open devices see the same data.
(function () {
  const PAGE = 1000;

  function deepMerge(a, b) {
    if (!a || typeof a !== "object" || Array.isArray(a) || !b || typeof b !== "object" || Array.isArray(b)) return b;
    const out = Object.assign({}, a);
    Object.keys(b).forEach((k) => { out[k] = k in a ? deepMerge(a[k], b[k]) : b[k]; });
    return out;
  }
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  function toError(e) {
    const msg = (e && e.message) || String(e);
    const denied = e && (e.code === "42501" || e.code === "P0002" || /row-level security|permission denied|not found, or your role/i.test(msg));
    return { code: denied ? "invalid_argument" : "unavailable", message: msg };
  }

  function createStore(sb) {
    const cache = new Map();      // collection -> Map(id -> data)
    const loading = new Map();    // collection -> Promise
    const listeners = new Map();  // collection -> Set({ next, error })
    const statusFns = new Set();
    let channel = null, everSubscribed = false, status = "connecting";

    const setStatus = (s) => { status = s; statusFns.forEach((fn) => fn(s)); };
    const snapshot = (c) => {
      const docs = [...(cache.get(c) || new Map()).entries()].map(([id, data]) => ({ id, exists: true, data: () => data }));
      return { docs, size: docs.length, empty: !docs.length };
    };
    const emit = (c) => (listeners.get(c) || new Set()).forEach((l) => { try { l.next(snapshot(c)); } catch (e) { console.error(e); } });

    async function load(c) {
      const m = new Map();
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await sb.from("docs").select("id,data").eq("collection", c).order("id").range(from, from + PAGE - 1);
        if (error) throw error;
        data.forEach((r) => m.set(r.id, r.data));
        if (data.length < PAGE) break;
      }
      cache.set(c, m);
      return m;
    }
    function ensureLoaded(c) {
      if (!loading.has(c)) loading.set(c, load(c).catch((e) => { loading.delete(c); throw e; }));
      return loading.get(c);
    }
    async function reloadAll() {
      await Promise.all([...listeners.keys()].map(async (c) => {
        try { await load(c); emit(c); } catch (e) { (listeners.get(c) || new Set()).forEach((l) => l.error && l.error(toError(e))); }
      }));
    }

    function ensureChannel() {
      if (channel) return;
      channel = sb.channel("docs-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "docs" }, (p) => {
          const row = p.eventType === "DELETE" ? p.old : p.new, c = row && row.collection;
          if (!c || !cache.has(c)) return;
          if (p.eventType === "DELETE") cache.get(c).delete(row.id);
          else if (row.data) cache.get(c).set(row.id, row.data);
          emit(c);
        })
        .subscribe((st) => {
          if (st === "SUBSCRIBED") {
            if (everSubscribed) reloadAll();
            everSubscribed = true;
            setStatus("live");
          } else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") setStatus("offline");
        });
    }
    // Catch up after the phone sleeps or the network comes back.
    let hiddenAt = 0;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 30000) reloadAll();
    });
    window.addEventListener("online", () => reloadAll());
    window.addEventListener("offline", () => setStatus("offline"));

    function subscribe(c, next, error) {
      const l = { next, error };
      if (!listeners.has(c)) listeners.set(c, new Set());
      listeners.get(c).add(l);
      ensureChannel();
      ensureLoaded(c).then(() => { if (listeners.get(c).has(l)) next(snapshot(c)); }).catch((e) => error && error(toError(e)));
      return () => listeners.get(c).delete(l);
    }

    function docRef(c, id) {
      return {
        id, path: c + "/" + id,
        async get() { const m = cache.get(c) || (await ensureLoaded(c)); const d = m.get(id); return { id, exists: d !== undefined, data: () => d }; },
        async set(data) {
          const { error } = await sb.from("docs").upsert({ collection: c, id, data });
          if (error) throw toError(error);
          if (cache.has(c)) { cache.get(c).set(id, data); emit(c); }
        },
        async update(patch) {
          const { error } = await sb.rpc("doc_update", { p_collection: c, p_id: id, p_patch: patch });
          if (error) throw toError(error);
          if (cache.has(c) && cache.get(c).has(id)) { cache.get(c).set(id, deepMerge(cache.get(c).get(id), patch)); emit(c); }
        },
        async delete() {
          const { data, error } = await sb.from("docs").delete().eq("collection", c).eq("id", id).select("id");
          if (error) throw toError(error);
          if (!data || !data.length) { const had = cache.has(c) && cache.get(c).has(id); if (had) throw { code: "invalid_argument", message: "Your role cannot delete this." }; }
          if (cache.has(c)) { cache.get(c).delete(id); emit(c); }
        },
        onSnapshot(next, error) {
          return subscribe(c, (snap) => { const d = snap.docs.find((x) => x.id === id); next({ id, exists: !!d, data: () => (d ? d.data() : undefined) }); }, error);
        },
      };
    }
    function collectionRef(c) {
      return {
        path: c,
        doc: (id) => docRef(c, id || newId()),
        async add(data) { const ref = docRef(c, newId()); await ref.set(data); return ref; },
        onSnapshot: (next, error) => subscribe(c, next, error),
      };
    }
    function split(path) { const i = path.indexOf("/"); return [path.slice(0, i), path.slice(i + 1)]; }

    return {
      collection: collectionRef,
      doc: (path) => { const [c, id] = split(path); return docRef(c, id); },
      onStatus(fn) { statusFns.add(fn); fn(status); return () => statusFns.delete(fn); },
      // Full backup of everything this user can read, and restore from such a file.
      async exportAll() {
        const rows = [];
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await sb.from("docs").select("collection,id,data,created_at,updated_at").order("collection").order("id").range(from, from + PAGE - 1);
          if (error) throw toError(error);
          rows.push(...data);
          if (data.length < PAGE) break;
        }
        return { app: "pump-solar-stock", version: 1, exportedAt: new Date().toISOString(), docs: rows.map((r) => ({ collection: r.collection, id: r.id, data: r.data })) };
      },
      async importAll(backup, onProgress) {
        const rows = (backup && backup.docs) || [];
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500).map((r) => ({ collection: r.collection, id: r.id, data: r.data }));
          const { error } = await sb.from("docs").upsert(chunk);
          if (error) throw toError(error);
          if (onProgress) onProgress(Math.min(rows.length, i + 500), rows.length);
        }
        await reloadAll();
        return rows.length;
      },
    };
  }

  window.StockDB = { createStore };
})();
