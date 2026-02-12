(() => {
  "use strict";

  let INSTALLED = false;
  let LAST_TS = 0;

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
  }

  function safeDescribe(el) {
    try {
      if (!el) return "(null)";
      const st = getComputedStyle(el);
      const id = el.id ? `#${el.id}` : "";
      const cls = (el.className || "").toString().split(" ").filter(Boolean).slice(0, 4).join(".");
      const clsPart = cls ? `.${cls}` : "";
      return `${el.tagName.toLowerCase()}${id}${clsPart} ` +
        `[z=${st.zIndex || ""} pe=${st.pointerEvents || ""} op=${st.opacity || ""} pos=${st.position || ""}]`;
    } catch {
      return "(describe-fail)";
    }
  }

  function isFullScreenBlocker(el) {
    try {
      if (!el) return false;
      const st = getComputedStyle(el);
      if (!(st.position === "fixed" || st.position === "sticky")) return false;
      if (st.pointerEvents === "none") return false;
      const r = el.getBoundingClientRect();
      const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
      const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
      // cobre boa parte do viewport
      return r.width >= vw * 0.9 && r.height >= vh * 0.9;
    } catch {
      return false;
    }
  }

  function shouldLogNow() {
    const t = Date.now();
    if (t - LAST_TS < 400) return false; // throttle
    LAST_TS = t;
    return true;
  }

  function handler(ev) {
    try {
      // evita flood: scroll/drag dispara muito
      if (!shouldLogNow()) return;

      const x = ev.clientX, y = ev.clientY;
      if (typeof x !== "number" || typeof y !== "number") return;

      const top = document.elementFromPoint(x, y);
      const path = ev.composedPath ? ev.composedPath() : [];
      const target = ev.target;

      // Caso 1: clique interceptado (top != target)
      if (top && target && top !== target) {
        log("warn",
          "ClickGuard: clique interceptado.\n" +
          `top: ${safeDescribe(top)}\n` +
          `target: ${safeDescribe(target)}\n` +
          `path0: ${safeDescribe(path[0])}`
        );
        return;
      }

      // Caso 2: top é provável overlay cobrindo viewport
      if (top && isFullScreenBlocker(top)) {
        log("warn",
          "ClickGuard: possível overlay bloqueando interação (fullscreen fixed).\n" +
          `top: ${safeDescribe(top)}`
        );
      }
    } catch {}
  }

  function install() {
    if (INSTALLED) {
      log("warn", "ClickGuard já estava instalado (skip).");
      return;
    }
    INSTALLED = true;

    // pointerdown (principal)
    document.addEventListener("pointerdown", handler, { capture: true, passive: true });

    // iOS fallback (alguns cenários o pointerdown é inconsistente)
    document.addEventListener("touchstart", (ev) => {
      try {
        const t = ev.touches && ev.touches[0];
        if (!t) return;
        // cria um "fake event" compatível pro handler
        handler({ clientX: t.clientX, clientY: t.clientY, target: ev.target, composedPath: ev.composedPath?.bind(ev) });
      } catch {}
    }, { capture: true, passive: true });

    log("ok", "ClickGuard instalado ✅");
  }

  window.RCF_CLICK_GUARD = window.RCF_CLICK_GUARD || { install };
})();
