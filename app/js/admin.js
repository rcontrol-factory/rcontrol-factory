/* =========================================================
  RControl Factory — app/js/admin.js (FULL) — v3.2
  Admin • IA Offline (Factory)
  - iOS-safe bind (touchend + click, capture, preventDefault)
  - Render leve/robusto (não duplica, não quebra se faltar DOM)
  - Integração "Mãe" fica no core/mother_selfupdate.js (se existir)
  - Logs em RCF_LOGGER se existir

  Objetivo:
  ✅ garantir UI clicável e previsível no iPhone/Chrome
  ✅ evitar travas por overlay/pointer-events
  ✅ manter Admin estável pra “Mãe” aplicar bundles por Thompson

  NOTA:
  - Se você já tem a UI do Admin no index.html, ele só faz bind.
  - Se não tiver, ele cria uma UI mínima (Executar/Limpar/Aplicar/Descartar).
========================================================= */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---------- logger ----------
  function log(msg) {
    try {
      if (window.RCF_LOGGER && typeof window.RCF_LOGGER.push === "function") {
        window.RCF_LOGGER.push("log", String(msg));
      } else if (window.RCF && typeof window.RCF.log === "function") {
        window.RCF.log(String(msg));
      } else {
        console.log("[RCF ADMIN]", msg);
      }
    } catch {}
  }

  function warn(msg) {
    try {
      if (window.RCF_LOGGER && typeof window.RCF_LOGGER.push === "function") {
        window.RCF_LOGGER.push("warn", String(msg));
      } else {
        console.warn("[RCF ADMIN]", msg);
      }
    } catch {}
  }

  function setStatus(text) {
    const el = $("statusText");
    if (el) el.textContent = String(text || "");
  }

  function writeOut(id, text) {
    const el = $(id);
    if (el) el.textContent = String(text || "");
  }

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
        const msg = (err && err.message) ? err.message : String(err);
        writeOut("adminOut", "❌ ERRO: " + msg);
        setStatus("Falha ❌");
        warn("click error: " + msg);
      }
    };

    try {
      el.style.pointerEvents = "auto";
      el.style.touchAction = "manipulation";
      el.style.webkitTapHighlightColor = "transparent";
      // capture ajuda quando tem container/overlay chato
      el.addEventListener("touchend", handler, { passive: false, capture: true });
      el.addEventListener("click", handler, { passive: false, capture: true });
    } catch {}
  }

  // ---------- util ----------
  function ensurePointerEvents(root) {
    if (!root) return;
    try {
      root.style.pointerEvents = "auto";
      root.style.position = root.style.position || "relative";
      root.style.zIndex = root.style.zIndex || "1";
    } catch {}

    try {
      const nodes = root.querySelectorAll("*");
      nodes.forEach((n) => {
        try {
          n.style.pointerEvents = "auto";
          n.style.touchAction = "manipulation";
        } catch {}
      });
    } catch {}
  }

  // =========================================================
  //  UI: Admin IA Offline (pode existir no HTML ou ser criado)
  // =========================================================
  function renderAdminCardIfMissing() {
    const view = $("view-admin");
    if (!view) return;

    ensurePointerEvents(view);

    // Se o card IA já existe, não cria outro
    if ($("adminIaCard")) return;

    const card = document.createElement("div");
    card.className = "card";
    card.id = "adminIaCard";
    card.style.pointerEvents = "auto";

    // UI mínima, sem quebrar o seu layout
    card.innerHTML = `
      <h2 style="margin-top:4px">ADMIN • IA Offline v2 (70%)</h2>
      <p class="hint">Ajuda a atualizar a Factory (corrigir UI, melhorar ações). Você aprova manualmente.</p>

      <div class="row" style="flex-wrap:wrap; gap:10px">
        <button class="btn ok" id="btnAdminRun" type="button">Executar</button>
        <button class="btn" id="btnAdminClear" type="button">Limpar</button>
        <button class="btn primary" id="btnAdminApply" type="button">Aplicar sugestão</button>
        <button class="btn danger" id="btnAdminDiscard" type="button">Descartar</button>
      </div>

      <pre class="mono small" id="adminOut" style="margin-top:10px">Pronto.</pre>

      <div class="hint" style="margin-top:10px">
        Dica: a seção <b>MAINTENANCE • Self-Update (Mãe)</b> é controlada pelo <code>js/core/mother_selfupdate.js</code>.
      </div>
    `;

    // insere como primeiro card do admin (bonito e previsível)
    const first = view.querySelector(".card");
    if (first && first.parentNode) {
      first.parentNode.insertBefore(card, first);
    } else {
      view.appendChild(card);
    }

    ensurePointerEvents(card);
  }

  // =========================================================
  //  Ações IA Offline (stubs seguros)
  // =========================================================
  function getAiState() {
    // espaço pra você plugar depois
    return window.RCF_AI || window.AI_BUILDER || null;
  }

  async function actionRun() {
    setStatus("Executando…");
    writeOut("adminOut", "Executando IA Offline…");

    const AI = getAiState();
    if (AI && typeof AI.run === "function") {
      const r = await AI.run();
      writeOut("adminOut", "✅ Executado.\n" + (typeof r === "string" ? r : JSON.stringify(r, null, 2)));
      setStatus("OK ✅");
      return;
    }

    // fallback: só confirma funcionamento do clique
    writeOut("adminOut", "✅ Clique OK.\n(IA Offline ainda é stub. Vamos ligar depois.)");
    setStatus("OK ✅");
  }

  async function actionClear() {
    setStatus("Limpando…");

    // limpa output
    writeOut("adminOut", "Pronto.");

    // se AI tiver método
    const AI = getAiState();
    if (AI && typeof AI.clear === "function") {
      try { await AI.clear(); } catch {}
    }

    setStatus("OK ✅");
    log("ADMIN clear");
  }

  async function actionApplySuggestion() {
    setStatus("Aplicando…");
    writeOut("adminOut", "Aplicando sugestão…");

    const AI = getAiState();
    if (AI && typeof AI.apply === "function") {
      const r = await AI.apply();
      writeOut("adminOut", "✅ Sugestão aplicada.\n" + (typeof r === "string" ? r : JSON.stringify(r, null, 2)));
      setStatus("OK ✅");
      return;
    }

    writeOut("adminOut", "✅ Clique OK.\n(Quando ligarmos o fluxo de sugestões, este botão aplica patches.)");
    setStatus("OK ✅");
  }

  async function actionDiscard() {
    setStatus("Descartando…");
    writeOut("adminOut", "Descartando…");

    const AI = getAiState();
    if (AI && typeof AI.discard === "function") {
      const r = await AI.discard();
      writeOut("adminOut", "✅ Descartado.\n" + (typeof r === "string" ? r : JSON.stringify(r, null, 2)));
      setStatus("OK ✅");
      return;
    }

    writeOut("adminOut", "✅ Clique OK.\n(Nada para descartar no modo stub.)");
    setStatus("OK ✅");
  }

  // =========================================================
  //  Bind
  // =========================================================
  function bindButtons() {
    // Se sua UI já existe, ele vai achar os IDs.
    // Se não existe, ele cria a UI mínima.
    renderAdminCardIfMissing();

    // força pointer-events na view e no card
    ensurePointerEvents($("view-admin"));
    ensurePointerEvents($("adminIaCard"));

    // binds
    bindTap($("btnAdminRun"), actionRun);
    bindTap($("btnAdminClear"), actionClear);
    bindTap($("btnAdminApply"), actionApplySuggestion);
    bindTap($("btnAdminDiscard"), actionDiscard);

    // Marca carregado
    const out = $("adminOut");
    if (out) {
      const prev = (out.textContent || "Pronto.").trim();
      out.textContent = prev + "\n\nADMIN v3.2 ✅ carregado";
    }

    setStatus("OK ✅");
    log("ADMIN v3.2 init ok");
  }

  function init() {
    try { bindButtons(); } catch (e) {
      warn("ADMIN init fail: " + (e?.message || String(e)));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
