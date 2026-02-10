/* =========================================================
  RControl Factory — core/admin.js (FULL) — FIX BOTÕES MAE
  - Renderiza seção "MAINTENANCE • Self-Update (Mãe)"
  - iOS-safe bind: touchend + click (com preventDefault)
  - Força pointer-events na área (mata overlay travando clique)
  - Ações (MVP):
      • Aplicar /import/mother_bundle.json  -> carrega e salva em localStorage
      • Aplicar bundle colado              -> salva em localStorage
      • Rollback overrides                 -> limpa localStorage
  OBS: aqui o objetivo é GARANTIR CLIQUE e fluxo; depois ligamos o patch real.
========================================================= */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---------- iOS safe tap ----------
  const TAP_GUARD_MS = 450;
  let _lastTapAt = 0;

  function bindTap(el, fn) {
    if (!el) return;

    const handler = (e) => {
      const now = Date.now();
      if (now - _lastTapAt < TAP_GUARD_MS) {
        try { e.preventDefault(); e.stopPropagation(); } catch {}
        return;
      }
      _lastTapAt = now;

      try { e.preventDefault(); e.stopPropagation(); } catch {}
      try { fn(e); } catch (err) {
        writeOut("adminOut", "ERRO no clique: " + (err?.message || String(err)));
      }
    };

    el.style.pointerEvents = "auto";
    el.style.touchAction = "manipulation";
    el.style.webkitTapHighlightColor = "transparent";

    // capture ajuda quando existe overlay/parent estranho
    el.addEventListener("touchend", handler, { passive: false, capture: true });
    el.addEventListener("click", handler, { passive: false, capture: true });
  }

  function setStatus(text) {
    const el = $("statusText");
    if (el) el.textContent = String(text || "");
  }

  function writeOut(id, text) {
    const el = $(id);
    if (el) el.textContent = String(text || "");
  }

  function log(msg) {
    try {
      if (window.RCF_LOGGER && typeof window.RCF_LOGGER.push === "function") {
        window.RCF_LOGGER.push("log", msg);
      } else if (window.RCF && typeof window.RCF.log === "function") {
        window.RCF.log(msg);
      } else {
        console.log("[RCF ADMIN]", msg);
      }
    } catch {}
  }

  // ---------- storage keys ----------
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

  // ---------- render ----------
  function renderMaintenance() {
    const adminView = $("view-admin");
    if (!adminView) return;

    // evita duplicar
    if ($("motherMaintCard")) return;

    // força pointer-events na view inteira
    adminView.style.pointerEvents = "auto";
    adminView.style.position = "relative";
    adminView.style.zIndex = "1";

    const card = document.createElement("div");
    card.className = "card";
    card.id = "motherMaintCard";
    card.style.pointerEvents = "auto";

    card.innerHTML = `
      <h2 style="margin-top:4px">MAINTENANCE • Self-Update (Mãe)</h2>
      <p class="hint">Aplicar overrides por cima do site (MVP). Se quebrar, use Rollback.</p>

      <div class="row" style="flex-wrap:wrap; gap:10px; pointer-events:auto">
        <button class="btn primary" id="btnMotherApplyFile" type="button" style="pointer-events:auto">
          Aplicar /import/mother_bundle.json
        </button>
        <button class="btn danger" id="btnMotherRollback" type="button" style="pointer-events:auto">
          Rollback overrides
        </button>
      </div>

      <div class="hint" style="margin:10px 0 6px 0">Ou cole um bundle JSON aqui:</div>
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

      <div class="row" style="margin-top:10px; pointer-events:auto">
        <button class="btn ok" id="btnMotherApplyPasted" type="button" style="pointer-events:auto">
          Aplicar bundle colado
        </button>
      </div>

      <pre class="mono small" id="motherMaintOut" style="margin-top:10px; pointer-events:auto">Pronto.</pre>
    `;

    // insere DEPOIS do primeiro card do admin (ou no fim)
    const firstCard = adminView.querySelector(".card");
    if (firstCard && firstCard.parentNode) {
      firstCard.parentNode.insertBefore(card, firstCard.nextSibling);
    } else {
      adminView.appendChild(card);
    }
  }

  // ---------- actions ----------
  async function applyFromFile() {
    setStatus("Aplicando bundle…");
    writeOut("motherMaintOut", "Carregando /import/mother_bundle.json …");

    // cache-bust
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
      writeOut("motherMaintOut", "✅ Bundle carregado e salvo.\nAgora o clique está OK.\n\n(Próximo passo: ligar aplicação real em runtime.)");
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
      writeOut("motherMaintOut", "✅ Bundle colado salvo em localStorage.\nAgora o clique está OK.\n\n(Próximo passo: ligar aplicação real em runtime.)");
      setStatus("Bundle salvo ✅");
      log("MAE: bundle salvo via colado");
    } catch (e) {
      writeOut("motherMaintOut", "❌ Erro ao salvar: " + (e?.message || String(e)));
      setStatus("Falha ❌");
    }
  }

  function rollback() {
    clearBundle();
    writeOut("motherMaintOut", "✅ Rollback feito (bundle apagado do localStorage).");
    setStatus("Rollback ✅");
    log("MAE: rollback");
  }

  // ---------- bind ----------
  function bindMaintenanceButtons() {
    // garante que render exista
    renderMaintenance();

    // força pointer-events em tudo do card (mata overlay)
    const card = $("motherMaintCard");
    if (card) {
      card.style.pointerEvents = "auto";
      card.querySelectorAll("*").forEach((el) => {
        if (el && el.style) el.style.pointerEvents = "auto";
      });
    }

    bindTap($("btnMotherApplyFile"), applyFromFile);
    bindTap($("btnMotherApplyPasted"), applyFromPaste);
    bindTap($("btnMotherRollback"), rollback);
  }

  function init() {
    // render + bind
    bindMaintenanceButtons();

    // feedback visível
    const saved = loadBundle();
    if (saved) {
      const at = localStorage.getItem(KEY_BUNDLE_AT) || "";
      writeOut("motherMaintOut", "Bundle já existe no localStorage ✅\n" + (at ? ("Salvo em: " + at) : ""));
    }

    // marca que carregou (pra você ver na hora)
    writeOut("adminOut", ( $("adminOut")?.textContent || "Pronto." ) + "\n\nMAE v1.1 ✅ carregado (admin.js)");
    setStatus("OK ✅");
    log("MAE v1.1 carregado");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
