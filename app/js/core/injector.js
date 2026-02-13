/* =========================================================
  app/js/core/injector.js  (RCF Injector v3 - iOS safe)
  - Recebe pack JSON { meta, files, registryPatch }
  - Aplica arquivos via VFS override (prefer: RCF_VFS_OVERRIDES.put)
  - Normaliza path pro motherRoot "/app" (prefixa /app quando faltar)
  - Timeout + retry por arquivo (não fica preso em "Aplicando...")
  - Log detalhado dentro do card
========================================================= */

(() => {
  "use strict";

  const OUT_ID = "injOut";
  const MOUNT_ID = "settingsMount";

  function $(id){ return document.getElementById(id); }
  function nowISO(){ return new Date().toISOString(); }

  function setOut(msg){
    const el = $(OUT_ID);
    if (el) el.textContent = String(msg || "Pronto.");
  }

  function appendOut(line){
    const el = $(OUT_ID);
    if (!el) return;
    el.textContent = (el.textContent ? el.textContent + "\n" : "") + String(line || "");
  }

  function safeParseJSON(txt){
    try { return JSON.parse(txt); } catch { return null; }
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function isIOS(){
    try {
      const ua = navigator.userAgent || "";
      return /iPad|iPhone|iPod/.test(ua) && /AppleWebKit/.test(ua);
    } catch { return false; }
  }

  // ---- VFS selector (prefer overrides)
  function getVFS(){
    const ov = window.RCF_VFS_OVERRIDES;
    if (ov && typeof ov.put === "function") {
      return { type: "RCF_VFS_OVERRIDES", put: ov.put.bind(ov), clear: ov.clear?.bind(ov) };
    }
    const v = window.RCF_VFS;
    if (v && typeof v.put === "function") {
      // alguns builds tem clearAll
      const clear = (typeof v.clearAll === "function") ? v.clearAll.bind(v)
                  : (typeof v.clear === "function") ? v.clear.bind(v)
                  : null;
      return { type: "RCF_VFS", put: v.put.bind(v), clear };
    }
    return null;
  }

  // ---- path normalize: sempre escrever em /app/*
  function normPath(p){
    let path = String(p || "").trim();
    if (!path) return "";
    path = path.split("#")[0].split("?")[0].trim();
    if (!path.startsWith("/")) path = "/" + path;
    path = path.replace(/\/{2,}/g, "/");

    // bloqueia traversal
    if (path.includes("..")) {
      path = path.replace(/\.\./g, "");
      path = path.replace(/\/{2,}/g, "/");
    }

    // motherRoot fixo do seu check
    const root = "/app";
    if (!path.startsWith(root + "/")) path = root + path; // prefixa /app
    return path;
  }

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

  function withTimeout(promise, ms, label){
    let t;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms em ${label}`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  }

  // ---- registry patch (mantém compat)
  function applyRegistryPatch(patch){
    if (!patch || typeof patch !== "object") return;
    const R = window.RCF_REGISTRY;
    if (!R) return;

    try {
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
    } catch (e) {
      appendOut("⚠️ registryPatch falhou: " + (e?.message || e));
    }
  }

  // ---- apply files with retry/timeout (iOS-safe)
  async function applyFiles(filesMap){
    const vfs = getVFS();
    if (!vfs) throw new Error("VFS não disponível (RCF_VFS_OVERRIDES/RCF_VFS). Recarregue 1x.");

    const keys = Object.keys(filesMap || {});
    if (!keys.length) return { ok: 0, fail: 0, total: 0, vfs: vfs.type };

    const ios = isIOS();
    const timeoutMs = ios ? 12000 : 7000; // iOS precisa maior
    const retries = ios ? 2 : 1;

    let ok = 0, fail = 0;

    appendOut(`VFS: ${vfs.type} ✅`);
    appendOut(`Arquivos: ${keys.length}`);
    appendOut(`Timeout por arquivo: ${timeoutMs}ms | Retries: ${retries}`);
    appendOut("----");

    for (let idx = 0; idx < keys.length; idx++){
      const raw = keys[idx];
      const path = normPath(raw);

      const v = filesMap[raw];
      const content =
        (v && typeof v === "object" && "content" in v)
          ? String(v.content ?? "")
          : String(v ?? "");

      const contentType =
        (v && typeof v === "object" && v.contentType)
          ? String(v.contentType)
          : guessType(path);

      const label = `${idx+1}/${keys.length} put(${path})`;

      let done = false;
      for (let r = 0; r <= retries; r++){
        try {
          appendOut(`→ ${label} (try ${r+1})`);
          // IMPORTANTE: passa contentType (muitos puts do seu core aceitam 3 args)
          await withTimeout(Promise.resolve(vfs.put(path, content, contentType)), timeoutMs, label);
          appendOut(`✅ ok: ${path}`);
          ok++;
          done = true;
          break;
        } catch (e) {
          const msg = e?.message || e;
          appendOut(`❌ err: ${path} :: ${msg}`);
          if (r < retries) await sleep(500 + r*700);
        }
      }

      if (!done) fail++;
    }

    appendOut("----");
    appendOut(`RESULTADO: ok=${ok} fail=${fail} total=${keys.length}`);
    return { ok, fail, total: keys.length, vfs: vfs.type };
  }

  async function applyPack(pack){
    if (!pack || typeof pack !== "object") return { ok:false, msg:"Pack inválido." };

    const meta = pack.meta || {};
    const files = pack.files || {};
    const patch = pack.registryPatch || meta.registryPatch || null;

    const name = meta.name || "pack";
    const ver  = meta.version || "1.0";

    setOut(`Aplicando ${name} v${ver}...`);
    appendOut(`at: ${nowISO()}`);

    const res = await applyFiles(files);
    applyRegistryPatch(patch);

    const msg = `Aplicado: ${name} v${ver} — ok:${res.ok}/${res.total}` + (res.fail ? ` (falhas:${res.fail})` : "");
    appendOut(msg);
    return { ok:true, msg };
  }

  async function clearOverrides(){
    const vfs = getVFS();
    if (!vfs || typeof vfs.clear !== "function") {
      throw new Error("Clear não disponível neste VFS (sem clear/clearAll).");
    }
    setOut("Limpando overrides...");
    await withTimeout(Promise.resolve(vfs.clear()), 10000, "clearOverrides()");
    setOut("Overrides zerados ✅");
  }

  // iOS click fallback
  function bindTap(el, fn){
    if (!el) return;
    let last = 0;
    const guard = 450;

    const handler = async (e) => {
      const now = Date.now();
      if (now - last < guard) { try { e.preventDefault(); e.stopPropagation(); } catch {} ; return; }
      last = now;
      try { e.preventDefault(); e.stopPropagation(); } catch {}
      try { await fn(e); } catch (err) { setOut("Falhou: " + (err?.message || err)); }
    };

    el.style.pointerEvents = "auto";
    el.style.touchAction = "manipulation";
    el.style.webkitTapHighlightColor = "transparent";

    el.addEventListener("touchend", handler, { passive: false, capture: true });
    el.addEventListener("click", handler, { passive: false, capture: true });
  }

  function render(){
    const mount = $(MOUNT_ID);
    if (!mount) return;

    // não duplicar
    if ($("rcfInjectorCard")) return;

    const card = document.createElement("div");
    card.className = "card";
    card.id = "rcfInjectorCard";
    card.style.pointerEvents = "auto";

    card.innerHTML = `
      <h3>Injeção (Injector)</h3>
      <p class="hint">Cole um pack JSON (meta + files). Aplica via VFS override. (v3: timeout + /app prefix)</p>

      <textarea id="injInput" class="textarea mono" spellcheck="false"
        placeholder='Exemplo:
{
  "meta": {"name":"teste","version":"1.0"},
  "files": { "/TESTE_OK.txt": "INJECTION OK" }
}'></textarea>

      <div class="row" style="gap:10px; flex-wrap:wrap">
        <button id="btnInjDry" class="btn" type="button">Dry-run</button>
        <button id="btnInjApply" class="btn primary" type="button">Aplicar pack</button>
        <button id="btnInjClear" class="btn danger" type="button">Zerar overrides</button>
      </div>

      <pre id="injOut" class="mono small">Pronto.</pre>

      <div class="hint" style="margin-top:10px">
        Status: <span id="injStatus">checando...</span>
      </div>
    `;

    mount.appendChild(card);

    const status = $("injStatus");
    const vfs = getVFS();
    const sw = !!navigator.serviceWorker;
    const ctl = !!navigator.serviceWorker?.controller;

    if (status) {
      status.textContent = vfs
        ? `${vfs.type} OK ✅ | SW:${sw ? "sim" : "não"} | controlled:${ctl ? "sim" : "não"}`
        : `VFS não disponível ❌ | SW:${sw ? "sim" : "não"} | controlled:${ctl ? "sim" : "não"}`;
    }

    const input = $("injInput");

    bindTap($("btnInjDry"), () => {
      const pack = safeParseJSON((input && input.value) || "");
      if (!pack) return setOut("JSON inválido (não parseou).");
      const files = pack.files || {};
      const keys = Object.keys(files);
      setOut(`OK (dry-run). Arquivos: ${keys.length}\n` + keys.slice(0, 80).map(k => "• " + normPath(k)).join("\n"));
    });

    bindTap($("btnInjApply"), async () => {
      const pack = safeParseJSON((input && input.value) || "");
      if (!pack) return setOut("JSON inválido (não parseou).");
      setOut("Aplicando...");
      const res = await applyPack(pack);
      setOut(res.msg);
    });

    bindTap($("btnInjClear"), async () => {
      await clearOverrides();
    });
  }

  window.addEventListener("load", () => {
    try { render(); } catch (e) { console.warn("Injector render falhou:", e); }
  });

  // API global
  window.RCF_INJECTOR = {
    applyPack,
    applyFiles: applyFiles
  };
})();
