/* app/js/core/mother_selfupdate.js
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
    try { console.log("[MAE]", type, msg); } catch {}
  };

  function guessType(path) {
    const p = String(path || "");
    if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
    if (p.endsWith(".css")) return "text/css; charset=utf-8";
    if (p.endsWith(".html")) return "text/html; charset=utf-8";
    if (p.endsWith(".json")) return "application/json; charset=utf-8";
    if (p.endsWith(".svg")) return "image/svg+xml";
    if (p.endsWith(".png")) return "image/png";
    if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
    if (p.endsWith(".webp")) return "image/webp";
    return "text/plain; charset=utf-8";
  }

  // Normaliza o path do bundle para o formato do override.
  // Aceita:
  //  - "/app/app.js"  -> "/app.js"
  //  - "app/app.js"   -> "/app.js"
  //  - "/app/js/..."  -> "/js/..."
  //  - "/index.html"  -> "/index.html"
  function normalizePath(inputPath) {
    let p = String(inputPath || "").trim();
    if (!p) return "";

    // remove query/hash se vier sujo
    p = p.split("#")[0].split("?")[0].trim();

    // garante leading slash
    if (!p.startsWith("/")) p = "/" + p;

    // se vier "/app/..." (repo path) -> remover "/app"
    // (porque no deploy o "app/" vira raiz "/")
    if (p.startsWith("/app/")) p = p.slice(4); // remove "/app"
    // se ficar vazio, vira "/"
    if (p === "") p = "/";

    // normaliza barras duplas
    p = p.replace(/\/{2,}/g, "/");

    return p;
  }

  function shouldSkip(path) {
    const p = String(path || "");
    if (!p) return true;
    if (p.endsWith("/")) return true;
    if (p.includes("/.git/")) return true;
    if (p.endsWith(".DS_Store")) return true;
    if (p.endsWith("thumbs.db")) return true;
    return false;
  }

  async function applyBundle(bundleText) {
    let bundle;
    try { bundle = JSON.parse(bundleText); }
    catch (e) { throw new Error("Bundle JSON inválido: " + (e?.message || e)); }

    // aceita:
    // { files: { "/app/app.js": {content, contentType}, ... } }
    // OU { "/app/app.js": "...", ... }
    const files = bundle?.files || bundle;
    if (!files || typeof files !== "object") throw new Error("Bundle sem 'files'.");

    const put = window.RCF_VFS_OVERRIDES?.put;
    if (!put) throw new Error("RCF_VFS_OVERRIDES.put não existe.");

    let count = 0;
    let shown = 0;

    for (const [rawPath, v] of Object.entries(files)) {
      const normPath = normalizePath(rawPath);
      if (shouldSkip(normPath)) continue;

      const content =
        (v && typeof v === "object" && "content" in v)
          ? String(v.content ?? "")
          : String(v ?? "");

      const contentType =
        (v && typeof v === "object" && v.contentType)
          ? String(v.contentType)
          : guessType(normPath);

      await put(normPath, content, contentType);
      count++;

      if (shown < 6) {
        log("info", `override: ${normPath} (${contentType})`);
        shown++;
      }
    }

    return count;
  }

  async function tryUpdateSW() {
    try {
      await navigator.serviceWorker?.ready;
    } catch {}

    try {
      const reg = await navigator.serviceWorker?.getRegistration?.("/");
      await reg?.update?.();
      return true;
    } catch {
      return false;
    }
  }

  const api = {
    // opcional: pra seu app.js fazer "Rodar Check"
    status() {
      return {
        ok: true,
        hasGh: !!window.RCF_GH_SYNC?.pull,
        hasOverrides: !!window.RCF_VFS_OVERRIDES?.put,
        ua: navigator.userAgent,
      };
    },

    async updateFromGitHub() {
      if (!window.RCF_GH_SYNC?.pull) throw new Error("GitHub Sync ausente: RCF_GH_SYNC.pull()");
      log("info", "Mãe: puxando bundle do GitHub...");
      const bundleText = await window.RCF_GH_SYNC.pull();

      log("info", "Mãe: aplicando overrides...");
      const n = await applyBundle(bundleText);

      log("ok", `Mãe: ${n} arquivo(s) aplicado(s). Atualizando SW...`);
      const swOk = await tryUpdateSW();

      log("ok", `Mãe: SW update ${swOk ? "OK" : "falhou/ignorado"} — recarregando...`);
      setTimeout(() => location.reload(), 250);
      return n;
    },

    async clearOverrides() {
      const clear = window.RCF_VFS_OVERRIDES?.clear;
      if (!clear) throw new Error("RCF_VFS_OVERRIDES.clear não existe.");
      log("warn", "Mãe: limpando overrides...");
      await clear();
      await tryUpdateSW();
      log("ok", "Mãe: overrides limpos. Recarregando...");
      setTimeout(() => location.reload(), 200);
      return true;
    }
  };

  // expõe nos 2 nomes pra não quebrar nada
  window.RCF_MOTHER = api;
  window.RCF_MAE = api;

  log("ok", "mother_selfupdate.js loaded");
})();
