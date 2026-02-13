/* app/js/core/injector.js  (RCF Injector v2 - iOS SAFE)
   - Recebe pack JSON { meta, files, registryPatch }
   - Aplica arquivos via VFS Overrides (SW) com timeout + retry
   - Corrige path automaticamente para /app/*
   - UI fica na aba Settings (#settingsMount)
*/

(() => {
  "use strict";

  const OUT_ID = "settingsOut";
  const MOUNT_ID = "settingsMount";

  function $(id){ return document.getElementById(id); }
  function nowISO(){ return new Date().toISOString(); }

  function logLine(msg){
    const el = $(OUT_ID);
    if (!el) return;
    el.textContent = String(msg || "Pronto.");
  }

  function safeParseJSON(txt){
    try { return JSON.parse(txt); } catch { return null; }
  }

  // ---------- VFS DETECTION ----------
  function getVFS(){
    // prioridade: overrides (é o que o mother_selfupdate usa)
    const o = window.RCF_VFS_OVERRIDES;
    if (o && typeof o.put === "function") return { api: o, kind: "RCF_VFS_OVERRIDES", hasClear: typeof o.clear === "function" };

    // fallback antigo
    const v = window.RCF_VFS;
    if (v && typeof v.put === "function") return { api: v, kind: "RCF_VFS", hasClear: typeof v.clearAll === "function" || typeof v.clear === "function" };

    return null;
  }

  function isIOS(){
    try {
      const ua = navigator.userAgent || "";
      return /iPad|iPhone|iPod/.test(ua) && /AppleWebKit/.test(ua);
    } catch { return false; }
  }

  function withTimeout(promise, ms, label){
    let t;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms em: ${label}`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  }

  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

  // ---------- PATH NORMALIZATION (FORÇA /app) ----------
  function normPath(raw){
    let p = String(raw || "").trim();
    if (!p) return "";
    p = p.split("#")[0].split("?")[0].trim();
    if (!p.startsWith("/")) p = "/" + p;
    p = p.replace(/\/{2,}/g, "/");

    // se já está em /app/, ok
    if (p.startsWith("/app/")) return p;

    // arquivos raiz comuns -> joga pra /app/
    // (mantém compatível com teu repo que tem /app/index.html, /app/app.js etc)
    return "/app" + p;
  }

  function guessType(path){
    const p = String(path || "");
    if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
    if (p.endsWith(".css")) return "text/css; charset=utf-8";
    if (p.endsWith(".html")) return "text/html; charset=utf-8";
    if (p.endsWith(".json")) return "application/json; charset=utf-8";
    if (p.endsWith(".svg")) return "image/svg+xml";
    if (p.endsWith(".txt") || p.endsWith(".md")) return "text/plain; charset=utf-8";
    return "text/plain; charset=utf-8";
  }

  // ---------- APPLY VIA VFS (timeout + retry) ----------
  async function putWithRetry(vfsApi, path, content, contentType){
    const p2 = normPath(path);
    const ios = isIOS();

    // iOS: timeout maior e backoff
    const timeouts = ios ? [15000, 20000, 25000] : [8000, 12000, 15000];
    const backs    = ios ? [400, 900, 1600] : [250, 600, 1200];

    const putFn = vfsApi.put.bind(vfsApi);

    for (let i = 0; i < 3; i++){
      try {
        const label = `put(${p2})#${i+1}`;
        const r = await withTimeout(
          Promise.resolve(putFn(p2, String(content ?? ""), contentType || guessType(p2))),
          timeouts[i],
          label
        );
        return { ok:true, path:p2, tries:i+1, res:r };
      } catch (e){
        if (i < 2) await sleep(backs[i]);
        else return { ok:false, path:p2, tries:3, error: (e?.message || String(e)) };
      }
    }
    return { ok:false, path:p2, tries:3, error:"unknown" };
  }

  async function applyFilesViaVFS(filesMap, uiCb){
    const v = getVFS();
    if (!v) throw new Error("VFS não disponível. (Sem RCF_VFS_OVERRIDES/RCF_VFS)");

    const keys = Object.keys(filesMap || {});
    const total = keys.length;

    let ok = 0, fail = 0;

    for (let idx = 0; idx < total; idx++){
      const rawPath = keys[idx];
      const value = filesMap[rawPath];

      const content =
        (value && typeof value === "object" && "content" in value)
          ? String(value.content ?? "")
          : String(value ?? "");

      const contentType =
        (value && typeof value === "object" && value.contentType)
          ? String(value.contentType)
          : guessType(rawPath);

      const r = await putWithRetry(v.api, rawPath, content, contentType);

      if (r.ok) ok++; else fail++;

      if (typeof uiCb === "function"){
        uiCb({ idx: idx+1, total, ok, fail, last: r });
      }
    }

    return { ok, fail, total, kind: v.kind };
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

  async function applyPack(pack, uiCb){
    if (!pack || typeof pack !== "object") return { ok:false, msg:"Pack inválido." };

    const meta = pack.meta || {};
    const files = pack.files || {};
    const patch = pack.registryPatch || meta.registryPatch || null;

    const name = meta.name || "pack";
    const ver  = meta.version || "1.0";

    const res = await applyFilesViaVFS(files, uiCb);
    applyRegistryPatch(patch);

    const msg =
      `Aplicado: ${name} v${ver}\n` +
      `VFS: ${res.kind}\n` +
      `ok: ${res.ok}/${res.total}` + (res.fail ? ` (falhas: ${res.fail})` : "");

    return { ok: res.fail === 0, msg };
  }

  async function clearOverrides(){
    const v = getVFS();
    if (!v) throw new Error("VFS não disponível.");

    // clear depende do tipo
    if (v.kind === "RCF_VFS_OVERRIDES"){
      if (typeof v.api.clear !== "function") throw new Error("RCF_VFS_OVERRIDES.clear() não existe.");
      await v.api.clear();
      return true;
    }

    // fallback
    if (typeof v.api.clearAll === "function") { await v.api.clearAll(); return true; }
    if (typeof v.api.clear === "function") { await v.api.clear(); return true; }

    throw new Error("VFS clear não encontrado.");
  }

  // ---------- UI ----------
  function enableClickFallback(container){
    if (!container) return;
    container.style.pointerEvents = "auto";
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
        <p class="hint">Cole um pack JSON (meta + files). Aplica via SW override (VFS). Sem mexer no core.</p>

        <textarea id="injInput" class="textarea mono" spellcheck="false"
          placeholder='Cole um JSON:
{
  "meta": {"name":"pack-x","version":"1.0"},
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

    const input = $("injInput");
    const out = $("injOut");
    const status = $("injStatus");
    enableClickFallback(mount);

    function setOut(t){ if (out) out.textContent = String(t || "Pronto."); }

    const v = getVFS();
    status.textContent = v
      ? `${v.kind} OK ✅ (override via SW)`
      : "VFS não disponível ❌ (recarregue 1x após instalar SW)";

    $("btnInjDry").addEventListener("click", () => {
      const pack = safeParseJSON(input.value || "");
      if (!pack) return setOut("JSON inválido (não parseou).");
      const files = pack.files || {};
      const keys = Object.keys(files);
      const preview = keys.slice(0, 80).map(k => `${k}  ->  ${normPath(k)}`).join("\n");
      setOut(`OK (dry-run). Arquivos: ${keys.length}\n\n${preview}`);
    });

    $("btnInjApply").addEventListener("click", async () => {
      const pack = safeParseJSON(input.value || "");
      if (!pack) return setOut("JSON inválido (não parseou).");

      setOut("Aplicando...");
      logLine("Injector: aplicando...");

      try {
        const res = await applyPack(pack, (p) => {
          const last = p.last;
          const line =
            `Aplicando ${p.idx}/${p.total} | ok:${p.ok} fail:${p.fail}\n` +
            `${last.ok ? "✅" : "❌"} ${last.path}` +
            (last.ok ? ` (tries:${last.tries})` : ` (erro:${last.error})`);
          setOut(line);
          logLine(line);
        });

        setOut(res.msg);
        logLine(res.msg);
      } catch (e) {
        const msg = `Falhou: ${e?.message || e}`;
        setOut(msg);
        logLine(msg);
      }
    });

    $("btnInjClear").addEventListener("click", async () => {
      setOut("Limpando overrides...");
      logLine("Injector: limpando overrides...");
      try {
        await clearOverrides();
        setOut("Overrides zerados ✅");
        logLine("Overrides zerados ✅");
      } catch (e) {
        const msg = `Falhou: ${e?.message || e}`;
        setOut(msg);
        logLine(msg);
      }
    });
  }

  // init
  window.addEventListener("load", () => {
    try { renderSettings(); } catch (e) { console.warn("Injector UI falhou:", e); }
  });

  // API global (pra debug)
  window.RCF_INJECTOR = {
    applyPack,
    applyFilesViaVFS,
    normPath
  };
})();
