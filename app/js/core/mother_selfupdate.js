/* app/js/core/mother_selfupdate.js — v3.2
   - Mantém iOS timeout+retry + root /app + bundle mem
   - ADICIONA: persistência real bundle_local (IDB) + meta no localStorage
   - ADICIONA: validação forte do bundleText (nunca sobrescreve bundle bom com texto "Arquivo")
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
    // iOS às vezes precisa mais tempo (index.html é o mais pesado)
    const base = isIOS() ? 20000 : 6000; // ↑ leve aumento (sem gambiarra)
    const timeouts = [base, base + 5000, base + 10000];
    const backs = [400, 900, 1800];

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

  function assertLooksLikeJson(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    // JSON de bundle sempre começa com "{"
    if (t[0] !== "{") return false;
    // evita HTML
    if (t.startsWith("<!DOCTYPE") || t.startsWith("<html")) return false;
    return true;
  }

  async function persistBundleLocal(meta, files) {
    // memória (source B.1)
    try {
      window.__MAE_BUNDLE_MEM__ = { meta: meta || null, files };
    } catch {}

    // meta pequena no localStorage (compat)
    try {
      window.RCF_STORAGE?.set?.("mother_bundle_meta", meta || null);
    } catch {}

    // persistência real no IDB
    try {
      if (typeof window.RCF_STORAGE?.put === "function") {
        const ok = await window.RCF_STORAGE.put("mother_bundle_local", { meta: meta || null, files });
        log(ok ? "ok" : "warn", `Mãe: bundle_local persist ${ok ? "OK" : "FALHOU"} (files=${Object.keys(files).length})`);
        return ok;
      } else {
        log("warn", "Mãe: RCF_STORAGE.put não existe — não persistiu bundle_local");
      }
    } catch (e) {
      log("error", "Mãe: erro ao persistir bundle_local -> " + (e?.message || e));
    }
    return false;
  }

  async function applyBundle(bundleText) {
    if (!assertLooksLikeJson(bundleText)) {
      const head = String(bundleText || "").slice(0, 80).replace(/\s+/g, " ");
      throw new Error(`Bundle não-JSON recebido (head="${head}")`);
    }

    let bundle;
    try { bundle = JSON.parse(bundleText); }
    catch (e) { throw new Error("Bundle JSON inválido: " + (e?.message || e)); }

    const files = bundle?.files || bundle;
    if (!files || typeof files !== "object") throw new Error("Bundle sem 'files'.");
    const entries = Object.entries(files);
    if (entries.length === 0) throw new Error("Bundle 'files' vazio.");

    // ✅ PERSISTE ANTES DE APLICAR OVERRIDES
    await persistBundleLocal(bundle?.meta || null, files);

    const put = window.RCF_VFS_OVERRIDES?.put;
    if (typeof put !== "function") throw new Error("RCF_VFS_OVERRIDES.put não existe.");

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
        hasStoragePut: typeof window.RCF_STORAGE?.put === "function",
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

  log("ok", "mother_selfupdate.js loaded (v3.2)");
})();
