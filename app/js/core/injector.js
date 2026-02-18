/* core/injector.js (RCF Injector v2.1c — PADRÃO com RCF_OVERRIDES_VFS)
   - Recebe pack JSON { meta, files, registryPatch }
   - Aplica via OverridesVFS (localStorage) => window.RCF_OVERRIDES_VFS (writeFile)
   - Fallback: se existir RCF_VFS.put, usa
   - NORMALIZA paths: SOURCE OF TRUTH = /app (nunca mais escreve /index.html)
   - Timeout por arquivo + retries + progresso no injOut
   - Clear: limpa key rcf:RCF_OVERRIDES_MAP (compatível com app.js)
   - UI monta direto no ADMIN (preferência) com fallback para Settings

   PATCH (Fillers no Injector):
   - Painel "Fillers" com busca + lista alfabética + copiar path
   - Contadores: total | bundle_local | overrides
   - Fonte bundle_local: localStorage rcf:mother_bundle_local (rcf_bundle_v1)
   - Fonte overrides count: RCF_VFS_OVERRIDES.listOverridesSafe() (se existir) OU rcf:RCF_OVERRIDES_MAP

   PATCH (Mover Fillers pro ADMIN no lugar do Log):
   - Se encontrar bloco "Log:" no Admin, esconde o PRE e coloca Fillers no lugar
*/
(() => {
  "use strict";

  const OUT_ID = "injOut";

  // Preferência: ADMIN (pra ficar tudo no lugar só)
  const VIEW_ADMIN_ID = "view-admin";
  const VIEW_SETTINGS_ID = "view-settings";

  const LS_BUNDLE_LOCAL = "rcf:mother_bundle_local";
  const LS_OVR_MAP = "rcf:RCF_OVERRIDES_MAP";

  function $(id){ return document.getElementById(id); }
  function nowISO(){ return new Date().toISOString(); }

  function setOut(msg){
    const el = $(OUT_ID);
    if (el) el.textContent = String(msg || "Pronto.");
  }

  function safeParseJSON(txt){
    try { return JSON.parse(txt); } catch { return null; }
  }

  function safeParse(raw, fb){
    try { return raw ? JSON.parse(raw) : fb; } catch { return fb; }
  }

  async function copyText(txt){
    const t = String(txt || "");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(t);
        return true;
      }
    } catch {}
    // fallback antigo
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

  // ✅ PADRÃO: MotherRoot é /app
  function normalizeMotherPath(inputPath){
    let p = String(inputPath || "").trim();
    if (!p) return "";
    p = p.split("#")[0].split("?")[0].trim();
    if (!p.startsWith("/")) p = "/" + p;

    p = p.replace(/\/{2,}/g, "/");

    // regras fixas (atalhos comuns)
    if (p === "/index.html") p = "/app/index.html";
    if (p === "/app.js") p = "/app/app.js";
    if (p === "/styles.css") p = "/app/styles.css";
    if (p === "/sw.js") p = "/app/sw.js";

    // força /app/
    if (!p.startsWith("/app/")) {
      p = "/app" + p;
      p = p.replace(/\/{2,}/g, "/");
    }
    return p;
  }

  function shouldSkip(path){
    const p = String(path || "");
    if (!p) return true;
    if (p.endsWith("/")) return true;
    if (p.includes("/.git/")) return true;
    if (p.endsWith(".DS_Store")) return true;
    if (p.endsWith("thumbs.db")) return true;
    return false;
  }

  function pickVFS(){
    // ✅ PADRÃO (app.js): window.RCF_OVERRIDES_VFS.writeFile(path, content)
    if (window.RCF_OVERRIDES_VFS && typeof window.RCF_OVERRIDES_VFS.writeFile === "function") {
      return {
        kind: "OVERRIDES_VFS(writeFile)",
        put: (p, c) => window.RCF_OVERRIDES_VFS.writeFile(p, c),
        clear: () => {
          try { localStorage.removeItem(LS_OVR_MAP); } catch {}
          return true;
        }
      };
    }

    // fallback antigo
    if (window.RCF_VFS && typeof window.RCF_VFS.put === "function") {
      return {
        kind: "VFS(put)",
        put: window.RCF_VFS.put.bind(window.RCF_VFS),
        clear: (typeof window.RCF_VFS.clearAll === "function")
          ? window.RCF_VFS.clearAll.bind(window.RCF_VFS)
          : null
      };
    }

    return null;
  }

  function withTimeout(promise, ms, label){
    let t;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms em ${label}`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  }

  async function applyFiles(filesMap, ui){
    const vfs = pickVFS();
    if (!vfs) throw new Error("VFS não disponível (RCF_OVERRIDES_VFS/RCF_VFS). Recarregue 1x.");

    const rawKeys = Object.keys(filesMap || {});
    const totalRaw = rawKeys.length;

    let ok = 0, fail = 0;
    const startedAt = nowISO();

    for (let i = 0; i < rawKeys.length; i++){
      const raw = rawKeys[i];
      const norm = normalizeMotherPath(raw);
      if (shouldSkip(norm)) continue;

      const content = String(filesMap[raw] ?? "");
      const label = `put(${norm})`;

      // log de normalização
      if (raw !== norm) {
        try { window.RCF_LOGGER?.push?.("info", `path normalized: ${raw} -> ${norm}`); } catch {}
      }

      if (ui) ui(`Aplicando ${i+1}/${totalRaw}…\n${norm}`);

      // retries curtos (iOS)
      let lastErr = null;
      const tries = 3;

      for (let a = 1; a <= tries; a++){
        try {
          await withTimeout(Promise.resolve(vfs.put(norm, content)), 6000, label);
          ok++;
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          await new Promise(r => setTimeout(r, 250 * a));
        }
      }

      if (lastErr){
        fail++;
        if (ui) ui(`Falhou em ${norm}\n${String(lastErr?.message || lastErr)}`);
      }
    }

    return { ok, fail, totalRaw, startedAt, kind: vfs.kind };
  }

  function applyRegistryPatch(patch){
    if (!patch || typeof patch !== "object") return;

    const R = window.RCF_REGISTRY;
    if (!R) return;

    if (Array.isArray(patch.modules)) {
      patch.modules.forEach(m => {
        if (!m || !m.id) return;
        R.upsertModule({
          id: m.id,
          name: m.name || m.id,
          entry: m.entry || "",
          enabled: m.enabled !== false
        });
      });
    }

    if (Array.isArray(patch.templates)) {
      patch.templates.forEach(t => {
        if (!t || !t.id) return;
        R.upsertTemplate({
          id: t.id,
          name: t.name || t.id,
          version: t.version || "1.0.0",
          entry: t.entry || ""
        });
      });
    }
  }

  async function applyPack(pack, ui){
    if (!pack || typeof pack !== "object") return { ok:false, msg:"Pack inválido." };

    const meta = pack.meta || {};
    const files = pack.files || {};
    const patch = pack.registryPatch || meta.registryPatch || null;

    const name = meta.name || "pack";
    const ver  = meta.version || "1.0";

    const res = await applyFiles(files, ui);
    applyRegistryPatch(patch);

    const msg =
      `✅ Aplicado: ${name} v${ver}\n` +
      `VFS: ${res.kind}\n` +
      `ok: ${res.ok}/${res.totalRaw}` +
      (res.fail ? ` (falhas: ${res.fail})` : "") +
      `\n@ ${nowISO()}`;

    return { ok:true, msg };
  }

  // ---------------------------
  // Fillers (Index + Search UI)
  // ---------------------------
  function readBundleLocalPaths(){
    const raw = String(localStorage.getItem(LS_BUNDLE_LOCAL) || "").trim();
    if (!raw) return [];
    const j = safeParse(raw, null);
    const files = Array.isArray(j?.files) ? j.files : [];
    const paths = files.map(f => String(f?.path || "").trim()).filter(Boolean);

    // alfabético + unique
    const uniq = Array.from(new Set(paths));
    uniq.sort((a,b) => a.localeCompare(b));
    return uniq;
  }

  async function readOverridesCount(){
    // prefer: RCF_VFS_OVERRIDES.listOverridesSafe
    try {
      if (window.RCF_VFS_OVERRIDES?.listOverridesSafe) {
        const r = await window.RCF_VFS_OVERRIDES.listOverridesSafe({ allowStale:true });
        if (r && r.ok) return Number(r.itemsCount || 0);
      }
    } catch {}

    // fallback: localStorage map do app.js
    try {
      const map = safeParse(localStorage.getItem(LS_OVR_MAP), null);
      if (map && typeof map === "object") {
        const keys = Object.keys(map);
        return keys.length;
      }
    } catch {}

    return 0;
  }

  function renderFillersPanel(container){
    // evita duplicar
    if (document.getElementById("injFillersWrap")) return;

    const wrap = document.createElement("div");
    wrap.id = "injFillersWrap";
    wrap.style.marginTop = "14px";
    wrap.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <div style="font-weight:900; font-size:14px;">Fillers</div>
        <div id="injFillersMeta" style="opacity:.75; font-size:12px;">Total: 0 | bundle_local: 0 | overrides: 0</div>
        <button id="injFillersRefresh" class="btn ghost" type="button" style="margin-left:auto;">Atualizar</button>
      </div>

      <div style="margin-top:10px;">
        <input id="injFillersSearch" class="input" style="width:100%;" placeholder="🔎 Pesquisar filler (ex: app/js/core/...)" />
      </div>

      <div id="injFillersList" style="margin-top:10px; display:flex; flex-direction:column; gap:8px;"></div>
    `;

    container.appendChild(wrap);

    const metaEl = document.getElementById("injFillersMeta");
    const listEl = document.getElementById("injFillersList");
    const searchEl = document.getElementById("injFillersSearch");
    const btnRefresh = document.getElementById("injFillersRefresh");

    let all = [];

    function renderList(filter){
      const q = String(filter || "").trim().toLowerCase();
      const filtered = q ? all.filter(p => p.toLowerCase().includes(q)) : all;

      listEl.innerHTML = "";
      const max = 140; // mobile safe
      const slice = filtered.slice(0, max);

      for (const p of slice){
        const row = document.createElement("div");
        row.style.cssText = `
          display:flex; align-items:center; gap:10px;
          padding:10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(0,0,0,.18);
        `;

        const left = document.createElement("div");
        left.style.cssText = "flex:1; min-width:0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size:12px; opacity:.92; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
        left.textContent = p;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn ghost";
        btn.textContent = "copiar";
        btn.style.padding = "8px 10px";

        btn.addEventListener("click", async () => {
          const ok = await copyText(p);
          try { window.RCF_LOGGER?.push?.(ok ? "ok" : "warn", ok ? `copiado ✅ ${p}` : `copy falhou: ${p}`); } catch {}
          if (ok) setOut(`✅ Copiado:\n${p}`);
          else setOut(`⚠️ Não consegui copiar (iOS bloqueou).\nPath:\n${p}`);
        });

        row.appendChild(left);
        row.appendChild(btn);
        listEl.appendChild(row);
      }

      if (filtered.length > max) {
        const more = document.createElement("div");
        more.style.cssText = "opacity:.7; font-size:12px; margin-top:6px;";
        more.textContent = `Mostrando ${max}/${filtered.length}. Refine a busca pra achar mais rápido.`;
        listEl.appendChild(more);
      }

      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.style.cssText = "opacity:.7; font-size:12px; padding:10px 2px;";
        empty.textContent = "Nenhum filler encontrado (pela busca atual).";
        listEl.appendChild(empty);
      }
    }

    async function refresh(){
      try {
        const bundlePaths = readBundleLocalPaths();
        const overridesCount = await readOverridesCount();

        all = bundlePaths;
        const total = all.length;

        metaEl.textContent = `Total: ${total} | bundle_local: ${bundlePaths.length} | overrides: ${overridesCount}`;
        renderList(searchEl.value);
      } catch (e) {
        metaEl.textContent = "Total: 0 | bundle_local: 0 | overrides: 0";
        setOut(`⚠️ Fillers refresh falhou: ${e?.message || e}`);
      }
    }

    btnRefresh.addEventListener("click", refresh);
    searchEl.addEventListener("input", () => renderList(searchEl.value));

    refresh();
  }

  // ---------------------------
  // ADMIN: colocar Fillers no lugar do "Log"
  // ---------------------------
  function findAdminLogPre(adminRoot){
    try {
      const nodes = Array.from(adminRoot.querySelectorAll("*"));
      for (const n of nodes) {
        const t = String(n.textContent || "").trim().toLowerCase();
        if (t === "log:" || t === "log") {
          // tenta pegar o próximo PRE (irmão ou no mesmo pai)
          let pre = null;

          if (n.nextElementSibling && n.nextElementSibling.tagName === "PRE") pre = n.nextElementSibling;

          if (!pre && n.parentElement) {
            const pres = Array.from(n.parentElement.querySelectorAll("pre"));
            if (pres.length) pre = pres[0];
          }

          if (pre) return pre;
        }
      }
    } catch {}
    return null;
  }

  function renderInjectorCard(container){
    // evita duplicar
    if (document.getElementById("injInput")) return;

    const wrap = document.createElement("div");
    wrap.className = "card";
    wrap.style.marginTop = "12px";
    wrap.innerHTML = `
      <h2>Injector (Overrides /app)</h2>
      <p class="hint">
        Cole um pack JSON (meta + files). Aplica via <b>OverridesVFS</b>.<br/>
        ✅ Padrão: <b>/app/*</b> (se você colar /index.html eu converto).
      </p>

      <textarea id="injInput" class="textarea mono" spellcheck="false"
        placeholder='Cole um JSON:
{
  "meta": {"name":"teste-real","version":"1.0"},
  "files": { "/index.html": "<!-- teste -->" }
}'></textarea>

      <div class="row">
        <button id="btnInjDry" class="btn ghost" type="button">Dry-run</button>
        <button id="btnInjApply" class="btn ok" type="button">Aplicar pack</button>
        <button id="btnInjClear" class="btn danger" type="button">Zerar overrides</button>
      </div>

      <pre id="injOut" class="mono small">Pronto.</pre>
      <div class="hint" style="margin-top:10px">
        Status: <span id="injStatus">checando...</span>
      </div>
    `;

    container.appendChild(wrap);

    const input  = document.getElementById("injInput");
    const status = document.getElementById("injStatus");

    // status VFS
    const vfs = pickVFS();
    status.textContent = vfs
      ? `OK ✅ (${vfs.kind})`
      : "VFS não disponível ❌ (recarregue 1x)";

    document.getElementById("btnInjDry").addEventListener("click", () => {
      const pack = safeParseJSON(input.value || "");
      if (!pack) return setOut("JSON inválido (não parseou).");
      const files = pack.files || {};
      const keys = Object.keys(files).map(k => normalizeMotherPath(k)).filter(Boolean);
      setOut(`OK (dry-run)\nArquivos: ${keys.length}\n\n` + keys.slice(0, 120).join("\n"));
    });

    document.getElementById("btnInjApply").addEventListener("click", async () => {
      const pack = safeParseJSON(input.value || "");
      if (!pack) return setOut("JSON inválido (não parseou).");

      try {
        setOut("Aplicando…");
        const res = await applyPack(pack, setOut);
        setOut(res.msg);
      } catch (e) {
        setOut(`❌ Falhou: ${e?.message || e}`);
      }
    });

    document.getElementById("btnInjClear").addEventListener("click", async () => {
      try {
        const v = pickVFS();
        if (!v || !v.clear) throw new Error("Clear não disponível.");
        setOut("Limpando overrides…");
        await withTimeout(Promise.resolve(v.clear()), 8000, "clear()");
        setOut("✅ Overrides zerados.");
      } catch (e) {
        setOut(`❌ Falhou: ${e?.message || e}`);
      }
    });

    return wrap;
  }

  function mount(){
    const admin = $(VIEW_ADMIN_ID);
    const settings = $(VIEW_SETTINGS_ID);

    // host preferido: ADMIN
    const host = admin || settings;
    if (!host) return;

    // cria card do injector onde estiver o host
    const card = renderInjectorCard(host);

    // Fillers: se tiver ADMIN e achar "Log:", coloca no lugar do Log
    if (admin) {
      const logPre = findAdminLogPre(admin);
      if (logPre && logPre.parentElement) {
        try { logPre.style.display = "none"; } catch {}
        renderFillersPanel(logPre.parentElement);
        return;
      }
      // fallback: coloca dentro do card
      renderFillersPanel(card);
      return;
    }

    // fallback geral (Settings)
    renderFillersPanel(card);
  }

  function init(){
    try { mount(); } catch (e) { console.warn("Injector mount falhou:", e); }
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init, { passive: true });
  } else {
    init();
  }

  window.RCF_INJECTOR = { applyPack };
})();
