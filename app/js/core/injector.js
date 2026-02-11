/* core/injector.js  (RCF Injector v1 - SW/VFS based)
   - Recebe pack JSON { meta, files, registryPatch }
   - Aplica arquivos via window.RCF_VFS.put() (SW override)
   - Clear via window.RCF_VFS.clearAll()
   - UI injeta dentro do #settingsMount (aba Settings)
*/
(() => {
  "use strict";

  const OUT_ID = "settingsOut";
  const MOUNT_ID = "settingsMount";

  function $(id){ return document.getElementById(id); }
  function nowISO(){ return new Date().toISOString(); }

  function log(msg){
    const el = $(OUT_ID);
    if (!el) return;
    el.textContent = String(msg || "Pronto.");
  }

  function safeParseJSON(txt){
    try { return JSON.parse(txt); } catch { return null; }
  }

  function normPath(p){
    p = String(p || "").trim();
    if (!p) return "";
    if (!p.startsWith("/")) p = "/" + p;
    return p;
  }

  function hasVFS(){
    return !!(window.RCF_VFS && typeof window.RCF_VFS.put === "function" && typeof window.RCF_VFS.clearAll === "function");
  }

  // aplica arquivos via SW override
  async function applyFilesViaVFS(filesMap){
    if (!hasVFS()) throw new Error("RCF_VFS não está disponível (vfs_overrides.js não carregou ou SW não controlou a página ainda).");

    const keys = Object.keys(filesMap || {});
    let ok = 0, fail = 0;

    for (const k of keys){
      const path = normPath(k);
      if (!path) continue;
      const content = String(filesMap[k] ?? "");
      try {
        await window.RCF_VFS.put(path, content);
        ok++;
      } catch (e) {
        console.warn("VFS.put falhou:", path, e);
        fail++;
      }
    }
    return { ok, fail, total: keys.length };
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

  async function applyPack(pack){
    if (!pack || typeof pack !== "object") return { ok:false, msg:"Pack inválido." };

    const meta = pack.meta || {};
    const files = pack.files || {};
    const patch = pack.registryPatch || meta.registryPatch || null;

    const name = meta.name || "pack";
    const ver  = meta.version || "1.0";

    const res = await applyFilesViaVFS(files);
    applyRegistryPatch(patch);

    const msg = `Aplicado: ${name} v${ver} — ok:${res.ok}/${res.total}` + (res.fail ? ` (falhas:${res.fail})` : "");
    return { ok:true, msg };
  }

  // iOS fallback: se overlay/pointer-events travar clique, capturamos e disparamos click no alvo
  function enableClickFallback(container){
    if (!container) return;

    // garante que o container receba eventos
    container.style.pointerEvents = "auto";

    container.addEventListener("click", (ev) => {
      const t = ev.target;
      if (!t) return;

      // se clicar em label, tenta clicar no input associado
      if (t.tagName === "LABEL") {
        const fid = t.getAttribute("for");
        if (fid) {
          const inp = document.getElementById(fid);
          if (inp && typeof inp.click === "function") inp.click();
        }
      }
    }, true);

    // captura toque e força focus/click em inputs (iOS às vezes “ignora”)
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

    mount.innerHTML = `
      <div class="card" style="margin-top:12px">
        <h3>Injeção (Receptor)</h3>
        <p class="hint">Cole um pack JSON (meta + files). Ele aplica via SW override (RCF_VFS). Sem quebrar base.</p>

        <textarea id="injInput" class="textarea mono" spellcheck="false"
          placeholder='Cole um JSON:
{
  "meta": {"name":"pack-x","version":"1.0"},
  "files": { "/core/TESTE.txt": "OK" }
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

    const input = document.getElementById("injInput");
    const out = document.getElementById("injOut");
    const status = document.getElementById("injStatus");

    enableClickFallback(mount);

    function setOut(t){ out.textContent = String(t || "Pronto."); }

    // status vfs/sw
    status.textContent = hasVFS()
      ? "RCF_VFS OK ✅ (override via SW)"
      : "RCF_VFS não disponível ❌ (recarregue 1x após instalar SW)";

    document.getElementById("btnInjDry").addEventListener("click", () => {
      const pack = safeParseJSON(input.value || "");
      if (!pack) return setOut("JSON inválido (não parseou).");
      const files = pack.files || {};
      const keys = Object.keys(files);
      setOut(`OK (dry-run). Arquivos: ${keys.length}\n` + keys.slice(0, 60).join("\n"));
    });

    document.getElementById("btnInjApply").addEventListener("click", async () => {
      const pack = safeParseJSON(input.value || "");
      if (!pack) return setOut("JSON inválido (não parseou).");

      try {
        setOut("Aplicando...");
        const res = await applyPack(pack);
        setOut(res.msg);
        log(res.msg);
      } catch (e) {
        const msg = `Falhou: ${e?.message || e}`;
        setOut(msg);
        log(msg);
      }
    });

    document.getElementById("btnInjClear").addEventListener("click", async () => {
      try {
        if (!hasVFS()) throw new Error("RCF_VFS não disponível.");
        await window.RCF_VFS.clearAll();
        setOut("Overrides zerados ✅");
        log("Overrides zerados ✅");
      } catch (e) {
        const msg = `Falhou: ${e?.message || e}`;
        setOut(msg);
        log(msg);
      }
    });
  }

  // init
  window.addEventListener("load", () => {
    try { renderSettings(); } catch (e) { console.warn("Injector UI falhou:", e); }
  });

  // API global
  window.RCF_INJECTOR = {
    applyPack,
    applyFilesViaVFS
  };
})();
