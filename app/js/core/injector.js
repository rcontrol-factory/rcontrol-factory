/* app/js/core/injector.js  (RCF Injector v2 - iOS-safe)
   - Recebe pack JSON { meta, files, registryPatch }
   - Aplica arquivos via VFS/SW com timeout + retry (evita "Aplicando..." infinito no iOS)
   - Normaliza paths e força root /app quando fizer sentido
   - Clear via clearAll()/clear()
   - UI injeta dentro do #settingsMount (aba Settings)
*/

(() => {
  "use strict";

  const OUT_ID = "settingsOut";
  const MOUNT_ID = "settingsMount";

  function $(id) { return document.getElementById(id); }
  function nowISO() { return new Date().toISOString(); }

  function log(msg) {
    const el = $(OUT_ID);
    if (!el) return;
    el.textContent = String(msg || "Pronto.");
  }

  function safeParseJSON(txt) {
    try { return JSON.parse(txt); } catch { return null; }
  }

  const isIOS = () => {
    try {
      const ua = navigator.userAgent || "";
      return /iPad|iPhone|iPod/.test(ua) && /AppleWebKit/.test(ua);
    } catch { return false; }
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Normaliza e protege path
  function sanitizePath(p) {
    p = String(p || "").trim();
    if (!p) return "";
    p = p.split("#")[0].split("?")[0].trim();
    if (!p.startsWith("/")) p = "/" + p;
    p = p.replace(/\/{2,}/g, "/");
    // anti traversal simples
    if (p.includes("..")) p = p.replace(/\.\./g, "");
    p = p.replace(/\/{2,}/g, "/");
    return p;
  }

  // Força /app quando é arquivo que claramente pertence ao app
  function toAppRootPath(input) {
    let p = sanitizePath(input);
    if (!p) return "";

    if (p.startsWith("/app/")) return p;

    // caminhos típicos do app
    if (p === "/index.html") return "/app/index.html";
    if (p === "/app.js") return "/app/app.js";
    if (p === "/styles.css") return "/app/styles.css";
    if (p === "/manifest.json") return "/app/manifest.json";
    if (p === "/sw.js") return "/app/sw.js";

    if (p.startsWith("/js/")) return "/app" + p;

    // arquivo na raiz (ex: /TESTE_OK.txt) → joga pra /app/
    if (/^\/[^/]+\.[a-z0-9]{1,8}$/i.test(p)) return "/app" + p;

    return p;
  }

  function guessType(path) {
    const p = String(path || "");
    if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
    if (p.endsWith(".css")) return "text/css; charset=utf-8";
    if (p.endsWith(".html")) return "text/html; charset=utf-8";
    if (p.endsWith(".json")) return "application/json; charset=utf-8";
    if (p.endsWith(".txt")) return "text/plain; charset=utf-8";
    return "text/plain; charset=utf-8";
  }

  function pickVFS() {
    // Preferir overrides, porque é exatamente o pipeline da Mãe (mais confiável)
    const o = window.RCF_VFS_OVERRIDES;
    if (o && typeof o.put === "function") {
      return {
        kind: "OVERRIDES",
        put: (path, content, contentType) => o.put(path, content, contentType),
        clear: () => (typeof o.clear === "function" ? o.clear() : Promise.resolve())
      };
    }

    const v = window.RCF_VFS;
    if (v && typeof v.put === "function") {
      // Alguns builds usam clearAll, outros clear
      const clearFn =
        (typeof v.clearAll === "function" && (() => v.clearAll())) ||
        (typeof v.clear === "function" && (() => v.clear())) ||
        (() => Promise.resolve());

      return {
        kind: "VFS",
        put: (path, content, contentType) => v.put(path, content, contentType),
        clear: clearFn
      };
    }

    return null;
  }

  function hasVFS() {
    return !!pickVFS();
  }

  function withTimeout(promise, ms, label) {
    let t;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms em: ${label}`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  }

  async function putWithRetry(vfs, path, content, contentType, onStep) {
    const baseTimeout = isIOS() ? 15000 : 8000;
    const timeouts = [baseTimeout, baseTimeout + 4000, baseTimeout + 8000];
    const backs = [300, 900, 1800];

    let lastErr = null;

    for (let i = 0; i < 3; i++) {
      try {
        onStep?.(`put try #${i + 1} (${vfs.kind}) — ${path}`);
        await withTimeout(
          Promise.resolve(vfs.put(path, content, contentType)),
          timeouts[i],
          `put(${path})`
        );
        onStep?.(`put ok — ${path}`);
        return { ok: true };
      } catch (e) {
        lastErr = e;
        onStep?.(`put err — ${path} — ${(e && e.message) ? e.message : String(e)}`);
        if (i < 2) await sleep(backs[i]);
      }
    }

    return { ok: false, error: lastErr ? (lastErr.message || String(lastErr)) : "unknown" };
  }

  // aplica arquivos via SW override / VFS
  async function applyFiles(filesMap, onStep) {
    const vfs = pickVFS();
    if (!vfs) throw new Error("RCF_VFS/RCF_VFS_OVERRIDES não está disponível (SW não controlou ainda ou vfs_overrides não carregou).");

    const rawKeys = Object.keys(filesMap || {});
    const keys = rawKeys.filter(Boolean);

    let ok = 0, fail = 0;

    for (let idx = 0; idx < keys.length; idx++) {
      const raw = keys[idx];
      const path = toAppRootPath(raw);
      const value = filesMap[raw];

      const content =
        (value && typeof value === "object" && "content" in value)
          ? String(value.content ?? "")
          : String(value ?? "");

      const contentType =
        (value && typeof value === "object" && value.contentType)
          ? String(value.contentType)
          : guessType(path);

      onStep?.(`(${idx + 1}/${keys.length}) aplicando: ${raw} → ${path}`);

      const r = await putWithRetry(vfs, path, content, contentType, onStep);
      if (r.ok) ok++;
      else fail++;
    }

    return { ok, fail, total: keys.length, vfsKind: vfs.kind };
  }

  function applyRegistryPatch(patch) {
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

  async function applyPack(pack, onStep) {
    if (!pack || typeof pack !== "object") return { ok: false, msg: "Pack inválido." };

    const meta = pack.meta || {};
    const files = pack.files || {};
    const patch = pack.registryPatch || meta.registryPatch || null;

    const name = meta.name || "pack";
    const ver = meta.version || "1.0";

    const res = await applyFiles(files, onStep);
    applyRegistryPatch(patch);

    const msg =
      `Aplicado: ${name} v${ver} — ok:${res.ok}/${res.total}` +
      (res.fail ? ` (falhas:${res.fail})` : "") +
      ` — via:${res.vfsKind}`;

    return { ok: true, msg };
  }

  // iOS: clique/toque às vezes "ignora" — reforço de interação
  function enableClickFallback(container) {
    if (!container) return;

    container.style.pointerEvents = "auto";

    // reduz "double tap" e travas
    try {
      container.style.touchAction = "manipulation";
      container.style.webkitTapHighlightColor = "transparent";
    } catch {}

    container.addEventListener("touchend", (ev) => {
      const t = ev.target;
      if (!t) return;
      const tag = (t.tagName || "").toLowerCase();
      if (tag === "button" && typeof t.click === "function") t.click();
      if ((tag === "input" || tag === "textarea") && typeof t.focus === "function") t.focus();
    }, { capture: true, passive: true });
  }

  function renderSettings() {
    const mount = $(MOUNT_ID);
    if (!mount) return;

    // Não apaga o Settings inteiro; só injeta o card do Injector se não existir
    if (document.getElementById("injCard")) return;

    const card = document.createElement("div");
    card.className = "card";
    card.id = "injCard";
    card.style.marginTop = "12px";

    card.innerHTML = `
      <h3>Injeção (Injector)</h3>
      <p class="hint">Cole um pack JSON (meta + files). Aplica via SW override (VFS) com timeout/retry (iOS-safe).</p>

      <textarea id="injInput" class="textarea mono" spellcheck="false"
        placeholder='Cole um JSON:
{
  "meta": {"name":"pack-x","version":"1.0"},
  "files": { "/TESTE_OK.txt": "OK" }
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
    `;

    mount.appendChild(card);
    enableClickFallback(mount);

    const input = document.getElementById("injInput");
    const out = document.getElementById("injOut");
    const status = document.getElementById("injStatus");

    function setOut(t) { out.textContent = String(t || "Pronto."); }

    const vfsNow = pickVFS();
    status.textContent = vfsNow
      ? `VFS OK ✅ (${vfsNow.kind})`
      : "VFS não disponível ❌ (recarregue 1x após instalar SW)";

    document.getElementById("btnInjDry").addEventListener("click", () => {
      const pack = safeParseJSON(input.value || "");
      if (!pack) return setOut("JSON inválido (não parseou).");
      const files = pack.files || {};
      const keys = Object.keys(files);
      const preview = keys.slice(0, 80).map(k => `${k}  →  ${toAppRootPath(k)}`).join("\n");
      setOut(`OK (dry-run). Arquivos: ${keys.length}\n\n${preview}${keys.length > 80 ? "\n\n… (cortado)" : ""}`);
    });

    document.getElementById("btnInjApply").addEventListener("click", async () => {
      const pack = safeParseJSON(input.value || "");
      if (!pack) return setOut("JSON inválido (não parseou).");

      try {
        const steps = [];
        const pushStep = (s) => {
          steps.push(`[${nowISO()}] ${s}`);
          // mantém só o final (não explodir memória)
          const tail = steps.slice(-40).join("\n");
          setOut("Aplicando...\n\n" + tail);
        };

        pushStep("start");
        const res = await applyPack(pack, pushStep);
        pushStep("done: " + res.msg);

        setOut(res.msg + "\n\n" + steps.slice(-40).join("\n"));
        log(res.msg);
      } catch (e) {
        const msg = `Falhou: ${e?.message || e}`;
        setOut(msg);
        log(msg);
      }
    });

    document.getElementById("btnInjClear").addEventListener("click", async () => {
      try {
        const vfs = pickVFS();
        if (!vfs) throw new Error("VFS não disponível.");
        await withTimeout(Promise.resolve(vfs.clear()), isIOS() ? 15000 : 8000, "clear()");
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
    applyFiles: (filesMap, onStep) => applyFiles(filesMap, onStep),
    _debug: { toAppRootPath, sanitizePath }
  };
})();
