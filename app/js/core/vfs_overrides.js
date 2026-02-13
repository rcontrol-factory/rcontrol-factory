/* RControl Factory — /app/js/core/vfs_overrides.js (PADRÃO) — v1.1
   - Corrige lookup do Service Worker quando o app roda em /app/ com scope "./"
   - Evita getRegistration("/") (errado) e usa baseURI (/app/)
   - postMessage com timeout e retry curto (iOS)
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

  function getAppScopePathname(){
    // baseURI deve estar em /app/ por causa do <base href="./">
    try {
      const u = new URL("./", document.baseURI);
      // garante "/app/" (termina com /)
      return u.pathname.endsWith("/") ? u.pathname : (u.pathname + "/");
    } catch {
      return "/app/";
    }
  }

  async function getActiveSW(){
    if (!("serviceWorker" in navigator)) return null;

    // 1) se já existe controller, usa ele (mais rápido)
    const ctrl = navigator.serviceWorker.controller;
    if (ctrl) return ctrl;

    // 2) tenta pegar registration do escopo do app (/app/)
    const scopePath = getAppScopePathname();

    try {
      const reg = await navigator.serviceWorker.getRegistration(scopePath);
      const sw = reg?.active || reg?.waiting || reg?.installing;
      if (sw) return sw;
    } catch {}

    // 3) fallback: pega qualquer registration e escolhe a mais específica pro /app/
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      if (regs && regs.length) {
        const wantedPrefix = location.origin + scopePath;
        let best = null;

        for (const r of regs) {
          const s = String(r?.scope || "");
          if (!s) continue;
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
        const res = await postOnce(msg);
        return res;
      } catch (e) {
        lastErr = e;
        // backoff curto (iOS)
        await sleep(250 * i);
      }
    }
    throw lastErr || new Error("post failed");
  }

  const api = {
    async put(path, content, contentType) {
      // mantém o path exatamente como veio (a Mãe já normaliza pra /app/...)
      await post({ type: "RCF_OVERRIDE_PUT", path, content, contentType });
      return true;
    },

    async clear() {
      await post({ type: "RCF_OVERRIDE_CLEAR" });
      return true;
    }
  };

  window.RCF_VFS_OVERRIDES = api;

  log("ok", `vfs_overrides ready ✅ scope=${getAppScopePathname()}`);
})();
