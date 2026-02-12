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
            s.createIndex("ts", "ts");
            s.createIndex("type", "type");
          } else {
            // garante índices (caso alguém tenha criado store sem index)
            const s = req.transaction.objectStore(STORE);
            if (!s.indexNames.contains("ts")) s.createIndex("ts", "ts");
            if (!s.indexNames.contains("type")) s.createIndex("type", "type");
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
