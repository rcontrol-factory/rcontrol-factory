/* app/js/core/mother_selfupdate.js
   Self-Update (Mãe): puxa bundle do GitHub e aplica via VFS overrides

   Compatível com:
   - window.RCF_GH_SYNC.pull()                  -> string JSON bundle
   - window.RCF_GH_SYNC.pullFile(cfg)           -> string JSON bundle (cfg em localStorage RCF_GH_CFG)
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

  function readGHConfig() {
    try {
      return JSON.parse(localStorage.getItem("RCF_GH_CFG") || "null") || {
        owner: "",
        repo: "",
        branch: "main",
        path: "app/import/mother_bundle.json",
        token: "",
      };
    } catch {
      return { owner: "", repo: "", branch: "main", path: "app/import/mother_bundle.json", token: "" };
    }
  }

  async function pullBundleText() {
    // 1) Prefer pull() (modo antigo)
    if (window.RCF_GH_SYNC?.pull) {
      return await window.RCF_GH_SYNC.pull();
    }

    // 2) Compat: pullFile(cfg) (modo novo/admin.js)
    if (window.RCF_GH_SYNC?.pullFile) {
      const cfg = readGHConfig();
      if (!cfg?.owner || !cfg?.repo || !cfg?.token) {
        throw new Error("GitHub config incompleta (owner/repo/token). Preencha em Admin > GitHub Sync e salve.");
      }
      return await window.RCF_GH_SYNC.pullFile(cfg);
    }

    throw new Error("GitHub Sync ausente: precisa RCF_GH_SYNC.pull() ou RCF_GH_SYNC.pullFile(cfg).");
  }

  async function applyBundleText(bundleText) {
    let bundle;
    try { bundle = JSON.parse(bundleText); }
    catch (e) { throw new Error("Bundle JSON inválido: " + (e?.message || e)); }

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
    try { await navigator.serviceWorker?.ready; } catch {}
    try {
      const reg = await navigator.serviceWorker?.getRegistration?.("/");
      await reg?.update?.();
      return true;
    } catch {
      return false;
    }
  }

  function reloadSoon(ms = 250) {
    try { setTimeout(() => location.reload(), ms); } catch {}
  }

  const api = {
    status() {
      return {
        ok: true,
        hasGhPull: !!window.RCF_GH_SYNC?.pull,
        hasGhPullFile: !!window.RCF_GH_SYNC?.pullFile,
        hasOverrides: !!window.RCF_VFS_OVERRIDES?.put,
        hasClear: !!window.RCF_VFS_OVERRIDES?.clear,
        ua: navigator.userAgent,
      };
    },

    // === nomes “novos” ===
    async updateFromGitHub() {
      log("info", "Mãe: puxando bundle do GitHub...");
      const bundleText = await pullBundleText();

      log("info", "Mãe: aplicando overrides...");
      const n = await applyBundleText(bundleText);

      log("ok", `Mãe: ${n} arquivo(s) aplicado(s). Atualizando SW...`);
      const swOk = await tryUpdateSW();

      log("ok", `Mãe: SW update ${swOk ? "OK" : "falhou/ignorado"} — recarregando...`);
      reloadSoon(250);
      return n;
    },

    async clearOverrides() {
      const clear = window.RCF_VFS_OVERRIDES?.clear;
      if (!clear) throw new Error("RCF_VFS_OVERRIDES.clear não existe.");
      log("warn", "Mãe: limpando overrides...");
      await clear();
      await tryUpdateSW();
      log("ok", "Mãe: overrides limpos. Recarregando...");
      reloadSoon(200);
      return true;
    },

    // === aliases “antigos” (pra UI velha não morrer) ===
    async carregarMae() { return api.updateFromGitHub(); },
    async loadMother() { return api.updateFromGitHub(); },
    async rodarCheck() { return api.status(); },
    async runCheck() { return api.status(); },
    async clear() { return api.clearOverrides(); },
  };

  // expõe nos nomes comuns
  window.RCF_MOTHER = api;
  window.RCF_MAE = api;

  // --- iOS / UI antiga: prende eventos nos botões da seção "MAINTENANCE" mesmo que a UI seja antiga ---
  function bindMaintenanceButtons() {
    // procura um container que tenha o texto "MAINTENANCE" ou "Self-Update"
    const allCards = Array.from(document.querySelectorAll(".card, section, div"));
    const maint = allCards.find(el => {
      const t = (el.textContent || "").toUpperCase();
      return t.includes("MAINTENANCE") && t.includes("SELF");
    });

    if (!maint) return false;

    const buttons = Array.from(maint.querySelectorAll("button"));
    if (!buttons.length) return false;

    function hook(btn, fn) {
      if (!btn) return;

      // iOS: usar touchend + click e garantir que vai executar
      const run = async (ev) => {
        try {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
        } catch {}

        try {
          btn.disabled = true;
          const res = await fn();
          log("ok", "UI: ação OK");
          return res;
        } catch (e) {
          log("error", "UI: ação falhou: " + (e?.message || e));
          alert("Falhou: " + (e?.message || e));
        } finally {
          btn.disabled = false;
        }
      };

      btn.style.pointerEvents = "auto";
      btn.addEventListener("touchend", run, { passive: false });
      btn.addEventListener("click", run, { passive: false });
    }

    // mapeia por texto do botão (robusto)
    for (const b of buttons) {
      const t = (b.textContent || "").trim().toLowerCase();

      if (t.includes("carregar")) hook(b, () => api.loadMother());
      else if (t.includes("rodar") || t.includes("check")) hook(b, () => api.runCheck());
      else if (t.includes("update") && t.includes("github")) hook(b, () => api.updateFromGitHub());
      else if (t.includes("clear") || t.includes("overrides")) hook(b, () => api.clearOverrides());
    }

    return true;
  }

  function bootBinders() {
    // tenta agora e tenta de novo depois (porque UI pode renderizar depois)
    let ok = bindMaintenanceButtons();
    if (!ok) setTimeout(bindMaintenanceButtons, 600);
    if (!ok) setTimeout(bindMaintenanceButtons, 1400);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootBinders);
  } else {
    bootBinders();
  }

  log("ok", "mother_selfupdate.js loaded (compat + iOS binder)");
})();
