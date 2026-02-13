/* RControl Factory — /app/js/admin.github.js (PADRÃO) — v2.5
   FIX UI (sem grudar em outras telas):
   - Renderiza GitHub Sync SOMENTE quando a tela ativa for "Settings"
   - Colapsado por padrão (abre/fecha)
   - Nunca usa position:fixed (nada overlay global)
   - Auto-repara se a UI for “apagada” pelo app.js (re-render leve)
*/
(() => {
  "use strict";

  if (window.RCF_ADMIN_GH && window.RCF_ADMIN_GH.__v25) return;

  const MOUNT_ID = "settingsMount";
  const OUT_ID = "settingsOut";
  const UI_OPEN_KEY = "rcf:ghui:open";

  const log = (lvl, msg) => {
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[GHUI]", lvl, msg); } catch {}
  };

  function $(id){ return document.getElementById(id); }

  function safeParse(raw, fallback){
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  }

  function getCfg(){
    if (window.RCF_GH_SYNC?.loadConfig) return window.RCF_GH_SYNC.loadConfig();
    return safeParse(localStorage.getItem("rcf:ghcfg"), {}) || {};
  }

  function saveCfg(cfg){
    if (window.RCF_GH_SYNC?.saveConfig) return window.RCF_GH_SYNC.saveConfig(cfg);
    const safe = {
      owner: String(cfg.owner || "").trim(),
      repo: String(cfg.repo || "").trim(),
      branch: String(cfg.branch || "main").trim(),
      path: String(cfg.path || "app/import/mother_bundle.json").trim(),
      token: String(cfg.token || "").trim(),
    };
    localStorage.setItem("rcf:ghcfg", JSON.stringify(safe));
    return safe;
  }

  function setOut(text){
    const out = $(OUT_ID);
    if (out) out.textContent = String(text || "");
  }

  function normalizePathInput(p){
    let x = String(p || "").trim();
    if (!x) return "app/import/mother_bundle.json";
    x = x.replace(/^\/+/, "");
    if (x.startsWith("import/")) x = "app/" + x;
    return x;
  }

  function enableClickFallback(container){
    if (!container) return;
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

  // ✅ Detecta se a tela atual é Settings (pela presença do título "Settings")
  function isSettingsScreen(){
    const headings = Array.from(document.querySelectorAll("h1,h2,h3,.title,.viewTitle"));
    for (const el of headings) {
      const t = String(el?.textContent || "").trim().toLowerCase();
      if (t === "settings") return true;
    }
    // fallback: se existir o mount e um texto "Segurança" + "Settings" no topo do conteúdo
    const bodyText = String(document.body?.innerText || "").toLowerCase();
    if (bodyText.includes("\nsettings") || bodyText.includes("settings\n")) return true;
    return false;
  }

  function alreadyMounted(){
    return !!document.getElementById("rcfGhCard");
  }

  function render(){
    const mount = $(MOUNT_ID);
    if (!mount) return false;
    if (!isSettingsScreen()) return false; // ✅ não injeta fora do Settings
    if (alreadyMounted()) return true;

    const open = localStorage.getItem(UI_OPEN_KEY) === "1";

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <div class="card" id="rcfGhCard" style="margin-top:12px">
        <div style="display:flex; align-items:center; gap:10px;">
          <h3 style="margin:0;">GitHub (Sync)</h3>
          <button id="rcfGhToggle" class="btn" type="button" style="margin-left:auto;">
            ${open ? "Fechar" : "Abrir"} GitHub Sync
          </button>
        </div>

        <div id="rcfGhBody" style="${open ? "" : "display:none;"} margin-top:12px">
          <p class="hint" style="margin-top:0">
            Bundle padrão: <b>app/import/mother_bundle.json</b><br/>
            (Se você digitar <b>import/mother_bundle.json</b>, eu salvo como <b>app/import/mother_bundle.json</b>)
          </p>

          <div class="row" style="gap:12px; flex-wrap:wrap;">
            <div style="flex:1; min-width:180px;">
              <label class="label">Owner</label>
              <input id="ghOwner" class="input" placeholder="owner" />
            </div>

            <div style="flex:1; min-width:180px;">
              <label class="label">Repo</label>
              <input id="ghRepo" class="input" placeholder="repo" />
            </div>
          </div>

          <div class="row" style="gap:12px; flex-wrap:wrap; margin-top:10px;">
            <div style="flex:1; min-width:180px;">
              <label class="label">Branch</label>
              <input id="ghBranch" class="input" placeholder="main" />
            </div>

            <div style="flex:1; min-width:180px;">
              <label class="label">Path</label>
              <input id="ghPath" class="input" placeholder="app/import/mother_bundle.json" />
            </div>
          </div>

          <div style="margin-top:10px;">
            <label class="label">Token (PAT)</label>
            <input id="ghToken" class="input" placeholder="ghp_..." />
          </div>

          <div class="row" style="margin-top:12px; gap:10px; flex-wrap:wrap;">
            <button id="btnSaveCfg" class="btn" type="button">Salvar cfg</button>
            <button id="btnTestToken" class="btn" type="button">Testar token</button>
            <button id="btnPull" class="btn" type="button">Pull bundle</button>
          </div>

          <div class="row" style="margin-top:10px; gap:10px; flex-wrap:wrap;">
            <button id="btnPushMother" class="btn" type="button">Push Mother Bundle</button>
            <button id="btnMaeUpdate" class="btn primary" type="button">MAE update</button>
          </div>

          <pre id="ghOut" class="mono small" style="margin-top:12px;">Pronto.</pre>
        </div>
      </div>
    `;

    // ✅ coloca no topo do Settings (pra ficar “quietinho” e não misturar com logs)
    try {
      mount.prepend(wrapper.firstElementChild);
    } catch {
      mount.appendChild(wrapper.firstElementChild);
    }

    const card = document.getElementById("rcfGhCard");
    const body = document.getElementById("rcfGhBody");
    const toggle = document.getElementById("rcfGhToggle");
    const out = document.getElementById("ghOut");

    enableClickFallback(card);

    function setGHOut(t){ out.textContent = String(t || "Pronto."); }

    function readInputs(){
      return {
        owner: String(document.getElementById("ghOwner")?.value || "").trim(),
        repo: String(document.getElementById("ghRepo")?.value || "").trim(),
        branch: String(document.getElementById("ghBranch")?.value || "main").trim(),
        path: normalizePathInput(document.getElementById("ghPath")?.value || ""),
        token: String(document.getElementById("ghToken")?.value || "").trim(),
      };
    }

    function fillInputs(cfg){
      document.getElementById("ghOwner").value = cfg.owner || "";
      document.getElementById("ghRepo").value = cfg.repo || "";
      document.getElementById("ghBranch").value = cfg.branch || "main";
      document.getElementById("ghPath").value = cfg.path || "app/import/mother_bundle.json";
      document.getElementById("ghToken").value = cfg.token || "";
    }

    fillInputs(getCfg());

    toggle.addEventListener("click", () => {
      const isOpen = body.style.display !== "none";
      if (isOpen) {
        body.style.display = "none";
        toggle.textContent = "Abrir GitHub Sync";
        localStorage.setItem(UI_OPEN_KEY, "0");
      } else {
        body.style.display = "";
        toggle.textContent = "Fechar GitHub Sync";
        localStorage.setItem(UI_OPEN_KEY, "1");
      }
    });

    document.getElementById("btnSaveCfg").addEventListener("click", () => {
      const cfg = readInputs();
      saveCfg(cfg);
      setGHOut("OK: ghcfg saved");
      log("ok", "OK: ghcfg saved");
    });

    document.getElementById("btnTestToken").addEventListener("click", async () => {
      try {
        const cfg = readInputs();
        saveCfg(cfg);
        setGHOut("Testando token…");
        if (!window.RCF_GH_SYNC?.test) throw new Error("RCF_GH_SYNC.test ausente");
        const res = await window.RCF_GH_SYNC.test(cfg);
        setGHOut(String(res || "OK"));
        log("ok", "OK: token test ok");
      } catch (e) {
        setGHOut("ERR: " + (e?.message || e));
        log("err", "ERR: token test fail");
      }
    });

    document.getElementById("btnPull").addEventListener("click", async () => {
      try {
        const cfg = readInputs();
        saveCfg(cfg);
        setGHOut("Pull…");
        if (!window.RCF_GH_SYNC?.pull) throw new Error("RCF_GH_SYNC.pull ausente");
        const txt = await window.RCF_GH_SYNC.pull(cfg);
        setGHOut("OK: pull ok (bytes=" + String(txt || "").length + ")");
        log("ok", "OK: gh pull ok");
      } catch (e) {
        setGHOut("ERR: " + (e?.message || e));
        log("err", "ERR: gh pull err");
      }
    });

    document.getElementById("btnPushMother").addEventListener("click", async () => {
      try {
        const cfg = readInputs();
        saveCfg(cfg);
        setGHOut("Push Mother Bundle…");
        if (!window.RCF_GH_SYNC?.pushMotherBundle) throw new Error("RCF_GH_SYNC.pushMotherBundle ausente");
        await window.RCF_GH_SYNC.pushMotherBundle(cfg);
        setGHOut("OK: GitHub: pushMotherBundle ok");
        log("ok", "OK: GitHub: pushMotherBundle ok");
      } catch (e) {
        setGHOut("ERR: " + (e?.message || e));
        log("err", "ERR: pushMotherBundle fail");
      }
    });

    document.getElementById("btnMaeUpdate").addEventListener("click", async () => {
      try {
        setGHOut("MAE update…");
        if (!window.RCF_MAE?.updateFromGitHub) throw new Error("RCF_MAE.updateFromGitHub ausente");
        const res = await window.RCF_MAE.updateFromGitHub({
          onProgress: (p) => {
            if (p?.step === "apply_progress") setGHOut(`Aplicando… ${p.done}/${p.total}`);
            if (p?.step === "apply_done") setGHOut(`OK: aplicado ${p.done}/${p.total}`);
          }
        });
        setGHOut("OK: mae update ok " + JSON.stringify(res));
        log("ok", "OK: mae update ok");
      } catch (e) {
        setGHOut("ERR: " + (e?.message || e));
        log("err", "ERR: mae update err");
      }
    });

    log("ok", "OK: admin.github.js ready ✅ (v2.5)");
    return true;
  }

  // Repara se o app.js apagar o card quando troca view
  function startRepairLoop(){
    let last = 0;
    setInterval(() => {
      const t = Date.now();
      if (t - last < 800) return;
      last = t;

      // se está em settings e o card sumiu, injeta de novo
      if (isSettingsScreen() && !alreadyMounted()) {
        render();
      }
    }, 900);
  }

  function boot(){
    // tenta várias vezes no boot
    let tries = 0;
    const tick = () => {
      tries++;
      render();
      if (tries < 40) setTimeout(tick, 200);
    };
    tick();
    startRepairLoop();
  }

  window.RCF_ADMIN_GH = { __v25: true, boot };

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
