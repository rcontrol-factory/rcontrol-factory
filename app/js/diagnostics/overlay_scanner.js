(() => {
  "use strict";

  let INSTALLED = false;
  let LAST_SCAN = 0;

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
  }

  function safeNum(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  }

  function isLikelyVisibleButBlocking(st) {
    // opacity 0 / visibility hidden ainda pode bloquear se pointer-events != none
    // display none não bloqueia porque não entra no layout
    if (st.display === "none") return false;
    if (st.pointerEvents === "none") return false;
    return true;
  }

  function coversViewportMostly(rect, vw, vh) {
    if (!rect) return false;
    const covers =
      rect.width >= vw * 0.80 &&
      rect.height >= vh * 0.80 &&
      rect.left <= vw * 0.12 &&
      rect.top <= vh * 0.12;
    return !!covers;
  }

  function getSuspectInfo(el, st, rect) {
    const z = st.zIndex || "";
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      cls: (el.className || "").toString().slice(0, 140),
      z,
      pe: st.pointerEvents || "",
      op: st.opacity || "",
      vis: st.visibility || "",
      disp: st.display || "",
      pos: st.position || "",
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      x: Math.round(rect.left),
      y: Math.round(rect.top),
    };
  }

  function isBlockingCandidate(el) {
    try {
      if (!el || el === document.body || el === document.documentElement) return false;

      const st = getComputedStyle(el);
      if (!isLikelyVisibleButBlocking(st)) return false;

      // só faz sentido em coisas "overlay-like"
      if (!(st.position === "fixed" || st.position === "sticky" || st.position === "absolute")) {
        return false;
      }

      const rect = el.getBoundingClientRect();
      const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
      const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

      if (!coversViewportMostly(rect, vw, vh)) return false;

      const z = safeNum(st.zIndex || 0);
      // se zIndex alto ou pointer-events ativo já é suspeito
      if (z >= 10) return true;

      // mesmo sem zIndex, fixed fullscreen com pointer-events ativo costuma ser blocker
      return st.pointerEvents !== "none";
    } catch {
      return false;
    }
  }

  function shouldScanNow() {
    const t = Date.now();
    if (t - LAST_SCAN < 800) return false;
    LAST_SCAN = t;
    return true;
  }

  function scan(opts = {}) {
    const limit = Number.isFinite(opts.limit) ? opts.limit : 25;
    const suspects = [];

    try {
      const all = Array.from(document.querySelectorAll("body *"));
      for (const el of all) {
        try {
          if (isBlockingCandidate(el)) {
            const st = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            suspects.push(getSuspectInfo(el, st, rect));
          }
        } catch {}
        if (suspects.length >= limit) break;
      }

      // Heurística extra: o que está “por cima” no centro do viewport?
      try {
        const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
        const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
        const top = document.elementFromPoint(Math.floor(vw / 2), Math.floor(vh / 2));
        if (top && isBlockingCandidate(top)) {
          const st = getComputedStyle(top);
          const rect = top.getBoundingClientRect();
          const info = getSuspectInfo(top, st, rect);
          info.note = "top@center";
          // evita duplicar
          const dup = suspects.some(s => s.tag === info.tag && s.id === info.id && s.x === info.x && s.y === info.y);
          if (!dup) suspects.unshift(info);
        }
      } catch {}

      if (suspects.length) {
        log("warn", "OverlayScanner: POSSÍVEL overlay bloqueando cliques:\n" + JSON.stringify(suspects, null, 2));
      } else {
        log("ok", "OverlayScanner: nenhum overlay grande suspeito ✅");
      }
    } catch (e) {
      log("err", "OverlayScanner scan err: " + (e?.message || e));
    }

    return suspects;
  }

  function highlightFirst() {
    try {
      const s = scan({ limit: 1 })[0];
      if (!s) return false;

      // tenta achar de novo pelo id (se tiver)
      let el = null;
      if (s.id) el = document.getElementById(s.id);
      if (!el) {
        // fallback: tenta pelo centro
        const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
        const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
        el = document.elementFromPoint(Math.floor(vw / 2), Math.floor(vh / 2));
      }
      if (!el) return false;

      el.style.outline = "3px solid #ef4444";
      el.style.outlineOffset = "2px";
      log("warn", "OverlayScanner: highlight aplicado no possível blocker.");
      return true;
    } catch {
      return false;
    }
  }

  function install() {
    if (INSTALLED) {
      log("warn", "OverlayScanner já estava instalado (skip).");
      return;
    }
    INSTALLED = true;

    // varre após load e depois de mudanças leves no DOM
    const kick = () => {
      try {
        if (!shouldScanNow()) return;
        scan();
      } catch {}
    };

    window.addEventListener("load", () => setTimeout(kick, 120), { passive: true });
    window.addEventListener("resize", () => setTimeout(kick, 120), { passive: true });

    // MutationObserver (leve)
    try {
      const mo = new MutationObserver(() => setTimeout(kick, 120));
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch {}

    log("ok", "OverlayScanner instalado ✅");
  }

  window.RCF_OVERLAY_SCANNER = window.RCF_OVERLAY_SCANNER || {
    scan,
    install,
    highlightFirst
  };

  log("ok", "overlay_scanner.js loaded ✅");
})();
