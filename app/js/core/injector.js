/* Injector v1 - aplica bundles/pack via Settings
   - Não depende do core interno (só usa localStorage)
   - Compatível com bundle formato "meta + files"
*/
(() => {
  "use strict";

  const OUT_KEY = "settingsOut";
  const MOUNT_ID = "settingsMount";

  // onde guardamos overrides (um dicionário path -> {content, updatedAt})
  const OVERRIDES_KEY = "rcf:overrides:v1";

  function $(id){ return document.getElementById(id); }
  function nowISO(){ return new Date().toISOString(); }

  function log(msg){
    const el = $(OUT_KEY);
    if (!el) return;
    el.textContent = String(msg || "Pronto.");
  }

  function safeParseJSON(txt){
    try { return JSON.parse(txt); } catch { return null; }
  }

  function loadOverrides(){
    try {
      const raw = localStorage.getItem(OVERRIDES_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  }

  function saveOverrides(obj){
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(obj));
  }

  // normaliza caminho pra sempre começar com "/"
  function normPath(p){
    p = String(p || "").trim();
    if (!p) return "";
    if (!p.startsWith("/")) p = "/" + p;
    return p;
  }

  function applyFiles(filesMap){
    const ov = loadOverrides();
    let count = 0;

    Object.keys(filesMap || {}).forEach((k) => {
      const path = normPath(k);
      if (!path) return;
      ov[path] = { content: String(filesMap[k] ?? ""), updatedAt: nowISO() };
      count++;
    });

    saveOverrides(ov);
    return count;
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

  function applyPack(pack){
    if (!pack || typeof pack !== "object") return { ok:false, msg:"Pack inválido." };

    // aceita {meta, files} (bundle mãe) e também {files} direto
    const meta = pack.meta || {};
    const files = pack.files || {};
    const patch = pack.registryPatch || meta.registryPatch || null;

    const n = applyFiles(files);
    applyRegistryPatch(patch);

    const name = meta.name || "pack";
    const ver = meta.version || "1.0";
    return { ok:true, msg:`Aplicado: ${name} v${ver} (${n} arquivos).` };
  }

  // UI do Settings
  function renderSettings(){
    const mount = $(MOUNT_ID);
    if (!mount) return;

    mount.innerHTML = `
      <div class="card" style="margin-top:12px">
        <h3>Injeção (Receptor)</h3>
        <p class="hint">Cole um pack JSON (meta + files) para instalar módulos/templates sem quebrar a base.</p>

        <textarea id="injInput" class="textarea mono" spellcheck="false"
          placeholder='Cole aqui um JSON do tipo:
{
  "meta": {"name":"pack-x","version":"1.0"},
  "files": { "/app/js/modules/x.js": "console.log(123)" },
  "registryPatch": { "modules":[{"id":"x","entry":"/app/js/modules/x.js"}] }
}'></textarea>

        <div class="row">
          <button id="btnInjDry" class="btn" type="button">Dry-run</button>
          <button id="btnInjApply" class="btn primary" type="button">Aplicar pack</button>
          <button id="btnInjExport" class="btn" type="button">Exportar overrides</button>
          <button id="btnInjClear" class="btn danger" type="button">Zerar overrides</button>
        </div>

        <pre id="injOut" class="mono small">Pronto.</pre>
      </div>
    `;

    const input = document.getElementById("injInput");
    const out = document.getElementById("injOut");

    function setOut(t){ out.textContent = String(t || "Pronto."); }

    document.getElementById("btnInjDry").addEventListener("click", () => {
      const pack = safeParseJSON(input.value || "");
      if (!pack) return setOut("JSON inválido (não parseou).");
      const files = pack.files || {};
      const keys = Object.keys(files);
      setOut(`OK (dry-run). Arquivos: ${keys.length}\n` + keys.slice(0, 40).join("\n"));
    });

    document.getElementById("btnInjApply").addEventListener("click", () => {
      const pack = safeParseJSON(input.value || "");
      if (!pack) return setOut("JSON inválido (não parseou).");
      const res = applyPack(pack);
      setOut(res.msg);
      log(res.msg);
    });

    document.getElementById("btnInjExport").addEventListener("click", async () => {
      const ov = loadOverrides();
      const payload = {
        meta: { name: "overrides-export", version: "1.0", createdAt: nowISO() },
        files: Object.fromEntries(Object.entries(ov).map(([p,v]) => [p, v.content]))
      };
      const txt = JSON.stringify(payload, null, 2);
      try {
        await navigator.clipboard.writeText(txt);
        setOut("Export copiado para a área de transferência ✅");
      } catch {
        // fallback: joga no textarea
        input.value = txt;
        setOut("Não consegui copiar. Coloquei o export no textarea.");
      }
    });

    document.getElementById("btnInjClear").addEventListener("click", () => {
      localStorage.removeItem(OVERRIDES_KEY);
      setOut("Overrides zerados ✅");
      log("Overrides zerados ✅");
    });
  }

  // init
  window.addEventListener("load", () => {
    try { renderSettings(); } catch (e) { console.warn("Injector UI falhou:", e); }
  });

  // API global (pra você chamar pelo console/agent depois)
  window.RCF_INJECTOR = {
    OVERRIDES_KEY,
    loadOverrides,
    applyPack,
    applyFiles
  };
})();
