/* =========================================================
   /app/js/core/injector.js  (RCF Injector v2 - self-mount)
   - NÃO depende de #settingsMount existir.
   - Monta sozinho dentro da aba Settings.
   - Recebe pack JSON { meta, files, registryPatch }
   - Aplica arquivos via window.RCF_VFS.put() (SW override)
   - Clear via window.RCF_VFS.clearAll()
========================================================= */

(() => {
  "use strict";

  const TAG = "[INJECTOR]";
  const CARD_ID = "rcfInjectorCard";
  const INPUT_ID = "injInput";
  const OUT_ID = "injOut";
  const STATUS_ID = "injStatus";

  function log(...a) { try { console.log(TAG, ...a); } catch {} }

  function $(id) { return document.getElementById(id); }

  function safeParseJSON(txt) {
    try { return JSON.parse(txt); } catch { return null; }
  }

  function normPath(p) {
    p = String(p || "").trim();
    if (!p) return "";
    if (!p.startsWith("/")) p = "/" + p;
    // colapsa //
    p = p.replace(/\/{2,}/g, "/");
    // remove traversal básico
    if (p.includes("..")) p = p.replace(/\.\./g, "");
    return p;
  }

  function hasVFS() {
    return !!(window.RCF_VFS
      && typeof window.RCF_VFS.put === "function"
      && typeof window.RCF_VFS.clearAll === "function");
  }

  // aplica arquivos via SW override
  async function applyFilesViaVFS(filesMap) {
    if (!hasVFS()) {
      throw new Error("RCF_VFS não está disponível (vfs_overrides.js não carregou ou SW não controlou a página ainda).");
    }

    const keys = Object.keys(filesMap || {});
    let ok = 0, fail = 0;

    for (const k of keys) {
      const path = normPath(k);
      if (!path) continue;
      const content = String(filesMap[k] ?? "");
      try {
        await window.RCF_VFS.put(path, content);
        ok++;
      } catch (e) {
        log("VFS.put falhou:", path, e?.message || e);
        fail++;
      }
    }
    return { ok, fail, total: keys.length };
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

  async function applyPack(pack) {
    if (!pack || typeof pack !== "object") return { ok: false, msg: "Pack inválido." };

    const meta = pack.meta || {};
    const files = pack.files || {};
    const patch = pack.registryPatch || meta.registryPatch || null;

    const name = meta.name || "pack";
    const ver = meta.version || "1.0";

    const res = await applyFilesViaVFS(files);
    applyRegistryPatch(patch);

    const msg =
      `Aplicado: ${name} v${ver} — ok:${res.ok}/${res.total}` +
      (res.fail ? ` (falhas:${res.fail})` : "");

    return { ok: true, msg };
  }

  // acha um “container” confiável da aba Settings
  function findSettingsContainer() {
    // Tentativas comuns (sua UI parece ter views por id)
    const candidates = [
      document.getElementById("view-settings"),
      document.getElementById("settingsView"),
      document.getElementById("settings"),
      document.querySelector('[data-view="settings"]'),
    ].filter(Boolean);

    if (candidates.length) return candidates[0];

    // fallback: procura por título "Settings" e sobe um pai razoável
    const h = Array.from(document.querySelectorAll("h1,h2,h3")).find(el =>
      String(el.textContent || "").trim().toLowerCase() === "settings"
    );
    if (h) return h.closest("section,div") || h.parentElement;

    return null;
  }

  function setOut(txt) {
    const out = $(OUT_ID);
    if (out) out.textContent = String(txt || "Pronto.");
  }

  function setStatus(txt) {
    const st = $(STATUS_ID);
    if (st) st.textContent = String(txt || "");
  }

  function renderCard(container) {
    if (!container) return;

    // já existe?
    if ($(CARD_ID)) return;

    const card = document.createElement("div");
    card.className = "card";
    card.id = CARD_ID;
    card.style.pointerEvents = "auto";
    card.style.marginTop = "12px";

    card.innerHTML = `
      <h3>Injeção (Injector)</h3>
      <p class="hint">Cole um pack JSON (meta + files). Aplica via SW override (RCF_VFS). Sem mexer no core.</p>

      <textarea id="${INPUT_ID}" class="textarea mono" spellcheck="false"
        style="min-height:180px"
        placeholder='Cole um JSON:
{
  "meta": {"name":"pack-x","version":"1.0"},
  "files": { "/app/core/TESTE.txt": "OK" }
}'></textarea>

      <div class="row" style="gap:10px; flex-wrap:wrap">
        <button id="btnInjDry" class="btn" type="button">Dry-run</button>
        <button id="btnInjApply" class="btn primary" type="button">Aplicar pack</button>
        <button id="btnInjClear" class="btn danger" type="button">Zerar overrides</button>
      </div>

      <pre id="${OUT_ID}" class="mono small">Pronto.</pre>

      <div class="hint" style="margin-top:10px">
        Status: <span id="${STATUS_ID}">checando...</span>
      </div>
    `;

    // coloca no final da tela Settings (não remove nada existente)
    container.appendChild(card);

    // binds
    const input = $(INPUT_ID);

    setStatus(hasVFS()
      ? "RCF_VFS OK ✅ (override via SW)"
      : "RCF_VFS não disponível ❌ (recarregue 1x após instalar SW)");

    const btnDry = document.getElementById("btnInjDry");
    const btnApply = document.getElementById("btnInjApply");
    const btnClear = document.getElementById("btnInjClear");

    if (btnDry) btnDry.addEventListener("click", () => {
      const pack = safeParseJSON((input && input.value) || "");
      if (!pack) return setOut("JSON inválido (não parseou).");
      const files = pack.files || {};
      const keys = Object.keys(files);
      setOut(`OK (dry-run). Arquivos: ${keys.length}\n` + keys.slice(0, 120).join("\n"));
    });

    if (btnApply) btnApply.addEventListener("click", async () => {
      const pack = safeParseJSON((input && input.value) || "");
      if (!pack) return setOut("JSON inválido (não parseou).");

      try {
        setOut("Aplicando...");
        const res = await applyPack(pack);
        setOut(res.msg);
        setStatus("OK ✅");
      } catch (e) {
        const msg = `Falhou: ${e?.message || e}`;
        setOut(msg);
        setStatus("Erro ❌");
      }
    });

    if (btnClear) btnClear.addEventListener("click", async () => {
      try {
        if (!hasVFS()) throw new Error("RCF_VFS não disponível.");
        await window.RCF_VFS.clearAll();
        setOut("Overrides zerados ✅");
        setStatus("OK ✅");
      } catch (e) {
        const msg = `Falhou: ${e?.message || e}`;
        setOut(msg);
        setStatus("Erro ❌");
      }
    });

    log("Injector card mounted ✅");
  }

  function ensureMounted() {
    const container = findSettingsContainer();
    if (!container) {
      log("Settings container não encontrado ainda (vou tentar de novo).");
      return false;
    }
    renderCard(container);
    return true;
  }

  // tenta montar agora + retries (porque seu app renderiza views depois do boot)
  function mountWithRetries() {
    if (ensureMounted()) return;

    let tries = 0;
    const max = 40; // ~8s
    const t = setInterval(() => {
      tries++;
      if (ensureMounted() || tries >= max) clearInterval(t);
    }, 200);
  }

  // init
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountWithRetries);
  } else {
    mountWithRetries();
  }

  // API global
  window.RCF_INJECTOR = {
    applyPack,
    applyFilesViaVFS
  };

  log("injector.js loaded (v2 self-mount)");
})();
