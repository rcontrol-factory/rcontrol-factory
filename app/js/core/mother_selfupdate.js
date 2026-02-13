/* app/js/core/mother_selfupdate.js — v3.1
   - iOS timeout+retry
   - root fix (/app)
   - bundle em memória
   - PERSISTÊNCIA REAL EM IndexedDB (mother_bundle_local)
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
    const base = isIOS() ? 15000 : 5000;
    const timeouts = [base, base + 2000, base + 4000];
    const backs = [300, 800, 1500];

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

  async function applyBundle(bundleText) {
    let bundle;
    try { bundle = JSON.parse(bundleText); }
    catch (e) { throw new Error("Bundle JSON inválido: " + (e?.message || e)); }

    const files = bundle?.files || bundle;
    if (!files || typeof files !== "object") throw new Error("Bundle sem 'files'.");

    // ===== GUARDA EM MEMÓRIA =====
    try {
      window.__MAE_BUNDLE_MEM__ = { meta: bundle?.meta || null, files };
    } catch {}

    // ===== PERSISTÊNCIA REAL (SCAN B) =====
    try {
      const dbPut =
        window.RCF_STORAGE?.put ||
        window.RCF_DB?.put ||
        window.RCF_IDB?.put;

      if (typeof dbPut === "function") {
        await dbPut("mother_bundle_local", {
          meta: bundle?.meta || null,
          files
        });

        log("ok", `Mãe: bundle persistido em IndexedDB (${Object.keys(files).length} files)`);
      } else {
        log("warn", "Mãe: API de storage não encontrada — bundle não persistido");
      }
    } catch (e) {
      log("error", "Mãe: erro ao persistir bundle_local -> " + (e?.message || e));
    }

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
      await tryUpdateSW();
      log("ok", "Mãe: overrides limpos. Recarregando...");
      setTimeout(() => location.reload(), 200);
      return true;
    }
  };

  window.RCF_MOTHER = api;
  window.RCF_MAE = api;

  log("ok", "mother_selfupdate.js loaded (v3.1)");
})();
