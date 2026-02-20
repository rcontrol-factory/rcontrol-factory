/* FILE: /app/js/core/agent_zip_bridge.js
/* =========================================================
  RControl Factory — /app/js/core/agent_zip_bridge.js (v1.0 SAFE)
  Objetivo:
  - Importar ZIP (ex.: Replit Agent) e salvar no KV (IDB/local fallback)
  - Expor API pro "Agent" usar como base de arquivos/knowledge
  - iOS safe + fail-safe (nunca trava a Factory)

  PATCH (compat + UI READY):
  - ✅ Exporta também window.RCF_AGENT_ZIP_BRIDGE (alias) — o app.js chama esse nome
  - ✅ Escuta RCF:UI_READY e monta o ZIP_VAULT quando ele existir (corrige reinject_called=0)
========================================================= */
(function () {
  "use strict";

  // Já carregado?
  if (window.RCF_AGENT_ZIP && window.RCF_AGENT_ZIP.__v10) return;
  if (window.RCF_AGENT_ZIP_BRIDGE && window.RCF_AGENT_ZIP_BRIDGE.__v10) return;

  const KEY_LAST = "agent_zip:last";

  const log = (level, msg) => {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
    try { console.log("[RCF/AGENT_ZIP]", level, msg); } catch {}
  };

  function nowISO() {
    try { return new Date().toISOString(); } catch { return String(Date.now()); }
  }

  function guessMime(path) {
    const p = String(path || "").toLowerCase();
    if (p.endsWith(".html")) return "text/html";
    if (p.endsWith(".css")) return "text/css";
    if (p.endsWith(".js")) return "text/javascript";
    if (p.endsWith(".json")) return "application/json";
    if (p.endsWith(".md")) return "text/markdown";
    if (p.endsWith(".txt")) return "text/plain";
    if (p.endsWith(".png")) return "image/png";
    if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
    if (p.endsWith(".webp")) return "image/webp";
    if (p.endsWith(".svg")) return "image/svg+xml";
    if (p.endsWith(".pdf")) return "application/pdf";
    return "application/octet-stream";
  }

  function isProbablyText(mime, path) {
    if (String(mime || "").startsWith("text/")) return true;
    const p = String(path || "").toLowerCase();
    return (
      p.endsWith(".js") || p.endsWith(".json") || p.endsWith(".css") ||
      p.endsWith(".html") || p.endsWith(".md") || p.endsWith(".txt") ||
      p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".jsx") ||
      p.endsWith(".env") || p.endsWith(".gitignore") || p.endsWith(".replit")
    );
  }

  function pickFile() {
    return new Promise((resolve) => {
      try {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = ".zip,application/zip";
        inp.style.position = "fixed";
        inp.style.left = "-9999px";
        inp.style.top = "-9999px";
        document.body.appendChild(inp);

        inp.onchange = () => {
          const f = inp.files && inp.files[0] ? inp.files[0] : null;
          try { inp.remove(); } catch {}
          resolve(f);
        };

        inp.click();
      } catch (e) {
        log("ERR", "file picker fail: " + (e?.message || e));
        resolve(null);
      }
    });
  }

  async function ensureDeps() {
    try {
      // vendor loader opcional
      if (window.RCF_VENDOR?.ensureJSZip) {
        await window.RCF_VENDOR.ensureJSZip();
      }
      if (!window.JSZip || typeof window.JSZip.loadAsync !== "function") {
        throw new Error("JSZip ausente");
      }
      if (!window.RCF_STORAGE || typeof window.RCF_STORAGE.put !== "function") {
        throw new Error("RCF_STORAGE.put ausente");
      }
      return true;
    } catch (e) {
      log("ERR", "deps fail: " + (e?.message || e));
      return false;
    }
  }

  async function importZip() {
    try {
      log("INFO", "importZip: iniciando…");

      const ok = await ensureDeps();
      if (!ok) return { ok: false, err: "deps_missing" };

      const file = await pickFile();
      if (!file) {
        log("WARN", "importZip: cancelado");
        return { ok: false, err: "canceled" };
      }

      const buf = await file.arrayBuffer();
      const zip = await window.JSZip.loadAsync(buf);

      const filesOut = {};
      let count = 0;
      let bytesApprox = 0;

      const entries = Object.keys(zip.files || {});
      for (const name of entries) {
        const entry = zip.files[name];
        if (!entry || entry.dir) continue;

        const mime = guessMime(name);
        const isText = isProbablyText(mime, name);

        try {
          if (isText) {
            const txt = await entry.async("string");
            filesOut[name] = { enc: "utf8", mime, data: txt };
            bytesApprox += (txt ? txt.length : 0);
          } else {
            // bin -> base64 (para não quebrar IDB com Blob)
            const b64 = await entry.async("base64");
            filesOut[name] = { enc: "base64", mime, data: b64 };
            bytesApprox += (b64 ? b64.length : 0);
          }
          count++;
        } catch (e) {
          log("WARN", "falha lendo entry: " + name + " :: " + (e?.message || e));
        }
      }

      const payload = {
        meta: {
          kind: "rcf-agent-zip",
          name: file.name,
          size: file.size || 0,
          importedAt: nowISO(),
          filesCount: count,
          approxBytes: bytesApprox
        },
        files: filesOut
      };

      const saved = await window.RCF_STORAGE.put(KEY_LAST, payload);

      if (saved) {
        log("OK", "ZIP importado ✅ name=" + file.name + " files=" + count);
        try { window.RCF_LOGGER?.push?.("OK", "AGENT_ZIP saved ✅ files=" + count); } catch {}
        return { ok: true, files: count, name: file.name };
      }

      log("ERR", "falha ao salvar no KV");
      return { ok: false, err: "save_failed" };

    } catch (e) {
      log("ERR", "importZip fail: " + (e?.message || e));
      return { ok: false, err: String(e?.message || e) };
    }
  }

  async function getLast() {
    try {
      if (!window.RCF_STORAGE?.getAsync) throw new Error("RCF_STORAGE.getAsync ausente");
      const v = await window.RCF_STORAGE.getAsync(KEY_LAST, null);
      return v || null;
    } catch (e) {
      log("WARN", "getLast fail: " + (e?.message || e));
      return null;
    }
  }

  async function clearLast() {
    try {
      if (!window.RCF_STORAGE?.delAsync) throw new Error("RCF_STORAGE.delAsync ausente");
      await window.RCF_STORAGE.delAsync(KEY_LAST);
      log("OK", "AGENT_ZIP cleared ✅");
      return true;
    } catch (e) {
      log("WARN", "clearLast fail: " + (e?.message || e));
      return false;
    }
  }

  // =========================================================
  // UI READY / VAULT reinject (corrige ordem de load)
  // =========================================================
  function tryMountVaultUI(reason) {
    try {
      const V = window.RCF_ZIP_VAULT;
      if (V && typeof V.mount === "function") {
        const ok = V.mount();
        if (ok) {
          try { window.RCF_LOGGER?.push?.("OK", `AGENT_ZIP_BRIDGE: vault mounted ✅ (${reason || "auto"})`); } catch {}
          return true;
        }
      }
    } catch {}
    return false;
  }

  function mountUI() {
    // tentativa imediata
    if (tryMountVaultUI("mountUI")) return true;

    // re-tentativas leves (iPhone safe)
    setTimeout(() => { tryMountVaultUI("retry 800ms"); }, 800);
    setTimeout(() => { tryMountVaultUI("retry 2000ms"); }, 2000);
    return false;
  }

  function onUIReady() {
    // UI_READY pode acontecer antes deste módulo ou antes do zip_vault
    mountUI();
  }

  // escuta evento padrão do app.js
  try {
    window.addEventListener("RCF:UI_READY", () => onUIReady(), { passive: true });
  } catch {}

  // se já está pronto, tenta já
  try {
    if (window.__RCF_UI_READY__) {
      onUIReady();
    }
  } catch {}

  // =========================================================
  // Export global API (mantém RCF_AGENT_ZIP + adiciona alias BRIDGE)
  // =========================================================
  const API = {
    __v10: true,
    importZip,
    getLast,
    clearLast,

    // compat hooks chamados pelo app.js (notifyUIReady)
    mountUI,
    mount: mountUI,
    init: mountUI
  };

  window.RCF_AGENT_ZIP = API;
  window.RCF_AGENT_ZIP_BRIDGE = API;

  log("OK", "agent_zip_bridge.js ready ✅ (v1.0)");
})();
