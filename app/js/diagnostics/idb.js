(() => {
  "use strict";

  const DB_NAME = "rcf_db";
  const DB_VER = 1;
  const STORE = "errors";

  let _dbPromise = null;
  let _db = null;

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
  }

  function isIDBAvailable() {
    try { return !!window.indexedDB; } catch { return false; }
  }

  function openDB() {
    if (_db) return Promise.resolve(_db);
    if (_dbPromise) return _dbPromise;

    _dbPromise = new Promise((resolve, reject) => {
      if (!isIDBAvailable()) {
        const e = new Error("indexedDB indisponível (bloqueado / private mode?)");
        log("warn", e.message);
        _dbPromise = null;
        return reject(e);
      }

      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VER);
      } catch (e) {
        log("err", "indexedDB.open falhou: " + (e?.message || e));
        _dbPromise = null;
        return reject(e);
      }

      req.onupgradeneeded = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const s = db.createObjectStore(STORE, { keyPath: "id" });
            try { s.createIndex("ts", "ts"); } catch {}
            try { s.createIndex("type", "type"); } catch {}
          } else {
            const s = req.transaction.objectStore(STORE);
            try { if (!s.indexNames.contains("ts")) s.createIndex("ts", "ts"); } catch {}
            try { if (!s.indexNames.contains("type")) s.createIndex("type", "type"); } catch {}
          }
        } catch (e) {
          log("err", "onupgradeneeded err: " + (e?.message || e));
        }
      };

      req.onsuccess = () => {
        _db = req.result;
        try {
          _db.onversionchange = () => {
            try { _db.close(); } catch {}
            _db = null;
            _dbPromise = null;
            log("warn", "IDB versionchange: conexão fechada (reopen on demand).");
          };
        } catch {}
        resolve(_db);
      };

      req.onerror = () => {
        const e = req.error || new Error("openDB error");
        log("err", "IDB open error: " + (e?.message || e));
        _dbPromise = null;
        reject(e);
      };

      req.onblocked = () => {
        log("warn", "IDB open blocked (outra aba segurando versão antiga).");
      };
    });

    return _dbPromise;
  }

  async function withStore(mode, fn) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction([STORE], mode);
      } catch (e) {
        log("err", "IDB transaction falhou: " + (e?.message || e));
        return reject(e);
      }

      const store = tx.objectStore(STORE);

      let done = false;
      const ok = (v) => { if (!done) { done = true; resolve(v); } };
      const bad = (e) => { if (!done) { done = true; reject(e); } };

      try {
        const r = fn(store, tx);
        // Se fn retornar promise, encadeia; se não, resolve no complete
        Promise.resolve(r).catch(bad);
      } catch (e) {
        bad(e);
      }

      tx.oncomplete = () => ok(true);
      tx.onerror = () => bad(tx.error || new Error("tx error"));
      tx.onabort = () => bad(tx.error || new Error("tx abort"));
    });
  }

  function makeId() {
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  async function putError(entry) {
    const e = entry || {};
    const row = {
      id: e.id || makeId(),
      ts: typeof e.ts === "number" ? e.ts : Date.now(),
      type: String(e.type || "error"),
      msg: String(e.msg || ""),
      stack: String(e.stack || ""),
      meta: e.meta ?? null
    };

    await withStore("readwrite", (store) => {
      store.put(row);
    });

    return row.id;
  }

  async function listErrors(limit = 50) {
    const out = [];
    const n = Math.max(1, Math.min(500, Number(limit) || 50));

    await withStore("readonly", (store) => {
      let idx;
      try { idx = store.index("ts"); } catch { idx = null; }

      // Melhor: usa index ts e varre de trás pra frente
      if (idx && typeof idx.openCursor === "function") {
        const req = idx.openCursor(null, "prev");
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur) return;
          out.push(cur.value);
          if (out.length >= n) return;
          cur.continue();
        };
        req.onerror = () => {};
      } else {
        // fallback: varre store
        const req = store.openCursor();
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur) return;
          out.push(cur.value);
          cur.continue();
        };
        req.onerror = () => {};
      }
    });

    // garante ordenação desc
    out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return out.slice(0, n);
  }

  async function clearAll() {
    await withStore("readwrite", (store) => {
      store.clear();
    });
    return true;
  }

  // Expor API mínima
  window.RCF_IDB = window.RCF_IDB || {};
  window.RCF_IDB.openDB = openDB;
  window.RCF_IDB.putError = putError;
  window.RCF_IDB.listErrors = listErrors;
  window.RCF_IDB.clearAll = clearAll;

  log("ok", "diagnostics/idb.js ready ✅");
})();
