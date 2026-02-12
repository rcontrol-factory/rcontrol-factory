(() => {
  "use strict";

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
  }

  function describe(el) {
    if (!el) return "(null)";
    const st = getComputedStyle(el);
    return `${el.tagName.toLowerCase()}#${el.id || ""}.${(el.className || "").toString().split(" ").filter(Boolean).slice(0,4).join(".")} ` +
           `[z=${st.zIndex || ""} pe=${st.pointerEvents || ""} op=${st.opacity || ""} pos=${st.position || ""}]`;
  }

  function install() {
    // captura no começo pra ver o que realmente está recebendo o clique
    document.addEventListener("pointerdown", (ev) => {
      try {
        const x = ev.clientX, y = ev.clientY;
        const top = document.elementFromPoint(x, y);
        const path = ev.composedPath ? ev.composedPath() : [];
        const target = ev.target;

        // se o target não é o top, tem algo interceptando
        if (top && target && top !== target) {
          log("warn",
            "ClickGuard: clique interceptado.\n" +
            `top: ${describe(top)}\n` +
            `target: ${describe(target)}\n` +
            `path0: ${describe(path[0])}`
          );
        }
      } catch {}
    }, { capture: true, passive: true });

    log("ok", "ClickGuard instalado ✅");
  }

  window.RCF_CLICK_GUARD = window.RCF_CLICK_GUARD || { install };
})();
