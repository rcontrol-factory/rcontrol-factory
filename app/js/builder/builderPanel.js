/* builderPanel.js — UI mínima do Builder SAFE (injeta no ADMIN sem mexer no app.js) */

(() => {
  "use strict";

  const PANEL_ID = "rcfBuilderSafePanel";

  function $(sel, root=document) { return root.querySelector(sel); }

  function getView() {
    try { return window.RCF?.state?.active?.view || ""; } catch { return ""; }
  }

  function ensureBuilderDeps() {
    const ok =
      !!window.RCF_BUILDER_SAFE &&
      !!window.RCF_PATCH_QUEUE &&
      !!window.RCF_ORGANIZER &&
      !!window.RCF_APPLY_PIPELINE;
    return ok;
  }

  function findAdminHost() {
    // tenta achar um lugar “estável” pra enfiar o painel
    // 1) root principal do app
    const root = $("#rcfRoot") || $("#app") || document.body;

    // tenta achar um card/section onde já tem Admin / GitHub Sync
    // se não achar, injeta no topo do root mesmo
    return root;
  }

  function makePanel() {
    const wrap = document.createElement("section");
    wrap.id = PANEL_ID;
    wrap.style.marginTop = "14px";

    wrap.innerHTML = `
      <div style="
        padding:14px;
        border:1px solid rgba(255,255,255,.10);
        border-radius:16px;
        background: rgba(0,0,0,.18);
        backdrop-filter: blur(10px);
      ">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div>
            <div style="font-weight:700;font-size:18px;letter-spacing:.2px;">Builder SAFE</div>
            <div style="opacity:.75;font-size:12px;margin-top:2px;">
              Comandos: help, list, set file, write, preview, apply, discard, show
            </div>
          </div>
          <div style="font-size:12px;opacity:.75;">
            stable: <span id="rcfBuilderStableBadge">?</span>
          </div>
        </div>

        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
          <input id="rcfBuilderCmd" placeholder="Digite um comando (ex: help)" style="
            flex:1;
            min-width:220px;
            padding:12px 12px;
            border-radius:14px;
            border:1px solid rgba(255,255,255,.10);
            background: rgba(0,0,0,.22);
            color: rgba(255,255,255,.92);
            outline:none;
          "/>

          <button id="rcfBuilderRun" style="
            padding:12px 14px;
            border-radius:14px;
            border:1px solid rgba(255,255,255,.10);
            background: rgba(0,255,170,.12);
            color: rgba(255,255,255,.92);
          ">Run</button>

          <button id="rcfBuilderPreview" style="
            padding:12px 14px;
            border-radius:14px;
            border:1px solid rgba(255,255,255,.10);
            background: rgba(255,255,255,.06);
            color: rgba(255,255,255,.92);
          ">Preview</button>

          <button id="rcfBuilderDiscard" style="
            padding:12px 14px;
            border-radius:14px;
            border:1px solid rgba(255,255,255,.10);
            background: rgba(255,90,90,.10);
            color: rgba(255,255,255,.92);
          ">Discard</button>
        </div>

        <div style="margin-top:10px; font-size:12px; opacity:.75;">
          Dica: <b>write</b> → cole o código → finalize com <b>/end</b>
        </div>

        <pre id="rcfBuilderOut" style="
          margin-top:12px;
          min-height:140px;
          max-height:320px;
          overflow:auto;
          padding:12px;
          border-radius:14px;
          border:1px solid rgba(255,255,255,.10);
          background: rgba(0,0,0,.28);
          color: rgba(255,255,255,.92);
          white-space: pre-wrap;
          word-break: break-word;
          -webkit-overflow-scrolling: touch;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 13px;
          line-height: 1.35;
        "></pre>
      </div>
    `;

    return wrap;
  }

  async function runCmd(text) {
    const out = $("#rcfBuilderOut");
    if (!out) return;

    if (!ensureBuilderDeps()) {
      out.textContent =
        "❌ Dependências do Builder não carregaram.\n" +
        "Precisa existir: RCF_BUILDER_SAFE, RCF_PATCH_QUEUE, RCF_ORGANIZER, RCF_APPLY_PIPELINE.";
      return;
    }

    try {
      const res = await window.RCF_BUILDER_SAFE.cmd(text);
      out.textContent = String(res || "");
    } catch (e) {
      out.textContent = "❌ Erro: " + (e?.message || e);
    }
  }

  function refreshStableBadge() {
    const el = $("#rcfBuilderStableBadge");
    if (!el) return;
    el.textContent = window.RCF_STABLE ? "TRUE ✅" : "FALSE ❌";
  }

  function bindPanel(panel) {
    const cmd = $("#rcfBuilderCmd", panel);
    const run = $("#rcfBuilderRun", panel);
    const prev = $("#rcfBuilderPreview", panel);
    const disc = $("#rcfBuilderDiscard", panel);

    run.addEventListener("click", () => runCmd(cmd.value));
    prev.addEventListener("click", () => runCmd("preview"));
    disc.addEventListener("click", () => runCmd("discard"));

    cmd.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        runCmd(cmd.value);
      }
    });

    refreshStableBadge();
    setInterval(refreshStableBadge, 1200);
  }

  function mountIfNeeded() {
    if (getView() !== "admin") return;

    if (document.getElementById(PANEL_ID)) return;

    const host = findAdminHost();
    const panel = makePanel();

    // injeta no topo do host (mais seguro), mas você pode mudar pra append se quiser
    host.prepend(panel);
    bindPanel(panel);

    // mensagem inicial
    runCmd("help");
  }

  // loop leve pra detectar troca de view
  setInterval(mountIfNeeded, 700);
})();
