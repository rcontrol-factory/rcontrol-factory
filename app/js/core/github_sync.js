/* /app/js/core/github_sync.js
   SAFE stub — garante window.RCF_GH_SYNC existe
*/

(() => {
  "use strict";

  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  const api = {
    async pull() {
      await sleep(250);
      return "✅ Pull (stub): módulo carregado. Implementação real vem depois.";
    },
    async push() {
      await sleep(250);
      return "✅ Push (stub): módulo carregado. Implementação real vem depois.";
    }
  };

  window.RCF_GH_SYNC = api;

  try {
    if (window.RCF_LOGGER && window.RCF_LOGGER.push) {
      window.RCF_LOGGER.push("ok", "github_sync.js loaded");
    }
  } catch {}
})();
