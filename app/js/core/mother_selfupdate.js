/* /app/js/core/mother_selfupdate.js
   Self-Update (Mãe): puxa bundle do GitHub e aplica via SW overrides
   Requer:
     - window.RCF_GH_SYNC.pull() -> retorna string JSON do bundle
     - window.RCF_VFS_OVERRIDES.put(path, content, contentType)
     - window.RCF_VFS_OVERRIDES.clear()
*/

(() => {
  "use strict";

  const log = (type, msg) => {
    try { window.RCF_LOGGER?.push?.(type, msg); } catch {}
  };

  async function applyBundle(bundleText) {
    let bundle;
    try { bundle = JSON.parse(bundleText); }
    catch (e) { throw new Error("Bundle JSON inválido: " + (e?.message || e)); }

    // Formato esperado:
    // { files: { "/app/app.js": { content, contentType }, ... } }
    const files = bundle.files || bundle;
    if (!files || typeof files !== "object") throw new Error("Bundle sem 'files'.");

    const put = window.RCF_VFS_OVERRIDES?.put;
    if (!put) throw new Error("RCF_VFS_OVERRIDES.put não existe.");

    let count = 0;
    for (const [path, v] of Object.entries(files)) {
      const content = (v && typeof v === "object" && "content" in v) ? String(v.content ?? "") : String(v ?? "");
      const contentType = (v && typeof v === "object" && v.contentType) ? String(v.contentType) : guessType(path);
      await put(path, content, contentType);
      count++;
    }
    return count;
  }

  function guessType(path) {
    const p = String(path || "");
    if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
    if (p.endsWith(".css")) return "text/css; charset=utf-8";
    if (p.endsWith(".html")) return "text/html; charset=utf-8";
    if (p.endsWith(".json")) return "application/json; charset=utf-8";
    return "text/plain; charset=utf-8";
  }

  const api = {
    async updateFromGitHub() {
      if (!window.RCF_GH_SYNC?.pull) throw new Error("GitHub Sync ausente: RCF_GH_SYNC.pull()");
      log("info", "Mãe: puxando bundle do GitHub...");
      const bundleText = await window.RCF_GH_SYNC.pull();

      log("info", "Mãe: aplicando overrides...");
      const n = await applyBundle(bundleText);

      log("ok", `Mãe: ${n} arquivo(s) aplicado(s). Atualizando SW...`);
      try { await navigator.serviceWorker?.getRegistration?.("/"); } catch {}

      // tenta atualizar e recarregar
      try { await navigator.serviceWorker?.ready; } catch {}
      try { const reg = await navigator.serviceWorker.getRegistration("/"); await reg?.update?.(); } catch {}

      log("ok", "Mãe: pronto. Recarregando...");
      setTimeout(() => location.reload(), 250);
      return n;
    },

    async clearOverrides() {
      const clear = window.RCF_VFS_OVERRIDES?.clear;
      if (!clear) throw new Error("RCF_VFS_OVERRIDES.clear não existe.");
      log("warn", "Mãe: limpando overrides...");
      await clear();
      log("ok", "Mãe: overrides limpos. Recarregando...");
      setTimeout(() => location.reload(), 200);
      return true;
    }
  };

  window.RCF_MOTHER = api;
  log("ok", "mother_selfupdate.js loaded");
})();
