/* RControl Factory — /app/js/core/vfs_overrides.js (PADRÃO) — v1.1
   - Client API para falar com o Service Worker via MessageChannel
   - Métodos:
     - put(path, content, contentType)
     - clear()
     - listFiles()
     - deleteFile(path)
   - Timeout + retries (iOS)
*/
(() => {
  "use strict";

  const VERSION = "v1.1";
  const DEFAULT_TIMEOUT = 9000; // iOS safety
  const RETRIES = 2;

  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

  async function getSW() {
    const reg = await navigator.serviceWorker?.getRegistration?.("/");
    return reg?.active || navigator.serviceWorker?.controller || null;
  }

  async function post(msg, timeoutMs = DEFAULT_TIMEOUT) {
    const sw = await getSW();
    if (!sw) throw new Error("SW não controlando a página ainda (recarregue 1x).");

    return await new Promise((resolve, reject) => {
      const ch = new MessageChannel();
      let t = null;

      ch.port1.onmessage = (ev) => {
        try {
          clearTimeout(t);
          const d = ev.data || {};
          if (d.type?.endsWith("_ERR")) reject(new Error(d.error || "ERR"));
          else resolve(d);
        } catch (e) {
          reject(e);
        }
      };

      t = setTimeout(() => {
        try { ch.port1.onmessage = null; } catch {}
        reject(new Error(`TIMEOUT ${timeoutMs}ms em ${msg?.type || "postMessage"}`));
      }, timeoutMs);

      try {
        sw.postMessage(msg, [ch.port2]);
      } catch (e) {
        clearTimeout(t);
        reject(e);
      }
    });
  }

  async function postRetry(msg, timeoutMs){
    let lastErr = null;
    for (let i = 0; i <= RETRIES; i++){
      try {
        return await post(msg, timeoutMs);
      } catch (e) {
        lastErr = e;
        await sleep(250 * (i + 1));
      }
    }
    throw lastErr || new Error("postRetry failed");
  }

  const api = {
    __v: VERSION,

    async put(path, content, contentType) {
      const r = await postRetry(
        { type: "RCF_OVERRIDE_PUT", path, content, contentType },
        12000
      );
      return !!r?.ok;
    },

    async clear() {
      const r = await postRetry(
        { type: "RCF_OVERRIDE_CLEAR" },
        12000
      );
      return !!r?.ok;
    },

    async listFiles() {
      const r = await postRetry(
        { type: "RCF_OVERRIDE_LIST" },
        12000
      );
      // retorna array de paths ("/index.html", "/js/...", etc)
      return Array.isArray(r?.paths) ? r.paths : [];
    },

    async deleteFile(path) {
      const r = await postRetry(
        { type: "RCF_OVERRIDE_DEL", path },
        12000
      );
      return !!r?.deleted;
    }
  };

  window.RCF_VFS_OVERRIDES = api;

  try {
    // log friendly (se tiver logger)
    window.RCF_LOGGER?.push?.("ok", `vfs_overrides ready ✅ ${VERSION} scope=/`);
  } catch {}

})();
