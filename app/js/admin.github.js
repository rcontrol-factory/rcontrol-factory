/* RControl Factory — /app/js/admin.github.js (PADRÃO) — v2.6
   GitHub UI como BOTÃO na subnav (ao lado de Logs/Diagnostics), sem depender de Settings/Admin mount.
   - Procura a barra que tem botões "Admin / Diagnostics / Logs" e injeta "GitHub" depois de "Logs"
   - Abre/fecha um painel flutuante (modal) com inputs e ações
   - Não gruda na tela, não mistura views
*/
(() => {
  "use strict";

  if (window.RCF_ADMIN_GH && window.RCF_ADMIN_GH.__v26) return;

  const UI_OPEN_KEY = "rcf:ghui:open";
  const LS_CFG_KEY  = "rcf:ghcfg";

  const log = (lvl, msg) => {
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[GHUI]", lvl, msg); } catch {}
  };

  function safeParse(raw, fallback){
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  }

  function normalizePathInput(p){
    let x = String(p || "").trim();
    if (!x) return "app/import/mother_bundle.json";
    x = x.replace(/^\/+/, "");
    if (x.startsWith("import/")) x = "app/" + x;
    return x;
  }

  function getCfg(){
    if (window.RCF_GH_SYNC?.loadConfig) return window.RCF_GH_SYNC.loadConfig();
    return safeParse(localStorage.getItem(LS_CFG_KEY), {}) || {};
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
    localStorage.setItem(LS_CFG_KEY, JSON.stringify(safe));
    return safe;
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

  function findButtonByText(root, txt){
    const t = String(txt || "").trim().toLowerCase();
    const buttons = Array.from((root || document).querySelectorAll("button, a"));
    for (const b of buttons){
      const bt = String(b.textContent || "").trim().toLowerCase();
      if (bt === t) return b;
    }
    return null;
  }

  // acha o "grupo" (container) onde estão Admin/Diagnostics/Logs
  function findSubnavContainer(){
    const allButtons = Array.from(document.querySelectorAll("button, a"));
    const logsBtn = allButtons.find(b => String(b.textContent||"").trim().toLowerCase() === "logs");
    if (!logsBtn) return null;

    // tenta pegar o pai que contém vários botões
    let p = logsBtn.parentElement;
    for (let i = 0; i < 6 && p; i++){
      const btns = p.querySelectorAll("button, a");
      if (btns && btns.length >= 3) return p;
      p = p.parentElement;
    }
    return logsBtn.parentElement || null;
  }

  function ensureModal(){
    if (document.getElementById("rcfGhModal")) return;

    const div = document.createElement("div");
    div.id = "rcfGhModal";
    div.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 999998;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 18px;
      background: rgba(0,0,0,.55);
      backdrop-filter: blur(6px);
    `;

    div.innerHTML = `
      <div id="rcfGhPanel" style="
        width: min(720px, 100%);
        max-height: 78vh;
        overflow: auto;
        border-radius: 16px;
        background: rgba(12,18,32,.92);
        border: 1px solid rgba(255,255,255,.10);
        padding: 14px;
        box-shadow: 0 20px 60px rgba(0,0,0,.45);
      ">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="font-weight:900; font-size:16px; color:#eafff4;">GitHub (Sync)</div>
          <button id="rcfGhClose" style="
            margin-left:auto;
            padding:8px 12px;
            border-radius: 999px;
            border: 1px solid rgba(255,255,255,.14);
            background: rgba(255,255,255,.08);
            color: #fff;
          ">Fechar</button>
        </div>

        <div style="margin-top:10px; color: rgba(255,255,255,.72); font-size: 12px; line-height:1.35;">
          Bundle padrão: <b>app/import/mother_bundle.json</b><br/>
          (Se digitar <b>import/mother_bundle.json</b>, eu salvo como <b>app/import/mother_bundle.json</b>)
        </div>

        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
          <div style="flex:1; min-width:160px;">
            <div style="font-size:12px; color: rgba(255,255,255,.65); margin-bottom:6px;">Owner</div>
            <input id="ghOwner" style="width:100%; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color:#fff;" placeholder="owner" />
          </div>

          <div style="flex:1; min-width:160px;">
            <div style="font-size:12px; color: rgba(255,255,255,.65); margin-bottom:6px;">Repo</div>
            <input id="ghRepo" style="width:100%; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color:#fff;" placeholder="repo" />
          </div>
        </div>

        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
          <div style="flex:1; min-width:160px;">
            <div style="font-size:12px; color: rgba(255,255,255,.65); margin-bottom:6px;">Branch</div>
            <input id="ghBranch" style="width:100%; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color:#fff;" placeholder="main" />
          </div>

          <div style="flex:1; min-width:160px;">
            <div style="font-size:12px; color: rgba(255,255,255,.65); margin-bottom:6px;">Path</div>
            <input id="ghPath" style="width:100%; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color:#fff;" placeholder="app/import/mother_bundle.json" />
          </div>
        </div>

        <div style="margin-top:10px;">
          <div style="font-size:12px; color: rgba(255,255,255,.65); margin-bottom:6px;">Token (PAT)</div>
          <input id="ghToken" style="width:100%; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color:#fff;" placeholder="ghp_..." />
        </div>

        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
          <button id="btnSaveCfg" style="padding:10px 12px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); color:#fff;">Salvar cfg</button>
          <button id="btnTestToken" style="padding:10px 12px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); color:#fff;">Testar token</button>
          <button id="btnPull" style="padding:10px 12px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); color:#fff;">Pull bundle</button>
        </div>

        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
          <button id="btnPushMother" style="padding:10px 12px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); color:#fff;">Push Mother Bundle</button>
          <button id="btnMaeUpdate" style="padding:10px 12px; border-radius:999px; border:1px solid rgba(60,255,170,.25); background: rgba(60,255,170,.10); color:#eafff4;">MAE update</button>
        </div>

        <pre id="ghOut" style="
          margin-top:12px;
          padding:12px;
          border-radius:12px;
          background: rgba(0,0,0,.25);
          border:1px solid rgba(255,255,255,.08);
          color: rgba(255,255,255,.85);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
          font-size: 12px;
          white-space: pre-wrap;
        ">Pronto.</pre>
      </div>
    `;

    document.body.appendChild(div);
    enableClickFallback(div);

    // fechar clicando fora
    div.addEventListener("click", (ev) => {
      if (ev.target === div) closeModal();
    });

    document.getElementById("rcfGhClose").addEventListener("click", closeModal);

    function setGHOut(t){
      const out = document.getElementById("ghOut");
      if (out) out.textContent = String(t || "Pronto.");
    }

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

    // preencher ao criar
    fillInputs(getCfg());

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

    // se tava aberto antes, abre de novo
    if (localStorage.getItem(UI_OPEN_KEY) === "1") openModal();
  }

  function openModal(){
    ensureModal();
    const m = document.getElementById("rcfGhModal");
    if (m) m.style.display = "flex";
    localStorage.setItem(UI_OPEN_KEY, "1");

    // sempre repuxa cfg quando abre
    try {
      const cfg = getCfg();
      document.getElementById("ghOwner").value = cfg.owner || "";
      document.getElementById("ghRepo").value = cfg.repo || "";
      document.getElementById("ghBranch").value = cfg.branch || "main";
      document.getElementById("ghPath").value = cfg.path || "app/import/mother_bundle.json";
      document.getElementById("ghToken").value = cfg.token || "";
    } catch {}
  }

  function closeModal(){
    const m = document.getElementById("rcfGhModal");
    if (m) m.style.display = "none";
    localStorage.setItem(UI_OPEN_KEY, "0");
  }

  function ensureGitHubButton(){
    const sub = findSubnavContainer();
    if (!sub) return false;

    // já existe?
    const existing = Array.from(sub.querySelectorAll("button, a")).find(b =>
      String(b.textContent||"").trim().toLowerCase() === "github"
    );
    if (existing) return true;

    const logsBtn = findButtonByText(sub, "Logs") || findButtonByText(sub, "logs");
    if (!logsBtn) return false;

    // cria botão parecido (copia classe do Logs)
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "GitHub";

    // tenta reaproveitar a classe do Logs
    try {
      if (logsBtn.className) btn.className = logsBtn.className;
    } catch {}

    btn.addEventListener("click", () => {
      // toggle
      const m = document.getElementById("rcfGhModal");
      const isOpen = m && m.style.display !== "none";
      if (isOpen) closeModal();
      else openModal();
    });

    // inserir depois de Logs
    try {
      logsBtn.insertAdjacentElement("afterend", btn);
    } catch {
      sub.appendChild(btn);
    }

    log("ok", "GitHub button injected ✅");
    return true;
  }

  function boot(){
    ensureModal();

    // tenta várias vezes (app.js pode recriar nav)
    let tries = 0;
    const tick = () => {
      tries++;
      ensureGitHubButton();
      if (tries < 120) setTimeout(tick, 250);
    };
    tick();

    // repara sempre (se sumir, recoloca)
    setInterval(() => {
      ensureGitHubButton();
    }, 900);
  }

  window.RCF_ADMIN_GH = { __v26: true, boot, openModal, closeModal };

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  log("ok", "admin.github.js ready ✅ (v2.6)");
})();
