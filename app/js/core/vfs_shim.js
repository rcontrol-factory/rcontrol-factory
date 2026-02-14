/* app/js/core/vfs_shim.js  (VFS SHIM v1.1 — PADRÃO)
   - Ponte SAFE: faz qualquer injector antigo enxergar o VFS correto.
   - Real: window.RCF_VFS_OVERRIDES (put / clearOverrides / listOverrides / delOverride)
   - Compat: window.RCF_VFS (put / clearAll / clearOverrides / clear)
   Patch:
   - NÃO aborta só porque RCF_VFS.put já existe (precisa garantir clearAll)
   - Mapeia clearAll -> clearOverrides (nome certo)
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

    // garante objeto
    window.RCF_VFS = window.RCF_VFS || {};

    // ✅ sempre garante put (mesmo se já existir, mantemos se for igual, senão sobrescreve para ficar correto)
    window.RCF_VFS.put = async (path, content, contentType) => {
      return o.put(path, content, contentType);
    };

    // ✅ nomes compatíveis para CLEAR
    const doClear = async () => {
      if (typeof o.clearOverrides === "function") return o.clearOverrides();
      if (typeof o.clearAll === "function") return o.clearAll();       // caso algum build antigo tenha isso
      if (typeof o.clear === "function") return o.clear();             // último fallback
      throw new Error("RCF_VFS_OVERRIDES não tem clearOverrides/clearAll/clear");
    };

    // Injector antigo chama clearAll()
    window.RCF_VFS.clearAll = doClear;

    // Compat extra (caso algum lugar chame outros nomes)
    window.RCF_VFS.clearOverrides = doClear;
    window.RCF_VFS.clear = doClear;

    log("Ponte instalada ✅ window.RCF_VFS (put/clearAll) -> RCF_VFS_OVERRIDES");
    return true;
  }

  // tenta agora
  if (install()) return;

  // tenta de novo (ordem de load / iOS delay)
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    if (install() || tries >= 25) {
      clearInterval(t);
      if (tries >= 25) log("não conseguiu instalar (timeout).");
    }
  }, 200);
})();
