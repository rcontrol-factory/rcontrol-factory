/* =========================================================
  RControl Factory — app/js/core/storage.js (V2 FULL)
  - Sem "export" (compatível com <script> normal)
  - localStorage wrapper + IndexedDB KV simples
  - Prefixo padrão: rcf:
  - ✅ adiciona: put/getAsync (IDB) para bundle_local e afins
========================================================= */
(function () {
  "use strict";

  const PREFIX = "rcf:";

  // ----------------------------
  // IndexedDB KV (simples)
  // ----------------------------
  const IDB_DB   = "RCF_DB";
  const IDB_VER  = 1;
  const IDB_STORE = "kv";

  function idbOpen() {
    return new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(IDB_DB, IDB_VER);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error("IDB open failed"));
      } catch (e) {
        reject(e);
      }
    });
  }

  async function idbGet(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(IDB_STORE, "readonly");
        const st = tx.objectStore(IDB_STORE);
        const rq = st.get(key);
        rq.onsuccess = () => resolve(rq.result);
        rq.onerror = () => reject(rq.error || new Error("IDB get failed"));
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
        rq.onerror = () => reject(rq.error || new Error("IDB put failed"));
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
        rq.onerror = () => reject(rq.error || new Error("IDB del failed"));
      } catch (e) {
        reject(e);
      }
    });
  }

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

    // ✅ API esperada pelo self-update (persistência "bundle_local")
    // put/getAsync/delAsync gravam no IndexedDB (KV)
    async put(key, value) {
      try {
        const fullKey = this.prefix + key;
        await idbPut(fullKey, value);
        // meta simples pra debug
        this.rawSet(this.prefix + key + ":meta", Date.now());
        return true;
      } catch {
        return false;
      }
    },

    async getAsync(key, fallback) {
      try {
        const fullKey = this.prefix + key;
        const v = await idbGet(fullKey);
        return v == null ? fallback : v;
      } catch {
        return fallback;
      }
    },

    async delAsync(key) {
      try {
        const fullKey = this.prefix + key;
        await idbDel(fullKey);
        try { localStorage.removeItem(this.prefix + key + ":meta"); } catch {}
        return true;
      } catch {
        return false;
      }
    }
  };

  window.RCF_STORAGE = Storage;
})();
