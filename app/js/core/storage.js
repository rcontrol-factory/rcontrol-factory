/* =========================================================
  RControl Factory — app/js/core/storage.js (V2.1 SAFE + BIN)
  - localStorage wrapper
  - IndexedDB KV simples (com fallback automático p/ JSON)
  - ✅ BINÁRIOS (PDF/Blob/ArrayBuffer) = IDB ONLY (sem fallback)
  - Prefixo padrão: rcf:
  - iOS/Safari robusto
========================================================= */
(function () {
  "use strict";

  const PREFIX = "rcf:";

  const IDB_DB   = "RCF_DB";
  const IDB_VER  = 1;
  const IDB_STORE = "kv";

  let __IDB_DB__ = null;
  let __IDB_OPENING__ = null;

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
  }

  // --------------------------------------------------------
  // helpers: detectar binários (não podem ir pro localStorage)
  // --------------------------------------------------------
  function isBinaryValue(v) {
    try {
      if (v == null) return false;
      if (typeof Blob !== "undefined" && v instanceof Blob) return true;
      if (typeof ArrayBuffer !== "undefined" && v instanceof ArrayBuffer) return true;
      if (typeof Uint8Array !== "undefined" && v instanceof Uint8Array) return true;
      if (typeof Int8Array !== "undefined" && v instanceof Int8Array) return true;
      if (typeof Uint16Array !== "undefined" && v instanceof Uint16Array) return true;
      if (typeof Uint32Array !== "undefined" && v instanceof Uint32Array) return true;
      if (typeof Int16Array !== "undefined" && v instanceof Int16Array) return true;
      if (typeof Int32Array !== "undefined" && v instanceof Int32Array) return true;
      if (typeof Float32Array !== "undefined" && v instanceof Float32Array) return true;
      if (typeof Float64Array !== "undefined" && v instanceof Float64Array) return true;
      if (typeof DataView !== "undefined" && v instanceof DataView) return true;
      return false;
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------
  // IDB OPEN (singleton + safe)
  // --------------------------------------------------------
  function idbOpen() {
    if (__IDB_DB__) return Promise.resolve(__IDB_DB__);
    if (__IDB_OPENING__) return __IDB_OPENING__;

    __IDB_OPENING__ = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(IDB_DB, IDB_VER);

        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE);
          }
        };

        req.onsuccess = () => {
          __IDB_DB__ = req.result;
          resolve(__IDB_DB__);
        };

        req.onerror = () => {
          reject(req.error || new Error("IDB open failed"));
        };

      } catch (e) {
        reject(e);
      }
    });

    return __IDB_OPENING__;
  }

  async function idbGet(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(IDB_STORE, "readonly");
        const st = tx.objectStore(IDB_STORE);
        const rq = st.get(key);
        rq.onsuccess = () => resolve(rq.result);
        rq.onerror = () => reject(rq.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async function idbPut(key, val) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const st = tx.objectStore(IDB_STORE);
        const rq = st.put(val, key);
        rq.onsuccess = () => resolve(true);
        rq.onerror = () => reject(rq.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async function idbDel(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const st = tx.objectStore(IDB_STORE);
        const rq = st.delete(key);
        rq.onsuccess = () => resolve(true);
        rq.onerror = () => reject(rq.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  // --------------------------------------------------------
  // STORAGE API
  // --------------------------------------------------------
  const Storage = {

    prefix: PREFIX,

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
      } catch (e) {
        log("warn", "localStorage.set fail: " + (e?.message || String(e)));
      }
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
      try { localStorage.setItem(fullKey, String(value)); }
      catch {}
    },

    // ----------------------------------------------------
    // Async KV (IDB com fallback automático p/ JSON)
    // ----------------------------------------------------
    async put(key, value) {
      const fullKey = this.prefix + key;

      // ✅ Binários: nunca tentam fallback localStorage
      if (isBinaryValue(value)) {
        try {
          await idbPut(fullKey, value);
          return true;
        } catch (e) {
          log("warn", "IDB putBin falhou (sem fallback): " + (e?.message || String(e)));
          return false;
        }
      }

      try {
        await idbPut(fullKey, value);
        return true;
      } catch (e) {
        log("warn", "IDB put falhou, fallback localStorage");
        try {
          // fallback seguro p/ JSON
          localStorage.setItem(fullKey, JSON.stringify(value));
          return true;
        } catch {
          return false;
        }
      }
    },

    async getAsync(key, fallback) {
      const fullKey = this.prefix + key;

      try {
        const v = await idbGet(fullKey);
        if (v == null) throw new Error("IDB null");
        return v;
      } catch {
        try {
          const v = localStorage.getItem(fullKey);
          return v == null ? fallback : JSON.parse(v);
        } catch {
          return fallback;
        }
      }
    },

    async delAsync(key) {
      const fullKey = this.prefix + key;

      try {
        await idbDel(fullKey);
        return true;
      } catch {
        try {
          localStorage.removeItem(fullKey);
          return true;
        } catch {
          return false;
        }
      }
    },

    // ----------------------------------------------------
    // ✅ BIN API (IDB ONLY) — ideal para PDF/Blob/buffer
    // ----------------------------------------------------
    async putBin(key, blobOrBuffer) {
      const fullKey = this.prefix + key;
      try {
        await idbPut(fullKey, blobOrBuffer);
        return true;
      } catch (e) {
        log("warn", "putBin falhou (IDB-only): " + (e?.message || String(e)));
        return false;
      }
    },

    async getBin(key) {
      const fullKey = this.prefix + key;
      try {
        const v = await idbGet(fullKey);
        return v == null ? null : v;
      } catch (e) {
        log("warn", "getBin falhou (IDB-only): " + (e?.message || String(e)));
        return null;
      }
    },

    async delBin(key) {
      const fullKey = this.prefix + key;
      try {
        await idbDel(fullKey);
        return true;
      } catch (e) {
        log("warn", "delBin falhou (IDB-only): " + (e?.message || String(e)));
        return false;
      }
    }
  };

  window.RCF_STORAGE = Storage;

})();
