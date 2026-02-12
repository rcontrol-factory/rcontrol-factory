(() => {
  "use strict";

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
  }

  function isBlocking(el) {
    const st = getComputedStyle(el);
    if (st.pointerEvents === "none") return false;
    if (st.visibility === "hidden" || st.display === "none" || Number(st.opacity) === 0) {
      // pode ser invisível mas ainda bloquear se pointer-events estiver ativo
      // opacity 0 ainda pode bloquear
    }
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;

    const covers =
      r.width > vw * 0.8 &&
      r.height > vh * 0.8 &&
      r.left <= vw * 0.1 &&
      r.top <= vh * 0.1;

    if (!covers) return false;

    const z = parseInt(st.zIndex || "0", 10);
    return (st.position === "fixed" || st.position === "sticky") && (z >= 10 || st.pointerEvents !== "none");
  }

  function scan() {
    const suspects = [];
    const all = Array.from(document.querySelectorAll("body *"));
    for (const el of all) {
      try {
        if (isBlocking(el)) {
          const st = getComputedStyle(el);
          suspects.push({
            tag: el.tagName.toLowerCase(),
            id: el.id || "",
            cls: (el.className || "").toString().slice(0, 120),
            z: st.zIndex || "",
            pe: st.pointerEvents || "",
            op: st.opacity || "",
            pos: st.position || ""
          });
        }
      } catch {}
      if (suspects.length >= 25) break;
    }

    if (suspects.length) {
      log("warn", "OverlayScanner: POSSÍVEL overlay bloqueando cliques:\n" + JSON.stringify(suspects, null, 2));
    } else {
      log("ok", "OverlayScanner: nenhum overlay grande suspeito ✅");
    }
    return suspects;
  }

  window.RCF_OVERLAY_SCANNER = window.RCF_OVERLAY_SCANNER || { scan };
})();
