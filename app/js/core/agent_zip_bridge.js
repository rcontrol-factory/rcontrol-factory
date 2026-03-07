/* FILE: /app/js/core/agent_zip_bridge.js
   RControl Factory — /app/js/core/agent_zip_bridge.js — v1.1a SAFE (IDB APP STORE + NO-QUOTA localStorage)
   FIX CRÍTICO (iPhone quota/localStorage):
   - ✅ NÃO salva payload grande em localStorage (rcf:apps vira só metadata + ponteiros)
   - ✅ Salva payload (files) em IndexedDB (DB: RCF_APPS_DB, store: apps) por appId/slug
   - ✅ Quota guard: try/catch + rollback (não cria app "meio salvo")
   - ✅ UI clara: "Storage cheio — apague apps/templates ou limpe dados do site"
   - ✅ Delete app: remove pointer do rcf:apps + apaga payload do IDB
   - ✅ Evita reload automático: dispara evento RCF:APPS_UPDATED
   - Mantém: Vault -> files (text/base64) iOS safe
*/

(function () {
  "use strict";

  if (window.RCF_AGENT_ZIP_BRIDGE && window.RCF_AGENT_ZIP_BRIDGE.__v11a) return;

  const PREFIX = "rcf:";
  const KEY_APPS = PREFIX + "apps"; // agora: metadata-only (sem files grandes)

  // ================
  // Utils
  // ================
  const safeJsonParse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
  const safeJsonStringify = (o) => { try { return JSON.stringify(o); } catch { return String(o); } };

  function log(level, msg, obj) {
    try {
      if (obj !== undefined) window.RCF_LOGGER?.push?.(level, String(msg) + " " + JSON.stringify(obj));
      else window.RCF_LOGGER?.push?.(level, String(msg));
    } catch {}
    try {
      if (obj !== undefined) console.log("[RCF_AGENT_ZIP_BRIDGE]", level, msg, obj);
      else console.log("[RCF_AGENT_ZIP_BRIDGE]", level, msg);
    } catch {}
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

  function uiMsgQuotaHint() {
    return [
      "❌ Storage cheio (quota excedida no iPhone).",
      "",
      "✅ O que fazer:",
      "• Apague apps antigos (botão Delete aqui).",
      "• Apague templates antigos (ZIP->APP packs).",
      "• Ou limpe os dados do site (Safari > Ajustes > Avançado > Dados dos Sites).",
      "",
      "Obs: o sistema agora salva payload grande em IndexedDB e localStorage só metadata,",
      "mas se já estiver lotado, você precisa liberar espaço 1x.",
    ].join("\n");
  }

  // ============================
  // IndexedDB App Store (payload)
  // ============================
  const IDB_DB = "RCF_APPS_DB";
  const IDB_VER = 1;
  const IDB_STORE = "apps";

  let __db = null;
  let __opening = null;

  function idbOpen() {
    if (__db) return Promise.resolve(__db);
    if (__opening) return __opening;

    __opening = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(IDB_DB, IDB_VER);

        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };

        req.onsuccess = () => { __db = req.result; resolve(__db); };
        req.onerror = () => reject(req.error || new Error("IDB open failed"));
      } catch (e) {
        reject(e);
      }
    });

    return __opening;
  }

  async function idbPut(key, val) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const st = tx.objectStore(IDB_STORE);
        const rq = st.put(val, key);
        rq.onsuccess = () => resolve(true);
        rq.onerror = () => reject(rq.error);
      } catch (e) { reject(e); }
    });
  }

  async function idbGet(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(IDB_STORE, "readonly");
        const st = tx.objectStore(IDB_STORE);
        const rq = st.get(key);
        rq.onsuccess = () => resolve(rq.result);
        rq.onerror = () => reject(rq.error);
      } catch (e) { reject(e); }
    });
  }

  async function idbDel(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const st = tx.objectStore(IDB_STORE);
        const rq = st.delete(key);
        rq.onsuccess = () => resolve(true);
        rq.onerror = () => reject(rq.error);
      } catch (e) { reject(e); }
    });
  }

  // ===================================
  // localStorage: metadata-only pointer
  // ===================================
  function getAppsMeta() {
    const raw = localStorage.getItem(KEY_APPS) || "[]";
    const list = safeJsonParse(raw, []);
    return Array.isArray(list) ? list : [];
  }

  function setAppsMeta(list) {
    // critical: do NOT store big blobs here.
    const compact = Array.isArray(list) ? list : [];
    try {
      localStorage.setItem(KEY_APPS, safeJsonStringify(compact));
      return true;
    } catch (e) {
      log("ERR", "Falha ao salvar rcf:apps (quota/localStorage). The quota has been exceeded.", { err: String(e?.message || e) });
      return false;
    }
  }

  function estimateFilesMeta(filesMap) {
    try {
      const keys = Object.keys(filesMap || {});
      let bytes = 0;
      for (const k of keys) {
        const v = filesMap[k];
        bytes += String(k || "").length;
        bytes += (typeof v === "string") ? v.length : 0;
      }
      return { filesCount: keys.length, approxChars: bytes };
    } catch {
      return { filesCount: 0, approxChars: 0 };
    }
  }

  // =====================
  // Vault -> Files builder
  // =====================
  async function buildFilesFromVaultIndex(opts) {
    const V = window.RCF_ZIP_VAULT;
    if (!V || typeof V.list !== "function" || typeof V.get !== "function") {
      throw new Error("RCF_ZIP_VAULT não disponível (zip_vault.js não carregou).");
    }

    const idx = V.list() || [];
    if (!idx.length) throw new Error("Vault vazio. Importe um ZIP primeiro.");

    const files = {};
    let countText = 0, countBin = 0, bytes = 0;

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

      const rec = await V.get(path0);
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

  // =====================
  // Public actions
  // =====================
  async function saveAppPayloadToIDB(slug, payload) {
    const key = "app:" + String(slug);
    await idbPut(key, payload);
    return key;
  }

  async function deleteAppPayloadFromIDB(slug) {
    const key = "app:" + String(slug);
    await idbDel(key);
    return true;
  }

  async function deleteApp(slug) {
    const s = String(slug || "").trim();
    if (!s) throw new Error("Slug vazio");
    const list = getAppsMeta();
    const next = list.filter(a => String(a.slug) !== s);
    // remove payload first (so we don't keep orphan big data)
    try { await deleteAppPayloadFromIDB(s); } catch {}
    // then update pointer list
    const ok = setAppsMeta(next);
    if (!ok) {
      // even if pointer update fails, payload already removed.
      throw new Error("Falha ao atualizar rcf:apps (quota). Limpe dados do site.");
    }
    try { window.dispatchEvent(new CustomEvent("RCF:APPS_UPDATED", { detail: { slug: s, action: "delete" } })); } catch {}
    return true;
  }

  async function zipToApp(options) {
    const opts = (options && typeof options === "object") ? options : {};
    const defaultName = pickZipNameFromVault();

    const name = String(opts.name || defaultName || "ZIP App").trim() || "ZIP App";
    const slug = String(opts.slug || slugify(name)).trim() || slugify(name) || ("zip-" + Date.now());
    const template = String(opts.template || "zip-import").trim() || "zip-import";

    const list = getAppsMeta();
    if (list.some(a => String(a.slug) === slug)) {
      throw new Error("Slug já existe: " + slug);
    }

    log("INFO", "zipToApp: montando files do Vault…");
    const built = await buildFilesFromVaultIndex({ stripRootFolder: opts.stripRootFolder !== false });

    if (!built.files["index.html"]) {
      built.files["index.html"] =
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title></head><body><h1>${name}</h1><p>ZIP importado ✅</p></body></html>`;
    }

    const meta2 = estimateFilesMeta(built.files);

    const appPayload = {
      kind: "rcf-app-payload-v1",
      slug,
      name,
      template,
      createdAt: nowISO(),
      zipMeta: built.meta,
      files: built.files
    };

    // 1) salvar payload grande no IDB
    let idbKey = "";
    try {
      idbKey = await saveAppPayloadToIDB(slug, appPayload);
    } catch (e) {
      log("ERR", "ZIP→APP falhou ao salvar payload no IndexedDB", { err: String(e?.message || e) });
      throw new Error("Falha ao salvar payload no IndexedDB (storage cheio ou bloqueado).");
    }

    // 2) salvar pointer pequeno no localStorage
    const pointer = {
      name,
      slug,
      template,
      createdAt: appPayload.createdAt,
      storage: "idb",
      idbKey,
      filesCount: Number(built.meta.total || 0),
      bytes: Number(built.meta.bytes || 0),
      approxChars: Number(meta2.approxChars || 0)
    };

    const next = [pointer].concat(list).slice(0, 50); // limit apps list meta
    const ok = setAppsMeta(next);

    if (!ok) {
      // rollback payload to avoid half-saved app
      try { await idbDel(idbKey); } catch {}
      throw new Error("Storage cheio (quota). " + "Não criei app incompleto. " + "Apague apps/templates antigos ou limpe dados do site.");
    }

    log("OK", `ZIP→APP ok ✅ slug=${slug} files=${built.meta.total} bytes=${built.meta.bytes}`);
    try { window.RCF_LOGGER?.push?.("OK", `ZIP→APP ✅ ${slug} files=${built.meta.total}`); } catch {}

    // no reload: notify UI
    try { window.dispatchEvent(new CustomEvent("RCF:APPS_UPDATED", { detail: { slug, action: "create" } })); } catch {}

    return { ok: true, app: pointer, payloadKey: idbKey, meta: built.meta };
  }

  // ==================================
  // UI mount no Agent (slot agent.actions)
  // ==================================
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

  let __mountDone = false;

  function mountUI() {
    if (__mountDone) return true;
    const slot = getSlotEl();
    if (!slot) return false;

    if (document.getElementById("rcfZipToAppCard")) {
      __mountDone = true;
      return true;
    }

    const card = document.createElement("div");
    card.className = "card";
    card.id = "rcfZipToAppCard";
    card.style.marginTop = "12px";
    card.innerHTML = `
      <h2 style="margin-top:0">ZIP → APP (IDB Safe)</h2>
      <div class="hint">Converte o ZIP importado no VAULT em um app salvo na Factory. (iPhone safe: payload no IndexedDB)</div>

      <div class="row" style="flex-wrap:wrap;align-items:center;margin-top:10px">
        <input id="rcfZipToAppName" placeholder="Nome do App (opcional)" style="min-width:220px;flex:1" />
        <input id="rcfZipToAppSlug" placeholder="Slug (opcional)" style="min-width:180px;flex:1" />
        <button class="btn ok" id="rcfZipToAppBtn" type="button">Criar App do ZIP</button>
      </div>

      <div class="row" style="flex-wrap:wrap;align-items:center;margin-top:10px">
        <button class="btn ghost" id="rcfZipToAppStats" type="button">Ver stats do Vault</button>
        <button class="btn ghost" id="rcfZipToAppListApps" type="button">Listar apps</button>
        <button class="btn danger" id="rcfZipToAppPurge" type="button">Apagar 5 apps antigos</button>
      </div>

      <pre class="mono small" id="rcfZipToAppOut" style="margin-top:10px">Pronto.</pre>

      <div id="rcfZipToAppAppsBox" style="margin-top:10px"></div>
    `;

    slot.appendChild(card);

    const out = document.getElementById("rcfZipToAppOut");
    const appsBox = document.getElementById("rcfZipToAppAppsBox");
    const setOut = (t) => { try { if (out) out.textContent = String(t ?? ""); } catch {} };

    function renderApps() {
      try {
        const list = getAppsMeta();
        if (!appsBox) return;
        if (!list.length) {
          appsBox.innerHTML = `<div class="hint">Sem apps salvos (rcf:apps).</div>`;
          return;
        }

        const show = list.slice(0, 12);
        appsBox.innerHTML = show.map(a => {
          const slug = String(a.slug || "");
          const nm = String(a.name || slug || "-");
          const bytes = Number(a.bytes || 0);
          const mb = (bytes / (1024 * 1024)).toFixed(2);
          return `
            <div class="row" style="align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08)">
              <div style="min-width:0">
                <div class="badge" style="max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nm}</div>
                <div class="hint" style="margin-top:4px">slug=${slug} • ${mb}MB • files=${Number(a.filesCount||0)}</div>
              </div>
              <button class="btn danger small" data-del="${slug}" type="button">Delete</button>
            </div>
          `;
        }).join("");

        const btns = Array.from(appsBox.querySelectorAll("button[data-del]"));
        for (const b of btns) {
          if (b.__bound) continue;
          b.__bound = true;
          b.addEventListener("click", async () => {
            const slug = b.getAttribute("data-del") || "";
            if (!slug) return;
            const ok = confirm("Apagar app '" + slug + "'? (remove payload do IndexedDB)");
            if (!ok) return;
            try {
              setOut("Apagando app… " + slug);
              await deleteApp(slug);
              setOut("✅ App apagado: " + slug);
              renderApps();
            } catch (e) {
              setOut("❌ Delete falhou: " + (e?.message || e) + "\n\n" + uiMsgQuotaHint());
            }
          }, { passive: true });
        }
      } catch {}
    }

    const btn = document.getElementById("rcfZipToAppBtn");
    const btnStats = document.getElementById("rcfZipToAppStats");
    const btnList = document.getElementById("rcfZipToAppListApps");
    const btnPurge = document.getElementById("rcfZipToAppPurge");

    const inpName = document.getElementById("rcfZipToAppName");
    const inpSlug = document.getElementById("rcfZipToAppSlug");

    if (btn && !btn.__bound) {
      btn.__bound = true;
      btn.addEventListener("click", async () => {
        try {
          setOut("Criando app do ZIP… (payload → IndexedDB)");
          const name = String(inpName?.value || "").trim();
          const slug = String(inpSlug?.value || "").trim();
          const r = await zipToApp({ name: name || undefined, slug: slug || undefined, stripRootFolder: true });
          setOut(
            `✅ OK: ${r.app.slug}\nfiles=${r.meta.total} (text=${r.meta.countText} bin=${r.meta.countBin})\nbytes=${r.meta.bytes}\n\nObs: sem reload automático. Vá no Dashboard/Apps e atualize a lista se necessário.`
          );
          renderApps();
        } catch (e) {
          const msg = String(e?.message || e);
          setOut("❌ Falhou: " + msg + "\n\n" + uiMsgQuotaHint());
        }
      }, { passive: true });
    }

    if (btnStats && !btnStats.__bound) {
      btnStats.__bound = true;
      btnStats.addEventListener("click", () => {
        try {
          const idx = window.RCF_ZIP_VAULT?.list?.() || [];
          const totalBytes = idx.reduce((a, it) => a + (Number(it.size) || 0), 0);
          setOut(`VAULT stats:\nfiles=${idx.length}\nMB=${(totalBytes/(1024*1024)).toFixed(1)}\nex: ${idx.slice(0, 8).map(x => x.path).join("\n")}${idx.length>8 ? "\n...(mais)" : ""}`);
        } catch (e) {
          setOut("❌ stats erro: " + (e?.message || e));
        }
      }, { passive: true });
    }

    if (btnList && !btnList.__bound) {
      btnList.__bound = true;
      btnList.addEventListener("click", () => {
        setOut("Apps (metadata) carregados. (payload fica no IndexedDB)");
        renderApps();
      }, { passive: true });
    }

    if (btnPurge && !btnPurge.__bound) {
      btnPurge.__bound = true;
      btnPurge.addEventListener("click", async () => {
        try {
          const ok = confirm("Apagar 5 apps mais antigos? (libera espaço no iPhone)");
          if (!ok) return;
          const list = getAppsMeta();
          const toDel = list.slice(-5).map(x => String(x.slug || "")).filter(Boolean);
          setOut("Purge iniciando… " + toDel.join(", "));
          for (const slug of toDel) {
            try { await deleteApp(slug); } catch {}
          }
          setOut("✅ Purge concluído. Se ainda estiver cheio, apague mais ou limpe dados do site.");
          renderApps();
        } catch (e) {
          setOut("❌ Purge falhou: " + (e?.message || e) + "\n\n" + uiMsgQuotaHint());
        }
      }, { passive: true });
    }

    // auto-refresh when apps change
    try {
      window.addEventListener("RCF:APPS_UPDATED", () => { try { renderApps(); } catch {} }, { passive: true });
    } catch {}

    setOut("Pronto. ✅ Importe ZIP no VAULT e depois clique 'Criar App do ZIP'. (IDB safe)");
    renderApps();
    __mountDone = true;
    return true;
  }

  let __mountLoopScheduled = false;

  function mountLoop() {
    if (__mountDone) return true;

    const ok = mountUI();
    if (ok) return true;

    if (__mountLoopScheduled) return false;
    __mountLoopScheduled = true;

    setTimeout(() => {
      __mountLoopScheduled = false;
      try { mountLoop(); } catch {}
    }, 700);

    setTimeout(() => {
      if (__mountDone) return;
      try { mountUI(); } catch {}
    }, 1700);

    return false;
  }

  // expõe API pública (p/ app.js/dashboard integrar depois)
  window.RCF_AGENT_ZIP_BRIDGE = {
    __v11a: true,
    mountUI: () => mountUI(),
    zipToApp: (opts) => zipToApp(opts),
    listAppsMeta: () => getAppsMeta(),
    deleteApp: (slug) => deleteApp(slug),
    getAppPayload: async (slug) => {
      const key = "app:" + String(slug || "");
      return await idbGet(key);
    }
  };

  // auto-mount com UI_READY BUS
  try {
    window.addEventListener("RCF:UI_READY", () => { try { mountLoop(); } catch {} }, { passive: true });
  } catch {}

  // fallback
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { try { mountLoop(); } catch {} }, { once: true });
  } else {
    mountLoop();
  }

  log("OK", "agent_zip_bridge.js ready ✅ (v1.1a)");
})();
