/* =========================================================
   RControl Factory — VFS SHIM (bridge seguro)
   - Faz o Injector enxergar o VFS correto.
   - Seu runtime real usa: window.RCF_VFS_OVERRIDES
   - Alguns módulos antigos esperam: window.RCF_VFS
   - Esse arquivo cria a ponte entre os dois.

   Versão: v1.0
========================================================= */

(() => {
  "use strict";

  const TAG = "[VFS-SHIM]";
  const VERSION = "v1.0";

  const log = (lvl, msg) => {
    try {
      if (window.RCF_LOGGER?.push) {
        window.RCF_LOGGER.push(lvl, msg);
      } else {
        console.log(TAG, lvl, msg);
      }
    } catch {}
  };

  function installBridge() {
    const overrides = window.RCF_VFS_OVERRIDES;

    // Se ainda não carregou overrides, espera
    if (!overrides || typeof overrides.put !== "function") {
      return false;
    }

    // Se já existe RCF_VFS funcional, não sobrescreve
    if (window.RCF_VFS && typeof window.RCF_VFS.put === "function") {
      log("ok", "RCF_VFS já existe (bridge não necessária) ✅");
      return true;
    }

    // Cria ponte compatível
    window.RCF_VFS = {
      put: async (path, content, contentType) => {
        return overrides.put(path, content, contentType);
      },

      clearAll: async () => {
        if (typeof overrides.clear === "function") {
          return overrides.clear();
        }

        if (typeof overrides.clearOverrides === "function") {
          return overrides.clearOverrides();
        }

        throw new Error("RCF_VFS_OVERRIDES.clear() não encontrado.");
      }
    };

    log("ok", `VFS bridge instalada ✅ (${VERSION})`);
    return true;
  }

  // Tenta instalar imediatamente
  if (installBridge()) return;

  // Se carregou antes do overrides, tenta por alguns segundos
  let tries = 0;
  const MAX_TRIES = 30;

  const interval = setInterval(() => {
    tries++;

    if (installBridge() || tries >= MAX_TRIES) {
      clearInterval(interval);

      if (tries >= MAX_TRIES) {
        log("warn", "VFS bridge não conseguiu instalar (timeout).");
      }
    }
  }, 200);

})();
