/* app/js/core/mother_selfupdate.js — v3.3 (bundle_local IDB real + retry iOS + root /app)
   - Normaliza paths pro root "/app"
   - Retry iOS no put (timeouts progressivos)
   - Guarda bundle em memória: window.__MAE_BUNDLE_MEM__
   - Persistência REAL do bundle_local via IndexedDB:
       DB: rcf_mother
       Store: bundles
       Key: mother_bundle_local_v1
   - Espelho meta no localStorage (rcf:mother_bundle_meta)
*/

(() => {
  "use strict";

  const TAG = "[MAE]";
  const log = (type, msg) => {
    try { window.RCF_LOGGER?.push?.(type, msg); } catch {}
    try { console.log(TAG, type, msg); } catch {}
  };

  const isIOS = () => {
    try {
      const ua = navigator.userAgent || "";
      return /iPad|iPhone|iPod/.test(ua) && /AppleWebKit/.test(ua);
    } catch { return false; }
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function guessType(path) {
    const p = String(path || "");
    if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
    if (p.endsWith(".css")) return "text/css; charset=utf-8";
    if (p.endsWith(".html")) return "text/html; charset=utf-8";
    if (p.endsWith(".json")) return "application/json; charset=utf-8";
    return "text/plain; charset=utf-8";
  }

  // ===== ROOT REAL do projeto (padrão: /app) =====
  function getMotherRoot() {
    const cfgRoot =
      window.RCF_CONFIG?.MOTHER_ROOT ||
      window.RCF?.config?.MOTHER_ROOT ||
      window.MOTHER_ROOT;

    const r = String(cfgRoot || "/app").trim();
    if (!r) return "/app";
    if (r === "/") return "/app";
    return r.startsWith("/") ? r.replace(/\/+$/g, "") : ("/" + r.replace(/\/+$/g, ""));
  }

  // ===== NORMALIZA PATH -> SEMPRE dentro do root (/app) =====
  function normalizePath(inputPath) {
    let p = String(inputPath || "").trim();
    if (!p) return "";

    p = p.split("#")[0].split("?")[0].trim();
    if (!p.startsWith("/")) p = "/" + p;
    p = p.replace(/\/{2,}/g, "/");

    if (p.includes("..")) {
      p = p.replace(/\.\./g, "");
      p = p.replace(/\/{2,}/g, "/");
    }

    const ROOT = getMotherRoot();

    if (p.startsWith(ROOT + "/")) return p;
    if (p.startsWith("/js/")) return ROOT + p;

    if (/^\/[^/]+\.(html|js|css|json|txt|md|png|jpg|jpeg|webp|svg|ico)$/i.test(p)) {
      return ROOT + p;
    }

    return ROOT + p;
  }

  function shouldSkip(path) {
    const p = String(path || "");
    if (!p) return true;
    if (p.endsWith("/")) return true;
    if (p.includes("/.git/")) return true;
    if (p.endsWith(".DS_Store")) return true;
    if (p.endsWith("thumbs.db")) return true;
    return false;
  }

  async function tryUpdateSW() {
    try { await navigator.serviceWorker?.ready; } catch {}
    try {
      const reg = await navigator.serviceWorker?.getRegistration?.("/");
      await reg?.update?.();
      return true;
    } catch {
      return false;
    }
  }

  function withTimeout(promise, ms, label) {
    let t;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms em: ${label}`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  }

  async function putWithRetry(putFn, path, content, contentType) {
    const base = isIOS() ? 20000 : 6000; // 🔧 aumentei pra iOS
    const timeouts = [base, base + 3000, base + 6000];
    const backs = [400, 900, 1700];

    for (let i = 0; i < 3; i++) {
      try {
        log("info", `Mãe: put try #${i + 1} (${timeouts[i]}ms) -> ${path}`);
        await withTimeout(
          Promise.resolve(putFn(path, content, contentType)),
          timeouts[i],
          `put(${path})`
        );
        return true;
      } catch (e) {
        log("warn", `Mãe: put falhou #${i + 1} -> ${path} :: ${e?.message || e}`);
        if (i < 2) await sleep(backs[i]);
      }
    }
    throw new Error(`Falhou: put after retries: ${path}`);
  }

  // -----------------------------
  // IndexedDB bundle_local (REAL)
  // -----------------------------
  const IDB_DB = "rcf_mother";
  const IDB_STORE = "bundles";
  const IDB_KEY = "mother_bundle_local_v1";

  function openIDB() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) return reject(new Error("indexedDB não suportado"));
      const req = indexedDB.open(IDB_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Falha ao abrir IDB"));
    });
  }

  async function idbPut(key, value) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const st = tx.objectStore(IDB_STORE);
      st.put(value, key);
      tx.oncomplete = () => { try { db.close(); } catch {} resolve(true); };
      tx.onerror = () => { try { db.close(); } catch {} reject(tx.error || new Error("IDB put falhou")); };
      tx.onabort = () => { try { db.close(); } catch {} reject(tx.error || new Error("IDB put abort")); };
    });
  }

  async function idbDel(key) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const st = tx.objectStore(IDB_STORE);
      st.delete(key);
      tx.oncomplete = () => { try { db.close(); } catch {} resolve(true); };
      tx.onerror = () => { try { db.close(); } catch {} reject(tx.error || new Error("IDB del falhou")); };
      tx.onabort = () => { try { db.close(); } catch {} reject(tx.error || new Error("IDB del abort")); };
    });
  }

  function saveMeta(metaObj) {
    try {
      localStorage.setItem("rcf:mother_bundle_meta", JSON.stringify(metaObj || {}));
    } catch {}
  }

  function head80(t) {
    return String(t || "").slice(0, 80).replace(/\s+/g, " ").trim();
  }

  function ensureBundleJson(bundleText) {
    const t = String(bundleText || "").trim();
    if (!t) throw new Error("Bundle vazio");
    if (t.startsWith("<!DOCTYPE") || t.startsWith("<html")) throw new Error(`Bundle veio HTML (head="${head80(t)}")`);
    if (!t.startsWith("{")) throw new Error(`Bundle não parece JSON (head="${head80(t)}")`);
    return true;
  }

  async function persistBundleLocal(bundleObj) {
    const files = bundleObj?.files || {};
    const meta = bundleObj?.meta || null;
    const count = Object.keys(files || {}).length;

    // memória
    try { window.__MAE_BUNDLE_MEM__ = { meta, files }; } catch {}

    // IDB (real)
    try {
      await idbPut(IDB_KEY, { meta, files, savedAt: new Date().toISOString() });
      saveMeta({ savedAt: new Date().toISOString(), count, hasMeta: !!meta, key: IDB_KEY });
      log("ok", `Mãe: bundle_local persistido ✅ (IDB) files=${count}`);
      return true;
    } catch (e) {
      saveMeta({ savedAt: new Date().toISOString(), count, hasMeta: !!meta, key: IDB_KEY, idbErr: String(e?.message || e) });
      log("warn", `Mãe: falha ao persistir IDB bundle_local :: ${e?.message || e}`);
      return false;
    }
  }

  async function applyBundle(bundleText) {
    ensureBundleJson(bundleText);

    let bundle;
    try { bundle = JSON.parse(bundleText); }
    catch (e) { throw new Error("Bundle JSON inválido: " + (e?.message || e)); }

    const files = bundle?.files || bundle;
    if (!files || typeof files !== "object") throw new Error("Bundle sem 'files'.");

    // ✅ persiste ANTES de aplicar overrides (pra Scan B nunca ser 0 se pull ok)
    await persistBundleLocal({ meta: bundle?.meta || null, files });

    const put = window.RCF_VFS_OVERRIDES?.put;
    if (typeof put !== "function") throw new Error("RCF_VFS_OVERRIDES.put não existe.");

    const entries = Object.entries(files);
    log("info", `Mãe: bundle tem ${entries.length} item(ns). root=${getMotherRoot()}`);

    let count = 0;
    for (const [rawPath, v] of entries) {
      const normPath = normalizePath(rawPath);
      if (shouldSkip(normPath)) continue;

      const content =
        (v && typeof v === "object" && "content" in v)
          ? String(v.content ?? "")
          : String(v ?? "");

      const contentType =
        (v && typeof v === "object" && v.contentType)
          ? String(v.contentType)
          : guessType(normPath);

      log("info", `Mãe: aplicando -> ${normPath}`);
      await putWithRetry(put, normPath, content, contentType);
      count++;
    }

    return count;
  }

  const api = {
    status() {
      return {
        ok: true,
        motherRoot: getMotherRoot(),
        hasGh: !!window.RCF_GH_SYNC?.pull,
        hasOverrides: typeof window.RCF_VFS_OVERRIDES?.put === "function",
        swSupported: !!navigator.serviceWorker,
        swControlled: !!navigator.serviceWorker?.controller,
        ua: navigator.userAgent,
      };
    },

    async updateFromGitHub() {
      if (!window.RCF_GH_SYNC?.pull) throw new Error("GitHub Sync ausente: RCF_GH_SYNC.pull()");
      log("info", "Mãe: puxando bundle do GitHub...");
      const bundleText = await window.RCF_GH_SYNC.pull();

      log("info", "Mãe: aplicando overrides...");
      const n = await applyBundle(bundleText);

      log("ok", `Mãe: ${n} arquivo(s) aplicado(s). Atualizando SW...`);
      const swOk = await tryUpdateSW();
      log("ok", `Mãe: SW update ${swOk ? "OK" : "falhou/ignorado"} — recarregando...`);
      setTimeout(() => location.reload(), 250);
      return n;
    },

    async clearOverrides() {
      const clear = window.RCF_VFS_OVERRIDES?.clear;
      if (typeof clear !== "function") throw new Error("RCF_VFS_OVERRIDES.clear não existe.");
      log("warn", "Mãe: limpando overrides...");
      await clear();

      // também limpa o bundle_local pra evitar leitura velha
      try { await idbDel(IDB_KEY); } catch {}
      try { saveMeta({ clearedAt: new Date().toISOString(), key: IDB_KEY }); } catch {}

      await tryUpdateSW();
      log("ok", "Mãe: overrides limpos. Recarregando...");
      setTimeout(() => location.reload(), 200);
      return true;
    }
  };

  window.RCF_MOTHER = api;
  window.RCF_MAE = api;

  log("ok", "mother_selfupdate.js loaded (v3.3)");
})();
