/* =========================================================
  RControl Factory — core/admin.js (FULL) — MÃE ALWAYS RENDER
  - A Mãe nunca some: renderiza no mount (#rcfMotherMount) e re-tenta via MutationObserver
  - Botões clicáveis: CAPTURE delegation (touchend/click/pointerup)
========================================================= */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function safeText(v) { return (v === undefined || v === null) ? "" : String(v); }

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
      if (window.RCF && typeof window.RCF.log === "function") window.RCF.log(msg);
      else console.log("[RCF ADMIN]", msg);
    } catch {}
  }

  // storage
  const KEY_BUNDLE = "rcf:mother_bundle";
  const KEY_BUNDLE_AT = "rcf:mother_bundle_at";

  function saveBundle(obj) {
    localStorage.setItem(KEY_BUNDLE, JSON.stringify(obj));
    localStorage.setItem(KEY_BUNDLE_AT, new Date().toISOString());
  }

  function loadBundle() {
    try {
      const raw = localStorage.getItem(KEY_BUNDLE);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function clearBundle() {
    try { localStorage.removeItem(KEY_BUNDLE); } catch {}
    try { localStorage.removeItem(KEY_BUNDLE_AT); } catch {}
  }

  // render
  function renderMotherCard() {
    // se já existe, ok
    if ($("motherMaintCard")) return true;

    const adminView = $("view-admin");
    const mount = $("rcfMotherMount");

    // se não existe Admin ainda, não dá pra render agora
    if (!adminView && !mount) return false;

    const host = mount || adminView;
    if (!host) return false;

    // força clique
    host.style.pointerEvents = "auto";
    host.style.position = "relative";
    host.style.zIndex = "999";

    const card = document.createElement("div");
    card.className = "card";
    card.id = "motherMaintCard";
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

    host.appendChild(card);

    // força pointer-events em tudo
    try {
      card.querySelectorAll("*").forEach((el) => {
        if (el && el.style) {
          el.style.pointerEvents = "auto";
          el.style.touchAction = "manipulation";
          el.style.webkitTapHighlightColor = "transparent";
        }
      });
    } catch {}

    // marca carregamento
    const adminOut = $("adminOut");
    if (adminOut) {
      adminOut.textContent = (adminOut.textContent || "Pronto.") + "\n\nMAE v1.3 ✅ render OK";
    }

    // se já existe bundle, mostra status
    const saved = loadBundle();
    if (saved) {
      const at = localStorage.getItem(KEY_BUNDLE_AT) || "";
      writeOut("motherMaintOut", "Bundle já existe no localStorage ✅\n" + (at ? ("Salvo em: " + at) : ""));
    }

    return true;
  }

  // actions
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
      writeOut("motherMaintOut", "✅ Bundle carregado e salvo em localStorage.");
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
    try { json = JSON.parse(raw); }
    catch (e) {
      writeOut("motherMaintOut", "❌ JSON inválido.\n" + (e?.message || String(e)));
      setStatus("JSON inválido ❌");
      return;
    }

    try {
      saveBundle(json);
      writeOut("motherMaintOut", "✅ Bundle colado salvo em localStorage.");
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

  // CAPTURE delegation
  function getBtnId(ev) {
    try {
      const t = ev.target;
      const btn = t && t.closest ? t.closest("#btnMotherApplyFile,#btnMotherApplyPasted,#btnMotherRollback") : null;
      return btn ? btn.id : "";
    } catch { return ""; }
  }

  function installCapture() {
    const handler = (ev) => {
      const id = getBtnId(ev);
      if (!id) return;

      try { ev.preventDefault(); ev.stopPropagation(); } catch {}

      // garante render (caso sumiu)
      renderMotherCard();

      if (id === "btnMotherApplyFile") return applyFromFile();
      if (id === "btnMotherApplyPasted") return applyFromPaste();
      if (id === "btnMotherRollback") return rollback();
    };

    document.addEventListener("touchend", handler, { passive: false, capture: true });
    document.addEventListener("click", handler, { passive: false, capture: true });
    document.addEventListener("pointerup", handler, { passive: false, capture: true });
  }

  function installObserver() {
    // se o adminView/mount aparecer depois (ou for recriado), re-renderiza
    const obs = new MutationObserver(() => {
      if ($("motherMaintCard")) return;
      renderMotherCard();
    });

    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  function init() {
    installCapture();
    installObserver();

    // tenta render agora, se não der, o observer resolve depois
    renderMotherCard();

    setStatus("OK ✅");
    log("MAE v1.3 carregado (admin.js)");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
