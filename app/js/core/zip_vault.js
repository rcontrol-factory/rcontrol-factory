/* FILE: /app/js/core/zip_vault.js
   RControl Factory — js/core/zip_vault.js — v1.0j SAFE (DEDUP: mount/restore 3x no mesmo boot)
   BASE: v1.0i (seu arquivo)
   PATCH MÍNIMO (sem refatorar pipeline / sem mexer em boot):
   - ✅ DEDUP MOUNT: se já montou com sucesso, chamadas seguintes viram no-op (não loga 3x)
   - ✅ DEDUP RESTORE: restorePacks só roda de verdade quando TEMPLATE_REGISTRY existir; depois disso, não repete
   - Mantém: IDB ArrayBuffer, Viewer, JSZip loader robusto, Auto ZIP->APP pack + restore packs
*/

(function () {
  "use strict";

  if (window.RCF_ZIP_VAULT && (window.RCF_ZIP_VAULT.__v10g || window.RCF_ZIP_VAULT.__v10i || window.RCF_ZIP_VAULT.__v10j)) return;

  const PREFIX = "rcf:";
  const LS_INDEX_KEY = PREFIX + "vault:index";
  const LS_LAST_KEY  = PREFIX + "vault:last";
  const LS_CFG_KEY   = PREFIX + "vault:cfg";

  const LS_APP_INDEX = PREFIX + "vault:app:index";
  const LS_APP_KEY   = (id) => PREFIX + "vault:app:" + id;

  const IDB_DB = "RCF_VAULT_DB";
  const IDB_VER = 1;
  const IDB_STORE = "files";

  const safeJsonParse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
  const safeJsonStringify = (o) => { try { return JSON.stringify(o); } catch { return String(o); } };

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
    try { console.log("[RCF_VAULT]", level, msg); } catch {}
  }

  function nowISO() { return new Date().toISOString(); }

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
  // SESSION GUARDS (DEDUP mount/restore dentro do mesmo boot)
  // =========================================================
  const __SESSION = (function(){
    try {
      if (!window.__RCF_ZIP_VAULT_SESSION__) {
        window.__RCF_ZIP_VAULT_SESSION__ = {
          mountOk: false,
          mountTag: "",
          restoreOk: false,
          restoreTag: "",
          restoreAttempts: 0
        };
      }
      return window.__RCF_ZIP_VAULT_SESSION__;
    } catch {
      return { mountOk:false, mountTag:"", restoreOk:false, restoreTag:"", restoreAttempts:0 };
    }
  })();

  // =========================================================
  // IDB
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

  async function idbClearAll() {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const st = tx.objectStore(IDB_STORE);
        const rq = st.clear();
        rq.onsuccess = () => resolve(true);
        rq.onerror = () => reject(rq.error);
      } catch (e) { reject(e); }
    });
  }

  // =========================================================
  // localStorage index/cfg
  // =========================================================
  function readIndex() {
    return safeJsonParse(localStorage.getItem(LS_INDEX_KEY) || "[]", []);
  }
  function writeIndex(list) {
    try { localStorage.setItem(LS_INDEX_KEY, safeJsonStringify(list || [])); } catch {}
  }

  function getCfg() {
    // ✅ merge forte: sempre injeta defaults
    const cur = safeJsonParse(localStorage.getItem(LS_CFG_KEY) || "{}", {});
    const def = {
      keepTextCacheMax: 180000,
      autoMountUI: true,
      autoZipToApp: true,
      autoZipMaxBytesLS: 900000,
      autoSelectGenerator: true
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

    const candidates = [
      "/app/vendor/jszip.min.js",
      "/vendor/jszip.min.js",
      "/js/vendor/jszip.min.js",
      "/app/js/vendor/jszip.min.js"
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
  // AUTO ZIP->APP pack
  // =========================================================
  function readAppIndex() { return safeJsonParse(localStorage.getItem(LS_APP_INDEX) || "[]", []); }
  function writeAppIndex(list) { try { localStorage.setItem(LS_APP_INDEX, safeJsonStringify(list || [])); } catch {} }

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

  const AutoZipToApp = {
    async fromJob(meta) {
      const cfg = getCfg();
      const max = Number(cfg.autoZipMaxBytesLS || 0) || 0;
      if (max > 0 && (Number(meta.bytes) || 0) > max) {
        log("WARN", "ZIP->APP: ZIP grande demais p/ localStorage. bytes=" + meta.bytes + " max=" + max);
        return { ok:false, err:"zip_too_big" };
      }

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
        kind: "rcf-zipapp-pack",
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

      try { localStorage.setItem(LS_APP_KEY(templateId), safeJsonStringify(pack)); } catch {}

      try {
        const idx = readAppIndex();
        const next = idx.filter(x => x && x.id !== templateId);
        next.unshift({ id: templateId, jobId: meta.jobId, name: pack.name, title: pack.title, createdAt: pack.createdAt, bytes: pack.bytes, count: pack.count });
        writeAppIndex(next.slice(0, 30));
      } catch {}

      const okReg = registerZipAsTemplate(pack);
      if (okReg) log("OK", "ZIP->APP pronto ✅ template=" + templateId + " title=" + title);
      else log("WARN", "ZIP->APP: registry não disponível ainda");

      if (cfg.autoSelectGenerator) {
        setTimeout(() => { try { tryAutoSelectGenerator(templateId); } catch {} }, 650);
        setTimeout(() => { try { tryAutoSelectGenerator(templateId); } catch {} }, 1600);
      }

      return { ok:true, templateId, title };
    },

    restorePacks() {
      try {
        const idx = readAppIndex();
        if (!idx || !idx.length) return 0;
        let ok = 0;
        for (const it of idx) {
          const id = it && it.id ? String(it.id) : "";
          if (!id) continue;
          const raw = localStorage.getItem(LS_APP_KEY(id)) || "";
          const pack = safeJsonParse(raw, null);
          if (pack && pack.templateId) if (registerZipAsTemplate(pack)) ok++;
        }
        if (ok) log("OK", "ZIP->APP restore ✅ templates=" + ok);
        return ok;
      } catch { return 0; }
    }
  };

  // =========================================================
  // Vault core
  // =========================================================
  const Vault = {
    __v10g: true,
    _lock: false,
    _job: null,

    index() {
      const list = readIndex();
      list.sort((a, b) => String(a.path).localeCompare(String(b.path)));
      return list;
    },

    async getFile(path) {
      const p = normPath(path);
      return (await idbGet("file:" + p)) || null;
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
      await idbClearAll();
      writeIndex([]);
      try { localStorage.removeItem(LS_LAST_KEY); } catch {}
      log("OK", "VAULT clearAll ✅");
      return true;
    },

    async importZipFile(file) {
      if (this._lock) return { ok:false, err:"locked" };
      this._lock = true;

      // Dedup (iOS pode disparar 2x o mesmo trigger em sequência): ignora reimport do mesmo arquivo por ~2s
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

          await idbPut(key, rec);
          importedKeys.push(key);
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
            await AutoZipToApp.fromJob({ jobId, startedAt, name: file.name || "", bytes: this._job.bytes, count: files.length, paths: jobPaths });
          }
        } catch (e) {
          log("WARN", "AUTO ZIP->APP falhou (não trava): " + (e?.message || e));
        }

        return { ok:true, jobId, count: files.length, bytes: this._job.bytes };
      } catch (e) {
        try { for (const k of importedKeys) { try { await idbDel(k); } catch {} } } catch {}
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
  // UI (FORÇA aparecer)
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
        <h2 style="margin-top:0">VAULT • ZIP Import (PDF safe)</h2>
        <div class="hint">Importa ZIP e guarda no IndexedDB (iOS safe). ✅</div>

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
  // BOOT: FORÇA mount + hooks (DEDUP)
  // =========================================================
  function forceMountNow(tag) {
    try {
      // ✅ DEDUP: se já montou com sucesso, não repete log nem re-monta
      if (__SESSION.mountOk && UI._mounted) return;

      const ok = UI.mount();
      if (ok) {
        if (!__SESSION.mountOk) {
          __SESSION.mountOk = true;
          __SESSION.mountTag = String(tag || "");
          log("OK", "VAULT mount OK ✅ via " + tag);
        }
      } else {
        log("WARN", "VAULT mount pending… via " + tag);
      }
    } catch (e) {
      log("WARN", "VAULT mount erro via " + tag + " :: " + (e?.message || e));
    }
  }

  function restorePacksOnce(tag) {
    try {
      // ✅ só tenta de verdade quando registry existir (senão, deixa as próximas tentarem)
      const REG = window.RCF_TEMPLATE_REGISTRY;
      const hasReg = !!(REG && (typeof REG.add === "function"));

      if (__SESSION.restoreOk) return;

      __SESSION.restoreAttempts = Number(__SESSION.restoreAttempts || 0) + 1;

      if (!hasReg) return; // ainda não dá pra registrar templates

      const n = AutoZipToApp.restorePacks();
      __SESSION.restoreOk = true;
      __SESSION.restoreTag = String(tag || "");
      // (AutoZipToApp.restorePacks já loga templates=N quando >0)
      if (!n) log("OK", "ZIP->APP restore ✅ templates=0 (via " + tag + ")");
    } catch {}
  }

  function restoreZipAppsLoop() {
    // ✅ mantém redundância, mas com DEDUP real
    restorePacksOnce("restore#0");
    setTimeout(() => restorePacksOnce("restore#900ms"), 900);
    setTimeout(() => restorePacksOnce("restore#2200ms"), 2200);
  }

  window.RCF_ZIP_VAULT = {
    __v10g: true,
    __v10i: true,
    __v10j: true,
    __v: "1.0j",
    mount: () => UI.mount(),
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
    zipToAppRestore: () => AutoZipToApp.restorePacks()
  };

  // ✅ monta já
  forceMountNow("immediate");

  // ✅ monta também quando UI estiver pronta (slots criados)
  try {
    window.addEventListener("RCF:UI_READY", () => {
      forceMountNow("RCF:UI_READY");
      setTimeout(() => forceMountNow("RCF:UI_READY+700ms"), 700);
      setTimeout(() => forceMountNow("RCF:UI_READY+1800ms"), 1800);
      // restore também pode depender de registry ficar pronto
      restoreZipAppsLoop();
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

  log("OK", "zip_vault.js ready ✅ (v1.0j)");
})();
