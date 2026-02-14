/* RControl Factory — /app/js/core/vfs_overrides.js (PADRÃO) — v1.1
   - Ponte de RPC com o SW via MessageChannel
   - Suporta:
     - put(path, content, contentType)        -> RCF_OVERRIDE_PUT
     - clear()                                -> RCF_OVERRIDE_CLEAR
     - listFiles()                            -> RCF_OVERRIDE_LIST
     - deleteFile(path)                       -> RCF_OVERRIDE_DEL
*/
(() => {
  "use strict";

  const log = (lvl, msg) => {
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
  };

  async function getSW() {
    // prefer: registration active
    const reg = await navigator.serviceWorker?.getRegistration?.("/");
    const sw = reg?.active || navigator.serviceWorker?.controller;
    if (!sw) throw new Error("SW não controlando a página ainda. Recarregue 1x.");
    return sw;
  }

  async function post(msg) {
    const sw = await getSW();

    return await new Promise((resolve, reject) => {
      const ch = new MessageChannel();

      const timer = setTimeout(() => {
        reject(new Error("TIMEOUT RPC (SW)"));
      }, 6500);

      ch.port1.onmessage = (ev) => {
        clearTimeout(timer);
        const d = ev.data || {};
        if (d.type?.endsWith("_ERR")) reject(new Error(d.error || "ERR"));
        else resolve(d);
      };

      try {
        sw.postMessage(msg, [ch.port2]);
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  const api = {
    // mantém assinatura compatível
    async put(path, content, contentType) {
      await post({ type: "RCF_OVERRIDE_PUT", path, content, contentType });
      return true;
    },

    async clear() {
      await post({ type: "RCF_OVERRIDE_CLEAR" });
      return true;
    },

    // ✅ novo: lista arquivos (paths) que estão no cache de override
    async listFiles() {
      const r = await post({ type: "RCF_OVERRIDE_LIST" });
      // espera {paths:[...]}
      return Array.isArray(r.paths) ? r.paths : [];
    },

    // ✅ novo: apaga um override específico
    async deleteFile(path) {
      const r = await post({ type: "RCF_OVERRIDE_DEL", path });
      return !!r.deleted;
    }
  };

  window.RCF_VFS_OVERRIDES = api;
  log("ok", "vfs_overrides ready ✅ scope=/");
})();
