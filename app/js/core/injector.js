/* core/injector.js (RCF Injector v2.1c — PADRÃO com RCF_OVERRIDES_VFS)
   - Recebe pack JSON { meta, files, registryPatch }
   - Aplica via OverridesVFS (localStorage) => window.RCF_OVERRIDES_VFS (writeFile)
   - Fallback: se existir RCF_VFS.put, usa
   - NORMALIZA paths: SOURCE OF TRUTH = /app (nunca mais escreve /index.html)
   - Timeout por arquivo + retries + progresso no injOut
   - Clear: limpa key rcf:RCF_OVERRIDES_MAP (compatível com app.js)
   - UI monta direto no #view-settings (não precisa settingsMount)

   PATCH (FILLERS Explorer):
   - Lê bundle local (rcf:mother_bundle_local + compat keys) e lista fillers/paths
   - Ordena A→Z, mostra contador + fonte do bundle
   - Campo de busca (lupa) + lista clicável (click copia path)
*/
(() => {
  "use strict";

  const VIEW_SETTINGS_ID = "view-settings";
  const OUT_ID = "injOut";

  function $(id){ return document.getElementById(id); }
  function nowISO(){ return new Date().toISOString(); }

  function setOut(msg){
    const el = $(OUT_ID);
    if (el) el.textContent = String(msg || "Pronto.");
  }

  function safeParseJSON(txt){
    try { return JSON.parse(txt); } catch { return null; }
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
          try { localStorage.removeItem("rcf:RCF_OVERRIDES_MAP"); } catch {}
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

  // =========================================================
  // FILLERS EXPLORER (bundle local -> lista A-Z + busca)
  // =========================================================
  const BUNDLE_KEYS = [
    "rcf:mother_bundle_local",
    "rcf:mother_bundle",
    "rcf:mother_bundle_json"
  ];

  function readBundleFromLS(){
    for (const k of BUNDLE_KEYS){
      const raw = String(localStorage.getItem(k) || "").trim();
      if (!raw) continue;
      const j = safeParseJSON(raw);
      if (j && typeof j === "object" && Array.isArray(j.files)) {
        return { ok:true, key:k, bundle:j, raw };
      }
    }
    return { ok:false, key:null, bundle:null, raw:"" };
  }

  function extractPathsFromBundle(bundleObj){
    const files = Array.isArray(bundleObj?.files) ? bundleObj.files : [];
    const out = [];
    for (let i = 0; i < files.length; i++){
      const f = files[i] || {};
      const p = String(f.path || f.name || "").trim();
      if (!p) continue;
      const norm = normalizeMotherPath(p);
      if (shouldSkip(norm)) continue;
      out.push(norm);
    }
    // uniq + sort A-Z
    const uniq = Array.from(new Set(out));
    uniq.sort((a,b) => a.localeCompare(b));
    return uniq;
  }

  function tryCopy(text){
    const t = String(text || "");
    if (!t) return false;

    // clipboard api
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(t).catch(() => {});
        return true;
      }
    } catch {}

    // fallback execCommand
    try {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.setAttribute("readonly", "readonly");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {}

    return false;
  }

  function renderFillersExplorer(container){
    if (!container) return;

    // evita duplicar
    if (document.getElementById("fillersBox")) return;

    const box = document.createElement("div");
    box.id = "fillersBox";
    box.className = "card";
    box.style.marginTop = "12px";

    box.innerHTML = `
      <h2>Fillers (bundle local)</h2>
      <p class="hint">
        Lista dos paths do <b>mother_bundle</b> salvo no localStorage (scanner/targets).
        <br/>Ordenado A→Z. Clique em um item para <b>copiar</b>.
      </p>

      <div class="row" style="align-items:center; gap:10px;">
        <div style="flex:1; position:relative;">
          <input id="fillersSearch" class="input" type="text" placeholder="🔎 Buscar filler..." style="width:100%;" />
        </div>
        <button id="btnFillersReload" class="btn ghost" type="button">Recarregar</button>
      </div>

      <div class="hint" style="margin-top:10px;">
        Fonte: <span id="fillersSrc">-</span> • Total: <span id="fillersCount">0</span>
      </div>

      <div style="margin-top:10px; max-height: 260px; overflow:auto; border-radius:12px; border:1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.18);">
        <div id="fillersList" class="mono small" style="padding:10px; white-space:pre-wrap;">(vazio)</div>
      </div>

      <div class="hint" style="margin-top:10px;">
        Dica: se o total estiver <b>1</b> mas você sabe que tem mais, então o bundle local ainda não foi atualizado — o scanner vai ler exatamente isso aqui.
      </div>
    `;

    container.appendChild(box);

    const elSrc = document.getElementById("fillersSrc");
    const elCount = document.getElementById("fillersCount");
    const elList = document.getElementById("fillersList");
    const elSearch = document.getElementById("fillersSearch");

    let all = [];

    function renderList(filterText){
      const q = String(filterText || "").trim().toLowerCase();
      const items = q
        ? all.filter(p => p.toLowerCase().includes(q))
        : all;

      elCount.textContent = String(items.length);

      if (!items.length) {
        elList.textContent = "(vazio)";
        return;
      }

      // render com linhas clicáveis
      elList.innerHTML = items.map(p => {
        const safe = p.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `<div class="fillItem" data-p="${safe}" style="padding:6px 4px; border-bottom:1px solid rgba(255,255,255,.06); cursor:pointer;">${safe}</div>`;
      }).join("");

      // bind clicks
      const nodes = elList.querySelectorAll(".fillItem");
      nodes.forEach(n => {
        n.addEventListener("click", () => {
          const p = n.getAttribute("data-p") || "";
          tryCopy(p);
          setOut(`📋 Copiado: ${p}`);
          try { window.RCF_LOGGER?.push?.("ok", `fillers copy: ${p}`); } catch {}
        }, { passive:true });
      });
    }

    function reload(){
      const r = readBundleFromLS();
      if (!r.ok) {
        all = [];
        elSrc.textContent = "(nenhum bundle encontrado)";
        elCount.textContent = "0";
        elList.textContent = "(vazio)";
        return;
      }

      const paths = extractPathsFromBundle(r.bundle);
      all = paths;

      const srcTxt = `${r.key} (files=${Array.isArray(r.bundle?.files) ? r.bundle.files.length : 0})`;
      elSrc.textContent = srcTxt;

      renderList(elSearch.value || "");
    }

    // debounce simples
    let t = null;
    elSearch.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => renderList(elSearch.value || ""), 120);
    }, { passive:true });

    document.getElementById("btnFillersReload").addEventListener("click", () => {
      reload();
      setOut("✅ Fillers recarregados.");
    });

    reload();
  }

  function renderSettings(){
    const view = $(VIEW_SETTINGS_ID);
    if (!view) return;

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

    view.appendChild(wrap);

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

    // ✅ NOVO: fillers explorer (bundle local) dentro do Settings
    renderFillersExplorer(view);
  }

  function init(){
    try { renderSettings(); } catch (e) { console.warn("Injector UI falhou:", e); }
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init, { passive: true });
  } else {
    init();
  }

  window.RCF_INJECTOR = { applyPack };
})();
