/* /app/js/core/vfs_overrides.js — v1.1
  - PostMessage para SW com MessageChannel
  - ✅ PADRÃO: scope/registration em /app (não "/")
  - ✅ normalizeMotherPath(p): /index.html -> /app/index.html e tudo vira /app/*
  - ✅ retry + timeout para iOS/travadas
*/
(() => {
  "use strict";

  // ✅ PADRÃO: normalizeMotherPath (mesmas regras da Mãe)
  function normalizeMotherPath(p) {
    let x = String(p || "").trim();
    if (!x) return "";
    x = x.split("#")[0].split("?")[0].trim();
    if (!x.startsWith("/")) x = "/" + x;
    x = x.replace(/\/{2,}/g, "/");

    if (x === "/index.html") x = "/app/index.html";

    const ROOT_FILES = new Set(["/styles.css", "/app.js", "/sw.js", "/manifest.json", "/favicon.ico"]);
    if (ROOT_FILES.has(x)) x = "/app" + x;

    if (x.startsWith("/js/")) x = "/app" + x;

    if (!x.startsWith("/app/")) x = "/app" + x;
    x = x.replace(/\/{2,}/g, "/");
    return x;
  }

  function log(lvl, msg) {
    try { window.RCF_LOGGER?.push?.(lvl, String(msg)); } catch {}
    try { console.log("[VFS_OVERRIDES]", lvl, msg); } catch {}
  }

  function withTimeout(promise, ms, label) {
    let t;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms em ${label}`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  }

  async function getRegSmart() {
    // ✅ /app/ scope
    const scopePath = new URL("./", document.baseURI).pathname; // "/app/"
    try {
      const reg = await navigator.serviceWorker?.getRegistration?.(scopePath);
      if (reg) return reg;
    } catch {}
    try {
      const reg2 = await navigator.serviceWorker?.getRegistration?.();
      if (reg2) return reg2;
    } catch {}
    return null;
  }

  async function post(msg) {
    if (!("serviceWorker" in navigator)) throw new Error("SW não suportado.");

    const reg = await getRegSmart();
    const sw = reg?.active || navigator.serviceWorker?.controller;
    if (!sw) throw new Error("SW não controlando a página ainda (recarregue 1x).");

    return await new Promise((resolve, reject) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = (ev) => {
        const d = ev.data || {};
        if (d.type?.endsWith("_ERR")) reject(new Error(d.error || "ERR"));
        else resolve(d);
      };
      sw.postMessage(msg, [ch.port2]);
    });
  }

  async function postRetry(msg, label) {
    const tries = 3;
    let last = null;
    for (let i = 1; i <= tries; i++) {
      try {
        return await withTimeout(post(msg), 8000, label + ` (try ${i}/${tries})`);
      } catch (e) {
        last = e;
        await new Promise(r => setTimeout(r, 250 * i));
      }
    }
    throw last || new Error("post failed");
  }

  const api = {
    async put(path, content, contentType) {
      const from = String(path || "");
      const to = normalizeMotherPath(from);
      if (from !== to) log("info", `path normalized: ${from} -> ${to}`);

      await postRetry(
        { type: "RCF_OVERRIDE_PUT", path: to, content: String(content ?? ""), contentType },
        `put(${to})`
      );
      return true;
    },
    async clear() {
      await postRetry({ type: "RCF_OVERRIDE_CLEAR" }, "clear()");
      return true;
    }
  };

  window.RCF_VFS_OVERRIDES = api;
})();
