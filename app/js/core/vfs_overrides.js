/* RControl Factory — /app/js/core/vfs_overrides.js (PADRÃO) — v1.2
   - Corrige seleção do Service Worker (scope) mesmo quando document.baseURI engana (iOS / Pages)
   - Descobre o root real (/app/) pela URL do script carregado (vfs_overrides.js)
   - Usa getRegistration() do contexto + fallback por getRegistrations()
   - postMessage com timeout + retry curto (iOS)
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

  function findThisScriptSrc(){
    // 1) melhor: currentScript
    try {
      const s = document.currentScript;
      if (s && s.src) return s.src;
    } catch {}

    // 2) fallback: procura pelo script que contém "vfs_overrides.js"
    try {
      const els = Array.from(document.querySelectorAll('script[src]'));
      const hit = els.find(x => String(x.src || "").includes("vfs_overrides.js"));
      if (hit && hit.src) return hit.src;
    } catch {}

    return "";
  }

  function deriveAppRootFromScript(){
    // Se o script veio de ".../app/js/core/vfs_overrides.js" → root é "/app/"
    const src = String(findThisScriptSrc() || "");
    try {
      const u = new URL(src, location.href);
      const p = u.pathname || "";
      const idx = p.indexOf("/app/");
      if (idx >= 0) return "/app/";
    } catch {}

    // fallback: tenta por pathname atual
    if (location.pathname.startsWith("/app/") || location.pathname === "/app") return "/app/";

    // último fallback
    return "/";
  }

  const APP_ROOT = deriveAppRootFromScript(); // "/app/" ou "/"
  log("ok", `vfs_overrides ready ✅ scope=${APP_ROOT}`);

  async function getActiveSW(){
    if (!("serviceWorker" in navigator)) return null;

    // 1) se já existe controller, usa (mais confiável quando já controlando)
    const ctrl = navigator.serviceWorker.controller;
    if (ctrl) return ctrl;

    // 2) registration do contexto atual (sem argumento) — pega a registration “do cliente”
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sw = reg?.active || reg?.waiting || reg?.installing;
      if (sw) return sw;
    } catch {}

    // 3) tenta registration especificamente do root detectado (/app/)
    try {
      const reg = await navigator.serviceWorker.getRegistration(APP_ROOT);
      const sw = reg?.active || reg?.waiting || reg?.installing;
      if (sw) return sw;
    } catch {}

    // 4) fallback: procura a melhor registration por prefixo de scope
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      if (regs && regs.length) {
        const wantedPrefix = location.origin + APP_ROOT;
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
