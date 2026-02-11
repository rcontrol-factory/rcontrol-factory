/* =========================================================
  RControl Factory — /app/js/ui.gear.js (FULL)
  FIX iOS: botões dentro da engrenagem/drawer não clicam
========================================================= */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const TAP_GUARD_MS = 350;
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
        console.warn("[GEAR] click error:", err);
      }
    };

    // iOS safe
    el.style.pointerEvents = "auto";
    el.style.touchAction = "manipulation";
    el.style.webkitTapHighlightColor = "transparent";

    el.addEventListener("touchend", handler, { passive: false, capture: true });
    el.addEventListener("click", handler, { passive: false, capture: true });
  }

  function openDrawer() {
    const drawer = $("toolsDrawer");
    if (!drawer) return;
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");

    // força pointer events (mata overlay/bug iOS)
    drawer.style.pointerEvents = "auto";
    drawer.style.zIndex = "99999";
    drawer.querySelectorAll("*").forEach((n) => {
      if (n && n.style) {
        n.style.pointerEvents = "auto";
        n.style.touchAction = "manipulation";
      }
    });
  }

  function closeDrawer() {
    const drawer = $("toolsDrawer");
    if (!drawer) return;
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    drawer.style.pointerEvents = "none";
  }

  function init() {
    const btnOpen1 = $("btnOpenTools");   // topo
    const btnOpen2 = $("btnOpenTools2");  // dashboard
    const btnClose = $("btnCloseTools");
    const drawer = $("toolsDrawer");

    // Abrir/fechar drawer
    bindTap(btnOpen1, openDrawer);
    bindTap(btnOpen2, openDrawer);
    bindTap(btnClose, closeDrawer);

    // FIX: botões dentro do drawer não clicam
    bindTap($("btnClearLogs"), () => {
      // se existir logger, limpa
      if (window.RCF_LOGGER?.clear) window.RCF_LOGGER.clear();
      const box = $("logsBox");
      if (box) box.textContent = "Logs limpos ✅";
    });

    bindTap($("btnCopyLogs"), async () => {
      const txt = $("logsBox")?.textContent || "";
      try { await navigator.clipboard.writeText(txt); } catch {}
      const box = $("logsBox");
      if (box) box.textContent = (txt ? txt : "Logs...") + "\n\nCopiado ✅";
    });

    // Se clicar fora (opcional), fecha
    if (drawer) {
      drawer.addEventListener("click", (e) => {
        // clica no fundo do drawer (não em botão) -> não fecha
        // (mantém simples)
      }, { capture: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
