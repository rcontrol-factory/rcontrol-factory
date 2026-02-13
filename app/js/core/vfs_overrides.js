/* RControl Factory — /app/js/core/vfs_overrides.js (PADRÃO) — v1.1
   FIX:
   - getRegistration("./") (compatível com SW scope "./")
   - fallback: getRegistration() + controller + ready
   - retry curto quando SW ainda não controlou a página
   - aliases: write / writeFile (pra compat com mother_selfupdate)
*/
(() => {
  "use strict";

  if (window.RCF_VFS_OVERRIDES && window.RCF_VFS_OVERRIDES.__v11) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function getSWController() {
    // 1) controller direto
    if (navigator.serviceWorker?.controller) return navigator.serviceWorker.controller;

    // 2) tenta pegar registration do scope "./" (PWA em /app/)
    let reg = null;
    try { reg = await navigator.serviceWorker?.getRegistration?.("./"); } catch {}
    if (!reg) {
      try { reg = await navigator.serviceWorker?.getRegistration?.(); } catch {}
    }

    const sw = reg?.active || reg?.waiting || reg?.installing || null;
    if (sw) return sw;

    // 3) espera ready (quando o SW terminar de instalar)
    try {
      const readyReg = await navigator.serviceWorker.ready;
      const sw2 = readyReg?.active || null;
      if (sw2) return sw2;
    } catch {}

    return null;
  }

  async function post(msg) {
    if (!("serviceWorker" in navigator)) {
      throw new Error("ServiceWorker não suportado.");
    }

    // iOS: às vezes precisa esperar o SW controlar a página
    let lastErr = null;
    for (let i = 0; i < 4; i++) {
      try {
        const sw = await getSWController();
        if (!sw) throw new Error("SW não controlando a página ainda.");

        return await new Promise((resolve, reject) => {
          const ch = new MessageChannel();
          ch.port1.onmessage = (ev) => {
            const d = ev.data || {};
            if (d.type?.endsWith("_ERR")) reject(new Error(d.error || "ERR"));
            else resolve(d);
          };
          sw.postMessage(msg, [ch.port2]);
        });
      } catch (e) {
        lastErr = e;
        await sleep(180 + i * 220);
      }
    }

    throw (lastErr || new Error("post failed"));
  }

  const api = {
    __v11: true,

    async put(path, content, contentType) {
      await post({ type: "RCF_OVERRIDE_PUT", path, content, contentType });
      return true;
    },

    // aliases p/ compat
    async write(path, content, contentType) {
      return await api.put(path, content, contentType);
    },
    async writeFile(path, content, contentType) {
      return await api.put(path, content, contentType);
    },

    async clear() {
      await post({ type: "RCF_OVERRIDE_CLEAR" });
      return true;
    }
  };

  window.RCF_VFS_OVERRIDES = api;
})();
