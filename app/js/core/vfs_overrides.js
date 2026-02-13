/* RControl Factory — /app/js/core/vfs_overrides.js (PADRÃO) — v1.3
   - FIX iOS: descobre o root real via new URL("./sw.js", document.baseURI)
   - Garante scope "/app/" quando o app roda em /app/ (Pages/Cache confuso)
   - getRegistration() + fallback getRegistrations()
   - postMessage com timeout + retry (iOS)
   - API: put(path, content, contentType) + clear()
*/
(() => {
  "use strict";

  const SW_TIMEOUT_MS = 6500;
  const SW_TRIES = 2;

  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

  function log(lvl, msg){
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[VFS_OVR]", lvl, msg); } catch {}
  }

  function deriveAppRoot(){
    // 🔒 Fonte de verdade: "./sw.js" relativo ao baseURI (seu SW fica em /app/sw.js)
    try {
      const u = new URL("./sw.js", document.baseURI);
      const p = String(u.pathname || "");
      if (p.endsWith("/sw.js")) {
        const root = p.slice(0, -"/sw.js".length) || "/";
        return root.endsWith("/") ? root : (root + "/");
      }
    } catch {}

    // fallback 1: tenta baseURI por /app/
    try {
      const b = new URL(document.baseURI);
      if ((b.pathname || "").includes("/app/")) return "/app/";
    } catch {}

    // fallback 2: pathname
    if (location.pathname.startsWith("/app/") || location.pathname === "/app") return "/app/";

    return "/";
  }

  const APP_ROOT = deriveAppRoot(); // esperado: "/app/"
  log("ok", `vfs_overrides ready ✅ scope=${APP_ROOT} base=${String(document.baseURI || "")}`);

  async function getActiveSW(){
    if (!("serviceWorker" in navigator)) return null;

    // 1) se já controlando, usa controller
    const ctrl = navigator.serviceWorker.controller;
    if (ctrl) return ctrl;

    // 2) registration do cliente (sem arg)
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sw = reg?.active || reg?.waiting || reg?.installing;
      if (sw) return sw;
    } catch {}

    // 3) registration do root detectado (/app/)
    try {
      const reg = await navigator.serviceWorker.getRegistration(APP_ROOT);
      const sw = reg?.active || reg?.waiting || reg?.installing;
      if (sw) return sw;
    } catch {}

    // 4) procura nas registrations pela que casa com scope
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      if (regs && regs.length) {
        const wantedPrefix = location.origin + APP_ROOT;
        let best = null;
        for (const r of regs) {
          const s = String(r?.scope || "");
          if (wantedPrefix && s.startsWith(wantedPrefix)) best = r;
        }
        const pick = best || regs[0];
        const sw = pick?.active || pick?.waiting || pick?.installing;
        if (sw) return sw;
      }
    } catch {}

    return null;
  }

  function withTimeout(promise, ms, label){
    let t;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms em ${label}`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  }

  async function postOnce(msg){
    const sw = await getActiveSW();
    if (!sw) throw new Error("SW não controlando a página ainda.");

    return await withTimeout(new Promise((resolve, reject) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = (ev) => {
        const d = ev.data || {};
        if (d.type?.endsWith("_ERR")) reject(new Error(d.error || "ERR"));
        else resolve(d);
      };
      try {
        sw.postMessage(msg, [ch.port2]);
      } catch (e) {
        reject(e);
      }
    }), SW_TIMEOUT_MS, msg?.type || "postMessage");
  }

  async function post(msg){
    let lastErr = null;
    for (let i = 1; i <= SW_TRIES; i++){
      try {
        return await postOnce(msg);
      } catch (e) {
        lastErr = e;
        await sleep(250 * i);
      }
    }
    throw lastErr || new Error("post failed");
  }

  const api = {
    async put(path, content, contentType) {
      await post({ type: "RCF_OVERRIDE_PUT", path, content, contentType });
      return true;
    },
    async clear() {
      await post({ type: "RCF_OVERRIDE_CLEAR" });
      return true;
    }
  };

  window.RCF_VFS_OVERRIDES = api;
})();
