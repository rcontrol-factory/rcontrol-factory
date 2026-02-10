/* =========================================================
  RControl Factory — core/admin.js (FULL)
  - Render do Admin + bloco Maintenance Self-Update (Mãe)
  - Mantém IDs compatíveis com core/mother_selfupdate.js
========================================================= */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);

  function safeText(v) {
    return (v === undefined || v === null) ? "" : String(v);
  }

  function setText(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = safeText(txt);
  }

  // Renderiza o conteúdo do Admin (dentro de #view-admin)
  function renderAdmin() {
    const view = document.getElementById("view-admin");
    if (!view) return;

    // Se já existir Maintenance no HTML, não duplica
    const hasMaintenance = view.querySelector('[data-rcf="maintenance"]');
    if (hasMaintenance) return;

    // Procura o <pre id="adminOut"> já existente
    const adminOut = document.getElementById("adminOut");

    // Insere o bloco Maintenance ANTES do "Plano + Sugestão" (adminOut fica abaixo)
    const card = view.querySelector(".card");
    if (!card) return;

    const block = document.createElement("div");
    block.setAttribute("data-rcf", "maintenance");
    block.innerHTML = `
      <hr style="border:0;border-top:1px solid rgba(255,255,255,.10);margin:16px 0" />

      <h2 style="margin:0 0 6px 0">MAINTENANCE • Self-Update (Mãe)</h2>
      <p class="hint" style="margin-top:0">
        Aplica overrides por cima do site (no iPhone) via Service Worker. Se quebrar, use Rollback.
      </p>

      <div class="row" style="margin:10px 0 12px 0">
        <button class="btn" id="btnMotherApplyImport" type="button">Aplicar /import/mother_bundle.json</button>
        <button class="btn danger" id="btnMotherRollback" type="button">Rollback overrides</button>
      </div>

      <div class="hint" style="margin: 6px 0">Ou cole um bundle JSON aqui:</div>

      <textarea id="motherBundleText" spellcheck="false" style="
        width:100%;
        min-height:120px;
        resize: vertical;
        border:1px solid rgba(255,255,255,.10);
        background: rgba(0,0,0,.22);
        color: rgba(255,255,255,.92);
        border-radius: 12px;
        padding: 12px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
        font-size: 13px;
        line-height: 1.45;
        outline: none;
      ">{
  "files": {
    "/core/TESTE.txt": "OK — bundle aplicado em {{DATE}}"
  }
}</textarea>

      <div class="row" style="margin-top:10px">
        <button class="btn ok" id="btnMotherApplyPaste" type="button">Aplicar bundle colado</button>
      </div>
    `;

    // Coloca o bloco antes do “Plano + Sugestão”
    if (adminOut && adminOut.parentElement === card) {
      // procura o título "Plano + Sugestão" (h2 antes do pre)
      const h2s = Array.from(card.querySelectorAll("h2"));
      const planTitle = h2s.find(h => (h.textContent || "").toLowerCase().includes("plano"));
      if (planTitle) {
        card.insertBefore(block, planTitle);
      } else {
        card.insertBefore(block, adminOut);
      }
    } else {
      card.appendChild(block);
    }
  }

  // Pequeno log no adminOut pra confirmar que admin.js carregou
  function adminBootNote() {
    const out = document.getElementById("adminOut");
    if (!out) return;

    const lines = [];
    lines.push("Admin core carregado ✅");
    lines.push("Maintenance pronto (IDs ok).");
    lines.push("Se botões não clicarem: provável overlay/pointer-events (iOS).");

    // Não sobrescreve se já tiver coisa importante
    const cur = (out.textContent || "").trim();
    if (!cur || cur === "Pronto." || cur.toLowerCase().startsWith("sem")) {
      out.textContent = lines.join("\n");
    }
  }

  function init() {
    renderAdmin();
    adminBootNote();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { passive: true });
  } else {
    init();
  }

  // Export opcional
  window.RCF_ADMIN = window.RCF_ADMIN || {};
  window.RCF_ADMIN.renderAdmin = renderAdmin;
})();
