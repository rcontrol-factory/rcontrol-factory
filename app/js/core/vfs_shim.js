/* =========================================================
   RControl Factory — VFS SHIM (bridge seguro) — v1.1 (PADRÃO)
   - Faz módulos antigos enxergarem o VFS correto
   - Runtime real: window.RCF_VFS_OVERRIDES
   - Compat legado: window.RCF_VFS.{put,clearAll,clearOverrides}

   FIX v1.1 (necessário):
   - Mesmo se RCF_VFS já existir, COMPLETA com clearAll (Injector usa isso)
   - Não sobrescreve implementações existentes, só garante aliases
========================================================= */

(() => {
  "use strict";

  const TAG = "[VFS-SHIM]";
  const VERSION = "v1.1";

  const log = (lvl, msg) => {
    try {
      if (window.RCF_LOGGER?.push) window.RCF_LOGGER.push(lvl, msg);
      else console.log(TAG, lvl, msg);
    } catch {}
  };

  function ensureBridge() {
    const overrides = window.RCF_VFS_OVERRIDES;

    // Se ainda não carregou overrides, não dá pra bridgear
    if (!overrides || typeof overrides.put !== "function") return false;

    // Garante objeto RCF_VFS
    window.RCF_VFS = window.RCF_VFS || {};

    // 1) put (não sobrescreve se já existir)
    if (typeof window.RCF_VFS.put !== "function") {
      window.RCF_VFS.put = async (path, content, contentType) => {
        return overrides.put(path, content, contentType);
      };
    }

    // 2) clearOverrides (alias seguro)
    if (typeof window.RCF_VFS.clearOverrides !== "function") {
      window.RCF_VFS.clearOverrides = async () => {
        if (typeof overrides.clearOverrides === "function") return overrides.clearOverrides();
        if (typeof overrides.clear === "function") return overrides.clear();
        throw new Error("RCF_VFS_OVERRIDES.clear/clearOverrides não encontrado.");
      };
    }

    // 3) clearAll (Injector legado usa isso) ✅
    if (typeof window.RCF_VFS.clearAll !== "function") {
      window.RCF_VFS.clearAll = async () => {
        // prioriza clearOverrides (padrão do vfs_overrides v1.3)
        if (typeof overrides.clearOverrides === "function") return overrides.clearOverrides();
        if (typeof overrides.clear === "function") return overrides.clear();
        // fallback: tenta via alias que acabamos de garantir
        if (typeof window.RCF_VFS.clearOverrides === "function") return window.RCF_VFS.clearOverrides();
        throw new Error("Não foi possível limpar overrides (clearAll).");
      };
    }

    log("ok", `VFS bridge OK ✅ (${VERSION})`);
    return true;
  }

  // tenta já
  if (ensureBridge()) return;

  // tenta por alguns segundos
  let tries = 0;
  const MAX_TRIES = 30;

  const t = setInterval(() => {
    tries++;
    if (ensureBridge() || tries >= MAX_TRIES) {
      clearInterval(t);
      if (tries >= MAX_TRIES) log("warn", "VFS bridge não instalou (timeout).");
    }
  }, 200);
})();
