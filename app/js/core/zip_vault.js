/* FILE: /app/js/core/zip_vault.js
   RControl Factory — /app/js/core/zip_vault.js — v1.1b SAFE (MOUNT/RESTORE GUARD + TEMPLATES PACKS -> IDB + LIMIT + DELETE)
   FIX CRÍTICO (iPhone quota/localStorage):
   - ✅ NÃO salva packs grandes (ZIP->APP template pack) no localStorage
     -> agora: payload do pack vai para IndexedDB (DB: RCF_VAULT_DB, store: kv)
     -> localStorage guarda só índice pequeno (rcf:vault:app:index) + meta
   - ✅ Limite de templates (default maxTemplates=6) + prune automático (remove payload IDB + pointer)
   - ✅ Delete template: remove pointer + apaga payload do IDB
   - ✅ Mensagem clara se storage estiver cheio
   - Mantém: VAULT files no IDB store "files", Viewer, JSZip fallback CDN
   - Mantém: UI mount force (VAULT nunca "some")
   - ✅ Guard interno real: mount 1x efetivo + restore 1x efetivo (gatilhos repetidos são ignorados)
*/

(function () {
  "use strict";

  if (window.RCF_ZIP_VAULT && (window.RCF_ZIP_VAULT.__v11b || window.RCF_ZIP_VAULT.__v11a)) return;

  const PREFIX = "rcf:";
  const LS_INDEX_KEY = PREFIX + "vault:index";
  const LS_LAST_KEY  = PREFIX + "vault:last";
  const LS_CFG_KEY   = PREFIX + "vault:cfg";

  const LS_APP_INDEX = PREFIX + "vault:app:index"; // meta-only
  const IDB_PACK_KEY = (id) => "zipapp-pack:" + String(id); // in IDB kv store

  const IDB_DB = "RCF_VAULT_DB";
  const IDB_VER = 2; // bump to create kv store
  const IDB_STORE_FILES = "files";
  const IDB_STORE_KV = "kv";

  const safeJsonParse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
  const safeJsonStringify = (o) => { try { return JSON.stringify(o); } catch { return String(o); } };

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
    try { console.log("[RCF_VAULT]", level, msg); } catch {}
  }

  function nowISO() { return new Date().toISOString(); }

  function uiMsgQuotaHint() {
    return [
      "❌ Storage cheio (quota iPhone).",
      "✅ Apague templates antigos (ZIP->APP) e/ou apps antigos, ou limpe dados do site.",
      "Safari: Ajustes > Avançado > Dados dos Sites > rcontrol... > Remover.",
    ].join("\n");
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
      s.endsWith(".html") || s.endsWith(".htm") || s.endsWith(".md") || s.endsWith(".txt") ||
      s.endsWith(".ts") || s.endsWith(".tsx") || s.endsWith(".jsx") || s.endsWith(".env") || s.endsWith(".gitignore")
    );
  }

  function normPath(p) {
    let x = String(p || "").trim();
    x = x.replace(/\\/g, "/");
    x = x.replace(/^\.\/+/, "");
    x = x.replace(/^\/+/, "");
    x = x.replace(/\/{2,}/g, "/");
    return x;
  }

  // =========================================================
  // IDB (files + kv)
  // =========================================================
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
          if (!db.objectStoreNames.contains(IDB_STORE_FILES)) db.createObjectStore(IDB_STORE_FILES);
          if (!db.objectStoreNames.contains(IDB_STORE_KV)) db.createObjectStore(IDB_STORE_KV);
        };

        req.onsuccess = () => { __db = req.result; resolve(__db); };
        req.onerror = () => reject(req.error || new Error("IDB open failed"));
      } catch (e) {
        reject(e);
      }
    });

    return __opening;
  }

  async function idbPut(store, key, val) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(store, "readwrite");
        const st = tx.objectStore(store);
        const rq = st.put(val, key);
        rq.onsuccess = () => resolve(true);
        rq.onerror = () => reject(rq.error);
      } catch (e) { reject(e); }
    });
  }

  async function idbGet(store, key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(store, "readonly");
        const st = tx.objectStore(store);
        const rq = st.get(key);
        rq.onsuccess = () => resolve(rq.result);
        rq.onerror = () => reject(rq.error);
      } catch (e) { reject(e); }
    });
  }

  async function idbDel(store, key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(store, "readwrite");
        const st = tx.objectStore(store);
        const rq = st.delete(key);
        rq.onsuccess = () => resolve(true);
        rq.onerror = () => reject(rq.error);
      } catch (e) { reject(e); }
    });
  }

  async function idbClearAll(store) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(store, "readwrite");
        const st = tx.objectStore(store);
        const rq = st.clear();
        rq.onsuccess = () => resolve(true);
        rq.onerror = () => reject(rq.error);
      } catch (e) { reject(e); }
    });
  }

  // =========================================================
  // localStorage index/cfg (small)
  // =========================================================
  function readIndex() {
    return safeJsonParse(localStorage.getItem(LS_INDEX_KEY) || "[]", []);
  }
  function writeIndex(list) {
    try { localStorage.setItem(LS_INDEX_KEY, safeJsonStringify(list || [])); } catch {}
  }

  function readAppIndex() {
    const x = safeJsonParse(localStorage.getItem(LS_APP_INDEX) || "[]", []);
    return Array.isArray(x) ? x : [];
  }
  function writeAppIndex(list) {
    try { localStorage.setItem(LS_APP_INDEX, safeJsonStringify(list || [])); return true; }
    catch (e) { log("ERR", "Falha ao salvar app index (quota)", String(e?.message || e)); return false; }
  }

  function getCfg() {
    const cur = safeJsonParse(localStorage.getItem(LS_CFG_KEY) || "{}", {});
    const def = {
      keepTextCacheMax: 180000,
      autoMountUI: true,
      autoZipToApp: true,
      autoZipMaxBytesLS: 900000, // legacy (não usado p/ pack, agora vai pro IDB)
      autoSelectGenerator: true,
      maxTemplates: 6,
      localJSZipPath: "/app/vendor/jszip.min.js"
    };
    return Object.assign(def, cur || {});
  }
  function setCfg(patch) {
    const cfg = Object.assign(getCfg(), patch || {});
    try { localStorage.setItem(LS_CFG_KEY, safeJsonStringify(cfg)); } catch {}
    return cfg;
  }

  // =========================================================
  // JSZip loader (robusto)
  // =========================================================
  function looksLikeHTML(txt) {
    const s = String(txt || "").trim().slice(0, 300).toLowerCase();
    return s.startsWith("<!doctype") || s.startsWith("<html") || s.includes("<head") || s.includes("<body") || s.includes("rcontrol factory");
  }

  function injectInlineScript(code, tag) {
    try {
      const s = document.createElement("script");
      s.setAttribute("data-rcf", tag || "inline");
      s.textContent = String(code || "");
      document.head.appendChild(s);
      return true;
    } catch (e) {
      log("ERR", "inject falhou: " + (e?.message || e));
      return false;
    }
  }

  function loadScriptSrc(src, timeoutMs) {
    return new Promise((resolve) => {
      try {
        const s = document.createElement("script");
        s.async = true;
        s.src = src;
        s.crossOrigin = "anonymous";

        let done = false;
        const finish = (ok) => {
          if (done) return;
          done = true;
          try { s.remove(); } catch {}
          resolve(!!ok);
        };

        const t = setTimeout(() => finish(false), timeoutMs || 8000);
        s.onload = () => { clearTimeout(t); finish(true); };
        s.onerror = () => { clearTimeout(t); finish(false); };

        document.head.appendChild(s);
      } catch { resolve(false); }
    });
  }

  async function ensureJSZip() {
    if (window.JSZip) return true;

    const cfg = getCfg();
    const local = String(cfg.localJSZipPath || "/app/vendor/jszip.min.js");

    const candidates = [
      local,
      "/app/vendor/jszip.min.js",
      "/vendor/jszip.min.js",
      "/js/vendor/jszip.min.js",
      "/app/js/vendor/jszip.min.js",
      "./app/vendor/jszip.min.js",
      "./vendor/jszip.min.js",
    ];

    for (const src of candidates) {
      try {
        const res = await fetch(src, { cache: "no-store" });
        if (!res.ok) continue;

        const ct = String(res.headers.get("content-type") || "").toLowerCase();
        const code = await res.text();
        if (!code || code.length < 2000) continue;

        if (ct.includes("text/html") || looksLikeHTML(code)) {
          log("WARN", "JSZip fetch retornou HTML (não vou injetar): " + src);
          continue;
        }

        const ok = injectInlineScript(code, "jszip:" + src);
        if (ok && window.JSZip) {
          log("OK", "JSZip carregado via " + src);
          return true;
        }
      } catch {}
    }

    const cdnList = [
      "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
      "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js"
    ];

    for (const url of cdnList) {
      try {
        log("INFO", "Tentando JSZip via CDN… " + url);
        const ok = await loadScriptSrc(url, 9000);
        if (ok && window.JSZip) {
          log("OK", "JSZip carregado via CDN ✅");
          return true;
        }
      } catch {}
    }

    log("ERR", "JSZip ausente. Garanta internet 1x (CDN) ou arquivo local real em /app/vendor/jszip.min.js.");
    return false;
  }

  // =========================================================
  // ZIP->APP Pack (Templates) -> IDB kv
  // =========================================================
  function stripCommonRoot(paths) {
    const arr = (paths || []).map(p => normPath(p)).filter(Boolean);
    if (!arr.length) return { root:"", out:arr };
    const parts0 = arr[0].split("/");
    let k = 0;
    for (; k < parts0.length; k++) {
      const seg = parts0[k];
      if (!seg) break;
      if (!arr.every(p => (p.split("/")[k] === seg))) break;
    }
    const root = (k > 0) ? parts0.slice(0, k).join("/") : "";
    if (!root) return { root:"", out:arr };
    const out = arr.map(p => p.startsWith(root + "/") ? p.slice(root.length + 1) : p);
    return { root, out };
  }

  function abToText(ab) {
    try { return new TextDecoder("utf-8", { fatal:false }).decode(new Uint8Array(ab || new ArrayBuffer(0))); }
    catch { return ""; }
  }
  function abToBase64(ab) {
    try {
      const u8 = new Uint8Array(ab || new ArrayBuffer(0));
      let s = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < u8.length; i += CHUNK) {
        s += String.fromCharCode.apply(null, Array.from(u8.slice(i, i + CHUNK)));
      }
      return btoa(s);
    } catch { return ""; }
  }

  function tryParseManifestTitle(filesMap) {
    const key = Object.keys(filesMap || {}).find(k => String(k).toLowerCase() === "manifest.json");
    if (!key) return "";
    try {
      const mf = filesMap[key];
      const txt = (mf && mf.enc === "utf8") ? mf.data : "";
      const o = safeJsonParse(txt, null);
      return o ? String(o.name || o.short_name || "").trim() : "";
    } catch { return ""; }
  }

  function registerZipAsTemplate(pack) {
    try {
      const REG = window.RCF_TEMPLATE_REGISTRY;
      if (!REG || typeof REG.add !== "function") return false;

      const tplId = String(pack.templateId || "");
      if (!tplId) return false;
      if (REG.get && REG.get(tplId)) return true;

      REG.add(tplId, {
        title: pack.title || ("ZIP App: " + (pack.name || tplId)),
        files() {
          const out = {};
          const files = pack.files || {};
          for (const p of Object.keys(files)) {
            const f = files[p];
            if (!f) continue;
            out[p] = String(f.data || "");
          }
          return out;
        }
      });

      log("OK", "ZIP->APP: template registrado ✅ id=" + tplId);
      try { window.dispatchEvent(new CustomEvent("RCF:TEMPLATES_UPDATED", { detail: { id: tplId } })); } catch {}
      return true;
    } catch (e) {
      log("WARN", "ZIP->APP: register template falhou: " + (e?.message || e));
      return false;
    }
  }

  function tryAutoSelectGenerator(templateId) {
    try {
      const sels = Array.from(document.querySelectorAll("select"));
      const target = sels.find(s => {
        const id = (s.id || "").toLowerCase();
        const nm = (s.getAttribute("name") || "").toLowerCase();
        return id.includes("tpl") || id.includes("template") || nm.includes("tpl") || nm.includes("template");
      }) || null;
      if (!target) return false;

      const opt = Array.from(target.options || []).find(o => String(o.value) === String(templateId));
      if (!opt) return false;

      target.value = templateId;
      try { target.dispatchEvent(new Event("change", { bubbles:true })); } catch {}
      try { target.dispatchEvent(new Event("input", { bubbles:true })); } catch {}
      log("OK", "ZIP->APP: generator auto-select ✅ " + templateId);
      return true;
    } catch { return false; }
  }

  async function savePackToIDB(templateId, pack) {
    const key = IDB_PACK_KEY(templateId);
    await idbPut(IDB_STORE_KV, key, pack);
    return key;
  }

  async function loadPackFromIDB(templateId) {
    const key = IDB_PACK_KEY(templateId);
    return await idbGet(IDB_STORE_KV, key);
  }

  async function deletePackFromIDB(templateId) {
    const key = IDB_PACK_KEY(templateId);
    await idbDel(IDB_STORE_KV, key);
    return true;
  }

  async function pruneTemplates(maxKeep) {
    const n = Math.max(0, Number(maxKeep || 0) || 0);
    const idx = readAppIndex();
    if (!idx.length) return 0;
    if (idx.length <= n) return 0;

    const keep = idx.slice(0, n);
    const drop = idx.slice(n);

    let removed = 0;
    for (const it of drop) {
      const id = it && it.id ? String(it.id) : "";
      if (!id) continue;
      try { await deletePackFromIDB(id); } catch {}
      removed++;
    }

    const ok = writeAppIndex(keep);
    if (!ok) log("WARN", "prune: falha ao salvar app index (quota) — tente limpar dados do site");
    return removed;
  }

  async function deleteTemplate(templateId) {
    const id = String(templateId || "").trim();
    if (!id) throw new Error("templateId vazio");

    const idx = readAppIndex();
    const next = idx.filter(x => String(x.id || "") !== id);

    try { await deletePackFromIDB(id); } catch {}

    const ok = writeAppIndex(next);
    if (!ok) throw new Error("Falha ao salvar index (quota). " + uiMsgQuotaHint());

    try { window.dispatchEvent(new CustomEvent("RCF:TEMPLATES_UPDATED", { detail: { id, action: "delete" } })); } catch {}
    log("OK", "ZIP->APP template deleted ✅ " + id);
    return true;
  }

  const AutoZipToApp = {
    async fromJob(meta) {
      const cfg = getCfg();
      const all = Vault.index();
      const jobList = all.filter(it => it && it.jobId === meta.jobId).map(it => it.path);
      const stripped = stripCommonRoot(jobList);
      const root = stripped.root;
      const paths = stripped.out;

      const filesPack = {};
      for (let i = 0; i < paths.length; i++) {
        const p2 = paths[i];
        const realPath = root ? (root + "/" + p2) : p2;
        const rec = await Vault.getFile(realPath);
        if (!rec || !rec.ab) continue;

        const mime = rec.mime || mimeByPath(p2);
        const isText = isTextByMimeOrPath(mime, p2);

        if (isText) filesPack[p2] = { enc:"utf8", mime, data: abToText(rec.ab) };
        else filesPack[p2] = { enc:"base64", mime, data: abToBase64(rec.ab) };

        if ((i % 20) === 0) await new Promise(r => setTimeout(r, 0));
      }

      const mfTitle = tryParseManifestTitle(filesPack);
      const title = mfTitle || (meta.name ? String(meta.name).replace(/\.zip$/i, "") : "ZIP App");
      const templateId = "zipapp-" + String(meta.jobId).replace(/[^a-zA-Z0-9_-]/g, "");

      const pack = {
        kind: "rcf-zipapp-pack-v1",
        templateId,
        jobId: meta.jobId,
        name: meta.name || "",
        title,
        createdAt: nowISO(),
        bytes: meta.bytes || 0,
        count: meta.count || 0,
        root,
        files: filesPack
      };

      // 1) payload -> IDB (kv)
      try {
        await savePackToIDB(templateId, pack);
      } catch (e) {
        log("ERR", "ZIP->APP pack falhou ao salvar no IDB (storage cheio?) :: " + (e?.message || e));
        return { ok:false, err:"idb_fail", hint: uiMsgQuotaHint() };
      }

      // 2) index meta -> localStorage (small)
      try {
        const idx = readAppIndex();
        const next = idx.filter(x => x && x.id !== templateId);
        next.unshift({ id: templateId, jobId: meta.jobId, name: pack.name, title: pack.title, createdAt: pack.createdAt, bytes: pack.bytes, count: pack.count });
        const ok = writeAppIndex(next.slice(0, 40));
        if (!ok) {
          // rollback payload
          try { await deletePackFromIDB(templateId); } catch {}
          return { ok:false, err:"quota_index", hint: uiMsgQuotaHint() };
        }

        // prune templates
        const removed = await pruneTemplates(cfg.maxTemplates || 6);
        if (removed) log("OK", "ZIP->APP prune ✅ removed=" + removed);

      } catch (e) {
        try { await deletePackFromIDB(templateId); } catch {}
        log("ERR", "ZIP->APP index fail :: " + (e?.message || e));
        return { ok:false, err:"index_fail", hint: uiMsgQuotaHint() };
      }

      const okReg = registerZipAsTemplate(pack);
      if (okReg) log("OK", "ZIP->APP pronto ✅ template=" + templateId + " title=" + title);
      else log("WARN", "ZIP->APP: registry não disponível ainda");

      if (cfg.autoSelectGenerator) {
        setTimeout(() => { try { tryAutoSelectGenerator(templateId); } catch {} }, 650);
        setTimeout(() => { try { tryAutoSelectGenerator(templateId); } catch {} }, 1600);
      }

      return { ok:true, templateId, title };
    },

    async restorePacks() {
      try {
        const idx = readAppIndex();
        if (!idx || !idx.length) return 0;

        let ok = 0;
        for (const it of idx) {
          const id = it && it.id ? String(it.id) : "";
          if (!id) continue;

          const pack = await loadPackFromIDB(id);
          if (pack && pack.templateId) {
            if (registerZipAsTemplate(pack)) ok++;
          }
        }

        if (ok) log("OK", "ZIP->APP restore ✅ templates=" + ok);
        return ok;
      } catch (e) {
        log("WARN", "ZIP->APP restore erro: " + (e?.message || e));
        return 0;
      }
    }
  };

  // =========================================================
  // Vault core (files store)
  // =========================================================
  const Vault = {
    _lock: false,
    _job: null,

    index() {
      const list = readIndex();
      list.sort((a, b) => String(a.path).localeCompare(String(b.path)));
      return list;
    },

    async getFile(path) {
      const p = normPath(path);
      return (await idbGet(IDB_STORE_FILES, "file:" + p)) || null;
    },

    async openAsObjectURL(path) {
      const rec = await this.getFile(path);
      if (!rec) return null;
      try {
        const mime = rec.mime || mimeByPath(path);
        const ab = rec.ab;
        if (!ab) return null;
        const blob = new Blob([ab], { type: mime });
        return URL.createObjectURL(blob);
      } catch { return null; }
    },

    async clearAll() {
      await idbClearAll(IDB_STORE_FILES);
      writeIndex([]);
      try { localStorage.removeItem(LS_LAST_KEY); } catch {}
      log("OK", "VAULT clearAll ✅");
      return true;
    },

    async importZipFile(file) {
      if (this._lock) return { ok:false, err:"locked" };
      this._lock = true;

      // Dedup iOS: ignora reimport do mesmo arquivo por ~2s
      try {
        const sig = String((file && file.name) || "") + "|" + String((file && file.size) || 0) + "|" + String((file && file.lastModified) || 0);
        const now = Date.now();
        if (this._lastImportSig === sig && this._lastImportAt && (now - this._lastImportAt) < 2000) {
          try { log("WARN", "VAULT import duplicado ignorado ⚠️"); } catch {}
          this._lock = false;
          return { ok:false, err:"dup" };
        }
        this._lastImportSig = sig;
        this._lastImportAt = now;
      } catch {}

      const jobId = "job_" + Date.now();
      const startedAt = nowISO();
      const importedKeys = [];
      this._job = { id: jobId, startedAt, name: file?.name || "(zip)", total: 0, done: 0, bytes: 0 };

      try {
        const okZip = await ensureJSZip();
        if (!okZip) throw new Error("JSZip não carregou (internet 1x ou arquivo local).");
        if (!file) throw new Error("Arquivo ZIP ausente.");

        const zipBuf = await file.arrayBuffer();
        const zip = await window.JSZip.loadAsync(zipBuf);

        const entries = [];
        zip.forEach((relativePath, entry) => { entries.push({ relativePath, entry }); });

        const files = entries.filter(x => x && x.entry && !x.entry.dir);
        this._job.total = files.length;

        const idx = readIndex();
        const idxMap = new Map(idx.map(it => [String(it.path), it]));
        const jobPaths = [];

        for (let i = 0; i < files.length; i++) {
          const rp = normPath(files[i].relativePath);
          const entry = files[i].entry;
          const mime = mimeByPath(rp);
          const ab = await entry.async("arraybuffer");
          const size = ab ? ab.byteLength : 0;

          const key = "file:" + rp;
          const rec = { path: rp, mime, size, ab, source: "zip:" + String(file.name || "import"), importedAt: startedAt, jobId };

          await idbPut(IDB_STORE_FILES, key, rec);
          importedKeys.push({ store: IDB_STORE_FILES, key });
          jobPaths.push(rp);

          idxMap.set(rp, { path: rp, mime, size, importedAt: startedAt, source: rec.source, jobId });

          this._job.done = i + 1;
          this._job.bytes += size;

          if ((i % 14) === 0) await new Promise(r => setTimeout(r, 0));
          UI._progress();
        }

        writeIndex(Array.from(idxMap.values()));
        try { localStorage.setItem(LS_LAST_KEY, safeJsonStringify({ jobId, startedAt, name: file.name || "", count: files.length, bytes: this._job.bytes })); } catch {}

        log("OK", `VAULT import ok ✅ files=${files.length} bytes=${this._job.bytes}`);

        try {
          const cfg = getCfg();
          if (cfg.autoZipToApp) {
            const r = await AutoZipToApp.fromJob({ jobId, startedAt, name: file.name || "", bytes: this._job.bytes, count: files.length, paths: jobPaths });
            if (!r.ok) log("WARN", "AUTO ZIP->APP falhou (não trava): " + (r.err || "erro") + (r.hint ? (" :: " + r.hint) : ""));
          }
        } catch (e) {
          log("WARN", "AUTO ZIP->APP falhou (não trava): " + (e?.message || e));
        }

        return { ok:true, jobId, count: files.length, bytes: this._job.bytes };
      } catch (e) {
        try {
          for (const it of importedKeys) {
            try { await idbDel(it.store, it.key); } catch {}
          }
        } catch {}
        log("ERR", "VAULT import fail :: " + (e?.message || e));
        return { ok:false, err:(e?.message || String(e)) };
      } finally {
        this._lock = false;
        this._job = null;
        UI._progress();
        UI.renderList();
      }
    }
  };

  // =========================================================
  // UI (FORÇA aparecer) + Templates admin
  // =========================================================
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
  }

  function findMountPoint() {
    try {
      const ui = window.RCF_UI;
      if (ui && typeof ui.getSlot === "function") {
        const slot =
          ui.getSlot("agent.tools") ||
          ui.getSlot("agent.actions") ||
          ui.getSlot("generator.tools") ||
          ui.getSlot("admin.tools") ||
          ui.getSlot("admin.integrations");
        if (slot) return slot;
      }
    } catch {}

    return (
      document.querySelector('[data-rcf-slot="agent.tools"]') ||
      document.querySelector('[data-rcf-slot="agent.actions"]') ||
      document.querySelector('[data-rcf-view="agent"]') ||
      document.getElementById("view-agent") ||
      document.getElementById("app") ||
      document.body
    );
  }

  const UI = {
    _mounted: false,

    mount() {
      if (this._mounted) return true;

      const root = findMountPoint();
      if (!root) return false;

      if (document.getElementById("rcfVaultCard")) {
        this._mounted = true;
        this.bind();
        this.renderList();
        return true;
      }

      const card = document.createElement("div");
      card.className = "card";
      card.id = "rcfVaultCard";
      card.style.marginTop = "12px";
      card.innerHTML = `
        <h2 style="margin-top:0">VAULT • ZIP Import (iPhone safe)</h2>
        <div class="hint">Importa ZIP no IndexedDB. ZIP→APP templates agora ficam no IndexedDB (sem estourar localStorage).</div>

        <div class="row" style="flex-wrap:wrap;align-items:center;margin-top:10px">
          <input id="rcfVaultZipInput" type="file" accept=".zip" style="max-width:340px" />
          <button class="btn ok" id="rcfVaultBtnImport" type="button">Import ZIP</button>
          <button class="btn ghost" id="rcfVaultBtnRefresh" type="button">Atualizar lista</button>
          <button class="btn danger" id="rcfVaultBtnClear" type="button">Clear Vault</button>
        </div>

        <pre class="mono small" id="rcfVaultOut" style="margin-top:10px">Pronto.</pre>

        <div class="row" style="margin-top:10px;align-items:center;flex-wrap:wrap">
          <input id="rcfVaultFilter" placeholder="filtrar: pdf | .js | pasta/" style="flex:1;min-width:220px" />
          <div class="badge" id="rcfVaultStats" style="white-space:nowrap">files=0</div>
        </div>

        <div id="rcfVaultList" class="files" style="margin-top:10px;max-height:32vh;overflow:auto"></div>

        <div class="row" style="margin-top:10px;align-items:center;flex-wrap:wrap">
          <button class="btn ghost" id="rcfTplBtnList" type="button">Listar templates ZIP→APP</button>
          <button class="btn danger" id="rcfTplBtnPrune" type="button">Prune templates (max 6)</button>
        </div>
        <div id="rcfTplBox" style="margin-top:10px"></div>

        <div id="rcfVaultViewer" style="margin-top:10px;display:none;border:1px solid rgba(255,255,255,.12);border-radius:12px;overflow:hidden">
          <div style="display:flex;gap:10px;align-items:center;padding:10px;border-bottom:1px solid rgba(255,255,255,.10)">
            <div class="badge" id="rcfVaultViewerTitle" style="max-width:65%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Viewer</div>
            <div class="spacer"></div>
            <button class="btn small ghost" id="rcfVaultViewerOpen" type="button">Open</button>
            <button class="btn small danger" id="rcfVaultViewerClose" type="button">Close</button>
          </div>
          <iframe id="rcfVaultFrame" title="Vault Viewer" style="width:100%;height:54vh;border:0;background:#fff"></iframe>
        </div>
      `;

      root.appendChild(card);

      this._mounted = true;
      this.bind();
      this.renderList();
      this._progress();

      log("OK", "UI mount ✅ root=" + (root.id || root.getAttribute?.("data-rcf-slot") || root.getAttribute?.("data-rcf-view") || root.tagName));
      return true;
    },

    out(txt) {
      const el = document.getElementById("rcfVaultOut");
      if (el) el.textContent = String(txt ?? "");
    },

    _progress() {
      const st = document.getElementById("rcfVaultStats");
      if (!st) return;
      const idx = Vault.index();
      const j = Vault._job;
      if (j) st.textContent = `importando… ${j.done}/${j.total} • ${(j.bytes / (1024*1024)).toFixed(1)}MB`;
      else {
        const totalBytes = idx.reduce((a, it) => a + (Number(it.size) || 0), 0);
        st.textContent = `files=${idx.length} • ${(totalBytes / (1024*1024)).toFixed(1)}MB`;
      }
    },

    bind() {
      const inp = document.getElementById("rcfVaultZipInput");
      const btnImport = document.getElementById("rcfVaultBtnImport");
      const btnRefresh = document.getElementById("rcfVaultBtnRefresh");
      const btnClear = document.getElementById("rcfVaultBtnClear");
      const filter = document.getElementById("rcfVaultFilter");

      const tplBtnList = document.getElementById("rcfTplBtnList");
      const tplBtnPrune = document.getElementById("rcfTplBtnPrune");

      if (btnImport && !btnImport.__bound) {
        btnImport.__bound = true;
        btnImport.addEventListener("click", async () => {
          try {
            const f = inp && inp.files && inp.files[0];
            if (!f) return UI.out("⚠️ Selecione um .zip primeiro.");
            UI.out("Importando… (não feche a aba)");
            const r = await Vault.importZipFile(f);
            if (r.ok) UI.out(`✅ Import OK • files=${r.count} • ${(r.bytes / (1024*1024)).toFixed(1)}MB`);
            else if (r.err === "dup") UI.out("⚠️ Import ignorado (duplicado)");
            else UI.out("❌ Falhou: " + (r.err || "erro"));
          } catch (e) {
            UI.out("❌ Erro: " + (e?.message || e));
          } finally {
            UI._progress();
            UI.renderList();
          }
        }, { passive: true });
      }

      if (btnRefresh && !btnRefresh.__bound) {
        btnRefresh.__bound = true;
        btnRefresh.addEventListener("click", () => {
          UI.renderList();
          UI._progress();
          UI.out("Lista atualizada ✅");
        }, { passive: true });
      }

      if (btnClear && !btnClear.__bound) {
        btnClear.__bound = true;
        btnClear.addEventListener("click", async () => {
          try {
            const ok = confirm("Clear Vault? (apaga arquivos do IDB)");
            if (!ok) return;
            await Vault.clearAll();
            UI.renderList();
            UI._progress();
            UI.out("✅ Vault limpo.");
          } catch (e) {
            UI.out("❌ Clear falhou: " + (e?.message || e));
          }
        }, { passive: true });
      }

      if (filter && !filter.__bound) {
        filter.__bound = true;
        filter.addEventListener("input", () => UI.renderList(), { passive: true });
      }

      if (tplBtnList && !tplBtnList.__bound) {
        tplBtnList.__bound = true;
        tplBtnList.addEventListener("click", async () => {
          try {
            UI.out("Listando templates ZIP→APP…");
            await UI.renderTemplates();
            UI.out("Templates listados ✅");
          } catch (e) {
            UI.out("❌ Templates erro: " + (e?.message || e) + "\n" + uiMsgQuotaHint());
          }
        }, { passive: true });
      }

      if (tplBtnPrune && !tplBtnPrune.__bound) {
        tplBtnPrune.__bound = true;
        tplBtnPrune.addEventListener("click", async () => {
          try {
            const cfg = getCfg();
            const removed = await pruneTemplates(cfg.maxTemplates || 6);
            UI.out("✅ Prune OK. removed=" + removed);
            await UI.renderTemplates();
          } catch (e) {
            UI.out("❌ Prune erro: " + (e?.message || e) + "\n" + uiMsgQuotaHint());
          }
        }, { passive: true });
      }

      const vClose = document.getElementById("rcfVaultViewerClose");
      const vOpen  = document.getElementById("rcfVaultViewerOpen");

      if (vClose && !vClose.__bound) {
        vClose.__bound = true;
        vClose.addEventListener("click", () => UI.closeViewer(), { passive: true });
      }
      if (vOpen && !vOpen.__bound) {
        vOpen.__bound = true;
        vOpen.addEventListener("click", () => {
          const url = document.getElementById("rcfVaultFrame")?.getAttribute("data-url") || "";
          if (url) window.open(url, "_blank", "noopener,noreferrer");
        }, { passive: true });
      }
    },

    renderList() {
      const box = document.getElementById("rcfVaultList");
      if (!box) return;

      const q = String(document.getElementById("rcfVaultFilter")?.value || "").trim().toLowerCase();
      const idx = Vault.index();

      const filtered = !q ? idx : idx.filter(it => {
        const p = String(it.path || "").toLowerCase();
        const m = String(it.mime || "").toLowerCase();
        return p.includes(q) || m.includes(q);
      });

      box.innerHTML = "";
      if (!filtered.length) {
        box.innerHTML = `<div class="hint">Nenhum arquivo no Vault (ou filtro sem match).</div>`;
        UI._progress();
        return;
      }

      const LIMIT = 220;
      const show = filtered.slice(0, LIMIT);

      for (const it of show) {
        const row = document.createElement("div");
        row.className = "file-item";
        const mb = (Number(it.size) || 0) / (1024 * 1024);
        row.textContent = `${it.path}  •  ${it.mime || "?"}  •  ${mb.toFixed(2)}MB`;
        row.style.cursor = "pointer";
        row.addEventListener("click", () => UI.openViewer(it.path), { passive: true });
        box.appendChild(row);
      }

      UI._progress();
    },

    async renderTemplates() {
      const box = document.getElementById("rcfTplBox");
      if (!box) return;

      const idx = readAppIndex();
      if (!idx.length) {
        box.innerHTML = `<div class="hint">Sem templates ZIP→APP salvos.</div>`;
        return;
      }

      const show = idx.slice(0, 12);
      box.innerHTML = show.map(it => {
        const id = String(it.id || "");
        const title = String(it.title || it.name || id);
        const mb = (Number(it.bytes||0) / (1024*1024)).toFixed(2);
        return `
          <div class="row" style="align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08)">
            <div style="min-width:0">
              <div class="badge" style="max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(title)}</div>
              <div class="hint" style="margin-top:4px">id=${escapeHtml(id)} • ${mb}MB • files=${Number(it.count||0)}</div>
            </div>
            <button class="btn danger small" data-tpl-del="${escapeHtml(id)}" type="button">Delete</button>
          </div>
        `;
      }).join("");

      const btns = Array.from(box.querySelectorAll("button[data-tpl-del]"));
      for (const b of btns) {
        if (b.__bound) continue;
        b.__bound = true;
        b.addEventListener("click", async () => {
          const id = b.getAttribute("data-tpl-del") || "";
          if (!id) return;
          const ok = confirm("Apagar template '" + id + "'? (remove payload do IndexedDB)");
          if (!ok) return;
          try {
            UI.out("Apagando template… " + id);
            await deleteTemplate(id);
            UI.out("✅ Template apagado: " + id);
            await UI.renderTemplates();
          } catch (e) {
            UI.out("❌ Delete template falhou: " + (e?.message || e) + "\n" + uiMsgQuotaHint());
          }
        }, { passive: true });
      }
    },

    async openViewer(path) {
      try {
        const viewer = document.getElementById("rcfVaultViewer");
        const frame  = document.getElementById("rcfVaultFrame");
        const title  = document.getElementById("rcfVaultViewerTitle");
        if (!viewer || !frame || !title) return;

        UI.out("Abrindo…");

        const url = await Vault.openAsObjectURL(path);
        if (!url) return UI.out("❌ Não consegui abrir (bytes/url).");

        title.textContent = path;
        frame.setAttribute("data-url", url);

        const mime = mimeByPath(path);
        if (mime === "application/pdf" || mime.startsWith("image/")) frame.src = url;
        else {
          const rec = await Vault.getFile(path);
          const text = abToText(rec?.ab);
          frame.srcdoc = `<pre style="white-space:pre-wrap;word-break:break-word;padding:14px;font-family:ui-monospace,Menlo,monospace">${escapeHtml(text.slice(0, 250000))}</pre>`;
        }

        viewer.style.display = "block";
        UI.out("✅ Viewer pronto.");
      } catch (e) {
        UI.out("❌ Viewer erro: " + (e?.message || e));
      }
    },

    closeViewer() {
      try {
        const viewer = document.getElementById("rcfVaultViewer");
        const frame  = document.getElementById("rcfVaultFrame");
        if (!viewer || !frame) return;

        const url = frame.getAttribute("data-url") || "";
        frame.removeAttribute("data-url");

        frame.src = "about:blank";
        frame.srcdoc = "";

        if (url && url.startsWith("blob:")) { try { URL.revokeObjectURL(url); } catch {} }

        viewer.style.display = "none";
        UI.out("Fechado.");
      } catch {}
    }
  };

  // =========================================================
  // BOOT: FORÇA mount + hooks
  // =========================================================
  function forceMountNow(tag) {
    try {
      if (Boot.mountDone) {
        log("INFO", "VAULT mount ignorado (já montado) via " + tag + " first=" + (Boot.mountBy || "?"));
        return true;
      }

      const ok = UI.mount();
      if (ok) {
        Boot.mountDone = true;
        Boot.mountBy = String(tag || "");
        log("OK", "VAULT mount OK ✅ via " + tag);
        return true;
      }

      log("WARN", "VAULT mount pending… via " + tag);
      return false;
    } catch (e) {
      log("WARN", "VAULT mount erro via " + tag + " :: " + (e?.message || e));
      return false;
    }
  }

  function restoreZipAppsOnce(tag) {
    if (Boot.restorePromise) {
      log("INFO", "ZIP->APP restore ignorado (já iniciado) via " + tag);
      return Boot.restorePromise;
    }

    Boot.restoreStarted = true;
    Boot.restorePromise = (async () => {
      try {
        const n = await AutoZipToApp.restorePacks();
        Boot.restoreDone = true;
        log("OK", "ZIP->APP restore guard OK ✅ via " + tag + " templates=" + Number(n || 0));
        return n;
      } catch (e) {
        log("WARN", "ZIP->APP restore guard erro via " + tag + " :: " + (e?.message || e));
        return 0;
      }
    })();

    return Boot.restorePromise;
  }

  function restoreZipAppsLoop() {
    try { restoreZipAppsOnce("restore-now"); } catch {}
    setTimeout(() => { try { restoreZipAppsOnce("restore+900ms"); } catch {} }, 900);
    setTimeout(() => { try { restoreZipAppsOnce("restore+2200ms"); } catch {} }, 2200);
  }


  const Boot = {
    mountDone: false,
    mountBy: "",
    restoreStarted: false,
    restoreDone: false,
    restorePromise: null
  };

  // =========================================================
  // Public API
  // =========================================================
  window.RCF_ZIP_VAULT = {
    __v11a: true,
    __v11b: true,
    __v: "1.1b",
    mount: () => forceMountNow("api:mount"),
    mountUI: () => forceMountNow("api:mountUI"),
    injectUI: () => forceMountNow("api:injectUI"),
    inject: () => forceMountNow("api:inject"),
    init: () => forceMountNow("api:init"),
    importZip: (file) => Vault.importZipFile(file),
    list: () => Vault.index(),
    get: async (path) => {
      const rec = await Vault.getFile(path);
      if (!rec) return null;
      return { ab: rec.ab || null, size: Number(rec.size) || (rec.ab ? rec.ab.byteLength : 0), mime: rec.mime || mimeByPath(path), path: rec.path || path };
    },
    openURL: (path) => Vault.openAsObjectURL(path),
    clearAll: () => Vault.clearAll(),
    cfgGet: () => getCfg(),
    cfgSet: (p) => setCfg(p),

    // ZIP->APP packs/templates
    zipToAppRestore: () => AutoZipToApp.restorePacks(),
    templatesIndex: () => readAppIndex(),
    deleteTemplate: (templateId) => deleteTemplate(templateId),
    pruneTemplates: (maxKeep) => pruneTemplates(maxKeep)
  };

  // ✅ monta já
  forceMountNow("immediate");

  // ✅ monta também quando UI estiver pronta
  try {
    window.addEventListener("RCF:UI_READY", () => {
      forceMountNow("RCF:UI_READY");
      setTimeout(() => forceMountNow("RCF:UI_READY+700ms"), 700);
      setTimeout(() => forceMountNow("RCF:UI_READY+1800ms"), 1800);
    });
  } catch {}

  // ✅ DOM fallback
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      forceMountNow("DOMContentLoaded");
      setTimeout(() => forceMountNow("DOMContentLoaded+700ms"), 700);
      setTimeout(() => forceMountNow("DOMContentLoaded+1800ms"), 1800);
      restoreZipAppsLoop();
    }, { once: true });
  } else {
    setTimeout(() => forceMountNow("readyState+350ms"), 350);
    setTimeout(() => forceMountNow("readyState+1200ms"), 1200);
    restoreZipAppsLoop();
  }

  log("OK", "zip_vault.js ready ✅ (v1.1b)");
})();
