/* =========================================================
  RControl Factory — /app/js/core/ui_admin_compact.js (PADRÃO) — v1.0
  - Conserta a tela "horrível" do Admin (FASE A) no iPhone:
    * outputs (Log / Preview/Diff) não estouram a tela
    * scroll interno + max-height
    * compacta log do Admin para últimas N linhas (sem apagar nada do storage)
========================================================= */
(() => {
  "use strict";

  if (window.RCF_UI_ADMIN_COMPACT && window.RCF_UI_ADMIN_COMPACT.__v10) return;

  const MAX_VH = 34;        // altura máxima dos outputs no Admin
  const MAX_LINES = 90;     // linhas máximas nos logs do Admin (DOM)
  const ADMIN_VIEW_SEL = "#view-admin, [data-view='admin'], .view-admin";

  function log(lvl, msg){
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[UI_ADMIN_COMPACT]", lvl, msg); } catch {}
  }

  function applyBoxStyles(el){
    if (!el) return;
    try {
      el.style.maxHeight = `${MAX_VH}vh`;
      el.style.overflow = "auto";
      el.style.webkitOverflowScrolling = "touch";
      el.style.wordBreak = "break-word";
      el.style.whiteSpace = "pre-wrap";
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

  function compactPre(pre){
    if (!pre) return;
    const raw = pre.textContent || "";
    if (!raw) return;
    if (raw.startsWith("… (mostrando últimas")) return;

    const next = tailLines(raw, MAX_LINES);
    if (next !== raw) pre.textContent = next;
  }

  function findAdminRoot(){
    return document.querySelector(ADMIN_VIEW_SEL) || null;
  }

  function fixAdmin(){
    const root = findAdminRoot();
    if (!root) return false;

    // targets comuns (se existirem)
    const ids = ["adminOut","previewOut","diffOut","logOut","phaseLog","phaseOut","scanOut"];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) applyBoxStyles(el);
    }

    // fallback: todo <pre> dentro do Admin
    const pres = Array.from(root.querySelectorAll("pre"));
    pres.forEach(p => {
      applyBoxStyles(p);
      // compacta só se tiver cara de LOG grande
      if ((p.textContent || "").split("\n").length > MAX_LINES) compactPre(p);
    });

    // fallback: textarea outputs
    const tas = Array.from(root.querySelectorAll("textarea"));
    tas.forEach(applyBoxStyles);

    return true;
  }

  function install(){
    // roda já
    fixAdmin();

    // observa troca de view + updates
    const obs = new MutationObserver(() => {
      fixAdmin();
    });

    obs.observe(document.documentElement, { childList:true, subtree:true });

    log("ok", "ui_admin_compact.js ready ✅ (v1.0)");
    window.RCF_UI_ADMIN_COMPACT = { __v10:true, fixAdmin };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once:true });
  } else {
    install();
  }
})();
