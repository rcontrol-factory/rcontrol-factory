/* RControl Factory — /app/js/core/vfs_overrides.js (PADRÃO) — v2
  - Scope correto do SW em /app/: ./sw.js com scope ./
  - getRegistration no scope ./ (não "/")
  - normalizeMotherPath(p): tudo vira /app/...
  - put() com retry/backoff + espera SW controlar (iOS safe)
*/
(() => {
  "use strict";

  // -----------------------------
  // Logging (compat)
  // -----------------------------
  const log = (lvl, msg) => {
    try { window.RCF_LOGGER?.push?.(lvl, String(msg)); } catch {}
    try { console.log("[VFS_OVERRIDES]", lvl, msg); } catch {}
  };

  // -----------------------------
  // PADRÃO: MotherRoot é /app
  // -----------------------------
  function normalizeMotherPath(p) {
    let x = String(p || "").trim();
    if (!x) return "";
    x = x.split("#")[0].split("?")[0].trim();
    if (!x.startsWith("/")) x = "/" + x;
    x = x.replace(/\/{2,}/g, "/");

    // regra de ouro: tudo vira /app/...
    if (x === "/index.html") x = "/app/index.html";
    if (x === "/styles.css") x = "/app/styles.css";
    if (x === "/app.js") x = "/app/app.js";
    if (x === "/sw.js") x = "/app/sw.js";
    if (x === "/manifest.json") x = "/app/manifest.json";

    // /js/... vira /app/js/...
    if (x.startsWith("/js/")) x = "/app" + x;

    // garante /app/
    if (!x.startsWith("/app/")) x = "/app" + x;

    x = x.replace(/\/{2,}/g, "/");
    return x;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitForController(timeoutMs = 3500) {
    if (!("serviceWorker" in navigator)) return null;

    // já controlando?
    if (navigator.serviceWorker.controller) return navigator.serviceWorker.controller;

    // espera controllerchange
    let done = false;
    return await new Promise((resolve) => {
      const t = setTimeout(() => {
        if (done) return;
        done = true;
        resolve(navigator.serviceWorker.controller || null);
      }, timeoutMs);

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (done) return;
        clearTimeout(t);
        done = true;
        resolve(navigator.serviceWorker.controller || null);
      }, { once: true });
    });
  }

  // ✅ pega registration do scope ./ (baseURI do /app/)
  async function getAppRegistration() {
    if (!("serviceWorker" in navigator)) return null;

    // 1) tenta explicitamente scope "./"
    try {
      const reg1 = await navigator.serviceWorker.getRegistration("./");
      if (reg1) return reg1;
    } catch {}

    // 2) tenta baseURI (seguro com <base href="./">)
    try {
      const scope = new URL("./", document.baseURI).toString();
      const reg2 = await navigator.serviceWorker.getRegistration(scope);
      if (reg2) return reg2;
    } catch {}

    // 3) fallback genérico
    try {
      const reg3 = await navigator.serviceWorker.getRegistration();
      return reg3 || null;
    } catch {}

    return null;
  }

  async function post(msg) {
    const reg = await getAppRegistration();

    // pega SW ativo/controlador
    const sw =
      reg?.active ||
      reg?.waiting ||
      navigator.serviceWorker?.controller ||
      null;

    // tenta aguardar controller se não existir ainda
    if (!sw) {
      await waitForController(3500);
    }

    const reg2 = await getAppRegistration();
    const sw2 = reg2?.active || navigator.serviceWorker?.controller;

    if (!sw2) throw new Error("SW não controlando a página ainda (scope ./).");

    return await new Promise((resolve, reject) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = (ev) => {
        const d = ev.data || {};
        if (d.type?.endsWith("_ERR")) reject(new Error(d.error || "ERR"));
        else resolve(d);
      };
      sw2.postMessage(msg, [ch.port2]);
    });
  }

  async function postWithRetry(msg, tries = 4) {
    let lastErr = null;
    for (let i = 0; i < tries; i++) {
      try {
        if (i > 0) log("warn", `retry ${i + 1}/${tries}: ${msg?.type || "MSG"}`);
        return await post(msg);
      } catch (e) {
        lastErr = e;
        // backoff iOS safe
        await sleep(350 + i * 600);
      }
    }
    throw lastErr || new Error("postWithRetry failed");
  }

  const api = {
    async put(path, content, contentType) {
      const from = String(path || "");
      const to = normalizeMotherPath(from);

      // ✅ log obrigatório do PATCH MÍNIMO
      if (from !== to) log("info", `path normalized: ${from} -> ${to}`);

      await postWithRetry({
        type: "RCF_OVERRIDE_PUT",
        path: to,
        content: String(content ?? ""),
        contentType: String(contentType || "")
      });

      return true;
    },

    async clear() {
      await postWithRetry({ type: "RCF_OVERRIDE_CLEAR" });
      return true;
    },

    // expose p/ debug
    _normalizeMotherPath: normalizeMotherPath
  };

  window.RCF_VFS_OVERRIDES = api;
  log("ok", "vfs_overrides.js ready ✅ (scope ./, normalize + retry)");
})();
