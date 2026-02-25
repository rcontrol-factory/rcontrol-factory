/* FILE: /app/js/core/agent_zip_bridge.js
   RControl Factory — core/agent_zip_bridge.js — v1.0b SAFE (NO-DOUBLE / NO-SILENT-FAIL)
   OBJETIVO:
   - Transformar ZIP (importado no RCF_ZIP_VAULT) em APP dentro do Storage (rcf:apps)
   - Monta UI no slot agent.actions (usa RCF_UI + evento RCF:UI_READY)
   - iOS safe: ArrayBuffer -> TextDecoder para texto, e base64 DataURL para binários

   PATCH SAFE:
   - ✅ Lock anti-duplo (iOS / clique repetido): zipToApp é single-flight
   - ✅ Detecta e ERRA CLARO se exceder quota do localStorage (sem fail silencioso)
   - ✅ Guard de mount (evita re-mount em cascata)
*/

(function () {
  "use strict";

  if (window.RCF_AGENT_ZIP_BRIDGE && window.RCF_AGENT_ZIP_BRIDGE.__v10b) return;

  const PREFIX = "rcf:";
  const KEY_APPS = PREFIX + "apps";

  // limite “seguro” aproximado (localStorage varia por browser; aqui é guard para não quebrar silencioso)
  const MAX_APP_JSON_BYTES = 900000; // ~900KB

  const safeJsonParse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
  const safeJsonStringify = (o) => { try { return JSON.stringify(o); } catch { return String(o); } };

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
    try { console.log("[RCF_AGENT_ZIP_BRIDGE]", level, msg); } catch {}
  }

  function nowISO() { return new Date().toISOString(); }

  function slugify(str) {
    return String(str || "")
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function mimeByPath(p) {
    const s = String(p || "").toLowerCase();
    if (s.endsWith(".pdf")) return "application/pdf";
    if (s.endsWith(".png")) return "image/png";
    if (s.endsWith(".jpg") || s.endsWith(".jpeg")) return "image/jpeg";
    if (s.endsWith(".webp")) return "image/webp";
    if (s.endsWith(".svg")) return "image/svg+xml";
    if (s.endsWith(".json")) return "application/json";
    if (s.endsWith(".css")) return "text/css";
    if (s.endsWith(".html") || s.endsWith(".htm")) return "text/html";
    if (s.endsWith(".js")) return "text/javascript";
    if (s.endsWith(".txt") || s.endsWith(".md")) return "text/plain";
    return "application/octet-stream";
  }

  function isTextByMimeOrPath(mime, p) {
    const m = String(mime || "").toLowerCase();
    if (m.startsWith("text/")) return true;
    const s = String(p || "").toLowerCase();
    return (
      s.endsWith(".js") || s.endsWith(".json") || s.endsWith(".css") ||
      s.endsWith(".html") || s.endsWith(".htm") || s.endsWith(".md") || s.endsWith(".txt") || s.endsWith(".svg")
    );
  }

  function getApps() {
    return safeJsonParse(localStorage.getItem(KEY_APPS) || "[]", []);
  }

  function setApps(list) {
    try {
      localStorage.setItem(KEY_APPS, safeJsonStringify(list || []));
      return true;
    } catch (e) {
      log("ERR", "Falha ao salvar rcf:apps (quota/localStorage). " + (e?.message || e));
      return false;
    }
  }

  function pickZipNameFromVault() {
    try {
      const last = localStorage.getItem("rcf:vault:last");
      const o = safeJsonParse(last || "{}", {});
      const n = (o && o.name) ? String(o.name) : "";
      return n.replace(/\.zip$/i, "") || "ZIP App";
    } catch {
      return "ZIP App";
    }
  }

  function arrayBufferToBase64(ab) {
    try {
      const u8 = new Uint8Array(ab);
      let s = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < u8.length; i += CHUNK) {
        s += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
      }
      return btoa(s);
    } catch {
      return "";
    }
  }

  function decodeText(ab) {
    try {
      const u8 = ab ? new Uint8Array(ab) : new Uint8Array();
      return new TextDecoder("utf-8", { fatal: false }).decode(u8);
    } catch {
      return "";
    }
  }

  async function buildFilesFromVaultIndex(opts) {
    const V = window.RCF_ZIP_VAULT;
    if (!V || typeof V.list !== "function" || typeof V.get !== "function") {
      throw new Error("RCF_ZIP_VAULT não disponível (zip_vault.js não carregou).");
    }

    const idx = V.list() || [];
    if (!idx.length) throw new Error("Vault vazio. Importe um ZIP primeiro.");

    const files = {};
    let countText = 0, countBin = 0, bytes = 0;

    // Opcional: remover prefixo de pasta raiz comum (ex: "meuapp/")
    const stripRoot = !!(opts && opts.stripRootFolder);
    let rootPrefix = "";
    if (stripRoot) {
      const parts = idx.map(it => String(it.path || "").split("/")[0]).filter(Boolean);
      const first = parts[0] || "";
      const allSame = first && parts.every(p => p === first);
      if (allSame) rootPrefix = first + "/";
    }

    for (const it of idx) {
      const path0 = String(it.path || "");
      if (!path0) continue;

      const path = rootPrefix && path0.startsWith(rootPrefix) ? path0.slice(rootPrefix.length) : path0;
      if (!path) continue;

      const mime = it.mime || mimeByPath(path);
      const rec = await V.get(path0); // pega no path original (com prefixo se tiver)
      const ab = rec && rec.ab ? rec.ab : null;
      const size = rec && rec.size ? Number(rec.size) : (ab ? ab.byteLength : 0);
      bytes += (size || 0);

      if (ab && isTextByMimeOrPath(mime, path)) {
        files[path] = decodeText(ab);
        countText++;
      } else if (ab) {
        const b64 = arrayBufferToBase64(ab);
        files[path] = `data:${mime};base64,${b64}`;
        countBin++;
      } else {
        files[path] = "";
        countText++;
      }
    }

    return { files, meta: { countText, countBin, bytes, total: countText + countBin, rootPrefix } };
  }

  function estimateUtf8Bytes(str) {
    try {
      // TextEncoder é suportado no iOS moderno; fallback simples se faltar
      if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(String(str || "")).length;
    } catch {}
    try { return unescape(encodeURIComponent(String(str || ""))).length; } catch {}
    return String(str || "").length;
  }

  // single-flight lock (anti duplo clique / iOS)
  function acquireLock() {
    const k = "__RCF_ZIP_TO_APP_LOCK__";
    const now = Date.now();
    const cur = window[k] || 0;
    if (cur && (now - cur) < 3000) return false; // 3s
    window[k] = now;
    return true;
  }
  function releaseLock() {
    try { window.__RCF_ZIP_TO_APP_LOCK__ = 0; } catch {}
  }

  async function zipToApp(options) {
    if (!acquireLock()) {
      throw new Error("Aguarde… (zipToApp já está rodando)");
    }

    try {
      const opts = options && typeof options === "object" ? options : {};
      const defaultName = pickZipNameFromVault();

      const name = String(opts.name || defaultName || "ZIP App").trim() || "ZIP App";
      const slug = String(opts.slug || slugify(name)).trim() || slugify(name) || ("zip-" + Date.now());
      const template = String(opts.template || "zip-import").trim() || "zip-import";

      const apps = getApps();
      if (apps.some(a => String(a.slug) === slug)) {
        throw new Error("Slug já existe: " + slug);
      }

      log("INFO", "zipToApp: montando files do Vault…");
      const built = await buildFilesFromVaultIndex({ stripRootFolder: opts.stripRootFolder !== false });

      if (!built.files["index.html"]) {
        built.files["index.html"] =
          `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title></head><body><h1>${name}</h1><p>ZIP importado ✅</p></body></html>`;
      }

      const app = {
        name,
        slug,
        createdAt: nowISO(),
        template,
        files: built.files,
        zipMeta: built.meta
      };

      // ✅ antes de salvar, estima tamanho do JSON do app (evita falha silenciosa)
      const appJson = safeJsonStringify(app);
      const bytesJson = estimateUtf8Bytes(appJson);

      if (bytesJson > MAX_APP_JSON_BYTES) {
        log("WARN", `ZIP->APP: APP grande demais p/ localStorage. jsonBytes=${bytesJson} max=${MAX_APP_JSON_BYTES}`);
        throw new Error(
          "ZIP grande demais para salvar como APP no localStorage.\n" +
          `Tamanho JSON=${bytesJson} (max~${MAX_APP_JSON_BYTES}).\n` +
          "DICA: importe um ZIP menor / remova assets grandes (pdf/imagens) ou use outro método de deploy."
        );
      }

      apps.push(app);

      const okSave = setApps(apps);
      if (!okSave) {
        // tenta reverter para não “parecer criado”
        try { apps.pop(); } catch {}
        throw new Error("Falhou ao salvar rcf:apps (quota/localStorage). ZIP muito grande ou storage bloqueado.");
      }

      // valida leitura de volta (garante que não “sumiu”)
      const check = getApps();
      const exists = check.some(a => String(a.slug) === slug);
      if (!exists) {
        throw new Error("Apps não persistiu (storage falhou). Não vou fingir que criou.");
      }

      log("OK", `ZIP→APP ok ✅ slug=${slug} files=${built.meta.total} bytes=${built.meta.bytes}`);
      try { window.RCF_LOGGER?.push?.("OK", `ZIP→APP ✅ ${slug} files=${built.meta.total}`); } catch {}

      if (opts.reload !== false) {
        setTimeout(() => { try { location.reload(); } catch {} }, 250);
      }

      return { ok: true, app, meta: built.meta };
    } finally {
      releaseLock();
    }
  }

  // =========================================================
  // UI mount no Agent (slot agent.actions)
  // =========================================================
  function getSlotEl() {
    try {
      const ui = window.RCF_UI;
      if (ui && typeof ui.getSlot === "function") {
        const s = ui.getSlot("agent.actions");
        if (s) return s;
      }
    } catch {}
    return document.getElementById("rcfAgentSlotActions") || document.querySelector('[data-rcf-slot="agent.actions"]') || null;
  }

  function mountUI() {
    const slot = getSlotEl();
    if (!slot) return false;

    if (document.getElementById("rcfZipToAppCard")) return true;

    const card = document.createElement("div");
    card.className = "card";
    card.id = "rcfZipToAppCard";
    card.style.marginTop = "12px";
    card.innerHTML = `
      <h2 style="margin-top:0">ZIP → APP</h2>
      <div class="hint">Converte o ZIP importado no VAULT em um app salvo na Factory.</div>

      <div class="row" style="flex-wrap:wrap;align-items:center;margin-top:10px">
        <input id="rcfZipToAppName" placeholder="Nome do App (opcional)" style="min-width:220px;flex:1" />
        <input id="rcfZipToAppSlug" placeholder="Slug (opcional)" style="min-width:180px;flex:1" />
        <button class="btn ok" id="rcfZipToAppBtn" type="button">Criar App do ZIP</button>
      </div>

      <div class="row" style="flex-wrap:wrap;align-items:center;margin-top:10px">
        <button class="btn ghost" id="rcfZipToAppStats" type="button">Ver stats do Vault</button>
        <button class="btn danger" id="rcfZipToAppReload" type="button">Recarregar</button>
      </div>

      <pre class="mono small" id="rcfZipToAppOut" style="margin-top:10px">Pronto.</pre>
    `;

    slot.appendChild(card);

    const out = document.getElementById("rcfZipToAppOut");
    const setOut = (t) => { try { if (out) out.textContent = String(t ?? ""); } catch {} };

    const btn = document.getElementById("rcfZipToAppBtn");
    const btnStats = document.getElementById("rcfZipToAppStats");
    const btnReload = document.getElementById("rcfZipToAppReload");

    const inpName = document.getElementById("rcfZipToAppName");
    const inpSlug = document.getElementById("rcfZipToAppSlug");

    // lock por botão (anti duplo click)
    function tapLock(el, ms) {
      try {
        const now = Date.now();
        const last = Number(el.__tapLast || 0);
        if (last && (now - last) < (ms || 800)) return false;
        el.__tapLast = now;
        return true;
      } catch {
        return true;
      }
    }

    if (btn && !btn.__bound) {
      btn.__bound = true;
      btn.addEventListener("click", async () => {
        if (!tapLock(btn, 900)) return;
        try {
          setOut("Criando app do ZIP…");
          const name = String(inpName?.value || "").trim();
          const slug = String(inpSlug?.value || "").trim();
          const r = await zipToApp({ name: name || undefined, slug: slug || undefined, stripRootFolder: true, reload: true });
          setOut(`✅ OK: ${r.app.slug}\nfiles=${r.meta.total} (text=${r.meta.countText} bin=${r.meta.countBin})\nbytes=${r.meta.bytes}`);
        } catch (e) {
          setOut("❌ Falhou: " + (e?.message || e));
        }
      }, { passive: true });
    }

    if (btnStats && !btnStats.__bound) {
      btnStats.__bound = true;
      btnStats.addEventListener("click", () => {
        if (!tapLock(btnStats, 500)) return;
        try {
          const idx = window.RCF_ZIP_VAULT?.list?.() || [];
          const totalBytes = idx.reduce((a, it) => a + (Number(it.size) || 0), 0);
          setOut(
            `VAULT stats:\nfiles=${idx.length}\nMB=${(totalBytes/(1024*1024)).toFixed(1)}\n` +
            `ex:\n${idx.slice(0, 8).map(x => x.path).join("\n")}${idx.length>8 ? "\n...(mais)" : ""}`
          );
        } catch (e) {
          setOut("❌ stats erro: " + (e?.message || e));
        }
      }, { passive: true });
    }

    if (btnReload && !btnReload.__bound) {
      btnReload.__bound = true;
      btnReload.addEventListener("click", () => {
        if (!tapLock(btnReload, 600)) return;
        try { location.reload(); } catch {}
      }, { passive: true });
    }

    setOut("Pronto. ✅ Importe ZIP no VAULT e depois clique 'Criar App do ZIP'.");
    return true;
  }

  // mount guard (não spammar 3x)
  function mountLoop() {
    if (window.__RCF_AGENT_ZIP_BRIDGE_MOUNTED__) return;
    const ok = mountUI();
    if (ok) {
      window.__RCF_AGENT_ZIP_BRIDGE_MOUNTED__ = true;
      return;
    }

    // tenta algumas vezes (slot pode aparecer depois), mas sem ficar infinito
    if (window.__RCF_AGENT_ZIP_BRIDGE_TRIES__ == null) window.__RCF_AGENT_ZIP_BRIDGE_TRIES__ = 0;
    window.__RCF_AGENT_ZIP_BRIDGE_TRIES__++;

    const tries = window.__RCF_AGENT_ZIP_BRIDGE_TRIES__;
    if (tries > 5) return;

    setTimeout(() => { try { mountUI(); } catch {} }, 700);
    setTimeout(() => { try { mountUI(); } catch {} }, 1700);
  }

  // expõe
  window.RCF_AGENT_ZIP_BRIDGE = {
    __v10b: true,
    mountUI: () => mountUI(),
    zipToApp: (opts) => zipToApp(opts)
  };

  // auto-mount: usa UI_READY BUS
  try {
    window.addEventListener("RCF:UI_READY", () => {
      try { mountLoop(); } catch {}
    }, { passive: true });
  } catch {}

  // fallback
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { try { mountLoop(); } catch {} }, { once: true });
  } else {
    mountLoop();
  }

  log("OK", "agent_zip_bridge.js ready ✅ (v1.0b)");
})();
