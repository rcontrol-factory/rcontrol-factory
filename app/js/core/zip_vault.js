/* FILE: /app/js/core/zip_vault.js
   RControl Factory — js/core/zip_vault.js — v1.0e SAFE
   FIXES:
   - JSZip loader robusto (rejeita HTML + fallback CDN via <script src>)
   - iOS SAFARI: IndexedDB não armazena Blob/File confiável -> salva ArrayBuffer (bytes) no IDB
   - Viewer reconstrói Blob a partir dos bytes
   - ✅ NOVO: AUTO-ZIP -> APP (gera template dinamicamente no RCF_TEMPLATE_REGISTRY)
     - Após importar ZIP, cria um template "zipapp-<jobId>" com os arquivos do ZIP
     - Salva um pack leve no localStorage (para ZIPs pequenos)
     - Tenta auto-selecionar no Generator (best-effort)
*/
(function () {
  "use strict";

  if (window.RCF_ZIP_VAULT && window.RCF_ZIP_VAULT.__v10e) return;

  const PREFIX = "rcf:";
  const LS_INDEX_KEY = PREFIX + "vault:index";
  const LS_LAST_KEY  = PREFIX + "vault:last";
  const LS_CFG_KEY   = PREFIX + "vault:cfg";

  // ✅ NOVO: pack p/ auto-template (pequenos)
  const LS_APP_INDEX = PREFIX + "vault:app:index"; // array {id,jobId,name,title,createdAt,bytes,count}
  const LS_APP_KEY   = (id) => PREFIX + "vault:app:" + id;

  const IDB_DB = "RCF_VAULT_DB";
  const IDB_VER = 1;
  const IDB_STORE = "files";

  const $ = (sel, root = document) => root.querySelector(sel);

  const safeJsonParse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
  const safeJsonStringify = (o) => { try { return JSON.stringify(o); } catch { return String(o); } };

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
    try {
      if (window.RCF && typeof window.RCF.log === "function") window.RCF.log(msg);
      else console.log("[RCF_VAULT]", level, msg);
    } catch {}
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
  // IDB (SAFE)
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
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE);
          }
        };

        req.onsuccess = () => {
          __db = req.result;
          resolve(__db);
        };

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
      } catch (e) {
        reject(e);
      }
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
      } catch (e) {
        reject(e);
      }
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
      } catch (e) {
        reject(e);
      }
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
      } catch (e) {
        reject(e);
      }
    });
  }

  // =========================================================
  // Index (localStorage leve)
  // =========================================================
  function readIndex() {
    return safeJsonParse(localStorage.getItem(LS_INDEX_KEY) || "[]", []);
  }

  function writeIndex(list) {
    try { localStorage.setItem(LS_INDEX_KEY, safeJsonStringify(list || [])); } catch {}
  }

  function getCfg() {
    return safeJsonParse(localStorage.getItem(LS_CFG_KEY) || "{}", {
      keepTextCacheMax: 180000,
      autoMountUI: true,
      // ✅ NOVO
      autoZipToApp: true,
      autoZipMaxBytesLS: 900000, // ~0.9MB (seguro p/ iOS)
      autoSelectGenerator: true
    });
  }

  function setCfg(patch) {
    const cfg = Object.assign(getCfg(), patch || {});
    try { localStorage.setItem(LS_CFG_KEY, safeJsonStringify(cfg)); } catch {}
    return cfg;
  }

  // =========================================================
  // JSZip loader (ROBUSTO)
  // =========================================================
  function looksLikeHTML(txt) {
    const s = String(txt || "").trim().slice(0, 300).toLowerCase();
    return (
      s.startsWith("<!doctype") ||
      s.startsWith("<html") ||
      s.includes("<head") ||
      s.includes("<body") ||
      s.includes("rcontrol factory")
    );
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
      } catch {
        resolve(false);
      }
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
  // ✅ AUTO ZIP -> APP (template dinâmico)
  // =========================================================
  function readAppIndex() {
    return safeJsonParse(localStorage.getItem(LS_APP_INDEX) || "[]", []);
  }
  function writeAppIndex(list) {
    try { localStorage.setItem(LS_APP_INDEX, safeJsonStringify(list || [])); } catch {}
  }

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
    // root só vale se for pasta (>=1 seg) e não remover arquivo único
    const root = (k > 0) ? parts0.slice(0, k).join("/") : "";
    if (!root) return { root:"", out:arr };
    const out = arr.map(p => p.startsWith(root + "/") ? p.slice(root.length + 1) : p);
    return { root, out };
  }

  function abToText(ab) {
    try {
      const u8 = ab ? new Uint8Array(ab) : new Uint8Array();
      return new TextDecoder("utf-8", { fatal: false }).decode(u8);
    } catch {
      return "";
    }
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
    } catch {
      return "";
    }
  }

  function tryParseManifestTitle(filesMap) {
    // procura manifest.json na raiz
    const key = Object.keys(filesMap || {}).find(k => String(k).toLowerCase() === "manifest.json");
    if (!key) return "";
    try {
      const mf = filesMap[key];
      if (!mf) return "";
      const txt = (mf.enc === "utf8") ? mf.data : "";
      const o = safeJsonParse(txt, null);
      if (!o) return "";
      return String(o.name || o.short_name || "").trim();
    } catch {
      return "";
    }
  }

  function registerZipAsTemplate(pack) {
    try {
      const REG = window.RCF_TEMPLATE_REGISTRY;
      if (!REG || typeof REG.add !== "function") return false;

      const tplId = String(pack.templateId || "");
      if (!tplId) return false;

      // evita duplicar
      if (REG.get && REG.get(tplId)) return true;

      REG.add(tplId, {
        title: pack.title || ("ZIP App: " + (pack.name || tplId)),
        files(spec) {
          // devolve os arquivos já prontos (strings/base64)
          const out = {};
          const files = pack.files || {};
          for (const p of Object.keys(files)) {
            const f = files[p];
            if (!f) continue;
            if (f.enc === "utf8") out[p] = String(f.data || "");
            else if (f.enc === "base64") {
              // deixa como data url? (engine atual normalmente espera texto; bin é raro)
              // guardamos como base64 puro para futuras evoluções
              out[p] = String(f.data || "");
            } else {
              out[p] = String(f.data || "");
            }
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
      // tenta achar qualquer <select> que pareça ser de template
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
      try { target.dispatchEvent(new Event("change", { bubbles: true })); } catch {}
      try { target.dispatchEvent(new Event("input", { bubbles: true })); } catch {}
      log("OK", "ZIP->APP: generator auto-select ✅ " + templateId);
      return true;
    } catch {
      return false;
    }
  }

  // =========================================================
  // Vault core (IDB salva bytes, não Blob)
  // =========================================================
  const Vault = {
    __v10e: true,
    _lock: false,
    _job: null,

    index() {
      const list = readIndex();
      list.sort((a, b) => String(a.path).localeCompare(String(b.path)));
      return list;
    },

    async getFile(path) {
      const p = normPath(path);
      const key = "file:" + p;
      const rec = await idbGet(key);
      return rec || null;
    },

    async openAsObjectURL(path) {
      const rec = await this.getFile(path);
      if (!rec) return null;

      try {
        if (rec.blob) return URL.createObjectURL(rec.blob);
        const mime = rec.mime || mimeByPath(path);
        const ab = rec.ab;
        if (!ab) return null;
        const blob = new Blob([ab], { type: mime });
        return URL.createObjectURL(blob);
      } catch {
        return null;
      }
    },

    async clearAll() {
      await idbClearAll();
      writeIndex([]);
      try { localStorage.removeItem(LS_LAST_KEY); } catch {}
      log("OK", "VAULT clearAll ✅");
      return true;
    },

    async importZipFile(file) {
      if (this._lock) return { ok: false, err: "locked" };
      this._lock = true;

      const jobId = "job_" + Date.now();
      const startedAt = nowISO();
      const importedKeys = [];

      this._job = { id: jobId, startedAt, name: file?.name || "(zip)", total: 0, done: 0, bytes: 0 };

      try {
        const okZip = await ensureJSZip();
        if (!okZip) throw new Error("JSZip não carregou (verifique internet 1x ou arquivo local).");

        if (!file) throw new Error("Arquivo ZIP ausente.");
        const zipBuf = await file.arrayBuffer();

        const zip = await window.JSZip.loadAsync(zipBuf);
        const entries = [];
        zip.forEach((relativePath, entry) => { entries.push({ relativePath, entry }); });

        const files = entries.filter(x => x && x.entry && !x.entry.dir);
        this._job.total = files.length;

        const idx = readIndex();
        const idxMap = new Map(idx.map(it => [String(it.path), it]));

        // ✅ para AUTO-ZIP->APP: vamos coletar paths do job
        const jobPaths = [];

        for (let i = 0; i < files.length; i++) {
          const rp = normPath(files[i].relativePath);
          const entry = files[i].entry;

          const mime = mimeByPath(rp);

          // ✅ iOS SAFE: pega bytes e salva no IDB (ArrayBuffer é cloneable)
          const ab = await entry.async("arraybuffer");
          const size = ab ? ab.byteLength : 0;

          const key = "file:" + rp;
          const rec = {
            path: rp,
            mime,
            size,
            ab,
            source: "zip:" + String(file.name || "import"),
            importedAt: startedAt,
            jobId
          };

          await idbPut(key, rec);
          importedKeys.push(key);
          jobPaths.push(rp);

          idxMap.set(rp, {
            path: rp,
            mime,
            size,
            importedAt: startedAt,
            source: rec.source,
            jobId
          });

          this._job.done = i + 1;
          this._job.bytes += size;

          if ((i % 14) === 0) await new Promise(r => setTimeout(r, 0));
          UI._progress();
        }

        writeIndex(Array.from(idxMap.values()));
        try {
          localStorage.setItem(LS_LAST_KEY, safeJsonStringify({
            jobId, startedAt, name: file.name || "", count: files.length, bytes: this._job.bytes
          }));
        } catch {}

        log("OK", `VAULT import ok ✅ files=${files.length} bytes=${this._job.bytes}`);

        // ✅ AUTO ZIP -> APP (template)
        try {
          const cfg = getCfg();
          if (cfg.autoZipToApp) {
            await AutoZipToApp.fromJob({
              jobId,
              startedAt,
              name: file.name || "",
              bytes: this._job.bytes,
              count: files.length,
              paths: jobPaths
            });
          }
        } catch (e) {
          log("WARN", "AUTO ZIP->APP falhou (não trava): " + (e?.message || e));
        }

        return { ok: true, jobId, count: files.length, bytes: this._job.bytes };

      } catch (e) {
        try { for (const k of importedKeys) { try { await idbDel(k); } catch {} } } catch {}
        log("ERR", "VAULT import fail :: " + (e?.message || e));
        return { ok: false, err: (e?.message || String(e)) };

      } finally {
        this._lock = false;
        this._job = null;
        UI._progress();
        UI.renderList();
      }
    }
  };

  // =========================================================
  // ✅ AUTO ZIP -> APP helper
  // =========================================================
  const AutoZipToApp = {
    async fromJob(meta) {
      const cfg = getCfg();
      const max = Number(cfg.autoZipMaxBytesLS || 0) || 0;

      // só faz pack local se for "pequeno" (pra não quebrar iOS LS)
      if (max > 0 && (Number(meta.bytes) || 0) > max) {
        log("WARN", "ZIP->APP: ZIP grande demais p/ localStorage. bytes=" + meta.bytes + " max=" + max);
        log("WARN", "ZIP->APP: mande um ZIP menor (ou depois eu integro via Engine/Builder).");
        return { ok:false, err:"zip_too_big" };
      }

      // pega só os arquivos desse job
      const all = Vault.index();
      const jobList = all.filter(it => it && it.jobId === meta.jobId).map(it => it.path);

      // strip pasta raiz comum (ex: timesheet-lite/* -> *)
      const stripped = stripCommonRoot(jobList);
      const root = stripped.root;
      const paths = stripped.out;

      const filesPack = {};
      let packBytesApprox = 0;

      for (let i = 0; i < paths.length; i++) {
        const p2 = paths[i];
        const realPath = root ? (root + "/" + p2) : p2;

        const rec = await Vault.getFile(realPath);
        if (!rec || !rec.ab) continue;

        const mime = rec.mime || mimeByPath(p2);
        const isText = isTextByMimeOrPath(mime, p2);

        if (isText) {
          const txt = abToText(rec.ab);
          filesPack[p2] = { enc:"utf8", mime, data: txt };
          packBytesApprox += (txt ? txt.length : 0);
        } else {
          const b64 = abToBase64(rec.ab);
          filesPack[p2] = { enc:"base64", mime, data: b64 };
          packBytesApprox += (b64 ? b64.length : 0);
        }

        if ((i % 20) === 0) await new Promise(r => setTimeout(r, 0));
      }

      // tenta pegar título do manifest
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
        approxLS: packBytesApprox,
        root,
        files: filesPack
      };

      // salva pack
      try { localStorage.setItem(LS_APP_KEY(templateId), safeJsonStringify(pack)); } catch (e) {
        log("WARN", "ZIP->APP: não salvou pack no localStorage: " + (e?.message || e));
        // ainda tenta registrar direto via memória (pack já existe)
      }

      // atualiza índice
      try {
        const idx = readAppIndex();
        const next = idx.filter(x => x && x.id !== templateId);
        next.unshift({
          id: templateId,
          jobId: meta.jobId,
          name: pack.name,
          title: pack.title,
          createdAt: pack.createdAt,
          bytes: pack.bytes,
          count: pack.count
        });
        writeAppIndex(next.slice(0, 30));
      } catch {}

      // registra template no registry (se existir)
      const okReg = registerZipAsTemplate(pack);

      if (okReg) {
        log("OK", "ZIP->APP pronto ✅ template=" + templateId + " title=" + title);
        try { window.RCF_LOGGER?.push?.("OK", "ZIP->APP ✅ template=" + templateId); } catch {}
      } else {
        log("WARN", "ZIP->APP: registry não disponível ainda (template_registry não carregou?)");
      }

      // tenta auto-select generator
      if (cfg.autoSelectGenerator) {
        setTimeout(() => { try { tryAutoSelectGenerator(templateId); } catch {} }, 650);
        setTimeout(() => { try { tryAutoSelectGenerator(templateId); } catch {} }, 1600);
      }

      return { ok:true, templateId, title };
    },

    // permite re-registrar packs no boot (se registry carregar depois)
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
          if (pack && pack.templateId) {
            if (registerZipAsTemplate(pack)) ok++;
          }
        }
        if (ok) log("OK", "ZIP->APP restore ✅ templates=" + ok);
        return ok;
      } catch {
        return 0;
      }
    }
  };

  // =========================================================
  // UI no AGENTE (workspace)
  // =========================================================
  const UI = {
    _mounted: false,

    mount() {
      if (this._mounted) return true;

      const agentView =
        document.getElementById("view-agent") ||
        document.querySelector('[data-rcf-view="agent"]') ||
        document.getElementById("view-admin") ||
        null;

      if (!agentView) return false;

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
        <div class="hint">Importa ZIP e guarda no IndexedDB. ✅ Auto ZIP→App (vira template no Generator quando pequeno).</div>

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

      agentView.appendChild(card);

      this._mounted = true;
      this.bind();
      this.renderList();
      this._progress();
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
      if (j) {
        st.textContent = `importando… ${j.done}/${j.total} • ${(j.bytes / (1024*1024)).toFixed(1)}MB`;
      } else {
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
            if (r.ok) UI.out(`✅ Import OK • files=${r.count} • ${(r.bytes / (1024*1024)).toFixed(1)}MB\n✅ Se for pequeno, virou APP/Template automaticamente.`);
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
        filter.addEventListener("input", () => {
          UI.renderList();
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

      if (filtered.length > LIMIT) {
        const more = document.createElement("div");
        more.className = "hint";
        more.style.marginTop = "8px";
        more.textContent = `... (${filtered.length - LIMIT} mais — refine o filtro)`;
        box.appendChild(more);
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
        if (!url) {
          UI.out("❌ Não consegui abrir (bytes/url).");
          return;
        }

        title.textContent = path;
        frame.setAttribute("data-url", url);

        const mime = mimeByPath(path);

        if (mime === "application/pdf" || mime.startsWith("image/")) {
          frame.src = url;
        } else {
          const rec = await Vault.getFile(path);
          const ab = rec?.ab;
          let text = "";
          try {
            const u8 = ab ? new Uint8Array(ab) : new Uint8Array();
            text = new TextDecoder("utf-8", { fatal: false }).decode(u8);
          } catch {
            text = "(não foi possível decodificar como texto)";
          }
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

        if (url && url.startsWith("blob:")) {
          try { URL.revokeObjectURL(url); } catch {}
        }

        viewer.style.display = "none";
        UI.out("Fechado.");
      } catch {}
    }
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
  }

  function tryMountLoop() {
    const cfg = getCfg();
    if (!cfg.autoMountUI) return;

    const ok = UI.mount();
    if (ok) return;

    setTimeout(() => { try { UI.mount(); } catch {} }, 800);
    setTimeout(() => { try { UI.mount(); } catch {} }, 2000);
  }

  // ✅ restore packs depois que template_registry carregar
  function restoreZipAppsLoop() {
    try { AutoZipToApp.restorePacks(); } catch {}
    setTimeout(() => { try { AutoZipToApp.restorePacks(); } catch {} }, 1400);
    setTimeout(() => { try { AutoZipToApp.restorePacks(); } catch {} }, 3200);
  }

  window.RCF_ZIP_VAULT = {
    __v10e: true,
    mount: () => UI.mount(),
    importZip: (file) => Vault.importZipFile(file),
    list: () => Vault.index(),
    get: (path) => Vault.getFile(path),
    openURL: (path) => Vault.openAsObjectURL(path),
    clearAll: () => Vault.clearAll(),
    cfgGet: () => getCfg(),
    cfgSet: (p) => setCfg(p),
    // ✅ helper
    zipToAppRestore: () => AutoZipToApp.restorePacks()
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      tryMountLoop();
      restoreZipAppsLoop();
    }, { once: true });
  } else {
    tryMountLoop();
    restoreZipAppsLoop();
  }

  log("OK", "zip_vault.js ready ✅ (v1.0e)");
})();
