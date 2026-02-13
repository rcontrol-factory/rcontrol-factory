/* app/js/core/vfs_shim.js
   - Ponte SAFE: faz o Injector enxergar o VFS correto.
   - Seu app tem: window.RCF_VFS_OVERRIDES (put/clear)
   - Injector espera: window.RCF_VFS (put/clearAll)
*/
(() => {
  "use strict";

  const TAG = "[VFS-SHIM]";
  const log = (...a) => { try { console.log(TAG, ...a); } catch {} };

  function install() {
    const o = window.RCF_VFS_OVERRIDES;

    if (!o || typeof o.put !== "function") {
      log("RCF_VFS_OVERRIDES ainda não existe (aguardando)...");
      return false;
    }

    // Já existe RCF_VFS com put? então não mexe
    if (window.RCF_VFS && typeof window.RCF_VFS.put === "function") {
      log("RCF_VFS já existe ✅");
      return true;
    }

    // cria a ponte
    window.RCF_VFS = {
      put: async (path, content, contentType) => {
        // passa pelo override real
        return o.put(path, content, contentType);
      },

      // Injector chama clearAll(), mas o override real chama clear()
      clearAll: async () => {
        if (typeof o.clear === "function") return o.clear();
        if (typeof o.clearAll === "function") return o.clearAll();
        // fallback: se não existir, pelo menos não quebra
        throw new Error("RCF_VFS_OVERRIDES.clear() não existe.");
      },
    };

    log("Ponte instalada ✅ window.RCF_VFS -> RCF_VFS_OVERRIDES");
    return true;
  }

  // tenta agora
  if (install()) return;

  // tenta de novo (porque scripts carregam em ordem, mas iOS às vezes dá delay)
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    if (install() || tries >= 25) {
      clearInterval(t);
      if (tries >= 25) log("não conseguiu instalar (timeout).");
    }
  }, 200);
})();
