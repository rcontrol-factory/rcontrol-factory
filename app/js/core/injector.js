/* /app/js/core/injector.js  (RCF Injector v2.1 - PADRÃO /app)
  - Aplica pack JSON { meta, files, registryPatch }
  - Aplica via overrides: prefere RCF_VFS_OVERRIDES, fallback RCF_VFS
  - ✅ PADRÃO: MotherRoot=/app
  - ✅ normalizeMotherPath: /index.html -> /app/index.html, /js/* -> /app/js/*
  - ✅ LOG: "path normalized: from -> to"
  - Timeout por arquivo + retries curtos (iOS)
*/
(() => {
  "use strict";

  const MOUNT_ID = "settingsMount";
  const OUT_ID = "settingsOut";

  function $(id){ return document.getElementById(id); }
  function nowISO(){ return new Date().toISOString(); }

  function logTop(msg){
    const el = $(OUT_ID);
    if (el) el.textContent = String(msg || "");
  }

  function safeParseJSON(txt){
    try { return JSON.parse(txt); } catch { return null; }
  }

  // ✅ PADRÃO: normalizeMotherPath (não remove /app/)
  function normalizeMotherPath(inputPath){
    let p = String(inputPath || "").trim();
    if (!p) return "";
    p = p.split("#")[0].split("?")[0].trim();
    if (!p.startsWith("/")) p = "/" + p;
    p = p.replace(/\/{2,}/g, "/");

    if (p === "/index.html") p = "/app/index.html";

    const ROOT_FILES = new Set(["/styles.css", "/app.js", "/sw.js", "/manifest.json", "/favicon.ico"]);
    if (ROOT_FILES.has(p)) p = "/app" + p;

    if (p.startsWith("/js/")) p = "/app" + p;

    if (!p.startsWith("/app/")) p = "/app" + p;
    p = p.replace(/\/{2,}/g, "/");
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
    if (window.RCF_VFS_OVERRIDES && typeof window.RCF_VFS_OVERRIDES.put === "function") {
      return {
        kind: "OVERRIDES",
        put: window.RCF_VFS_OVERRIDES.put.bind(window.RCF_VFS_OVERRIDES),
        clear: (typeof window.RCF_VFS_OVERRIDES.clear === "function")
          ? window.RCF_VFS_OVERRIDES.clear.bind(window.RCF_VFS_OVERRIDES)
          : null
      };
    }

    if (window.RCF_VFS && typeof window.RCF_VFS.put === "function") {
      return {
        kind: "VFS",
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
    if (!vfs) throw new Error("VFS não disponível (RCF_VFS_OVERRIDES/RCF_VFS). Recarregue 1x após SW controlar.");

    const keys = Object.keys(filesMap || {});
    const total = keys.length;

    let ok = 0, fail = 0;
    const startedAt = nowISO();

    for (let i = 0; i < keys.length; i++){
      const raw = keys[i];
      const norm = normalizeMotherPath(raw);
      if (shouldSkip(norm)) continue;

      if (raw !== norm) {
        try { window.RCF_LOGGER?.push?.("info", `path normalized: ${raw} -> ${norm}`); } catch {}
      }

      const content = String(filesMap[raw] ?? "");
      const label = `put(${norm})`;

      if (ui) ui(`Aplicando ${i+1}/${total}…\n${norm}`);

      let lastErr = null;
      const tries = 3;
      for (let a = 1; a <= tries; a++){
        try {
          await withTimeout(Promise.resolve(vfs.put(norm, content)), 8000, label);
          ok++;
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          await new Promise(r => setTimeout(r, 300 * a));
        }
      }

      if (lastErr){
        fail++;
        if (ui) ui(`Falhou em ${norm}\n${String(lastErr?.message || lastErr)}`);
      }
    }

    return { ok, fail, total, startedAt, kind: vfs.kind };
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
      `ok: ${res.ok}/${res.total}` +
      (res.fail ? ` (falhas: ${res.fail})` : "") +
      `\n@ ${nowISO()}`;

    return { ok:true, msg };
  }

  // init (mantém seu UI)
  window.addEventListener("load", () => {
    try {
      const mount = $(MOUNT_ID);
      if (!mount) return;

      if (document.getElementById("injInput")) return;

      mount.innerHTML += `
        <div class="card" style="margin-top:12px">
          <h3>Injeção (Injector)</h3>
          <p class="hint">
            Cole um pack JSON (meta + files). Aplica via override (SW).<br/>
            PADRÃO: paths serão normalizados para /app/* (ex: /index.html -> /app/index.html).
          </p>

          <textarea id="injInput" class="textarea mono" spellcheck="false"
            placeholder='Cole um JSON:
{
  "meta": {"name":"teste-real","version":"1.0"},
  "files": { "/index.html": "<!-- ok -->" }
}'></textarea>

          <div class="row">
            <button id="btnInjDry" class="btn" type="button">Dry-run</button>
            <button id="btnInjApply" class="btn primary" type="button">Aplicar pack</button>
            <button id="btnInjClear" class="btn danger" type="button">Zerar overrides</button>
          </div>

          <pre id="injOut" class="mono small">Pronto.</pre>
          <div class="hint" style="margin-top:10px">
            Status: <span id="injStatus">checando...</span>
          </div>
        </div>
      `;

      const input  = document.getElementById("injInput");
      const out    = document.getElementById("injOut");
      const status = document.getElementById("injStatus");

      function setOut(t){ out.textContent = String(t || "Pronto."); }

      const vfs = pickVFS();
      status.textContent = vfs
        ? `OK ✅ (${vfs.kind})`
        : "VFS não disponível ❌ (recarregue 1x após SW controlar a página)";

      document.getElementById("btnInjDry").addEventListener("click", () => {
        const pack = safeParseJSON(input.value || "");
        if (!pack) return setOut("JSON inválido (não parseou).");
        const files = pack.files || {};
        const keys = Object.keys(files).map(k => normalizeMotherPath(k));
        setOut(`OK (dry-run)\nArquivos: ${keys.length}\n\n` + keys.slice(0, 80).join("\n"));
      });

      document.getElementById("btnInjApply").addEventListener("click", async () => {
        const pack = safeParseJSON(input.value || "");
        if (!pack) return setOut("JSON inválido (não parseou).");

        try {
          setOut("Aplicando…");
          logTop("Injector: aplicando…");
          const res = await applyPack(pack, setOut);
          setOut(res.msg);
          logTop(res.msg);
        } catch (e) {
          const msg = `❌ Falhou: ${e?.message || e}`;
          setOut(msg);
          logTop(msg);
        }
      });

      document.getElementById("btnInjClear").addEventListener("click", async () => {
        try {
          const v = pickVFS();
          if (!v || !v.clear) throw new Error("Clear não disponível (sem clear/clearAll).");
          setOut("Limpando overrides…");
          await withTimeout(Promise.resolve(v.clear()), 10000, "clear()");
          setOut("✅ Overrides zerados.");
          logTop("✅ Overrides zerados.");
        } catch (e) {
          const msg = `❌ Falhou: ${e?.message || e}`;
          setOut(msg);
          logTop(msg);
        }
      });

    } catch (e) {
      console.warn("Injector UI falhou:", e);
    }
  });

  window.RCF_INJECTOR = { applyPack, normalizeMotherPath };
})();
