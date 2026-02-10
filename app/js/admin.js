/* =========================================================
  RControl Factory — core/admin.js (FULL) — MÃE BUTTONS FIX (CAPTURE)
  - Renderiza seção "MAINTENANCE • Self-Update (Mãe)" dentro do Admin
  - iOS/Chrome-safe: delegação global com CAPTURE (pega clique antes de overlays/stopPropagation)
  - Força pointer-events e z-index no card da Mãe
  - Ações (MVP):
      • Aplicar /import/mother_bundle.json  -> salva bundle em localStorage
      • Aplicar bundle colado              -> salva bundle em localStorage
      • Rollback overrides                 -> limpa bundle do localStorage
========================================================= */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // -------- utils ----------
  function safeText(v) {
    return (v === undefined || v === null) ? "" : String(v);
  }

  function setStatus(text) {
    const el = $("statusText");
    if (el) el.textContent = safeText(text || "");
  }

  function writeOut(id, text) {
    const el = $(id);
    if (el) el.textContent = safeText(text || "");
  }

  function log(msg) {
    try {
      if (window.RCF && typeof window.RCF.log === "function") {
        window.RCF.log(msg);
      } else {
        console.log("[RCF ADMIN]", msg);
      }
    } catch {}
  }

  // -------- storage keys ----------
  const KEY_BUNDLE = "rcf:mother_bundle";
  const KEY_BUNDLE_AT = "rcf:mother_bundle_at";

  function saveBundle(obj) {
    localStorage.setItem(KEY_BUNDLE, JSON.stringify(obj));
    localStorage.setItem(KEY_BUNDLE_AT, new Date().toISOString());
  }

  function loadBundle() {
    try {
      const raw = localStorage.getItem(KEY_BUNDLE);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function clearBundle() {
    try { localStorage.removeItem(KEY_BUNDLE); } catch {}
    try { localStorage.removeItem(KEY_BUNDLE_AT); } catch {}
  }

  // -------- render Mãe ----------
  function renderMotherCard() {
    const adminView = $("view-admin");
    if (!adminView) return false;

    // evita duplicar
    if ($("motherMaintCard")) return true;

    // mount "limpo" (se existir no index)
    const mount = $("rcfMotherMount");

    // força clique na view
    adminView.style.pointerEvents = "auto";
    adminView.style.position = "relative";
    adminView.style.zIndex = "2";

    const card = document.createElement("div");
    card.className = "card";
    card.id = "motherMaintCard";

    // MUITO importante: garante que nada cubra
    card.style.position = "relative";
    card.style.zIndex = "999";
    card.style.pointerEvents = "auto";

    card.innerHTML = `
      <h2 style="margin-top:4px">MAINTENANCE • Self-Update (Mãe)</h2>
      <p class="hint">Aplicar overrides por cima do site (MVP). Se quebrar, use Rollback.</p>

      <div class="row" style="flex-wrap:wrap; gap:10px; pointer-events:auto">
        <button class="btn primary" id="btnMotherApplyFile" type="button">
          Aplicar /import/mother_bundle.json
        </button>
        <button class="btn ok" id="btnMotherApplyPasted" type="button">
          Aplicar bundle colado
        </button>
        <button class="btn danger" id="btnMotherRollback" type="button">
          Rollback overrides
        </button>
      </div>

      <div class="hint" style="margin:10px 0 6px 0">Cole um bundle JSON aqui:</div>

      <textarea id="motherBundleTextarea" spellcheck="false"
        style="
          width:100%;
          min-height:160px;
          border:1px solid rgba(255,255,255,.10);
          background: rgba(0,0,0,.22);
          color: rgba(255,255,255,.92);
          border-radius: 12px;
          padding: 12px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
          font-size: 13px;
          line-height: 1.45;
          outline: none;
          pointer-events:auto;
        "
      >{
  "files": {
    "/core/TESTE.txt": "OK — bundle aplicado em {{DATE}}"
  }
}</textarea>

      <pre class="mono small" id="motherMaintOut" style="margin-top:10px; pointer-events:auto">Pronto.</pre>
    `;

    // insere no mount se existir, senão no fim do adminView
    if (mount) {
      mount.style.pointerEvents = "auto";
      mount.style.position = "relative";
      mount.style.zIndex = "999";
      mount.appendChild(card);
    } else {
      adminView.appendChild(card);
    }

    // força pointer-events em TUDO dentro do card
    try {
      card.querySelectorAll("*").forEach((el) => {
        if (el && el.style) {
          el.style.pointerEvents = "auto";
          el.style.touchAction = "manipulation";
          el.style.webkitTapHighlightColor = "transparent";
        }
      });
    } catch {}

    return true;
  }

  // -------- actions ----------
  async function applyFromFile() {
    setStatus("Aplicando bundle…");
    writeOut("motherMaintOut", "Carregando /import/mother_bundle.json …");

    const url = "/import/mother_bundle.json?ts=" + Date.now();

    let json;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      json = await res.json();
    } catch (e) {
      writeOut("motherMaintOut", "❌ Falha ao carregar " + url + "\n" + (e?.message || String(e)));
      setStatus("Falha ❌");
      return;
    }

    try {
      saveBundle(json);
      writeOut("motherMaintOut", "✅ Bundle carregado e salvo em localStorage.\nPróximo: aplicar runtime (já já).");
      setStatus("Bundle salvo ✅");
      log("MAE: bundle salvo via arquivo");
    } catch (e) {
      writeOut("motherMaintOut", "❌ Erro ao salvar bundle: " + (e?.message || String(e)));
      setStatus("Falha ❌");
    }
  }

  function applyFromPaste() {
    setStatus("Aplicando colado…");

    const ta = $("motherBundleTextarea");
    const raw = ta ? String(ta.value || "") : "";

    let json;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      writeOut("motherMaintOut", "❌ JSON inválido.\n" + (e?.message || String(e)));
      setStatus("JSON inválido ❌");
      return;
    }

    try {
      saveBundle(json);
      writeOut("motherMaintOut", "✅ Bundle colado salvo em localStorage.\nPróximo: aplicar runtime (já já).");
      setStatus("Bundle salvo ✅");
      log("MAE: bundle salvo via colado");
    } catch (e) {
      writeOut("motherMaintOut", "❌ Erro ao salvar: " + (e?.message || String(e)));
      setStatus("Falha ❌");
    }
  }

  function rollback() {
    clearBundle();
    writeOut("motherMaintOut", "✅ Rollback feito (bundle removido do localStorage).");
    setStatus("Rollback ✅");
    log("MAE: rollback");
  }

  // -------- CAPTURE delegation (mata overlay/stopPropagation) ----------
  function findBtnIdFromEvent(ev) {
    try {
      const t = ev.target;
      if (!t) return "";
      const btn = t.closest ? t.closest("#btnMotherApplyFile,#btnMotherApplyPasted,#btnMotherRollback") : null;
      return btn ? btn.id : "";
    } catch {
      return "";
    }
  }

  function installGlobalCapture() {
    const handler = (ev) => {
      const id = findBtnIdFromEvent(ev);
      if (!id) return;

      // IMPORTANTÍSSIMO: para tudo antes de outros scripts
      try { ev.preventDefault(); ev.stopPropagation(); } catch {}

      // garante render antes de agir
      renderMotherCard();

      // debug visível
      try { log("MAE click captured: " + id + " (" + ev.type + ")"); } catch {}

      if (id === "btnMotherApplyFile") return applyFromFile();
      if (id === "btnMotherApplyPasted") return applyFromPaste();
      if (id === "btnMotherRollback") return rollback();
    };

    // CAPTURE = true
    document.addEventListener("touchend", handler, { passive: false, capture: true });
    document.addEventListener("click", handler, { passive: false, capture: true });
    document.addEventListener("pointerup", handler, { passive: false, capture: true });
  }

  function init() {
    // Render + instala capture (mesmo se overlay existir)
    renderMotherCard();
    installGlobalCapture();

    const saved = loadBundle();
    if (saved) {
      const at = localStorage.getItem(KEY_BUNDLE_AT) || "";
      writeOut("motherMaintOut", "Bundle já existe no localStorage ✅\n" + (at ? ("Salvo em: " + at) : ""));
    }

    // marca carregamento (você vê no adminOut)
    const adminOut = $("adminOut");
    if (adminOut) {
      adminOut.textContent =
        (adminOut.textContent || "Pronto.") +
        "\n\nMAE v1.2 ✅ carregado (admin.js capture delegation)";
    }

    setStatus("OK ✅");
    log("MAE v1.2 carregado");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
