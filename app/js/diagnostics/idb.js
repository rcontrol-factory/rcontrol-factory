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
            // garante índices (caso alguém tenha criado store sem index)
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

        // se outra aba atualizar versão, fecha aqui pra não travar
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
        tx = db.transaction(STORE, mode);
      } catch (e) {
        log("err", "IDB transaction fail: " + (e?.message || e));
        return reject(e);
      }

      let store;
      try {
        store = tx.objectStore(STORE);
      } catch (e) {
        log("err", "IDB objectStore fail: " + (e?.message || e));
        return reject(e);
      }

      const done = (v) => {
        try { resolve(v); } catch {}
      };
      const fail = (e) => {
        try { reject(e); } catch {}
      };

      try {
        const r = fn(store, tx);
        // Se retornar uma Promise, aguarda; se não, resolve no oncomplete
        if (r && typeof r.then === "function") {
          r.then(done).catch(fail);
        } else {
          tx.oncomplete = () => done(r);
          tx.onerror = () => fail(tx.error || new Error("tx error"));
          tx.onabort = () => fail(tx.error || new Error("tx abort"));
        }
      } catch (e) {
        fail(e);
      }
    });
  }

  function makeId() {
    // id estável e curto, sem depender de crypto
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeEntry(entry) {
    const ts = Number(entry?.ts || Date.now());
    const type = String(entry?.type || "error");
    const message = String(entry?.message || "");
    const stack = String(entry?.stack || "");
    const meta = entry?.meta != null ? entry.meta : null;

    return {
      id: String(entry?.id || makeId()),
      ts,
      type,
      message,
      stack,
      meta
    };
  }

  async function put(entry) {
    const obj = normalizeEntry(entry);
    await withStore("readwrite", (store) => {
      return new Promise((resolve, reject) => {
        let req;
        try { req = store.put(obj); } catch (e) { return reject(e); }
        req.onsuccess = () => resolve(obj.id);
        req.onerror = () => reject(req.error || new Error("put error"));
      });
    });
    return obj.id;
  }

  async function list(limit = 200) {
    const max = Math.max(1, Math.min(2000, Number(limit || 200)));
    return withStore("readonly", (store) => {
      return new Promise((resolve, reject) => {
        const out = [];
        let req;

        // Prefer index("ts") descending if possible
        try {
          const idx = store.index("ts");
          req = idx.openCursor(null, "prev");
        } catch {
          try { req = store.openCursor(null, "prev"); } catch (e) { return reject(e); }
        }

        req.onsuccess = () => {
          const cur = req.result;
          if (!cur) return resolve(out);
          out.push(cur.value);
          if (out.length >= max) return resolve(out);
          try { cur.continue(); } catch (e) { reject(e); }
        };

        req.onerror = () => reject(req.error || new Error("cursor error"));
      });
    });
  }

  async function clearAll() {
    return withStore("readwrite", (store) => {
      return new Promise((resolve, reject) => {
        let req;
        try { req = store.clear(); } catch (e) { return reject(e); }
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error || new Error("clear error"));
      });
    });
  }

  async function exportText(limit = 300) {
    const rows = await list(limit);
    return rows.map(r => {
      const d = new Date(r.ts || Date.now()).toISOString();
      const msg = (r.message || "").replace(/\s+/g, " ").trim();
      return `[${d}] ${r.type}: ${msg}${r.stack ? "\n" + r.stack : ""}`;
    }).join("\n\n");
  }

  // API pública usada pelo diagnostics
  window.RCF_DIAG_IDB = window.RCF_DIAG_IDB || {
    openDB,
    put,
    list,
    clearAll,
    exportText
  };

  log("ok", "diagnostics/idb.js loaded ✅");
})();
