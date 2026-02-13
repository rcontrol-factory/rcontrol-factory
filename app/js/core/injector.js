/* core/injector.js  (RCF Injector v1 - SW/VFS based) — PATCHED
   - Recebe pack JSON { meta, files, registryPatch }
   - Aplica arquivos via window.RCF_VFS.put() (SW override)
   - Clear via window.RCF_VFS.clearAll()
   - UI injeta dentro do #settingsMount (aba Settings)

   PATCH:
   - normalizePath com root /app (evita escrever em /index.html quando o real é /app/index.html)
   - put robusto iOS: timeout 15s + retries (3) + backoff
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

  const TAG = "[INJECTOR]";
  const isIOS = () => {
    try {
      const ua = navigator.userAgent || "";
      return /iPad|iPhone|iPod/.test(ua) && /AppleWebKit/.test(ua);
    } catch { return false; }
  };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // ===== PATH NORMALIZATION (root /app) =====
  function normalizePath(p){
    let path = String(p || "").trim();
    if (!path) return "";

    // remove query/hash
    path = path.split("#")[0].split("?")[0];

    // garantir leading slash
    if (!path.startsWith("/")) path = "/" + path;

    // colapsar barras
    path = path.replace(/\/{2,}/g, "/");

    // impedir traversal
    if (path.includes("..")) {
      path = path.replace(/\.\./g, "");
      path = path.replace(/\/{2,}/g, "/");
    }

    // se já está em /app/
    if (path.startsWith("/app/")) return path;

    // mapear arquivos raiz conhecidos -> /app/*
    const rootMap = new Set([
      "/index.html",
      "/styles.css",
      "/app.js",
      "/sw.js",
      "/manifest.json",
      "/privacy.html",
      "/recovery.html",
      "/terms.html",
    ]);
    if (rootMap.has(path)) return "/app" + path;

    // mapear /js/* -> /app/js/*
    if (path.startsWith("/js/")) return "/app" + path;

    // se é arquivo na raiz, joga pra /app/
    if (/^\/[^/]+\.(html|js|css|json|txt|md|png|jpg|jpeg|webp|svg|ico)$/i.test(path)) {
      return "/app" + path;
    }

    return path;
  }

  function hasVFS(){
    return !!(window.RCF_VFS && typeof window.RCF_VFS.put === "function" && typeof window.RCF_VFS.clearAll === "function");
  }

  // ===== PUT ROBUSTO (iOS anti-timeout) =====
  async function vfsPutRobust(path, content){
    if (!hasVFS()) throw new Error("RCF_VFS não está disponível (vfs_overrides.js não carregou ou SW não controlou a página ainda).");

    const p2 = normalizePath(path);

    const base = isIOS() ? 15000 : 5000;
    const timeouts = [base, base + 2000, base + 4000];
    const backs = [300, 800, 1500];

    const put = window.RCF_VFS.put.bind(window.RCF_VFS);

    for (let i = 0; i < 3; i++){
      try {
        console.log(TAG, `put try #${i+1}`, path, "->", p2, `timeout=${timeouts[i]}ms`);

        // Se o RCF_VFS.put não suporta timeout, ele ignora. Mesmo assim o retry ajuda.
        const res = await Promise.race([
          put(p2, content),
          new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${timeouts[i]}ms em: put(${p2})`)), timeouts[i]))
        ]);

        console.log(TAG, "put ok", p2);
        return res;
      } catch (e) {
        console.warn(TAG, "put err", p2, e?.message || e);
        if (i < 2) await sleep(backs[i]);
      }
    }

    throw new Error(`${TAG} put failed after retries: ${p2}`);
  }

  // aplica arquivos via SW override (robusto)
  async function applyFilesViaVFS(filesMap){
    const keys = Object.keys(filesMap || {});
    let ok = 0, fail = 0;

    for (const k of keys){
      const path = String(k || "").trim();
      if (!path) continue;

      const content = String(filesMap[k] ?? "");
      try {
        await vfsPutRobust(path, content);
        ok++;
      } catch (e) {
        console.warn(TAG, "VFS.put falhou:", path, e);
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
        <h3>Injeção (Receptor)</h3>
        <p class="hint">Cole um pack JSON (meta + files). Ele aplica via SW override (RCF_VFS). Sem quebrar base.</p>

        <textarea id="injInput" class="textarea mono" spellcheck="false"
          placeholder='Cole um JSON:
{
  "meta": {"name":"pack-x","version":"1.0"},
  "files": { "/index.html": "OK" }
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

    status.textContent = hasVFS()
      ? `RCF_VFS OK ✅ (override via SW) — iOS=${isIOS() ? "sim" : "não"}`
      : "RCF_VFS não disponível ❌ (recarregue 1x após instalar SW)";

    document.getElementById("btnInjDry").addEventListener("click", () => {
      const pack = safeParseJSON(input.value || "");
      if (!pack) return setOut("JSON inválido (não parseou).");
      const files = pack.files || {};
      const keys = Object.keys(files);
      const preview = keys.slice(0, 60).map(k => `${k} -> ${normalizePath(k)}`).join("\n");
      setOut(`OK (dry-run). Arquivos: ${keys.length}\n` + preview);
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

  window.addEventListener("load", () => {
    try { renderSettings(); } catch (e) { console.warn("Injector UI falhou:", e); }
  });

  window.RCF_INJECTOR = {
    applyPack,
    applyFilesViaVFS
  };
})();
