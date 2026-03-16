/* FILE: /app/js/core/injector.js
   RControl Factory — RCF Injector
   v2.2 SAFE / PIPELINE BRIDGE / FILLERS

   Objetivo:
   - manter pack apply via JSON { meta, files, registryPatch }
   - priorizar RCF_APPLY_PIPELINE quando existir
   - fallback seguro para RCF_OVERRIDES_VFS / RCF_VFS
   - normalizar SOURCE OF TRUTH para /app/*
   - manter timeout + retries + progresso
   - manter Fillers com busca/cópia
   - montar preferencialmente no ADMIN com fallback para SETTINGS
   - funcionar como script clássico
*/

(() => {
  "use strict";

  if (window.RCF_INJECTOR && window.RCF_INJECTOR.__v22) return;

  const VERSION = "v2.2";
  const OUT_ID = "injOut";

  const VIEW_ADMIN_ID = "view-admin";
  const VIEW_SETTINGS_ID = "view-settings";

  const LS_BUNDLE_LOCAL = "rcf:mother_bundle_local";
  const LS_OVR_MAP = "rcf:RCF_OVERRIDES_MAP";

  function $(id) {
    try { return document.getElementById(id); } catch { return null; }
  }

  function nowISO() {
    try { return new Date().toISOString(); }
    catch { return ""; }
  }

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(String(level || "LOG").toUpperCase(), "[INJECTOR] " + String(msg || "")); } catch {}
    try { console.log("[INJECTOR]", level, msg); } catch {}
  }

  function setOut(msg) {
    const el = $(OUT_ID);
    if (el) {
      try { el.textContent = String(msg || "Pronto."); } catch {}
    }
  }

  function safeParseJSON(txt) {
    try { return JSON.parse(txt); } catch { return null; }
  }

  function safeParse(raw, fb) {
    try { return raw ? JSON.parse(raw) : fb; } catch { return fb; }
  }

  async function copyText(txt) {
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

  function normalizeMotherPath(inputPath) {
    let p = String(inputPath || "").trim();
    if (!p) return "";

    p = p.replace(/\\/g, "/");
    p = p.split("#")[0].split("?")[0].trim();

    if (!p.startsWith("/")) p = "/" + p;
    p = p.replace(/\/{2,}/g, "/");

    if (p === "/index.html") p = "/app/index.html";
    if (p === "/app.js") p = "/app/app.js";
    if (p === "/styles.css") p = "/app/styles.css";
    if (p === "/sw.js") p = "/app/sw.js";

    if (!p.startsWith("/app/") && !p.startsWith("/functions/")) {
      p = "/app" + p;
      p = p.replace(/\/{2,}/g, "/");
    }

    return p;
  }

  function shouldSkip(path) {
    const p = String(path || "");
    if (!p) return true;
    if (p.endsWith("/")) return true;
    if (p.includes("/.git/")) return true;
    if (p.endsWith(".DS_Store")) return true;
    if (p.endsWith("thumbs.db")) return true;
    return false;
  }

  function pickVFS() {
    if (window.RCF_OVERRIDES_VFS && typeof window.RCF_OVERRIDES_VFS.writeFile === "function") {
      return {
        kind: "OVERRIDES_VFS(writeFile)",
        put: (p, c) => window.RCF_OVERRIDES_VFS.writeFile(p, c),
        read: (p) => window.RCF_OVERRIDES_VFS.readFile ? window.RCF_OVERRIDES_VFS.readFile(p) : null,
        clear: () => {
          try { localStorage.removeItem(LS_OVR_MAP); } catch {}
          return true;
        }
      };
    }

    if (window.RCF_VFS && typeof window.RCF_VFS.put === "function") {
      return {
        kind: "VFS(put)",
        put: window.RCF_VFS.put.bind(window.RCF_VFS),
        read: typeof window.RCF_VFS.get === "function" ? window.RCF_VFS.get.bind(window.RCF_VFS) : null,
        clear: (typeof window.RCF_VFS.clearAll === "function")
          ? window.RCF_VFS.clearAll.bind(window.RCF_VFS)
          : null
      };
    }

    return null;
  }

  function withTimeout(promise, ms, label) {
    let t;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms em ${label}`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => {
      try { clearTimeout(t); } catch {}
    });
  }

  function getApplyPipeline() {
    try {
      if (window.RCF_APPLY_PIPELINE && typeof window.RCF_APPLY_PIPELINE.applyWithRollback === "function") {
        return window.RCF_APPLY_PIPELINE;
      }
    } catch {}
    return null;
  }

  async function applySingleFileViaPipeline(targetPath, newText, ui) {
    const pipeline = getApplyPipeline();
    if (!pipeline) return null;

    const patch = {
      targetPath: normalizeMotherPath(targetPath),
      newText: String(newText || ""),
      allowOverwrite: true
    };

    if (ui) ui(`Pipeline apply…\n${patch.targetPath}`);

    const res = await pipeline.applyWithRollback(patch);
    return res;
  }

  async function applySingleFileViaVFS(targetPath, newText, ui) {
    const vfs = pickVFS();
    if (!vfs) throw new Error("VFS não disponível (RCF_OVERRIDES_VFS/RCF_VFS). Recarregue 1x.");

    const norm = normalizeMotherPath(targetPath);
    const content = String(newText || "");
    const label = `put(${norm})`;

    let lastErr = null;
    const tries = 3;

    for (let a = 1; a <= tries; a++) {
      try {
        if (ui) ui(`Aplicando ${norm}\nTentativa ${a}/${tries}`);
        await withTimeout(Promise.resolve(vfs.put(norm, content)), 6000, label);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        await new Promise(r => setTimeout(r, 250 * a));
      }
    }

    if (lastErr) throw lastErr;

    return {
      ok: true,
      applied: true,
      result: {
        ok: true,
        mode: "factory",
        targetPath: norm,
        msg: `OK write factory file ${norm}`
      }
    };
  }

  async function applyFiles(filesMap, ui) {
    const pipeline = getApplyPipeline();
    const rawKeys = Object.keys(filesMap || {});
    const totalRaw = rawKeys.length;

    let ok = 0;
    let fail = 0;
    const failures = [];
    const startedAt = nowISO();

    for (let i = 0; i < rawKeys.length; i++) {
      const raw = rawKeys[i];
      const norm = normalizeMotherPath(raw);

      if (shouldSkip(norm)) continue;

      const content = String(filesMap[raw] ?? "");

      if (raw !== norm) {
        log("INFO", `path normalized: ${raw} -> ${norm}`);
      }

      try {
        let res = null;

        if (pipeline) {
          res = await applySingleFileViaPipeline(norm, content, (msg) => {
            if (ui) ui(`(${i + 1}/${totalRaw}) ${msg}`);
          });
        }

        if (!res) {
          res = await applySingleFileViaVFS(norm, content, (msg) => {
            if (ui) ui(`(${i + 1}/${totalRaw}) ${msg}`);
          });
        }

        if (res && res.ok) {
          ok++;
          log("OK", `apply ok ${norm}`);
        } else {
          fail++;
          failures.push({
            path: norm,
            reason: (res && (res.step || res.msg || res.result?.msg)) || "falha desconhecida"
          });
          log("ERR", `apply fail ${norm}`);
        }
      } catch (e) {
        fail++;
        failures.push({
          path: norm,
          reason: String(e?.message || e || "erro")
        });
        if (ui) ui(`Falhou em ${norm}\n${String(e?.message || e)}`);
        log("ERR", `apply fail ${norm} :: ${String(e?.message || e)}`);
      }
    }

    return {
      ok,
      fail,
      totalRaw,
      startedAt,
      kind: pipeline ? "APPLY_PIPELINE" : (pickVFS()?.kind || "unknown"),
      failures
    };
  }

  function applyRegistryPatch(patch) {
    if (!patch || typeof patch !== "object") return;

    const R = window.RCF_REGISTRY;
    if (!R) return;

    if (Array.isArray(patch.modules)) {
      patch.modules.forEach((m) => {
        if (!m || !m.id) return;
        try {
          R.upsertModule({
            id: m.id,
            name: m.name || m.id,
            entry: m.entry || "",
            enabled: m.enabled !== false
          });
        } catch {}
      });
    }

    if (Array.isArray(patch.templates)) {
      patch.templates.forEach((t) => {
        if (!t || !t.id) return;
        try {
          R.upsertTemplate({
            id: t.id,
            name: t.name || t.id,
            version: t.version || "1.0.0",
            entry: t.entry || ""
          });
        } catch {}
      });
    }
  }

  function refreshRuntimeIndexes() {
    try { window.RCF_FACTORY_TREE?.refresh?.(); } catch {}
    try { window.RCF_MODULE_REGISTRY?.refresh?.(); } catch {}
    try { window.RCF_FACTORY_STATE?.refreshRuntime?.(); } catch {}
  }

  async function applyPack(pack, ui) {
    if (!pack || typeof pack !== "object") {
      return { ok: false, msg: "Pack inválido." };
    }

    const meta = pack.meta || {};
    const files = pack.files || {};
    const patch = pack.registryPatch || meta.registryPatch || null;

    const name = meta.name || "pack";
    const ver = meta.version || "1.0";

    const res = await applyFiles(files, ui);
    applyRegistryPatch(patch);
    refreshRuntimeIndexes();

    const msg =
      `✅ Aplicado: ${name} v${ver}\n` +
      `modo: ${res.kind}\n` +
      `ok: ${res.ok}/${res.totalRaw}` +
      (res.fail ? ` (falhas: ${res.fail})` : "") +
      `\n@ ${nowISO()}`;

    return {
      ok: res.fail === 0,
      partial: res.fail > 0 && res.ok > 0,
      msg,
      detail: res
    };
  }

  function readBundleLocalPaths() {
    const raw = String(localStorage.getItem(LS_BUNDLE_LOCAL) || "").trim();
    if (!raw) return [];

    const j = safeParse(raw, null);
    const files = Array.isArray(j?.files) ? j.files : [];
    const paths = files
      .map(f => String(f?.path || "").trim())
      .filter(Boolean);

    const uniq = Array.from(new Set(paths));
    uniq.sort((a, b) => a.localeCompare(b));
    return uniq;
  }

  async function readOverridesCount() {
    try {
      if (window.RCF_VFS_OVERRIDES?.listOverridesSafe) {
        const r = await window.RCF_VFS_OVERRIDES.listOverridesSafe({ allowStale: true });
        if (r && r.ok) return Number(r.itemsCount || 0);
      }
    } catch {}

    try {
      const map = safeParse(localStorage.getItem(LS_OVR_MAP), null);
      if (map && typeof map === "object") {
        return Object.keys(map).length;
      }
    } catch {}

    return 0;
  }

  function renderFillersPanel(container) {
    if (document.getElementById("injFillersWrap")) return;

    const wrap = document.createElement("div");
    wrap.id = "injFillersWrap";
    wrap.style.marginTop = "14px";
    wrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <div style="font-weight:900;font-size:14px;">Fillers</div>
        <div id="injFillersMeta" style="opacity:.75;font-size:12px;">Total: 0 | bundle_local: 0 | overrides: 0</div>
        <button id="injFillersRefresh" class="btn ghost" type="button" style="margin-left:auto;">Atualizar</button>
      </div>

      <div style="margin-top:10px;">
        <input id="injFillersSearch" class="input" style="width:100%;" placeholder="🔎 Pesquisar filler (ex: app/js/core/...)" />
      </div>

      <div id="injFillersList" style="margin-top:10px;display:flex;flex-direction:column;gap:8px;"></div>
    `;

    container.appendChild(wrap);

    const metaEl = document.getElementById("injFillersMeta");
    const listEl = document.getElementById("injFillersList");
    const searchEl = document.getElementById("injFillersSearch");
    const btnRefresh = document.getElementById("injFillersRefresh");

    let all = [];

    function renderList(filter) {
      const q = String(filter || "").trim().toLowerCase();
      const filtered = q ? all.filter(p => p.toLowerCase().includes(q)) : all;

      listEl.innerHTML = "";

      const max = 140;
      const slice = filtered.slice(0, max);

      slice.forEach((p) => {
        const row = document.createElement("div");
        row.style.cssText = `
          display:flex;align-items:center;gap:10px;
          padding:10px 12px;
          border-radius:12px;
          border:1px solid rgba(255,255,255,.10);
          background:rgba(0,0,0,.18);
        `;

        const left = document.createElement("div");
        left.style.cssText = "flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;opacity:.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
        left.textContent = p;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn ghost";
        btn.textContent = "copiar";
        btn.style.padding = "8px 10px";

        btn.addEventListener("click", async () => {
          const ok = await copyText(p);
          log(ok ? "OK" : "WARN", ok ? `copiado ✅ ${p}` : `copy falhou: ${p}`);
          if (ok) setOut(`✅ Copiado:\n${p}`);
          else setOut(`⚠️ Não consegui copiar.\nPath:\n${p}`);
        });

        row.appendChild(left);
        row.appendChild(btn);
        listEl.appendChild(row);
      });

      if (filtered.length > max) {
        const more = document.createElement("div");
        more.style.cssText = "opacity:.7;font-size:12px;margin-top:6px;";
        more.textContent = `Mostrando ${max}/${filtered.length}. Refine a busca.`;
        listEl.appendChild(more);
      }

      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.style.cssText = "opacity:.7;font-size:12px;padding:10px 2px;";
        empty.textContent = "Nenhum filler encontrado.";
        listEl.appendChild(empty);
      }
    }

    async function refresh() {
      try {
        const bundlePaths = readBundleLocalPaths();
        const overridesCount = await readOverridesCount();

        all = bundlePaths;
        metaEl.textContent = `Total: ${all.length} | bundle_local: ${bundlePaths.length} | overrides: ${overridesCount}`;
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

  function findAdminLogPre(adminRoot) {
    try {
      const nodes = Array.from(adminRoot.querySelectorAll("*"));
      for (const n of nodes) {
        const t = String(n.textContent || "").trim().toLowerCase();
        if (t === "log:" || t === "log") {
          let pre = null;

          if (n.nextElementSibling && n.nextElementSibling.tagName === "PRE") {
            pre = n.nextElementSibling;
          }

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

  function renderInjectorCard(container) {
    if (document.getElementById("injInput")) return document.getElementById("injInput")?.closest(".card") || null;

    const wrap = document.createElement("div");
    wrap.className = "card";
    wrap.style.marginTop = "12px";
    wrap.innerHTML = `
      <h2>Injector (Factory / Overrides)</h2>
      <p class="hint">
        Cole um pack JSON (meta + files).<br/>
        ✅ padrão de escrita: <b>/app/*</b><br/>
        ✅ quando existir, usa <b>RCF_APPLY_PIPELINE</b><br/>
        ✅ fallback seguro para <b>OverridesVFS</b>
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

    const input = document.getElementById("injInput");
    const status = document.getElementById("injStatus");

    const pipeline = getApplyPipeline();
    const vfs = pickVFS();

    status.textContent = pipeline
      ? "OK ✅ (APPLY_PIPELINE)"
      : (vfs ? `OK ✅ (${vfs.kind})` : "VFS/Pipeline não disponível ❌");

    document.getElementById("btnInjDry").addEventListener("click", () => {
      const pack = safeParseJSON(input.value || "");
      if (!pack) return setOut("JSON inválido (não parseou).");

      const files = pack.files || {};
      const keys = Object.keys(files)
        .map(k => normalizeMotherPath(k))
        .filter(Boolean);

      setOut(
        `OK (dry-run)\n` +
        `arquivos: ${keys.length}\n` +
        `modo: ${pipeline ? "APPLY_PIPELINE" : (vfs ? vfs.kind : "indisponível")}\n\n` +
        keys.slice(0, 120).join("\n")
      );
    });

    document.getElementById("btnInjApply").addEventListener("click", async () => {
      const pack = safeParseJSON(input.value || "");
      if (!pack) return setOut("JSON inválido (não parseou).");

      try {
        setOut("Aplicando…");
        const res = await applyPack(pack, setOut);
        setOut(res.msg);

        if (res.detail && Array.isArray(res.detail.failures) && res.detail.failures.length) {
          log("WARN", "falhas parciais: " + res.detail.failures.length);
        }
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
        refreshRuntimeIndexes();
        setOut("✅ Overrides zerados.");
      } catch (e) {
        setOut(`❌ Falhou: ${e?.message || e}`);
      }
    });

    return wrap;
  }

  function mount() {
    const admin = $(VIEW_ADMIN_ID);
    const settings = $(VIEW_SETTINGS_ID);
    const host = admin || settings;

    if (!host) return;

    const card = renderInjectorCard(host);

    if (admin) {
      const logPre = findAdminLogPre(admin);
      if (logPre && logPre.parentElement) {
        try { logPre.style.display = "none"; } catch {}
        renderFillersPanel(logPre.parentElement);
        return;
      }

      renderFillersPanel(card || host);
      return;
    }

    renderFillersPanel(card || host);
  }

  function init() {
    try {
      mount();
      try { window.RCF_MODULE_REGISTRY?.register?.("injector"); } catch {}
      try { window.RCF_FACTORY_TREE?.register?.("/app/js/core/injector.js"); } catch {}
      try { window.RCF_FACTORY_STATE?.setModule?.("injector", true); } catch {}
      log("OK", "injector ready ✅ " + VERSION);
    } catch (e) {
      console.warn("Injector mount falhou:", e);
      log("ERR", "mount falhou: " + String(e?.message || e));
    }
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init, { passive: true });
  } else {
    init();
  }

  window.RCF_INJECTOR = {
    __v22: true,
    version: VERSION,
    applyPack,
    normalizeMotherPath,
    refreshRuntimeIndexes
  };
})();
