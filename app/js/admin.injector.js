/* RControl Factory — /app/js/admin.injector.js (PADRÃO) — v1.0a
   Injector/Scanner robusto:
   - Scan em cascata:
     A) runtime_vfs (se existir list)
     B) mother_bundle_local (RCF_MAE.getLocalBundleText -> localStorage rcf:mother_bundle_local -> localStorage mother_bundle_local)
     C) DOM anchors (fallback garantido targets>=2)
   - Fix principal: não pode dar mother_bundle_local files=0 se a Mãe salvou filesCount=8

   PATCH (Fillers no Admin no lugar do Log):
   - Cria painel "Fillers" (busca + copiar) dentro do Admin
   - Tenta localizar a seção "Log:" do Admin (pela label) e encaixar o Fillers ali
   - Se achar, oculta o conteúdo do log pra não esticar a página
*/
(() => {
  "use strict";

  if (window.RCF_INJECTOR && window.RCF_INJECTOR.__v10a) return;

  const LS_BUNDLE_LOCAL = "rcf:mother_bundle_local";
  const LS_OVR_MAP = "rcf:RCF_OVERRIDES_MAP";

  const log = (lvl, msg) => {
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[INJECTOR]", lvl, msg); } catch {}
  };

  function safeParse(raw, fb) {
    try { return raw ? JSON.parse(raw) : fb; } catch { return fb; }
  }

  // ------------------------------------------------------------
  // Copy helper (iOS safe-ish)
  // ------------------------------------------------------------
  async function copyText(txt){
    const t = String(txt || "");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(t);
        return true;
      }
    } catch {}
    try {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.setAttribute("readonly", "readonly");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch {}
    return false;
  }

  // ------------------------------------------------------------
  // B) mother_bundle_local robusto (FIX)
  // ------------------------------------------------------------
  function readMotherBundleLocal() {
    let raw = "";
    let source = "";

    // 1) via Mãe (melhor)
    try {
      if (window.RCF_MAE?.getLocalBundleText) {
        const v = window.RCF_MAE.getLocalBundleText();
        raw = String(v || "");
        if (raw.trim()) source = "RCF_MAE.getLocalBundleText";
      }
    } catch {}

    // 2) via localStorage (novo padrão)
    if (!raw.trim()) {
      raw = String(localStorage.getItem(LS_BUNDLE_LOCAL) || "");
      if (raw.trim()) source = "localStorage:rcf:mother_bundle_local";
    }

    // 3) compat antigo
    if (!raw.trim()) {
      raw = String(localStorage.getItem("mother_bundle_local") || "");
      if (raw.trim()) source = "localStorage:mother_bundle_local";
    }

    raw = String(raw || "").trim();
    if (!raw) return { ok: false, files: [], source: "empty", rawLen: 0 };

    const j = safeParse(raw, null);
    if (!j) return { ok: false, files: [], source: source + ":json_parse_fail", rawLen: raw.length };

    // aceita vários formatos
    const arr =
      (Array.isArray(j?.files) && j.files) ||
      (Array.isArray(j?.bundle?.files) && j.bundle.files) ||
      (Array.isArray(j?.data?.files) && j.data.files) ||
      [];

    // normaliza: path/content/contentType
    const files = (arr || []).map(f => {
      const path = String(f?.path || f?.name || "").trim();
      if (!path) return null;

      const content =
        (f?.content != null) ? String(f.content) :
        (f?.text != null) ? String(f.text) :
        (f?.body != null) ? String(f.body) :
        "";

      const contentType = String(f?.contentType || f?.type || "");
      return { path, content, contentType };
    }).filter(Boolean);

    return { ok: true, files, source, rawLen: raw.length, rawKeys: Object.keys(j || {}) };
  }

  // ------------------------------------------------------------
  // A) runtime_vfs (se existir list no overrides)
  // ------------------------------------------------------------
  async function readRuntimeVfsList() {
    try {
      if (window.RCF_VFS?.list && typeof window.RCF_VFS.list === "function") {
        const res = await window.RCF_VFS.list();
        const files = Array.isArray(res?.files) ? res.files : [];
        return { ok: true, files, source: "runtime_vfs" };
      }
    } catch {}
    return { ok: false, files: [], source: "runtime_vfs_missing" };
  }

  // ------------------------------------------------------------
  // C) DOM anchors fallback (garante targets>=2)
  // ------------------------------------------------------------
  function domAnchorsTargets() {
    const path = "/runtime/document.html";
    return {
      ok: true,
      files: [{ path, content: "<!-- dom anchors only -->", contentType: "text/html" }],
      targets: [
        `${path}::HEAD_END`,
        `${path}::BODY_END`
      ],
      source: "dom_anchors_only"
    };
  }

  // ------------------------------------------------------------
  // Target map: a partir do bundle
  // ------------------------------------------------------------
  function buildTargetsFromFiles(files) {
    const hasIndex = (files || []).some(f => {
      const p = String(f.path || "");
      return p.endsWith("index.html") || p === "/index.html";
    });
    const base = hasIndex ? "/index.html" : "/runtime/document.html";
    return [
      `${base}::HEAD_END`,
      `${base}::BODY_END`,
    ];
  }

  // ------------------------------------------------------------
  // Scan principal (cascata)
  // ------------------------------------------------------------
  async function scan() {
    const a = await readRuntimeVfsList();
    if (a.ok && a.files.length > 0) {
      log("info", `scan: A:runtime_vfs files=${a.files.length}`);
      return { ok: true, source: "A:runtime_vfs", files: a.files, targets: buildTargetsFromFiles(a.files) };
    }
    log("warn", `scan: A:runtime_vfs files=0 => FALHA scan fallback -> mother_bundle`);

    const b = readMotherBundleLocal();
    if (b.ok && b.files.length > 0) {
      log("info", `scan: B:mother_bundle_local files=${b.files.length} source=${b.source}`);
      return { ok: true, source: "B:mother_bundle_local", files: b.files, targets: buildTargetsFromFiles(b.files) };
    }
    log("warn", `scan: B:mother_bundle_local files=0 => FALHA scan fallback -> DOM anchors`);

    const c = domAnchorsTargets();
    log("info", `scan: C:dom_anchors_only files=1`);
    return { ok: true, source: "C:dom_anchors_only", files: c.files, targets: c.targets };
  }

  // ------------------------------------------------------------
  // UI helpers (dropdown)
  // ------------------------------------------------------------
  function updateDropdown(targets) {
    const sel = document.getElementById("rcfInjectorTarget");
    if (!sel) return;

    sel.innerHTML = "";
    (targets || []).forEach(t => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      sel.appendChild(opt);
    });

    if (targets && targets.length) sel.value = targets[0];
    log("info", `CP3 ui: dropdown updated auto-selected=${sel.value || ""}`);
  }

  // ------------------------------------------------------------
  // Apply (injeta via RCF_VFS.put se existir)
  // ------------------------------------------------------------
  async function applyInjection({ target, mode, content }) {
    if (!window.RCF_VFS?.put) {
      throw new Error("VFS.put ausente");
    }
    const [path] = String(target || "").split("::");
    const key = String(path || "").trim() || "/index.html";
    const payload = String(content ?? "");

    await window.RCF_VFS.put(key, payload, "text/html; charset=utf-8");

    log("ok", `apply: OK ${key} ${target} mode=${mode || "INSERT"} write=vfs.put`);
    return { ok: true };
  }

  // ------------------------------------------------------------
  // Fillers (bundle_local + overrides)
  // ------------------------------------------------------------
  function readBundleLocalPaths(){
    try {
      const raw = String(localStorage.getItem(LS_BUNDLE_LOCAL) || "").trim();
      if (!raw) return [];
      const j = safeParse(raw, null);
      const files = Array.isArray(j?.files) ? j.files : [];
      const paths = files.map(f => String(f?.path || "").trim()).filter(Boolean);
      const uniq = Array.from(new Set(paths));
      uniq.sort((a,b) => a.localeCompare(b));
      return uniq;
    } catch {
      return [];
    }
  }

  async function readOverridesPaths(){
    // tenta por API (melhor)
    try {
      const O = window.RCF_VFS_OVERRIDES;
      if (O?.listOverridesSafe) {
        const r = await O.listOverridesSafe({ allowStale:true });
        const res = r?.res || r || null;

        const items = Array.isArray(res?.items) ? res.items
          : Array.isArray(res?.list) ? res.list
          : Array.isArray(res?.paths) ? res.paths
          : Array.isArray(res?.keys) ? res.keys
          : null;

        if (Array.isArray(items)) {
          const out = items.map(it => {
            if (typeof it === "string") return it;
            if (it?.path != null) return String(it.path);
            if (it?.key != null) return String(it.key);
            return "";
          }).map(s => String(s || "").trim()).filter(Boolean);

          const uniq = Array.from(new Set(out));
          uniq.sort((a,b) => a.localeCompare(b));
          return uniq;
        }
      }
    } catch {}

    // fallback: map LS do app.js
    try {
      const map = safeParse(localStorage.getItem(LS_OVR_MAP), null);
      if (map && typeof map === "object") {
        const keys = Object.keys(map).map(k => String(k||"").trim()).filter(Boolean);
        keys.sort((a,b) => a.localeCompare(b));
        return keys;
      }
    } catch {}

    return [];
  }

  // ------------------------------------------------------------
  // Encaixar Fillers no lugar do Log do Admin (heurística)
  // ------------------------------------------------------------
  function findAdminRoot(){
    return document.querySelector("#view-admin, #viewAdmin, [data-view='admin'], .view-admin") || document.body;
  }

  function findLogSlot(){
    const root = findAdminRoot();
    const nodes = Array.from(root.querySelectorAll("div, p, span, label, h1, h2, h3, h4, h5, pre"));
    for (const n of nodes){
      const t = String(n.textContent || "").trim().toLowerCase();
      // pega labels tipo "Log:" (do print)
      if (t === "log:" || t.startsWith("log:")) {
        // o slot geralmente é o container do bloco todo
        // sobe um pouco pra pegar o card/section
        let p = n.parentElement;
        for (let i=0; i<4 && p; i++){
          // se esse container tem um <pre> grande (logs), é ele
          const pre = p.querySelector("pre, textarea, .mono, .logs");
          if (pre) return { labelNode:n, container:p, logNode:pre };
          p = p.parentElement;
        }
        return { labelNode:n, container:n.parentElement || root, logNode:null };
      }
    }
    return null;
  }

  function renderFillersPanel(targetHost){
    if (!targetHost) return;

    // evita duplicar
    if (document.getElementById("rcfFillersAdminWrap")) return;

    const wrap = document.createElement("div");
    wrap.id = "rcfFillersAdminWrap";
    wrap.style.cssText = `
      margin-top:10px;
      padding:10px;
      border-radius:12px;
      border:1px solid rgba(255,255,255,.12);
      background: rgba(0,0,0,.12);
      color:#fff;
      font-size:12px;
    `;

    wrap.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <b>Fillers</b>
        <div id="rcfFillersMeta" style="opacity:.8;">Total: 0 | bundle_local: 0 | overrides: 0</div>
        <button id="rcfFillersRefresh" type="button" style="
          margin-left:auto;
          padding:6px 10px;
          border-radius:999px;
          border:1px solid rgba(255,255,255,.14);
          background:rgba(255,255,255,.08);
          color:#fff;
        ">Atualizar</button>
      </div>

      <div style="margin-top:8px;">
        <input id="rcfFillersSearch" style="
          width:100%;
          padding:8px 10px;
          border-radius:10px;
          border:1px solid rgba(255,255,255,.14);
          background:rgba(0,0,0,.25);
          color:#fff;
        " placeholder="🔎 Pesquisar filler (ex: app/js/core/...)" />
      </div>

      <div id="rcfFillersList" style="
        margin-top:10px;
        display:flex;
        flex-direction:column;
        gap:8px;
        max-height: 260px;
        overflow:auto;
      "></div>
    `;

    targetHost.appendChild(wrap);

    const metaEl = document.getElementById("rcfFillersMeta");
    const listEl = document.getElementById("rcfFillersList");
    const searchEl = document.getElementById("rcfFillersSearch");
    const btnRefresh = document.getElementById("rcfFillersRefresh");

    let bundlePaths = [];
    let overridePaths = [];
    let all = [];

    function renderList(q){
      const query = String(q || "").trim().toLowerCase();
      const base = query ? all.filter(p => p.toLowerCase().includes(query)) : all;

      listEl.innerHTML = "";
      const max = 120; // mobile
      const slice = base.slice(0, max);

      for (const p of slice){
        const row = document.createElement("div");
        row.style.cssText = `
          display:flex;
          align-items:center;
          gap:10px;
          padding:10px 12px;
          border-radius:12px;
          border:1px solid rgba(255,255,255,.10);
          background: rgba(0,0,0,.18);
        `;

        const left = document.createElement("div");
        left.style.cssText = `
          flex:1; min-width:0;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size:12px;
          opacity:.92;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        `;
        left.textContent = p;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "copiar";
        btn.style.cssText = `
          padding:8px 10px;
          border-radius:999px;
          border:1px solid rgba(255,255,255,.14);
          background:rgba(255,255,255,.08);
          color:#fff;
        `;

        btn.addEventListener("click", async () => {
          const ok = await copyText(p);
          log(ok ? "ok" : "warn", ok ? `copiado ✅ ${p}` : `copy falhou: ${p}`);
        });

        row.appendChild(left);
        row.appendChild(btn);
        listEl.appendChild(row);
      }

      if (!base.length) {
        const empty = document.createElement("div");
        empty.style.cssText = "opacity:.7; padding:8px 2px;";
        empty.textContent = "Nenhum filler encontrado (pela busca atual).";
        listEl.appendChild(empty);
      } else if (base.length > max) {
        const more = document.createElement("div");
        more.style.cssText = "opacity:.7; font-size:12px; margin-top:6px;";
        more.textContent = `Mostrando ${max}/${base.length}. Refine a busca.`;
        listEl.appendChild(more);
      }
    }

    async function refresh(){
      bundlePaths = readBundleLocalPaths();
      overridePaths = await readOverridesPaths();
      all = Array.from(new Set([ ...bundlePaths, ...overridePaths ]));
      all.sort((a,b) => a.localeCompare(b));

      metaEl.textContent = `Total: ${all.length} | bundle_local: ${bundlePaths.length} | overrides: ${overridePaths.length}`;
      renderList(searchEl.value);
    }

    btnRefresh.addEventListener("click", refresh);
    searchEl.addEventListener("input", () => renderList(searchEl.value));

    refresh();
  }

  function mountFillersInLogPlace(){
    // tenta achar log e substituir
    const slot = findLogSlot();
    if (!slot || !slot.container) return false;

    // se já montou, não faz nada
    if (document.getElementById("rcfFillersAdminWrap")) return true;

    // oculta logNode (se existir)
    try {
      if (slot.logNode) {
        slot.logNode.style.display = "none";
      } else {
        // tenta ocultar qualquer <pre> dentro do container
        const pre = slot.container.querySelector("pre");
        if (pre) pre.style.display = "none";
      }
    } catch {}

    // injeta fillers dentro do container do Log
    renderFillersPanel(slot.container);
    log("ok", "Fillers: mounted into Admin Log slot ✅");
    return true;
  }

  // ------------------------------------------------------------
  // Boot / bind
  // ------------------------------------------------------------
  async function refresh() {
    try {
      const r = await scan();
      log("info", `CP1 scan: source=${r.source} files=${(r.files || []).length}`);
      log("info", `targets: count=${(r.targets || []).length} source=${r.source}`);
      log("info", `CP2 targets: count=${(r.targets || []).length}`);
      updateDropdown(r.targets);

      // tenta encaixar fillers sempre após refresh (Admin já deve ter renderizado)
      try { mountFillersInLogPlace(); } catch {}

      return r;
    } catch (e) {
      log("err", "scan err: " + (e?.message || e));
      return { ok: false };
    }
  }

  function boot() {
    // tenta encaixar Fillers no lugar do Log primeiro (se o Admin real existir)
    try {
      const ok = mountFillersInLogPlace();
      if (!ok) {
        // fallback: coloca fillers no mini box do injector
        // (garante que fica no Admin de qualquer forma)
      }
    } catch {}

    // Mini UI do injector (se não existir)
    let host = document.getElementById("rcfInjectorBox");
    if (!host) {
      const admin = findAdminRoot();
      host = document.createElement("div");
      host.id = "rcfInjectorBox";
      host.style.cssText = "margin:10px 0; padding:10px; border:1px solid rgba(255,255,255,.12); border-radius:12px; background:rgba(0,0,0,.12); color:#fff; font-size:12px;";
      host.innerHTML = `
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <b>Injector</b>
          <button id="rcfInjectorRefresh" style="padding:6px 10px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.08); color:#fff;">Scan</button>
          <select id="rcfInjectorTarget" style="min-width:260px; padding:6px 10px; border-radius:10px; border:1px solid rgba(255,255,255,.14); background:rgba(0,0,0,.25); color:#fff;"></select>
          <button id="rcfInjectorApply" style="padding:6px 10px; border-radius:999px; border:1px solid rgba(60,255,170,.25); background:rgba(60,255,170,.10); color:#eafff4;">Apply (test)</button>
        </div>
        <div id="rcfInjectorHint" style="margin-top:8px; opacity:.8;">
          Scan pega: runtime_vfs → mother_bundle_local → DOM anchors. (Fix: mother_bundle_local não pode virar 0)
        </div>
      `;
      try { admin.appendChild(host); } catch { document.body.appendChild(host); }
    }

    const btnR = document.getElementById("rcfInjectorRefresh");
    const btnA = document.getElementById("rcfInjectorApply");
    const sel = document.getElementById("rcfInjectorTarget");

    btnR?.addEventListener("click", () => refresh());
    btnA?.addEventListener("click", async () => {
      try {
        const target = sel?.value || "/index.html::HEAD_END";
        await applyInjection({ target, mode: "INSERT", content: "<!-- injector test -->" });
      } catch (e) {
        log("err", "apply err: " + (e?.message || e));
      }
    });

    // fallback: se não achou Log slot, coloca Fillers aqui no Admin box (garante UI)
    try {
      if (!document.getElementById("rcfFillersAdminWrap")) {
        renderFillersPanel(host);
        log("info", "Fillers: mounted in injector box (fallback) ✅");
      }
    } catch {}

    // auto refresh
    refresh();

    log("ok", "injector.js ready ✅ (v1.0a)");
  }

  window.RCF_INJECTOR = {
    __v10a: true,
    scan,
    refresh,
    applyInjection,
    boot,
  };

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
