/* FILE: /app/js/admin.github.js
   RControl Factory — /app/js/admin.github.js (PADRÃO) — v2.8a
   BASE: v2.7d (seu arquivo completo)
   ADD (PWA LINKS / PAGES):
   - ✅ Seção "PWA Links (Cloudflare Pages)" no modal GitHub
   - ✅ Gera link público com ?who= (ex: Gabriel) e copia pro clipboard
   - ✅ Abre link em nova aba
   - ✅ (Opcional) dispara Deploy Hook (Cloudflare Pages) via POST (se você colar o hook)
   OBS: isso NÃO publica arquivos no Pages sozinho (isso fica pro próximo passo: Push app files).
*/

(() => {
  "use strict";

  if (window.RCF_ADMIN_GH && window.RCF_ADMIN_GH.__v28a) return;

  const UI_OPEN_KEY = "rcf:ghui:open";
  const LS_CFG_KEY  = "rcf:ghcfg";

  // ✅ NOVO: Pages cfg (para links/Deploy Hook)
  const LS_PAGES_KEY = "rcf:pagescfg";

  const log = (lvl, msg) => {
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[GHUI]", lvl, msg); } catch {}
  };

  function safeParse(raw, fallback){
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  }

  function normalizePathInput(p){
    let x = String(p || "").trim();
    if (!x) return "app/import/mother_bundle.json";
    x = x.replace(/^\/+/, "");
    if (x.startsWith("import/")) x = "app/" + x;
    return x;
  }

  function getCfg(){
    if (window.RCF_GH_SYNC?.loadConfig) return window.RCF_GH_SYNC.loadConfig();
    return safeParse(localStorage.getItem(LS_CFG_KEY), {}) || {};
  }

  function saveCfg(cfg){
    if (window.RCF_GH_SYNC?.saveConfig) return window.RCF_GH_SYNC.saveConfig(cfg);
    const safe = {
      owner: String(cfg.owner || "").trim(),
      repo: String(cfg.repo || "").trim(),
      branch: String(cfg.branch || "main").trim(),
      path: String(cfg.path || "app/import/mother_bundle.json").trim(),
      token: String(cfg.token || "").trim(),
    };
    localStorage.setItem(LS_CFG_KEY, JSON.stringify(safe));
    return safe;
  }

  // ✅ PAGES CFG
  function getPagesCfg(){
    const d = safeParse(localStorage.getItem(LS_PAGES_KEY), {}) || {};
    return {
      baseUrl: String(d.baseUrl || "").trim(),          // ex: https://timesheet-lite.pages.dev/
      deployHook: String(d.deployHook || "").trim(),    // ex: https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/...
      whoParam: String(d.whoParam || "who").trim(),     // padrão: who
      whoDefault: String(d.whoDefault || "Gabriel").trim()
    };
  }
  function savePagesCfg(patch){
    const cur = getPagesCfg();
    const next = Object.assign({}, cur, patch || {});
    try { localStorage.setItem(LS_PAGES_KEY, JSON.stringify(next)); } catch {}
    return next;
  }

  // ✅ Fix iOS: não forçar click() em touchend
  function enableClickFallback(container){
    if (!container) return;

    container.addEventListener("click", (ev) => {
      const t = ev.target;
      if (!t) return;
      if (t.tagName === "LABEL") {
        const fid = t.getAttribute("for");
        if (fid) {
          const inp = document.getElementById(fid);
          if (inp && typeof inp.focus === "function") inp.focus();
        }
      }
    }, true);

    container.addEventListener("touchend", (ev) => {
      const t = ev.target;
      if (!t) return;
      const tag = (t.tagName || "").toLowerCase();
      const isInput = tag === "input" || tag === "textarea" || tag === "select";
      if (isInput && typeof t.focus === "function") {
        try { t.focus(); } catch {}
      }
    }, { capture:true, passive:true });
  }

  function findButtonByText(root, txt){
    const t = String(txt || "").trim().toLowerCase();
    const buttons = Array.from((root || document).querySelectorAll("button, a"));
    for (const b of buttons){
      const bt = String(b.textContent || "").trim().toLowerCase();
      if (bt === t) return b;
    }
    return null;
  }

  function findSubnavContainer(){
    const allButtons = Array.from(document.querySelectorAll("button, a"));
    const logsBtn = allButtons.find(b => String(b.textContent||"").trim().toLowerCase() === "logs");
    if (!logsBtn) return null;

    let p = logsBtn.parentElement;
    for (let i = 0; i < 7 && p; i++){
      const btns = p.querySelectorAll("button, a");
      if (btns && btns.length >= 3) return p;
      p = p.parentElement;
    }
    return logsBtn.parentElement || null;
  }

  function ensureModal(){
    if (document.getElementById("rcfGhModal")) return;

    const div = document.createElement("div");
    div.id = "rcfGhModal";
    div.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 999998;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 18px;
      background: rgba(0,0,0,.55);
      backdrop-filter: blur(6px);
    `;

    div.innerHTML = `
      <div id="rcfGhPanel" style="
        width: min(720px, 100%);
        max-height: 78vh;
        overflow: auto;
        border-radius: 16px;
        background: rgba(12,18,32,.92);
        border: 1px solid rgba(255,255,255,.10);
        padding: 14px;
        box-shadow: 0 20px 60px rgba(0,0,0,.45);
      ">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="font-weight:900; font-size:16px; color:#eafff4;">GitHub (Sync)</div>
          <button id="rcfGhClose" type="button" style="
            margin-left:auto;
            padding:8px 12px;
            border-radius: 999px;
            border: 1px solid rgba(255,255,255,.14);
            background: rgba(255,255,255,.08);
            color: #fff;
          ">Fechar</button>
        </div>

        <div style="margin-top:10px; color: rgba(255,255,255,.72); font-size: 12px; line-height:1.35;">
          Bundle padrão: <b>app/import/mother_bundle.json</b><br/>
          (Se digitar <b>import/mother_bundle.json</b>, eu salvo como <b>app/import/mother_bundle.json</b>)
        </div>

        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
          <div style="flex:1; min-width:160px;">
            <div style="font-size:12px; color: rgba(255,255,255,.65); margin-bottom:6px;">Owner</div>
            <input id="ghOwner" style="width:100%; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color:#fff;" placeholder="owner" />
          </div>

          <div style="flex:1; min-width:160px;">
            <div style="font-size:12px; color: rgba(255,255,255,.65); margin-bottom:6px;">Repo</div>
            <input id="ghRepo" style="width:100%; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color:#fff;" placeholder="repo" />
          </div>
        </div>

        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
          <div style="flex:1; min-width:160px;">
            <div style="font-size:12px; color: rgba(255,255,255,.65); margin-bottom:6px;">Branch</div>
            <input id="ghBranch" style="width:100%; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color:#fff;" placeholder="main" />
          </div>

          <div style="flex:1; min-width:160px;">
            <div style="font-size:12px; color: rgba(255,255,255,.65); margin-bottom:6px;">Path</div>
            <input id="ghPath" style="width:100%; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color:#fff;" placeholder="app/import/mother_bundle.json" />
          </div>
        </div>

        <div style="margin-top:10px;">
          <div style="font-size:12px; color: rgba(255,255,255,.65); margin-bottom:6px;">Token (PAT)</div>
          <input id="ghToken" style="width:100%; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color:#fff;" placeholder="ghp_..." />
        </div>

        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
          <button id="btnSaveCfg" type="button" style="padding:10px 12px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); color:#fff;">Salvar cfg</button>
          <button id="btnTestToken" type="button" style="padding:10px 12px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); color:#fff;">Testar token</button>
          <button id="btnPull" type="button" style="padding:10px 12px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); color:#fff;">Pull bundle</button>
        </div>

        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
          <button id="btnPushMother" type="button" style="padding:10px 12px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); color:#fff;">Push Mother Bundle</button>
          <button id="btnMaeUpdate" type="button" style="padding:10px 12px; border-radius:999px; border:1px solid rgba(60,255,170,.25); background: rgba(60,255,170,.10); color:#eafff4;">MAE update</button>
          <button id="btnMaeClear" type="button" style="padding:10px 12px; border-radius:999px; border:1px solid rgba(255,180,80,.25); background: rgba(255,180,80,.10); color:#fff;">MAE clear</button>
        </div>

        <!-- ✅ NOVO: PWA Links / Pages -->
        <div style="
          margin-top:14px;
          padding-top:12px;
          border-top: 1px solid rgba(255,255,255,.10);
        ">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="font-weight:900; font-size:14px; color:#eafff4;">PWA Links (Cloudflare Pages)</div>
            <div style="font-size:12px; color: rgba(255,255,255,.65);">gera link pro Gabriel instalar no iPhone</div>
          </div>

          <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
            <div style="flex:1; min-width:220px;">
              <div style="font-size:12px; color: rgba(255,255,255,.65); margin-bottom:6px;">Base URL (Pages)</div>
              <input id="pgBaseUrl" style="width:100%; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color:#fff;"
                placeholder="https://timesheet-lite.pages.dev/" />
            </div>
            <div style="width:160px; min-width:150px;">
              <div style="font-size:12px; color: rgba(255,255,255,.65); margin-bottom:6px;">Param</div>
              <input id="pgWhoParam" style="width:100%; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color:#fff;"
                placeholder="who" />
            </div>
            <div style="width:190px; min-width:160px;">
              <div style="font-size:12px; color: rgba(255,255,255,.65); margin-bottom:6px;">Nome (default)</div>
              <input id="pgWhoName" style="width:100%; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color:#fff;"
                placeholder="Gabriel" />
            </div>
          </div>

          <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
            <button id="btnPgSave" type="button" style="padding:10px 12px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); color:#fff;">Salvar Pages cfg</button>
            <button id="btnPgCopyBase" type="button" style="padding:10px 12px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); color:#fff;">Copiar Base</button>
            <button id="btnPgCopyWho" type="button" style="padding:10px 12px; border-radius:999px; border:1px solid rgba(60,255,170,.25); background: rgba(60,255,170,.10); color:#eafff4;">Copiar Link do Nome</button>
            <button id="btnPgOpenWho" type="button" style="padding:10px 12px; border-radius:999px; border:1px solid rgba(255,180,80,.25); background: rgba(255,180,80,.10); color:#fff;">Abrir Link</button>
          </div>

          <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
            <div style="flex:1; min-width:220px;">
              <div style="font-size:12px; color: rgba(255,255,255,.65); margin-bottom:6px;">Deploy Hook (opcional)</div>
              <input id="pgDeployHook" style="width:100%; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color:#fff;"
                placeholder="https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/..." />
            </div>
            <button id="btnPgDeploy" type="button" style="align-self:flex-end;padding:10px 12px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); color:#fff;">Disparar Deploy</button>
          </div>

          <div style="margin-top:8px; color: rgba(255,255,255,.55); font-size: 11px; line-height:1.35;">
            Como o Gabriel usa: abrir link no Safari → Share → <b>Add to Home Screen</b>.
          </div>
        </div>

        <!-- ✅ Fillers UI -->
        <div style="
          margin-top:14px;
          padding-top:12px;
          border-top: 1px solid rgba(255,255,255,.10);
        ">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="font-weight:900; font-size:14px; color:#eafff4;">Fillers</div>
            <div id="fillerCount" style="font-size:12px; color: rgba(255,255,255,.65);">—</div>
            <button id="btnFillersRefresh" type="button" style="
              margin-left:auto;
              padding:8px 12px;
              border-radius:999px;
              border:1px solid rgba(255,255,255,.14);
              background: rgba(255,255,255,.08);
              color:#fff;
            ">Atualizar</button>
          </div>

          <div style="margin-top:10px;">
            <div style="position:relative;">
              <div style="
                position:absolute;
                left:10px;
                top:50%;
                transform: translateY(-50%);
                opacity:.75;
                font-size:14px;
              ">🔎</div>
              <input id="fillerSearch" style="
                width:100%;
                padding:10px 12px;
                padding-left:34px;
                border-radius:12px;
                border:1px solid rgba(255,255,255,.12);
                background: rgba(0,0,0,.25);
                color:#fff;
              " placeholder="Pesquisar filler (ex: app/js/core/...)"/>
            </div>
          </div>

          <div id="fillerList" style="
            margin-top:10px;
            padding:10px;
            border-radius:12px;
            background: rgba(0,0,0,.20);
            border:1px solid rgba(255,255,255,.08);
            max-height: 240px;
            overflow:auto;
          ">
            <div style="color: rgba(255,255,255,.70); font-size:12px;">Carregando…</div>
          </div>

          <div style="margin-top:8px; color: rgba(255,255,255,.55); font-size: 11px; line-height:1.35;">
            Fonte: <b>mother_bundle_local</b> + <b>VFS overrides</b> (se disponível). Clique em um item para copiar o path.
          </div>
        </div>

        <pre id="ghOut" style="
          margin-top:12px;
          padding:12px;
          border-radius:12px;
          background: rgba(0,0,0,.25);
          border:1px solid rgba(255,255,255,.08);
          color: rgba(255,255,255,.85);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
          font-size: 12px;
          white-space: pre-wrap;
        ">Pronto.</pre>
      </div>
    `;

    document.body.appendChild(div);
    enableClickFallback(div);

    div.addEventListener("click", (ev) => {
      if (ev.target === div) closeModal();
    });

    document.getElementById("rcfGhClose").addEventListener("click", closeModal);

    function setGHOut(t){
      const out = document.getElementById("ghOut");
      if (out) out.textContent = String(t || "Pronto.");
    }

    // ✅ PATCH: merge com cfg salvo (não deixa owner/repo virar vazio)
    function readInputsMerged(){
      const cur = getCfg() || {};
      const ownerIn  = String(document.getElementById("ghOwner")?.value || "").trim();
      const repoIn   = String(document.getElementById("ghRepo")?.value || "").trim();
      const branchIn = String(document.getElementById("ghBranch")?.value || "").trim();
      const pathIn   = String(document.getElementById("ghPath")?.value || "").trim();
      const tokenIn  = String(document.getElementById("ghToken")?.value || "").trim();

      return {
        owner:  ownerIn  || String(cur.owner || "").trim(),
        repo:   repoIn   || String(cur.repo || "").trim(),
        branch: (branchIn || String(cur.branch || "main")).trim(),
        path:   normalizePathInput(pathIn || String(cur.path || "app/import/mother_bundle.json")),
        token:  tokenIn  || String(cur.token || "").trim(),
      };
    }

    function fillInputs(cfg){
      document.getElementById("ghOwner").value = cfg.owner || "";
      document.getElementById("ghRepo").value = cfg.repo || "";
      document.getElementById("ghBranch").value = cfg.branch || "main";
      document.getElementById("ghPath").value = cfg.path || "app/import/mother_bundle.json";
      document.getElementById("ghToken").value = cfg.token || "";
    }

    // preencher ao criar
    fillInputs(getCfg());

    // ✅ preencher Pages cfg
    function fillPagesInputs(){
      const p = getPagesCfg();
      const base = document.getElementById("pgBaseUrl");
      const hook = document.getElementById("pgDeployHook");
      const prm  = document.getElementById("pgWhoParam");
      const who  = document.getElementById("pgWhoName");
      if (base) base.value = p.baseUrl || "";
      if (hook) hook.value = p.deployHook || "";
      if (prm)  prm.value  = p.whoParam || "who";
      if (who)  who.value  = p.whoDefault || "Gabriel";
    }
    fillPagesInputs();

    let busy = false;
    const lock = async (fn) => {
      if (busy) return;
      busy = true;
      try { await fn(); }
      finally { busy = false; }
    };

    async function robustMaeClear(){
      if (typeof window.RCF_MAE?.clear === "function") return await window.RCF_MAE.clear();

      if (typeof window.RCF_VFS_OVERRIDES?.clearOverrides === "function") return await window.RCF_VFS_OVERRIDES.clearOverrides();
      if (typeof window.RCF_VFS_OVERRIDES?.clear === "function") return await window.RCF_VFS_OVERRIDES.clear();

      if (typeof window.RCF_VFS?.clearOverrides === "function") return await window.RCF_VFS.clearOverrides();
      if (typeof window.RCF_VFS?.clearAll === "function") return await window.RCF_VFS.clearAll();
      if (typeof window.RCF_VFS?.clear === "function") return await window.RCF_VFS.clear();

      throw new Error("MAE clear: missing");
    }

    // ----------------------------
    // ✅ Fillers (paths) loader/UI
    // ----------------------------
    let __fillersAll = [];   // lista completa (sorted)
    let __fillersLastMeta = null;

    function el(id){ return document.getElementById(id); }

    function normPathForList(p){
      let x = String(p || "").trim();
      if (!x) return "";
      x = x.replace(/^\/+/, "");
      return x;
    }

    function uniqSorted(arr){
      const m = new Map();
      for (const it of (arr || [])) {
        const k = String(it || "").trim();
        if (!k) continue;
        if (!m.has(k)) m.set(k, true);
      }
      return Array.from(m.keys()).sort((a,b) => a.localeCompare(b));
    }

    async function getBundleLocalPaths(){
      try {
        const raw = localStorage.getItem("rcf:mother_bundle_local") || "";
        const j = safeParse(raw, null);
        const files = Array.isArray(j?.files) ? j.files : [];
        const out = [];
        for (const f of files){
          const p = normPathForList(f?.path || "");
          if (p) out.push(p);
        }
        return { ok:true, paths: out, from: "mother_bundle_local", meta: { filesCount: files.length } };
      } catch (e) {
        return { ok:false, paths: [], from: "mother_bundle_local", err: String(e?.message || e) };
      }
    }

    async function getOverridesPaths(){
      try {
        const O = window.RCF_VFS_OVERRIDES;
        if (!O) return { ok:false, paths: [], from: "overrides", err: "RCF_VFS_OVERRIDES ausente" };

        if (typeof O.listOverridesSafe === "function") {
          const r = await O.listOverridesSafe({ allowStale:true });
          const res = r?.res || null;
          const items = Array.isArray(res?.items) ? res.items
            : Array.isArray(res?.list) ? res.list
            : Array.isArray(res?.paths) ? res.paths
            : Array.isArray(res?.keys) ? res.keys
            : null;

          const out = [];
          if (Array.isArray(items)) {
            for (const it of items){
              const p = normPathForList(
                (typeof it === "string") ? it :
                (it?.path != null) ? it.path :
                (it?.key != null) ? it.key :
                ""
              );
              if (p) out.push(p);
            }
          }
          return { ok: true, paths: out, from: "overrides", meta: { itemsCount: out.length, mode: r?.from || "safe" } };
        }

        if (typeof O.listOverrides === "function") {
          const res = await O.listOverrides();
          const items = Array.isArray(res?.items) ? res.items
            : Array.isArray(res?.list) ? res.list
            : Array.isArray(res?.paths) ? res.paths
            : Array.isArray(res?.keys) ? res.keys
            : null;

          const out = [];
          if (Array.isArray(items)) {
            for (const it of items){
              const p = normPathForList(
                (typeof it === "string") ? it :
                (it?.path != null) ? it.path :
                (it?.key != null) ? it.key :
                ""
              );
              if (p) out.push(p);
            }
          }
          return { ok:true, paths: out, from: "overrides", meta: { itemsCount: out.length, mode: "listOverrides" } };
        }

        return { ok:false, paths: [], from: "overrides", err: "sem listOverrides/listOverridesSafe" };
      } catch (e) {
        return { ok:false, paths: [], from: "overrides", err: String(e?.message || e) };
      }
    }

    async function refreshFillers(){
      const listEl = el("fillerList");
      const countEl = el("fillerCount");
      if (listEl) listEl.innerHTML = `<div style="color: rgba(255,255,255,.70); font-size:12px;">Carregando…</div>`;

      const a = await getBundleLocalPaths();
      const b = await getOverridesPaths();

      const all = uniqSorted([ ...(a.paths || []), ...(b.paths || []) ]);
      __fillersAll = all;

      __fillersLastMeta = {
        at: Date.now(),
        mother_ok: !!a.ok,
        mother_count: (a.paths || []).length,
        overrides_ok: !!b.ok,
        overrides_count: (b.paths || []).length,
        overrides_err: b.err || "",
        mother_err: a.err || ""
      };

      if (countEl) {
        const s =
          `Total: ${all.length}` +
          ` | bundle_local: ${__fillersLastMeta.mother_count}` +
          ` | overrides: ${__fillersLastMeta.overrides_count}` +
          ((!b.ok && b.err) ? ` | WARN(overrides): ${b.err}` : "") +
          ((!a.ok && a.err) ? ` | WARN(bundle): ${a.err}` : "");
        countEl.textContent = s;
      }

      renderFillers(el("fillerSearch")?.value || "");
    }

    function tryCopy(text){
      const t = String(text || "");
      if (!t) return false;

      try {
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(t).catch(() => {});
          return true;
        }
      } catch {}

      try {
        const ta = document.createElement("textarea");
        ta.value = t;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try { document.execCommand("copy"); } catch {}
        document.body.removeChild(ta);
        return true;
      } catch {}

      return false;
    }

    function renderFillers(filterText){
      const listEl = el("fillerList");
      if (!listEl) return;

      const q = String(filterText || "").trim().toLowerCase();
      const base = __fillersAll || [];
      const shown = q ? base.filter(p => String(p).toLowerCase().includes(q)) : base;

      if (!shown.length) {
        listEl.innerHTML = `<div style="color: rgba(255,255,255,.70); font-size:12px;">Nenhum filler encontrado.</div>`;
        return;
      }

      const rows = shown.slice(0, 1200).map((p) => {
        const safeP = String(p).replace(/</g,"&lt;").replace(/>/g,"&gt;");
        return `
          <div class="rcfFillerRow" data-path="${safeP}" style="
            display:flex;
            gap:10px;
            align-items:center;
            padding:8px 10px;
            border-radius:10px;
            border:1px solid rgba(255,255,255,.06);
            background: rgba(255,255,255,.04);
            margin-bottom:8px;
            cursor:pointer;
          ">
            <div style="font-size:12px; color: rgba(255,255,255,.90); word-break: break-all; flex:1;">${safeP}</div>
            <div style="font-size:11px; color: rgba(255,255,255,.55);">copiar</div>
          </div>
        `;
      }).join("");

      listEl.innerHTML = rows;

      try {
        Array.from(listEl.querySelectorAll(".rcfFillerRow")).forEach((row) => {
          row.addEventListener("click", () => {
            const p = row.getAttribute("data-path") || "";
            const ok = tryCopy(p);
            setGHOut(ok ? ("OK: copied -> " + p) : ("INFO: path -> " + p));
          }, { passive:true });
        });
      } catch {}
    }

    // wiring fillers UI
    try {
      el("btnFillersRefresh")?.addEventListener("click", () => lock(async () => {
        try {
          await refreshFillers();
        } catch (e) {
          setGHOut("ERR: fillers refresh :: " + (e?.message || e));
        }
      }));

      el("fillerSearch")?.addEventListener("input", () => {
        renderFillers(el("fillerSearch")?.value || "");
      });
    } catch {}

    // carregar logo que criar
    try { refreshFillers(); } catch {}

    // ✅ NOVO: PAGES UI wiring
    function normalizeBaseUrl(u){
      let x = String(u || "").trim();
      if (!x) return "";
      // garante https
      if (!/^https?:\/\//i.test(x)) x = "https://" + x;
      // garante trailing slash
      if (!x.endsWith("/")) x += "/";
      return x;
    }

    function buildWhoLink(){
      const base = normalizeBaseUrl(el("pgBaseUrl")?.value || "");
      const prm  = String(el("pgWhoParam")?.value || "who").trim() || "who";
      const who  = String(el("pgWhoName")?.value || "Gabriel").trim() || "Gabriel";
      if (!base) return "";
      const sep = base.includes("?") ? "&" : "?";
      return base + sep + encodeURIComponent(prm) + "=" + encodeURIComponent(who);
    }

    el("btnPgSave")?.addEventListener("click", () => {
      const baseUrl = normalizeBaseUrl(el("pgBaseUrl")?.value || "");
      const deployHook = String(el("pgDeployHook")?.value || "").trim();
      const whoParam = String(el("pgWhoParam")?.value || "who").trim() || "who";
      const whoDefault = String(el("pgWhoName")?.value || "Gabriel").trim() || "Gabriel";

      savePagesCfg({ baseUrl, deployHook, whoParam, whoDefault });
      setGHOut("OK: pagescfg saved ✅");
    });

    el("btnPgCopyBase")?.addEventListener("click", () => {
      const base = normalizeBaseUrl(el("pgBaseUrl")?.value || "");
      if (!base) return setGHOut("WARN: preencha Base URL (Pages).");
      const ok = tryCopy(base);
      setGHOut(ok ? ("OK: copied base -> " + base) : ("INFO: base -> " + base));
    });

    el("btnPgCopyWho")?.addEventListener("click", () => {
      const link = buildWhoLink();
      if (!link) return setGHOut("WARN: preencha Base URL (Pages).");
      const ok = tryCopy(link);
      setGHOut(ok ? ("OK: copied link -> " + link) : ("INFO: link -> " + link));
    });

    el("btnPgOpenWho")?.addEventListener("click", () => {
      const link = buildWhoLink();
      if (!link) return setGHOut("WARN: preencha Base URL (Pages).");
      try {
        window.open(link, "_blank", "noopener,noreferrer");
        setGHOut("OK: opened -> " + link);
      } catch {
        setGHOut("INFO: link -> " + link);
      }
    });

    el("btnPgDeploy")?.addEventListener("click", () => lock(async () => {
      const hook = String(el("pgDeployHook")?.value || "").trim();
      if (!hook) return setGHOut("WARN: cole o Deploy Hook do Cloudflare Pages (opcional).");

      setGHOut("Deploy: disparando…");
      try {
        // Pages Deploy Hook: POST simples
        const res = await fetch(hook, { method: "POST", mode: "cors" }).catch(() => null);
        if (res && res.ok) {
          setGHOut("OK: deploy hook disparado ✅");
        } else {
          // alguns hooks respondem sem CORS/ok visível no browser
          setGHOut("INFO: deploy hook enviado (resposta pode ser bloqueada por CORS). ✅");
        }
      } catch (e) {
        setGHOut("INFO: deploy hook enviado (ou bloqueado por CORS). " + (e?.message || e));
      }
      // salva hook/base atual
      try {
        savePagesCfg({
          baseUrl: normalizeBaseUrl(el("pgBaseUrl")?.value || ""),
          deployHook: hook,
          whoParam: String(el("pgWhoParam")?.value || "who").trim() || "who",
          whoDefault: String(el("pgWhoName")?.value || "Gabriel").trim() || "Gabriel"
        });
      } catch {}
    }));

    document.getElementById("btnSaveCfg").addEventListener("click", () => {
      const cfg = readInputsMerged();
      saveCfg(cfg);
      setGHOut("OK: ghcfg saved");
      log("ok", "OK: ghcfg saved");
    });

    document.getElementById("btnTestToken").addEventListener("click", () => lock(async () => {
      try {
        const cfg = readInputsMerged();
        saveCfg(cfg);

        setGHOut("Testando token…");
        if (!window.RCF_GH_SYNC?.test) throw new Error("RCF_GH_SYNC.test ausente");
        const res = await window.RCF_GH_SYNC.test(cfg);

        setGHOut(String(res || "OK"));
        log("ok", "OK: token test ok");
      } catch (e) {
        setGHOut("ERR: " + (e?.message || e));
        log("err", "ERR: token test fail :: " + (e?.message || e));
      }
    }));

    document.getElementById("btnPull").addEventListener("click", () => lock(async () => {
      try {
        const cfg = readInputsMerged();
        saveCfg(cfg);

        setGHOut("Pull…");
        if (!window.RCF_GH_SYNC?.pull) throw new Error("RCF_GH_SYNC.pull ausente");
        const txt = await window.RCF_GH_SYNC.pull(cfg);

        setGHOut("OK: pull ok (bytes=" + String(txt || "").length + ")");
        log("ok", "OK: gh pull ok");
      } catch (e) {
        setGHOut("ERR: " + (e?.message || e));
        log("err", "ERR: gh pull err :: " + (e?.message || e));
      }
    }));

    document.getElementById("btnPushMother").addEventListener("click", () => lock(async () => {
      try {
        const cfg = readInputsMerged();
        saveCfg(cfg);

        setGHOut("Push Mother Bundle…");
        if (!window.RCF_GH_SYNC?.pushMotherBundle) throw new Error("RCF_GH_SYNC.pushMotherBundle ausente");
        await window.RCF_GH_SYNC.pushMotherBundle(cfg);

        setGHOut("OK: GitHub: pushMotherBundle ok");
        log("ok", "OK: GitHub: pushMotherBundle ok");
      } catch (e) {
        setGHOut("ERR: " + (e?.message || e));
        log("err", "ERR: pushMotherBundle fail :: " + (e?.message || e));
      }
    }));

    document.getElementById("btnMaeUpdate").addEventListener("click", () => lock(async () => {
      try {
        setGHOut("MAE update…");
        if (!window.RCF_MAE?.updateFromGitHub) throw new Error("RCF_MAE.updateFromGitHub ausente");

        const res = await window.RCF_MAE.updateFromGitHub({
          onProgress: (p) => {
            if (p?.step === "apply_progress") setGHOut(`Aplicando… ${p.done}/${p.total}`);
            if (p?.step === "apply_done") setGHOut(`OK: aplicado ${p.done}/${p.total}`);
          }
        });

        setGHOut("OK: mae update ok " + JSON.stringify(res));
        log("ok", "OK: mae update ok");
      } catch (e) {
        setGHOut("ERR: " + (e?.message || e));
        log("err", "ERR: mae update err :: " + (e?.message || e));
      }
    }));

    document.getElementById("btnMaeClear").addEventListener("click", () => lock(async () => {
      try {
        setGHOut("MAE clear…");
        const r = await robustMaeClear();
        setGHOut("OK: mae clear ok " + (r ? JSON.stringify(r) : ""));
        log("ok", "OK: mae clear ok");
      } catch (e) {
        setGHOut("ERR: " + (e?.message || e));
        log("err", "ERR: mae clear err :: " + (e?.message || e));
      }
    }));

    if (localStorage.getItem(UI_OPEN_KEY) === "1") openModal();
  }

  function openModal(){
    ensureModal();
    const m = document.getElementById("rcfGhModal");
    if (m) m.style.display = "flex";
    localStorage.setItem(UI_OPEN_KEY, "1");

    try {
      const cfg = getCfg();
      document.getElementById("ghOwner").value = cfg.owner || "";
      document.getElementById("ghRepo").value = cfg.repo || "";
      document.getElementById("ghBranch").value = cfg.branch || "main";
      document.getElementById("ghPath").value = cfg.path || "app/import/mother_bundle.json";
      document.getElementById("ghToken").value = cfg.token || "";
    } catch {}

    // ✅ restore pages cfg toda vez que abrir
    try {
      const p = getPagesCfg();
      const base = document.getElementById("pgBaseUrl");
      const hook = document.getElementById("pgDeployHook");
      const prm  = document.getElementById("pgWhoParam");
      const who  = document.getElementById("pgWhoName");
      if (base) base.value = p.baseUrl || "";
      if (hook) hook.value = p.deployHook || "";
      if (prm)  prm.value  = p.whoParam || "who";
      if (who)  who.value  = p.whoDefault || "Gabriel";
    } catch {}
  }

  function closeModal(){
    const m = document.getElementById("rcfGhModal");
    if (m) m.style.display = "none";
    localStorage.setItem(UI_OPEN_KEY, "0");
  }

  function ensureGitHubButton(){
    const sub = findSubnavContainer();
    if (!sub) return false;

    const existing = Array.from(sub.querySelectorAll("button, a")).find(b =>
      String(b.textContent||"").trim().toLowerCase() === "github"
    );
    if (existing) return true;

    const logsBtn = findButtonByText(sub, "Logs") || findButtonByText(sub, "logs");
    if (!logsBtn) return false;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "GitHub";

    try {
      if (logsBtn.className) btn.className = logsBtn.className;
    } catch {}

    btn.addEventListener("click", () => {
      const m = document.getElementById("rcfGhModal");
      const isOpen = m && m.style.display !== "none";
      if (isOpen) closeModal();
      else openModal();
    });

    try { logsBtn.insertAdjacentElement("afterend", btn); }
    catch { sub.appendChild(btn); }

    log("ok", "GitHub button injected ✅");
    return true;
  }

  let __started = false;
  let __obs = null;

  function startObserver(){
    if (__obs) return;
    __obs = new MutationObserver(() => {
      try { ensureGitHubButton(); } catch {}
    });
    try { __obs.observe(document.body, { childList: true, subtree: true }); } catch {}
  }

  function lightRetry(){
    let tries = 0;
    const tick = () => {
      tries++;
      try { ensureGitHubButton(); } catch {}
      if (tries < 40) setTimeout(tick, 250);
    };
    tick();
  }

  function boot(){
    if (__started) return;
    __started = true;

    ensureModal();
    startObserver();
    lightRetry();

    window.addEventListener("hashchange", () => { try { ensureGitHubButton(); } catch {} });
    window.addEventListener("popstate",  () => { try { ensureGitHubButton(); } catch {} });
  }

  window.RCF_ADMIN_GH = { __v28a: true, boot, openModal, closeModal };

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", boot, { once:true });
  } else {
    boot();
  }

  log("ok", "admin.github.js ready ✅ (v2.8a)");
})();
