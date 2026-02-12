/* app/js/core/mother_selfupdate.js — v2 (debug + timeout + check real) */

(() => {
  "use strict";

  const log = (type, msg) => {
    try { window.RCF_LOGGER?.push?.(type, msg); } catch {}
    try { console.log("[MAE]", type, msg); } catch {}
  };

  function guessType(path) {
    const p = String(path || "");
    if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
    if (p.endsWith(".css")) return "text/css; charset=utf-8";
    if (p.endsWith(".html")) return "text/html; charset=utf-8";
    if (p.endsWith(".json")) return "application/json; charset=utf-8";
    return "text/plain; charset=utf-8";
  }

  function normalizePath(inputPath) {
    let p = String(inputPath || "").trim();
    if (!p) return "";
    p = p.split("#")[0].split("?")[0].trim();
    if (!p.startsWith("/")) p = "/" + p;
    if (p.startsWith("/app/")) p = p.slice(4);
    p = p.replace(/\/{2,}/g, "/");
    return p || "/";
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

  async function applyBundle(bundleText) {
    let bundle;
    try { bundle = JSON.parse(bundleText); }
    catch (e) { throw new Error("Bundle JSON inválido: " + (e?.message || e)); }

    const files = bundle?.files || bundle;
    if (!files || typeof files !== "object") throw new Error("Bundle sem 'files'.");

    const put = window.RCF_VFS_OVERRIDES?.put;
    if (typeof put !== "function") throw new Error("RCF_VFS_OVERRIDES.put não existe.");

    const entries = Object.entries(files);
    log("info", `Mãe: bundle tem ${entries.length} item(ns).`);

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
      await withTimeout(
        Promise.resolve(put(normPath, content, contentType)),
        5000,
        `put(${normPath})`
      );

      count++;
    }

    return count;
  }

  const api = {
    status() {
      return {
        ok: true,
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

  log("ok", "mother_selfupdate.js loaded (v2)");
})();
