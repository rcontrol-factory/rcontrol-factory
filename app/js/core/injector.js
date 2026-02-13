/* core/injector.js  (RCF Injector v2 - robust iOS + timeout + normalize)
   - Recebe pack JSON { meta, files, registryPatch }
   - Aplica via overrides: prefere RCF_VFS_OVERRIDES, fallback RCF_VFS
   - Normaliza paths: remove /app/ automaticamente
   - Timeout por arquivo + progresso no injOut
   - Clear via clear/clearAll
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

  function normalizePath(inputPath){
    let p = String(inputPath || "").trim();
    if (!p) return "";
    p = p.split("#")[0].split("?")[0].trim();
    if (!p.startsWith("/")) p = "/" + p;

    // MUITO IMPORTANTE: remove /app/ pq seu app roda com root /app
    if (p.startsWith("/app/")) p = p.slice(4);

    // colapsa ////
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
    // preferido (mais consistente com mother_selfupdate)
    if (window.RCF_VFS_OVERRIDES && typeof window.RCF_VFS_OVERRIDES.put === "function") {
      return {
        kind: "OVERRIDES",
        put: window.RCF_VFS_OVERRIDES.put.bind(window.RCF_VFS_OVERRIDES),
        clear: (typeof window.RCF_VFS_OVERRIDES.clear === "function")
          ? window.RCF_VFS_OVERRIDES.clear.bind(window.RCF_VFS_OVERRIDES)
          : null
      };
    }

    // fallback antigo
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
      const path = normalizePath(raw);
      if (shouldSkip(path)) continue;

      const content = String(filesMap[raw] ?? "");
      const label = `put(${path})`;

      if (ui) ui(`Aplicando ${i+1}/${total}…\n${path}`);

      // retries curtos (iOS)
      let lastErr = null;
      const tries = 3;
      for (let a = 1; a <= tries; a++){
        try {
          await withTimeout(Promise.resolve(vfs.put(path, content)), 6000, label);
          ok++;
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          // backoff
          await new Promise(r => setTimeout(r, 250 * a));
        }
      }

      if (lastErr){
        fail++;
        if (ui) ui(`Falhou em ${path}\n${String(lastErr?.message || lastErr)}`);
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

  function enableClickFallback(container){
    if (!container) return;
    container.style.pointerEvents = "auto";

    container.addEventListener("click", (ev) => {
      const t = ev.target;
      if (!t) return;

      if (t.tagName === "LABEL") {
        const fid = t.getAttribute("for");
        if (fid) {
          const inp = document.getElementById(fid);
          if (inp && typeof inp.click === "function") inp.click();
        }
      }
    }, true);

    container.addEventListener("touchend", (ev) => {
      const t = ev.target;
      if (!t) return;
      const tag = (t.tagName || "").toLowerCase();
      const isBtn = tag === "button";
      const isInput = tag === "input" || tag === "textarea" || tag === "select";
      if (isBtn && typeof t.click === "function") t.click();
      if (isInput && typeof t.focus === "function") t.focus();
    }, { capture:true, passive:true });
  }

  function renderSettings(){
    const mount = $(MOUNT_ID);
    if (!mount) return;

    // evita duplicar
    if (document.getElementById("injInput")) return;

    mount.innerHTML += `
      <div class="card" style="margin-top:12px">
        <h3>Injeção (Injector)</h3>
        <p class="hint">
          Cole um pack JSON (meta + files). Aplica via override (SW).<br/>
          Dica: NÃO use /app/ no path — mas se usar, eu removo automaticamente.
        </p>

        <textarea id="injInput" class="textarea mono" spellcheck="false"
          placeholder='Cole um JSON:
{
  "meta": {"name":"teste-real","version":"1.0"},
  "files": { "/TESTE_OK.txt": "INJECTION WORKING" }
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

    enableClickFallback(mount);

    function setOut(t){ out.textContent = String(t || "Pronto."); }

    // status VFS
    const vfs = pickVFS();
    status.textContent = vfs
      ? `OK ✅ (${vfs.kind})`
      : "VFS não disponível ❌ (recarregue 1x após SW controlar a página)";

    document.getElementById("btnInjDry").addEventListener("click", () => {
      const pack = safeParseJSON(input.value || "");
      if (!pack) return setOut("JSON inválido (não parseou).");
      const files = pack.files || {};
      const keys = Object.keys(files).map(k => normalizePath(k));
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
        await withTimeout(Promise.resolve(v.clear()), 8000, "clear()");
        setOut("✅ Overrides zerados.");
        logTop("✅ Overrides zerados.");
      } catch (e) {
        const msg = `❌ Falhou: ${e?.message || e}`;
        setOut(msg);
        logTop(msg);
      }
    });
  }

  // init
  window.addEventListener("load", () => {
    try { renderSettings(); } catch (e) { console.warn("Injector UI falhou:", e); }
  });

  window.RCF_INJECTOR = { applyPack };
})();
