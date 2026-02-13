/* RControl Factory — /app/js/admin.github.js (PADRÃO) — v1.4
   FIXES:
   - Monta o painel SOMENTE no Settings (procura settingsMount + fallbacks)
   - Não usa setInterval (evita travar UI / render do app)
   - Usa MutationObserver para remontar quando o Settings é re-renderizado
   - ClickFallback iOS (somente dentro do card do GitHub)
   - Normaliza path -> app/import/mother_bundle.json
*/
(() => {
  "use strict";

  // evita duplicar
  if (window.RCF_ADMIN_GITHUB && window.RCF_ADMIN_GITHUB.__v14) return;

  const CARD_ID = "rcfGitHubCard";
  const OUT_ID  = "rcfGitHubOut";
  const DEFAULT_PATH = "app/import/mother_bundle.json";

  function logger(lvl, msg){
    try { window.RCF_LOGGER?.push?.(lvl, String(msg)); } catch {}
    try { console.log("[GH-ADMIN]", lvl, msg); } catch {}
  }

  function $(id){ return document.getElementById(id); }

  function safeParse(raw, fallback){
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  }

  function loadCfg(){
    try {
      if (window.RCF_GH_SYNC?.loadConfig) return window.RCF_GH_SYNC.loadConfig() || {};
    } catch {}
    return safeParse(localStorage.getItem("rcf:ghcfg"), {}) || {};
  }

  function normalizePath(input){
    let p = String(input || "").trim();
    if (!p) return DEFAULT_PATH;

    // remove / iniciais
    p = p.replace(/^\/+/, "");

    // "mother_bundle.json" -> app/import/mother_bundle.json
    if (!p.includes("/")) p = `app/import/${p}`;

    // "import/..." -> "app/import/..."
    if (p.startsWith("import/")) p = "app/" + p;

    // "app/xxx" mas não "app/import/xxx" -> joga pra import
    if (p.startsWith("app/") && !p.startsWith("app/import/")) {
      const rest = p.slice("app/".length).replace(/^\/+/, "");
      p = "app/import/" + rest;
    }

    // colapsa barras
    p = p.replace(/\/{2,}/g, "/");

    return p || DEFAULT_PATH;
  }

  function enableClickFallback(container){
    if (!container) return;

    // iOS: alguns clicks em elementos dentro de áreas roláveis falham
    container.style.pointerEvents = "auto";

    container.addEventListener("touchend", (ev) => {
      const t = ev.target;
      if (!t) return;
      const tag = (t.tagName || "").toLowerCase();
      const isBtn = tag === "button";
      if (isBtn && typeof t.click === "function") t.click();
    }, { capture:true, passive:true });
  }

  function findSettingsMount(){
    // ✅ prioridade: settingsMount (padrão do Injector)
    const a = $("settingsMount");
    if (a) return a;

    // fallbacks comuns (caso seu app.js use outro id)
    const b = $("settings");
    if (b) return b;

    const c = document.querySelector('[data-view="settings"]');
    if (c) return c;

    return null;
  }

  function unmount(){
    const el = $(CARD_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function mount(){
    const mountEl = findSettingsMount();
    if (!mountEl) return false;

    // já montado
    if ($(CARD_ID)) return true;

    const cfg = loadCfg();
    const normPath = normalizePath(cfg.path || DEFAULT_PATH);

    const card = document.createElement("div");
    card.id = CARD_ID;
    card.className = "card";
    card.style.marginTop = "12px";
    card.innerHTML = `
      <h3>GitHub (Sync)</h3>
      <p class="hint">
        Bundle padrão: <code>${DEFAULT_PATH}</code><br/>
        (Se você digitar <code>import/mother_bundle.json</code>, eu salvo como <code>${DEFAULT_PATH}</code>)
      </p>

      <div class="row" style="gap:10px; flex-wrap:wrap">
        <label style="flex:1; min-width:160px">
          <div class="hint">Owner</div>
          <input id="ghOwner" class="input" placeholder="rcontrol-factory" />
        </label>

        <label style="flex:1; min-width:160px">
          <div class="hint">Repo</div>
          <input id="ghRepo" class="input" placeholder="rcontrol-factory" />
        </label>

        <label style="width:120px">
          <div class="hint">Branch</div>
          <input id="ghBranch" class="input" placeholder="main" />
        </label>
      </div>

      <label style="display:block; margin-top:10px">
        <div class="hint">Path</div>
        <input id="ghPath" class="input" placeholder="${DEFAULT_PATH}" />
      </label>

      <label style="display:block; margin-top:10px">
        <div class="hint">Token (PAT)</div>
        <input id="ghToken" class="input" placeholder="ghp_..." />
      </label>

      <div class="row" style="margin-top:12px; gap:10px; flex-wrap:wrap">
        <button id="btnGhSave" class="btn" type="button">Salvar cfg</button>
        <button id="btnGhTest" class="btn" type="button">Testar token</button>
        <button id="btnGhPull" class="btn" type="button">Pull bundle</button>
        <button id="btnGhPushMother" class="btn primary" type="button">Push Mother Bundle</button>
        <button id="btnMaeUpdate" class="btn" type="button">MAE update</button>
      </div>

      <pre id="${OUT_ID}" class="mono small" style="margin-top:10px">Pronto.</pre>
    `;

    mountEl.appendChild(card);
    enableClickFallback(card);

    // preencher campos
    $("ghOwner").value  = String(cfg.owner || "");
    $("ghRepo").value   = String(cfg.repo || "");
    $("ghBranch").value = String(cfg.branch || "main");
    $("ghPath").value   = normPath;
    $("ghToken").value  = String(cfg.token || "");

    function setOut(t){
      const out = $(OUT_ID);
      if (out) out.textContent = String(t || "");
    }

    // handlers
    $("btnGhSave").addEventListener("click", () => {
      try {
        if (!window.RCF_GH_SYNC?.saveConfig) throw new Error("RCF_GH_SYNC.saveConfig ausente");

        const rawPath = String($("ghPath").value || "");
        const fixedPath = normalizePath(rawPath);

        if (rawPath.trim() !== fixedPath.trim()) {
          logger("info", `path normalized: ${rawPath.trim() || "(empty)"} -> ${fixedPath}`);
        }

        const cfg2 = {
          owner:  String($("ghOwner").value || "").trim(),
          repo:   String($("ghRepo").value || "").trim(),
          branch: String($("ghBranch").value || "main").trim(),
          path:   fixedPath,
          token:  String($("ghToken").value || "").trim(),
        };

        window.RCF_GH_SYNC.saveConfig(cfg2);
        setOut("OK: ghcfg saved");
        logger("ok", "OK: ghcfg saved");
      } catch (e) {
        setOut("ERR: " + (e?.message || e));
        logger("err", "ghcfg save err: " + (e?.message || e));
      }
    });

    $("btnGhTest").addEventListener("click", async () => {
      try {
        if (!window.RCF_GH_SYNC?.test) throw new Error("RCF_GH_SYNC.test ausente");
        setOut("Testando token...");
        const msg = await window.RCF_GH_SYNC.test(loadCfg());
        setOut(msg);
        logger("ok", msg);
      } catch (e) {
        setOut("ERR: " + (e?.message || e));
        logger("err", "gh test err: " + (e?.message || e));
      }
    });

    $("btnGhPull").addEventListener("click", async () => {
      try {
        if (!window.RCF_GH_SYNC?.pull) throw new Error("RCF_GH_SYNC.pull ausente");
        setOut("Pull iniciando...");
        const txt = await window.RCF_GH_SYNC.pull(loadCfg());
        setOut("OK: pull ok (bytes=" + String(txt || "").length + ")");
        logger("ok", "GitHub: pull ok");
      } catch (e) {
        setOut("ERR: gh pull err: " + (e?.message || e));
        logger("err", "gh pull err: " + (e?.message || e));
      }
    });

    $("btnGhPushMother").addEventListener("click", async () => {
      try {
        if (!window.RCF_GH_SYNC?.pushMotherBundle) throw new Error("RCF_GH_SYNC.pushMotherBundle ausente");
        setOut("Push Mother Bundle iniciando...");
        await window.RCF_GH_SYNC.pushMotherBundle(loadCfg());
        setOut("OK: GitHub: pushMotherBundle ok");
        logger("ok", "GitHub: pushMotherBundle ok");
      } catch (e) {
        setOut("ERR: pushMotherBundle err: " + (e?.message || e));
        logger("err", "pushMotherBundle err: " + (e?.message || e));
      }
    });

    $("btnMaeUpdate").addEventListener("click", async () => {
      try {
        if (!window.RCF_MAE?.updateFromGitHub) throw new Error("RCF_MAE.updateFromGitHub ausente");
        setOut("MAE update iniciando...");
        const res = await window.RCF_MAE.updateFromGitHub({
          onProgress: (p) => {
            if (p?.step === "apply_progress") setOut(`Aplicando... ${p.done}/${p.total}`);
          }
        });
        setOut("OK: mae update ok " + JSON.stringify(res));
        logger("ok", "mae update ok");
      } catch (e) {
        setOut("ERR: mae update err: " + (e?.message || e));
        logger("err", "mae update err: " + (e?.message || e));
      }
    });

    logger("ok", "OK: admin.github.js ready ✅");
    return true;
  }

  // Observa re-render do app e remonta quando Settings aparece
  function startObserver(){
    const obs = new MutationObserver(() => {
      try {
        const mountEl = findSettingsMount();
        if (!mountEl) {
          // se saiu do settings e o card ficou preso em algum lugar, remove
          // (segurança)
          if ($(CARD_ID) && !document.body.contains(findSettingsMount())) {
            // não faz nada, porque findSettingsMount() é null aqui
          }
          return;
        }

        // se o mount existe e o card não, remonta
        if (!$(CARD_ID)) mount();
      } catch {}
    });

    obs.observe(document.documentElement, { childList:true, subtree:true });

    return obs;
  }

  // init
  window.addEventListener("load", () => {
    try { mount(); } catch {}
    try { startObserver(); } catch {}
  });

  window.RCF_ADMIN_GITHUB = { __v14: true, mount, unmount };
})();
