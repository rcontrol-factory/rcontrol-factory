/* app/js/core/injector.js  (RCF Injector v2 - iOS safe)
   - Recebe pack JSON { meta, files, registryPatch }
   - Aplica arquivos via window.RCF_VFS.put() (SW override)
   - Timeouts + retries (evita “Aplicando…” infinito)
   - Normaliza paths pra /app/* quando necessário
   - UI injeta dentro do #settingsMount (aba Settings)
*/
(() => {
  "use strict";

  const OUT_ID = "settingsOut";
  const MOUNT_ID = "settingsMount";

  function $(id){ return document.getElementById(id); }
  function nowISO(){ return new Date().toISOString(); }

  function logGlobal(msg){
    const el = $(OUT_ID);
    if (el) el.textContent = String(msg || "Pronto.");
  }

  function safeParseJSON(txt){
    try { return JSON.parse(txt); } catch { return null; }
  }

  const isIOS = () => {
    try {
      const ua = navigator.userAgent || "";
      return /iPad|iPhone|iPod/.test(ua) && /AppleWebKit/.test(ua);
    } catch { return false; }
  };

  function guessType(path) {
    const p = String(path || "");
    if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
    if (p.endsWith(".css")) return "text/css; charset=utf-8";
    if (p.endsWith(".html")) return "text/html; charset=utf-8";
    if (p.endsWith(".json")) return "application/json; charset=utf-8";
    if (p.endsWith(".svg")) return "image/svg+xml";
    if (p.endsWith(".png")) return "image/png";
    if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
    if (p.endsWith(".webp")) return "image/webp";
    if (p.endsWith(".ico")) return "image/x-icon";
    return "text/plain; charset=utf-8";
  }

  // Normaliza path e garante que o override trabalhe com /app/*
  function normalizePath(p){
    let path = String(p || "").trim();
    if (!path) return "";
    path = path.split("#")[0].split("?")[0].trim();
    if (!path.startsWith("/")) path = "/" + path;
    path = path.replace(/\/{2,}/g, "/");

    // Se já está em /app/, ok
    if (path.startsWith("/app/")) return path;

    // Se é arquivo “raiz” (ex: /index.html, /app.js, /styles.css), joga pra /app/
    const rootFiles = new Set([
      "/index.html",
      "/app.js",
      "/styles.css",
      "/manifest.json",
      "/sw.js",
      "/privacy.html",
      "/terms.html",
      "/recovery.html",
    ]);

    if (rootFiles.has(path)) return "/app" + path;

    // Se vier /js/... (módulos), normalmente é /app/js/...
    if (path.startsWith("/js/")) return "/app" + path;

    // Se parecer arquivo simples na raiz, joga pra /app/
    if (/^\/[^/]+\.(html|js|css|json|txt|md|png|jpg|jpeg|webp|svg|ico)$/i.test(path)) {
      return "/app" + path;
    }

    // Default: mantém
    return path;
  }

  function hasVFS(){
    return !!(window.RCF_VFS && typeof window.RCF_VFS.put === "function" && typeof window.RCF_VFS.clearAll === "function");
  }

  function withTimeout(promise, ms, label){
    let t;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms em ${label}`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  }

  async function putWithRetry(path, content){
    const vfs = window.RCF_VFS;
    const contentType = guessType(path);

    // iOS costuma precisar de timeout maior
    const base = isIOS() ? 12000 : 6000;
    const timeouts = [base, base + 4000, base + 8000];
    const backs = [250, 700, 1200];

    let lastErr = null;

    for (let i = 0; i < 3; i++){
      try {
        // tenta com 3 args (path, content, contentType). Se a implementação ignorar, ok.
        return await withTimeout(
          Promise.resolve(vfs.put(path, content, contentType)),
          timeouts[i],
          `RCF_VFS.put(${path})`
        );
      } catch (e) {
        lastErr = e;
        if (i < 2) {
          await new Promise(r => setTimeout(r, backs[i]));
        }
      }
    }
    throw lastErr || new Error("put failed");
  }

  // aplica arquivos via SW override
  async function applyFilesViaVFS(filesMap, uiProgress){
    if (!hasVFS()) {
      throw new Error("RCF_VFS não está disponível (vfs_overrides.js não carregou ou SW não controlou a página ainda).");
    }

    const keys = Object.keys(filesMap || {});
    let ok = 0, fail = 0;

    for (let idx = 0; idx < keys.length; idx++){
      const raw = keys[idx];
      const path = normalizePath(raw);
      if (!path) continue;

      const content = String(filesMap[raw] ?? "");

      if (typeof uiProgress === "function") {
        uiProgress(`Aplicando ${idx+1}/${keys.length}: ${path}`);
      }

      try {
        await putWithRetry(path, content);
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

  async function applyPack(pack, uiProgress){
    if (!pack || typeof pack !== "object") return { ok:false, msg:"Pack inválido." };

    const meta = pack.meta || {};
    const files = pack.files || {};
    const patch = pack.registryPatch || meta.registryPatch || null;

    const name = meta.name || "pack";
    const ver  = meta.version || "1.0";

    const res = await applyFilesViaVFS(files, uiProgress);
    applyRegistryPatch(patch);

    const msg = `Aplicado: ${name} v${ver} — ok:${res.ok}/${res.total}` + (res.fail ? ` (falhas:${res.fail})` : "");
    return { ok:true, msg };
  }

  // iOS fallback: se overlay/pointer-events travar clique, capturamos e disparamos click no alvo
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

    mount.innerHTML = `
      <div class="card" style="margin-top:12px">
        <h3>Injeção (Injector)</h3>
        <p class="hint">Cole um pack JSON (meta + files). Aplica via SW override (RCF_VFS). Sem mexer no core.</p>

        <textarea id="injInput" class="textarea mono" spellcheck="false"
          placeholder='Cole um JSON:
{
  "meta": {"name":"pack-x","version":"1.0"},
  "files": { "/app/TESTE_OK.txt": "INJECTION WORKING" }
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

    const input  = $("injInput");
    const out    = $("injOut");
    const status = $("injStatus");

    enableClickFallback(mount);

    function setOut(t){ if (out) out.textContent = String(t || "Pronto."); }

    status.textContent = hasVFS()
      ? "RCF_VFS OK ✅ (override via SW)"
      : "RCF_VFS não disponível ❌ (recarregue 1x após instalar SW)";

    $("btnInjDry").addEventListener("click", () => {
      const pack = safeParseJSON(input.value || "");
      if (!pack) return setOut("JSON inválido (não parseou).");
      const files = pack.files || {};
      const keys = Object.keys(files);
      setOut(`OK (dry-run). Arquivos: ${keys.length}\n` + keys.slice(0, 60).join("\n"));
    });

    $("btnInjApply").addEventListener("click", async () => {
      const pack = safeParseJSON(input.value || "");
      if (!pack) return setOut("JSON inválido (não parseou).");

      try {
        setOut("Aplicando...");
        const res = await applyPack(pack, (p) => setOut(p));
        setOut(res.msg);
        logGlobal(res.msg);
      } catch (e) {
        const msg = `Falhou: ${e?.message || e}`;
        setOut(msg);
        logGlobal(msg);
      }
    });

    $("btnInjClear").addEventListener("click", async () => {
      try {
        if (!hasVFS()) throw new Error("RCF_VFS não disponível.");
        await withTimeout(window.RCF_VFS.clearAll(), isIOS() ? 12000 : 6000, "RCF_VFS.clearAll()");
        setOut("Overrides zerados ✅");
        logGlobal("Overrides zerados ✅");
      } catch (e) {
        const msg = `Falhou: ${e?.message || e}`;
        setOut(msg);
        logGlobal(msg);
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
