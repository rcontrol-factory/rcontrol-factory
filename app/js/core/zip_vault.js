/* FILE: /app/js/core/zip_vault.js
   RControl Factory — js/core/zip_vault.js — v1.0a SAFE (ZIP VAULT + PDF/ASSET no IDB)
   Objetivo:
   - Importar ZIP grande sem travar (iPhone safe)
   - Guardar arquivos PESADOS (PDF/IMG/etc) no IndexedDB (Blob)
   - Guardar índice leve no localStorage (meta)
   - UI dentro do VIEW "Agente" (para virar o “Replit-like Agent workspace”)
   Dependência:
   - JSZip (window.JSZip). Se não existir, o módulo tenta carregar de paths locais comuns.
*/
(function () {
  "use strict";

  if (window.RCF_ZIP_VAULT && window.RCF_ZIP_VAULT.__v10a) return;

  const PREFIX = "rcf:";
  const LS_INDEX_KEY = PREFIX + "vault:index";
  const LS_LAST_KEY  = PREFIX + "vault:last";
  const LS_CFG_KEY   = PREFIX + "vault:cfg";

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
      keepTextCacheMax: 180000, // ~180kb: cache textual opcional (não trava)
      autoMountUI: true
    });
  }

  function setCfg(patch) {
    const cfg = Object.assign(getCfg(), patch || {});
    try { localStorage.setItem(LS_CFG_KEY, safeJsonStringify(cfg)); } catch {}
    return cfg;
  }

  // =========================================================
  // JSZip loader (sem web externo; tenta caminhos locais)
  // =========================================================
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
        const code = await res.text();
        if (!code || code.length < 2000) continue;

        const s = document.createElement("script");
        s.textContent = code;
        document.head.appendChild(s);

        if (window.JSZip) {
          log("OK", "JSZip carregado via " + src);
          return true;
        }
      } catch {}
    }

    log("ERR", "JSZip ausente. Adicione jszip.min.js em /app/vendor/jszip.min.js (recomendado).");
    return false;
  }

  // =========================================================
  // Vault core
  // =========================================================
  const Vault = {
    __v10a: true,
    _lock: false,
    _job: null,

    index() {
      const list = readIndex();
      // ordena por path
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
      if (!rec || !rec.blob) return null;
      try {
        const url = URL.createObjectURL(rec.blob);
        return url;
      } catch {
        return null;
      }
    },

    async clearAll() {
      // limpa IDB + index
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
      const importedKeys = []; // rollback safety

      this._job = { id: jobId, startedAt, name: file?.name || "(zip)", total: 0, done: 0, bytes: 0 };

      try {
        const okZip = await ensureJSZip();
        if (!okZip) throw new Error("JSZip não carregou (adicione jszip.min.js local).");

        if (!file) throw new Error("Arquivo ZIP ausente.");
        const ab = await file.arrayBuffer();

        const zip = await window.JSZip.loadAsync(ab);
        const entries = [];
        zip.forEach((relativePath, entry) => { entries.push({ relativePath, entry }); });

        // filtra arquivos (não diretórios)
        const files = entries.filter(x => x && x.entry && !x.entry.dir);
        this._job.total = files.length;

        // índice atual
        const idx = readIndex();
        const idxMap = new Map(idx.map(it => [String(it.path), it]));

        // import SAFE por lotes
        for (let i = 0; i < files.length; i++) {
          const rp = normPath(files[i].relativePath);
          const entry = files[i].entry;

          // Heurística: mantém baixo risco no iPhone -> usa blob para tudo
          const mime = mimeByPath(rp);

          // PDF/IMG/BIN => blob (sempre)
          // Textos => blob também, mas podemos cachear um preview pequeno (opcional)
          const blob = await entry.async("blob");
          const size = blob?.size || 0;

          const key = "file:" + rp;
          const rec = {
            path: rp,
            mime,
            size,
            blob,
            source: "zip:" + String(file.name || "import"),
            importedAt: startedAt,
            jobId
          };

          // escreve no IDB
          await idbPut(key, rec);
          importedKeys.push(key);

          // atualiza index leve
          const meta = {
            path: rp,
            mime,
            size,
            importedAt: startedAt,
            source: rec.source,
            jobId
          };

          idxMap.set(rp, meta);

          this._job.done = i + 1;
          this._job.bytes += size;

          // yield pra não travar
          if ((i % 18) === 0) await new Promise(r => setTimeout(r, 0));

          UI._progress();
        }

        // salva index
        writeIndex(Array.from(idxMap.values()));
        try {
          localStorage.setItem(LS_LAST_KEY, safeJsonStringify({
            jobId, startedAt, name: file.name || "", count: files.length, bytes: this._job.bytes
          }));
        } catch {}

        log("OK", `VAULT import ok ✅ files=${files.length} bytes=${this._job.bytes}`);
        return { ok: true, jobId, count: files.length, bytes: this._job.bytes };

      } catch (e) {
        // rollback SAFE (apaga o que entrou nesse job)
        try {
          for (const k of importedKeys) { try { await idbDel(k); } catch {} }
        } catch {}

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
  // UI no AGENTE (workspace)
  // =========================================================
  const UI = {
    _mounted: false,

    _resolveHost(ctx) {
      try {
        // Prefer slots oficiais via registry (novo padrão)
        const R = (ctx && ctx.ui) ? ctx.ui : window.RCF_UI;
        if (R && typeof R.getSlot === "function") {
          return (
            R.getSlot("agent.tools") ||
            R.getSlot("agent.actions") ||
            R.getSlot("generator.tools") ||
            R.getSlot("admin.integrations") ||
            null
          );
        }
      } catch {}

      // Fallbacks antigos (não quebra)
      try {
        return (
          document.getElementById("view-agent") ||
          document.querySelector('[data-rcf-view="agent"]') ||
          document.getElementById("view-admin") ||
          null
        );
      } catch {
        return null;
      }
    },

    mount(ctx) {
      if (this._mounted) return true;

      const host = this._resolveHost(ctx);
      if (!host) return false;

      // já existe?
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
        <div class="hint">Importa ZIP grande e guarda PDFs/Assets no IndexedDB (sem travar).</div>

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

      // coloca no host resolvido (slot/agent/admin)
      host.appendChild(card);

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
            if (r.ok) UI.out(`✅ Import OK • files=${r.count} • ${(r.bytes / (1024*1024)).toFixed(1)}MB`);
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
            const ok = confirm("Clear Vault? (apaga PDFs/Assets do IDB)");
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

      // viewer
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

      // limita itens na tela (iPhone safe)
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
          UI.out("❌ Não consegui abrir (blob/url).");
          return;
        }

        title.textContent = path;
        frame.setAttribute("data-url", url);

        // PDF / IMG abre normal no iframe
        const mime = mimeByPath(path);
        if (mime === "application/pdf" || mime.startsWith("image/")) {
          frame.src = url;
        } else {
          // texto: mostra como pre
          const rec = await Vault.getFile(path);
          const blob = rec?.blob;
          let text = "";
          try { text = await blob.text(); } catch { text = "(não foi possível ler como texto)"; }
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

        // limpa
        frame.src = "about:blank";
        frame.srcdoc = "";

        // revoke URL (evita leak)
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

  // =========================================================
  // Auto-mount (Agent workspace) + compat UI_READY BUS
  // =========================================================
  function tryMountLoop(ctx) {
    const cfg = getCfg();
    if (!cfg.autoMountUI) return;

    // tenta montar já e mais tarde (UI pode demorar)
    const ok = UI.mount(ctx);
    if (ok) return;

    setTimeout(() => { try { UI.mount(ctx); } catch {} }, 800);
    setTimeout(() => { try { UI.mount(ctx); } catch {} }, 2000);
  }

  function mountUI(ctx) {
    try {
      tryMountLoop(ctx || { ui: window.RCF_UI });
      return true;
    } catch {
      return false;
    }
  }

  // API global
  window.RCF_ZIP_VAULT = {
    __v10a: true,
    mountUI: (ctx) => mountUI(ctx),
    mount: (ctx) => UI.mount(ctx),
    importZip: (file) => Vault.importZipFile(file),
    list: () => Vault.index(),
    get: (path) => Vault.getFile(path),
    openURL: (path) => Vault.openAsObjectURL(path),
    clearAll: () => Vault.clearAll(),
    cfgGet: () => getCfg(),
    cfgSet: (p) => setCfg(p)
  };

  // Se o UI_READY já aconteceu antes do módulo carregar, monta agora.
  try {
    if (window.__RCF_UI_READY__) {
      mountUI({ ui: window.RCF_UI });
    } else {
      window.addEventListener("RCF:UI_READY", (ev) => {
        try { mountUI(ev?.detail || { ui: window.RCF_UI }); } catch {}
      }, { passive: true });
    }
  } catch {}

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { tryMountLoop({ ui: window.RCF_UI }); }, { once: true });
  } else {
    tryMountLoop({ ui: window.RCF_UI });
  }

  log("OK", "zip_vault.js ready ✅ (v1.0a)");
})();
