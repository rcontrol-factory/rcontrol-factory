/* =========================================================
  RControl Factory — app/js/admin.js (FULL) — MÃE UI (SAFE) + iOS TAP FIX
  - Injeta "MAINTENANCE • Self-Update (Mãe)" dentro do Admin
  - Botões clicáveis no iPhone (touchend + click, capture, preventDefault)
  - Detecta Thompson (window.RCF_THOMPSON) e mostra status no Admin
  - MVP: ainda NÃO publica nada em GitHub (isso é próximo passo)
========================================================= */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---------- iOS safe tap ----------
  const TAP_GUARD_MS = 450;
  let _lastTapAt = 0;

  function bindTap(el, fn) {
    if (!el) return;

    const handler = async (e) => {
      const now = Date.now();
      if (now - _lastTapAt < TAP_GUARD_MS) {
        try { e.preventDefault(); e.stopPropagation(); } catch {}
        return;
      }
      _lastTapAt = now;

      try { e.preventDefault(); e.stopPropagation(); } catch {}
      try { await fn(e); } catch (err) {
        out("motherMaintOut", "❌ ERRO: " + (err?.message || String(err)));
        status("Falha ❌");
        log("ADMIN error: " + (err?.message || String(err)));
      }
    };

    try {
      el.style.pointerEvents = "auto";
      el.style.touchAction = "manipulation";
      el.style.webkitTapHighlightColor = "transparent";
    } catch {}

    el.addEventListener("touchend", handler, { passive: false, capture: true });
    el.addEventListener("click", handler, { passive: false, capture: true });
  }

  function status(text) {
    const el = $("statusText");
    if (el) el.textContent = String(text || "");
  }

  function out(id, text) {
    const el = $(id);
    if (el) el.textContent = String(text || "");
  }

  function appendOut(id, text) {
    const el = $(id);
    if (!el) return;
    const prev = (el.textContent || "").trim();
    el.textContent = prev ? (prev + "\n" + text) : text;
  }

  function log(msg) {
    try {
      if (window.RCF && typeof window.RCF.log === "function") window.RCF.log(msg);
      else console.log("[RCF ADMIN]", msg);
    } catch {}
  }

  // ---------- Thompson adapter ----------
  function getThompson() {
    return window.RCF_THOMPSON || window.THOMPSON || null;
  }

  // ---------- Render Mother card ----------
  function ensureMotherCard() {
    const adminView = $("view-admin");
    if (!adminView) return null;

    // evita duplicar
    if ($("motherMaintCard")) return $("motherMaintCard");

    adminView.style.pointerEvents = "auto";
    adminView.style.position = "relative";
    adminView.style.zIndex = "1";

    const card = document.createElement("div");
    card.className = "card";
    card.id = "motherMaintCard";
    card.style.pointerEvents = "auto";

    card.innerHTML = `
      <h2 style="margin-top:4px">MAINTENANCE • Self-Update (Mãe)</h2>
      <p class="hint">SAFE por padrão. (Próximo passo: ligar Thompson + overrides + rollback real.)</p>

      <div class="row" style="flex-wrap:wrap; gap:10px; pointer-events:auto">
        <button class="btn primary" id="btnMotherPing" type="button">Testar clique (PING)</button>
        <button class="btn" id="btnMotherCheckTh" type="button">Checar Thompson</button>
        <button class="btn danger" id="btnMotherHide" type="button">Ocultar card</button>
      </div>

      <div class="hint" style="margin:10px 0 6px 0">Bundle de teste (não aplica nada ainda):</div>
      <textarea id="motherBundleTextarea" spellcheck="false"
        style="
          width:100%;
          min-height:130px;
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
  "meta": { "name":"mother-test", "version":"1.0", "createdAt":"{{DATE}}" },
  "files": { "/core/TESTE.txt": "OK — teste em {{DATE}}" }
}</textarea>

      <pre class="mono small" id="motherMaintOut" style="margin-top:10px; pointer-events:auto">Pronto.</pre>
    `;

    // insere depois do primeiro card do admin (fica bonitinho)
    const firstCard = adminView.querySelector(".card");
    if (firstCard && firstCard.parentNode) firstCard.parentNode.insertBefore(card, firstCard.nextSibling);
    else adminView.appendChild(card);

    // força pointer-events em tudo no card
    card.querySelectorAll("*").forEach((el) => {
      try {
        el.style.pointerEvents = "auto";
        el.style.touchAction = "manipulation";
      } catch {}
    });

    return card;
  }

  // ---------- Actions ----------
  function replaceDateTokens(raw) {
    const iso = new Date().toISOString();
    return String(raw || "").replaceAll("{{DATE}}", iso);
  }

  async function actionPing() {
    status("PING ✅");
    out("motherMaintOut", "✅ Clique OK (PING)\n" + new Date().toLocaleString());
    appendOut("adminOut", "MAE: PING OK ✅");
    setTimeout(() => status("OK ✅"), 700);
  }

  async function actionCheckThompson() {
    const T = getThompson();
    const ok = !!T;

    const line = ok
      ? "✅ Thompson OK (window.RCF_THOMPSON encontrado)"
      : "❌ Thompson NÃO encontrado (verifique app/js/core/thompson.js e ordem no index.html)";

    // mostra detalhes se existir
    let extra = "";
    if (ok) {
      const methods = Object.keys(T).filter(k => typeof T[k] === "function").slice(0, 30);
      extra = "\nmethods: " + (methods.length ? methods.join(", ") : "(nenhum detectado)");
    }

    out("motherMaintOut", line + extra);
    appendOut("adminOut", "MAE: check Thompson -> " + (ok ? "OK ✅" : "FAIL ❌"));
    status(ok ? "Thompson OK ✅" : "Thompson FAIL ❌");
    setTimeout(() => status("OK ✅"), 900);
  }

  async function actionHide() {
    const card = $("motherMaintCard");
    if (card) card.style.display = "none";
    appendOut("adminOut", "MAE: card ocultado");
    status("OK ✅");
  }

  // ---------- Bind + Boot ----------
  function bindMother() {
    ensureMotherCard();

    bindTap($("btnMotherPing"), actionPing);
    bindTap($("btnMotherCheckTh"), actionCheckThompson);
    bindTap($("btnMotherHide"), actionHide);

    // marca carregamento visível
    appendOut("adminOut", "MAE UI carregada ✅ (app/js/admin.js)");
    out("motherMaintOut", "✅ MAE UI carregada.\nSe aparecer aqui, então o script está rodando.");
  }

  function init() {
    bindMother();

    // status Thompson logo no boot
    const T = getThompson();
    appendOut("adminOut", "Thompson: " + (T ? "OK ✅" : "não encontrado ❌"));

    status("OK ✅");
    log("admin.js init ok");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
