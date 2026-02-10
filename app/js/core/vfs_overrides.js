/* core/vfs_overrides.js
   API: window.RCF_VFS
   - put(path, content, type)
   - clearAll()
*/

(() => {
  "use strict";

  const CONTENT_TYPES = {
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8"
  };

  function ext(path) {
    const m = String(path || "").toLowerCase().match(/\.[a-z0-9]+$/);
    return m ? m[0] : ".txt";
  }

  async function ensureSWReady() {
    if (!("serviceWorker" in navigator)) throw new Error("Service Worker não suportado.");
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) throw new Error("SW sem active ainda.");
    return reg;
  }

  function postToSW(msg) {
    return new Promise(async (resolve, reject) => {
      try {
        await ensureSWReady();

        const onMsg = (ev) => {
          const d = ev.data || {};
          if (d.type === "RCF_OVERRIDE_PUT_OK" || d.type === "RCF_OVERRIDE_CLEAR_OK") {
            navigator.serviceWorker.removeEventListener("message", onMsg);
            resolve(d);
          }
        };
        navigator.serviceWorker.addEventListener("message", onMsg);

        // envia
        const ctrl = navigator.serviceWorker.controller;
        if (!ctrl) {
          // primeiro load depois do register pode não ter controller
          navigator.serviceWorker.removeEventListener("message", onMsg);
          reject(new Error("Sem controller. Recarregue a página 1x após instalar o SW."));
          return;
        }
        ctrl.postMessage(msg);
      } catch (e) {
        reject(e);
      }
    });
  }

  async function put(path, content, contentType) {
    const p = String(path || "").trim();
    if (!p.startsWith("/")) throw new Error("path deve começar com / (ex: /app.js)");
    const ct = contentType || CONTENT_TYPES[ext(p)] || "text/plain; charset=utf-8";
    return postToSW({ type: "RCF_OVERRIDE_PUT", path: p, content: String(content ?? ""), contentType: ct });
  }

  async function clearAll() {
    return postToSW({ type: "RCF_OVERRIDE_CLEAR" });
  }

  window.RCF_VFS = { put, clearAll };
})();
