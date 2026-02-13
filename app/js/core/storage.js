/* =========================================================
  RControl Factory — app/js/core/storage.js (FULL) — v2
  - Sem export (compatível com <script> normal)
  - Storage híbrido:
      * IndexedDB (KV) -> dados grandes (bundle_local etc.)
      * localStorage -> config/meta pequena (compatibilidade)
  - API compatível:
      get/set/del (mantidos)
      + put (alias de set), remove (alias de del)
========================================================= */
(function () {
  "use strict";

  const TAG = "[STORAGE]";
  const log = (type, msg) => {
    try { window.RCF_LOGGER?.push?.(type, `${TAG} ${msg}`); } catch {}
    try { console.log(TAG, type, msg); } catch {}
  };

  const DB_NAME = "rcf_db";
  const DB_VERSION = 1;
  const STORE = "kv";

  function hasIDB() {
    try { return !!window.indexedDB; } catch { return false; }
  }

  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IDB open error"));
    });
  }

  let _dbPromise = null;
  async function getDB() {
    if (!hasIDB()) return null;
    if (!_dbPromise) _dbPromise = idbOpen().catch((e) => {
      log("error", "Falha ao abrir IndexedDB: " + (e?.message || e));
      _dbPromise = null;
      return null;
    });
    return _dbPromise;
  }

  async function idbGet(key) {
    const db = await getDB();
    if (!db) return undefined;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, "readonly");
        const st = tx.objectStore(STORE);
        const req = st.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  }

  async function idbPut(key, value) {
    const db = await getDB();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        const st = tx.objectStore(STORE);
        const req = st.put(value, key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  async function idbDel(key) {
    const db = await getDB();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        const st = tx.objectStore(STORE);
        const req = st.delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  const Storage = {
    // mantém prefixo legado do localStorage (compat)
    prefix: "rcf:",

    // ========= LOCALSTORAGE (compat / pequeno) =========
    get(key, fallback) {
      try {
        const v = localStorage.getItem(this.prefix + key);
        if (v == null) return fallback;
        return JSON.parse(v);
      } catch {
        return fallback;
      }
    },

    set(key, value) {
      try {
        localStorage.setItem(this.prefix + key, JSON.stringify(value));
      } catch {}
    },

    del(key) {
      try { localStorage.removeItem(this.prefix + key); } catch {}
    },

    rawGet(fullKey, fallback) {
      try {
        const v = localStorage.getItem(fullKey);
        return v == null ? fallback : v;
      } catch {
        return fallback;
      }
    },

    rawSet(fullKey, value) {
      try { localStorage.setItem(fullKey, String(value)); } catch {}
    },

    // ========= INDEXEDDB (oficial / grande) =========
    async idbGet(key, fallback) {
      const v = await idbGet(key);
      return v === undefined ? fallback : v;
    },

    async idbPut(key, value) {
      return await idbPut(key, value);
    },

    async idbDel(key) {
      return await idbDel(key);
    },

    // ========= API “OFICIAL” PARA O SISTEMA =========
    // put/get/del vão para IDB por padrão (bundle_local, registry, etc.)
    async put(key, value) {
      const ok = await idbPut(key, value);
      if (!ok) {
        // fallback mínimo: só grava no localStorage se couber (pequeno)
        try {
          localStorage.setItem(this.prefix + key, JSON.stringify(value));
          log("warn", `IDB falhou, fallback localStorage: ${key}`);
          return true;
        } catch {
          log("error", `Falhou salvar (IDB+LS): ${key}`);
          return false;
        }
      }
      return true;
    },

    async fetch(key, fallback) {
      // tenta IDB primeiro
      const v = await idbGet(key);
      if (v !== undefined) return v;

      // fallback legado (caso tenha sido salvo antes em localStorage)
      return this.get(key, fallback);
    },

    async remove(key) {
      const ok = await idbDel(key);
      // também limpa legado
      try { localStorage.removeItem(this.prefix + key); } catch {}
      return ok;
    },

    // aliases para compatibilidade com códigos antigos
    async getAsync(key, fallback) { return await this.fetch(key, fallback); },
    async delAsync(key) { return await this.remove(key); }
  };

  // Exposição global
  window.RCF_STORAGE = Storage;

  // Sinalizador de “IDB pronto” (ajuda no diagnóstico interno)
  (async () => {
    const db = await getDB();
    log("info", `IndexedDB ${db ? "OK" : "INDISPONÍVEL"} (db=${DB_NAME}, store=${STORE})`);
  })();
})();
