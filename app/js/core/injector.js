/* app/js/core/injector.js  (RCF Injector v2 - robust / iOS-safe)
   - Recebe pack JSON { meta, files, registryPatch }
   - Aplica arquivos via window.RCF_VFS.put() (SW override)
   - Clear via window.RCF_VFS.clearAll()
   - NÃO trava em "Aplicando..." (timeout + retry + progresso)
*/
(() => {
  "use strict";

  const OUT_ID = "settingsOut";
  const MOUNT_ID = "settingsMount";

  const TAG = "[INJECTOR]";
  const $ = (id) => document.getElementById(id);
  const nowISO = () => new Date().toISOString();

  const isIOS = () => {
    try {
      const ua = navigator.userAgent || "";
      return /iPhone|iPad|iPod/i.test(ua) && /AppleWebKit/i.test(ua);
    } catch { return false; }
  };

  function logTop(msg) {
    const el = $(OUT_ID);
    if (el) el.textContent = String(msg || "Pronto.");
    try { console.log(TAG, msg); } catch {}
  }

  function safeParseJSON(txt) {
    try { return JSON.parse(txt); } catch { return null; }
  }

  // root da Mãe (quando existir)
  function getMotherRoot() {
    try {
      const r = window.RCF_MAE?.status?.()?.motherRoot;
      if (typeof r === "string" && r.trim()) return r.trim();
    } catch {}
    // fallback (se não tiver status)
    return "/app";
  }

  // Normaliza: sempre começa com "/" e, se root for "/app",
  // converte "/app/x" -> "/x" (VFS costuma ser virtual-root)
  function normalizePath(p) {
    let path = String(p || "").trim();
    if (!path) return "";

    path = path.split("#")[0].split("?")[0].trim();
    if (!path.startsWith("/")) path = "/" + path;
    path = path.replace(/\/{2,}/g, "/");

    // anti traversal
    if (path.includes("..")) {
      path = path.replace(/\.\./g, "");
      path = path.replace(/\/{2,}/g, "/");
    }

    const root = getMotherRoot();
    if (root === "/app") {
      if (path === "/app") return "/";
      if (path.startsWith("/app/")) path = path.slice(4); // remove "/app"
      // IMPORTANT: manter "/" na frente
      if (!path.startsWith("/")) path = "/" + path;
    }

    return path;
  }

  function hasVFS() {
    return !!(window.RCF_VFS && typeof window.RCF_VFS.put === "function" && typeof window.RCF_VFS.clearAll === "function");
  }

  function withTimeout(promise, ms, label) {
    let t;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms em ${label}`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  }

  async function putWithRetry(path, content) {
    const timeoutBase = isIOS() ? 15000 : 8000;
    const timeouts = [timeoutBase, timeoutBase + 3000, timeoutBase + 6000];
    const backs = [250, 700, 1500];

    for (let i = 0; i < 3; i++) {
      try {
        const label = `RCF_VFS.put(${path})#${i + 1}`;
        const res = await withTimeout(
          Promise.resolve(window.RCF_VFS.put(path, content)),
          timeouts[i],
          label
        );
        return { ok: true, res };
      } catch (e) {
        if (i === 2) return { ok: false, error: e };
        await new Promise(r => setTimeout(r, backs[i]));
      }
    }
    return { ok: false, error: new Error("unknown put retry error") };
  }

  // aplica arquivos via SW override (robusto)
  async function applyFilesViaVFS(filesMap, uiHooks) {
    if (!hasVFS()) throw new Error("RCF_VFS não está disponível (SW ainda não controlou / vfs_overrides não carregou).");

    const keys = Object.keys(filesMap || {});
    const total = keys.length;

    let ok = 0, fail = 0;
    const details = [];

    for (let idx = 0; idx < keys.length; idx++) {
      const rawKey = keys[idx];
      const vPath = normalizePath(rawKey);
      if (!vPath) continue;

      const content = String(filesMap[rawKey] ?? "");

      uiHooks?.onStep?.(idx + 1, total, rawKey, vPath);

      const r = await putWithRetry(vPath, content);
      if (r.ok) {
        ok++;
        details.push({ path: vPath, status: "ok" });
      } else {
        fail++;
        details.push({ path: vPath, status: "fail", error: String(r.error?.message || r.error) });
        // continua (não trava)
      }
    }

    return { ok, fail, total, details };
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

  async function applyPack(pack, uiHooks) {
    if (!pack || typeof pack !== "object") return { ok: false, msg: "Pack inválido." };

    const meta = pack.meta || {};
    const files = pack.files || {};
    const patch = pack.registryPatch || meta.registryPatch || null;

    const name = meta.name || "pack";
    const ver = meta.version || "1.0";

    const res = await applyFilesViaVFS(files, uiHooks);
    applyRegistryPatch(patch);

    const msg =
      `Aplicado: ${name} v${ver}\n` +
      `ok: ${res.ok}/${res.total}` + (res.fail ? ` (falhas: ${res.fail})` : "") +
      `\nroot: ${getMotherRoot()}  (paths normalizados p/ VFS)` +
      `\n${nowISO()}`;

    return { ok: true, msg, res };
  }

  function enableClickFallback(container) {
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
    }, { capture: true, passive: true });
  }

  function renderSettings() {
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
      </div>
    `;

    enableClickFallback(mount);

    const input = $("injInput");
    const out = $("injOut");
    const status = $("injStatus");

    const setOut = (t) => { if (out) out.textContent = String(t || "Pronto."); };

    status.textContent = hasVFS()
      ? "RCF_VFS OK ✅ (override via SW)"
      : "RCF_VFS não disponível ❌ (recarregue 1x após instalar SW)";

    $("btnInjDry").addEventListener("click", () => {
      const pack = safeParseJSON(input.value || "");
      if (!pack) return setOut("JSON inválido (não parseou).");
      const files = pack.files || {};
      const keys = Object.keys(files);
      const preview = keys.map(k => `${k}  ->  ${normalizePath(k)}`).slice(0, 60).join("\n");
      setOut(`OK (dry-run). Arquivos: ${keys.length}\n\nNORMALIZAÇÃO:\n${preview}`);
    });

    $("btnInjApply").addEventListener("click", async () => {
      const pack = safeParseJSON(input.value || "");
      if (!pack) return setOut("JSON inválido (não parseou).");

      try {
        setOut("Aplicando...");
        logTop("Injector: aplicando pack...");

        const uiHooks = {
          onStep(step, total, raw, norm) {
            setOut(`Aplicando ${step}/${total}\nraw: ${raw}\nvfs: ${norm}`);
          }
        };

        const r = await applyPack(pack, uiHooks);

        // mostra detalhes
        const d = r?.res?.details || [];
        const lines = [];
        lines.push(r.msg);
        lines.push("");
        lines.push("Detalhes (VFS):");
        d.slice(0, 40).forEach((it) => {
          lines.push((it.status === "ok" ? "✅" : "❌") + " " + it.path + (it.error ? " — " + it.error : ""));
        });
        if (d.length > 40) lines.push("… +" + (d.length - 40));

        setOut(lines.join("\n"));
        logTop("Injector: pack aplicado.");
      } catch (e) {
        const msg = `Falhou: ${e?.message || e}`;
        setOut(msg);
        logTop(msg);
      }
    });

    $("btnInjClear").addEventListener("click", async () => {
      try {
        if (!hasVFS()) throw new Error("RCF_VFS não disponível.");
        setOut("Limpando overrides...");
        await withTimeout(Promise.resolve(window.RCF_VFS.clearAll()), isIOS() ? 15000 : 8000, "RCF_VFS.clearAll()");
        setOut("Overrides zerados ✅");
        logTop("Overrides zerados ✅");
      } catch (e) {
        const msg = `Falhou: ${e?.message || e}`;
        setOut(msg);
        logTop(msg);
      }
    });
  }

  window.addEventListener("load", () => {
    try { renderSettings(); } catch (e) { console.warn(TAG, "render falhou:", e); }
  });

  window.RCF_INJECTOR = {
    applyPack,
    applyFilesViaVFS,
    normalizePath
  };

  logTop("Injector v2 carregado ✅");
})();
