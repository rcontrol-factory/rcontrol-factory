/* =========================================================
  RControl Factory — /app/js/core/ui_compact_outputs.js (PADRÃO) — v1.0
  - Evita Safari "tela gigante" por <pre> muito grande
  - Aplica max-height + overflow (scroll interno) em outputs comuns
  - Compacta #logsOut para últimas N linhas (SEM apagar do localStorage)
========================================================= */
(() => {
  "use strict";

  if (window.RCF_UI_COMPACT && window.RCF_UI_COMPACT.__v10) return;

  const MAX_LINES = 120;      // ajuste aqui se quiser mais/menos
  const MAX_VH = 42;          // altura máxima dos outputs na tela
  const TARGET_IDS = ["logsOut", "diagOut", "genOut", "injOut", "settingsOut"];

  function log(lvl, msg){
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[UI_COMPACT]", lvl, msg); } catch {}
  }

  function $(id){ return document.getElementById(id); }

  function applyBoxStyles(el){
    if (!el) return;
    try {
      el.style.maxHeight = `${MAX_VH}vh`;
      el.style.overflow = "auto";
      el.style.webkitOverflowScrolling = "touch";
      el.style.wordBreak = "break-word";
      el.style.whiteSpace = "pre-wrap"; // evita linha gigante estourar largura/altura
      el.style.contain = "content";
    } catch {}
  }

  function tailLines(text, maxLines){
    const s = String(text || "");
    if (!s) return s;
    const lines = s.split("\n");
    if (lines.length <= maxLines) return s;
    const cut = lines.slice(lines.length - maxLines).join("\n");
    const head = `… (mostrando últimas ${maxLines} linhas de ${lines.length}) …\n\n`;
    return head + cut;
  }

  function compactLogsOut(){
    const el = $("logsOut");
    if (!el) return false;

    // pega texto do próprio DOM
    const raw = (el.textContent || "");
    if (!raw) return true;

    // se já está compactado, não fica recompactando sem parar
    if (raw.startsWith("… (mostrando últimas")) return true;

    const next = tailLines(raw, MAX_LINES);
    if (next !== raw) el.textContent = next;

    return true;
  }

  function initOnce(){
    // aplica estilo nos outputs conhecidos
    for (const id of TARGET_IDS) applyBoxStyles($(id));

    // também aplica em qualquer <pre> grande (fallback)
    try {
      const pres = Array.from(document.querySelectorAll("pre"));
      pres.forEach(applyBoxStyles);
    } catch {}

    // compacta logs especificamente
    compactLogsOut();
  }

  function installObserver(){
    // roda já
    initOnce();

    // observa mudanças (views trocando / logs mudando)
    const obs = new MutationObserver(() => {
      // reaplica estilos se aparecerem novos outputs
      for (const id of TARGET_IDS) applyBoxStyles($(id));
      compactLogsOut();
    });

    obs.observe(document.documentElement, { childList: true, subtree: true });
    return obs;
  }

  function boot(){
    try {
      installObserver();
      log("ok", "ui_compact_outputs.js ready ✅ (v1.0)");
    } catch (e) {
      log("err", "ui_compact_outputs init fail :: " + (e?.message || String(e)));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  window.RCF_UI_COMPACT = { __v10:true, compactLogsOut };
})();
