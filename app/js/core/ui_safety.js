/* =========================================================
  RControl Factory — /app/js/core/ui_safety.js (FULL) — v1.0 (PADRÃO)
  - iOS/Safari UI Safety Layer
  - Evita overlay roubando toque + double fire (touch/click)
  - Ajuda scroll/viewport sem estourar layout
  - Não depende de app.js (auto-install)
  API: window.RCF_UI_SAFETY
========================================================= */
(() => {
  "use strict";

  if (window.RCF_UI_SAFETY && window.RCF_UI_SAFETY.__v10) return;

  const TAP_GUARD_MS = 420;
  let _lastTapAt = 0;

  const log = (lvl, msg) => {
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[UI_SAFETY]", lvl, msg); } catch {}
  };

  function safeText(x) {
    try { return typeof x === "string" ? x : JSON.stringify(x); }
    catch { return String(x); }
  }

  function isVisible(el) {
    try {
      if (!el) return false;
      const st = getComputedStyle(el);
      if (!st) return false;
      if (st.display === "none" || st.visibility === "hidden" || st.opacity === "0") return false;
      const r = el.getBoundingClientRect();
      if (!r || (r.width === 0 && r.height === 0)) return false;
      return true;
    } catch {
      return false;
    }
  }

  // -----------------------------
  // 1) CSS hardening (inline)
  // -----------------------------
  function injectCSSOnce() {
    if (document.getElementById("rcf-ui-safety-css")) return true;

    const css = `
/* RCF UI SAFETY v1.0 */
:root { -webkit-tap-highlight-color: transparent; }
html,body { overscroll-behavior: contain; }
body { touch-action: manipulation; }

/* overlays comuns não podem roubar toque (quando forem "efeito") */
.overlay,.glass,.bg-blur { pointer-events:none; }

/* modais e elementos interativos continuam clicáveis */
.modal, .modal * { pointer-events:auto; }

/* inputs e botões sempre clicáveis */
button, a, input, textarea, select, label { pointer-events:auto; }

/* evita topbar ficar abaixo de layers */
.topbar,.top-nav { position: sticky; top: 0; z-index: 9999; }

/* evita dock ficar atrás */
.bottom-dock { z-index: 2000; }

/* evita <pre> gigante estourar */
pre { max-height: 44vh; overflow:auto; -webkit-overflow-scrolling:touch; white-space:pre-wrap; word-break:break-word; }
`.trim();

    try {
      const st = document.createElement("style");
      st.id = "rcf-ui-safety-css";
      st.textContent = css;
      document.head.appendChild(st);
      return true;
    } catch {
      return false;
    }
  }

  // -----------------------------
  // 2) Double-fire guard (iOS)
  // -----------------------------
  function installTapGuard() {
    if (window.__RCF_TAP_GUARD_INSTALLED__) return true;
    window.__RCF_TAP_GUARD_INSTALLED__ = true;

    // captura no topo pra bloquear o segundo evento (click depois do touchend)
    const handler = (ev) => {
      const type = ev.type;
      if (type !== "click" && type !== "touchend") return;

      const now = Date.now();
      if (now - _lastTapAt < TAP_GUARD_MS) {
        try { ev.preventDefault(); ev.stopPropagation(); } catch {}
        return;
      }
      _lastTapAt = now;
    };

    try {
      document.addEventListener("touchend", handler, { capture: true, passive: false });
      document.addEventListener("click", handler, { capture: true, passive: false });
      return true;
    } catch {
      return false;
    }
  }

  // -----------------------------
  // 3) “Rescue click” para labels/inputs
  // -----------------------------
  function installLabelRescue() {
    if (window.__RCF_LABEL_RESCUE_INSTALLED__) return true;
    window.__RCF_LABEL_RESCUE_INSTALLED__ = true;

    const rescue = (ev) => {
      const t = ev.target;
      if (!t) return;

      // label -> click no input referenciado
      if (t.tagName === "LABEL") {
        const fid = t.getAttribute("for");
        if (fid) {
          const inp = document.getElementById(fid);
          if (inp && typeof inp.click === "function") {
            try { inp.click(); } catch {}
          }
        }
      }
    };

    try {
      document.addEventListener("click", rescue, true);
      document.addEventListener("touchend", rescue, true);
      return true;
    } catch {
      return false;
    }
  }

  // -----------------------------
  // 4) Overlay audit (soft)
  // -----------------------------
  function scanBlockingOverlays() {
    // opcional: se tiver overlay scanner, usa
    try {
      if (window.RCF_OVERLAY_SCANNER?.scan) return window.RCF_OVERLAY_SCANNER.scan();
    } catch {}

    // fallback simples: procura elementos visíveis com pointer-events:auto e z-index alto cobrindo tela
    const blocked = [];
    try {
      const all = Array.from(document.querySelectorAll("body *"));
      const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
      const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

      for (const el of all) {
        if (!isVisible(el)) continue;

        const st = getComputedStyle(el);
        if (!st) continue;
        if (st.pointerEvents === "none") continue;

        const z = Number(st.zIndex || 0);
        if (z < 1500) continue;

        const r = el.getBoundingClientRect();
        // cobre boa parte da tela
        const cover = (r.width * r.height) / (vw * vh);
        if (cover > 0.35) {
          blocked.push({
            tag: (el.tagName || "").toLowerCase(),
            id: el.id || "",
            cls: (el.className || "").toString().slice(0, 120),
            zIndex: st.zIndex || "",
            cover: Math.round(cover * 100) + "%"
          });
          if (blocked.length >= 8) break;
        }
      }
    } catch {}

    return { ok: true, blocked };
  }

  // -----------------------------
  // 5) Install
  // -----------------------------
  function install() {
    const rep = {
      ts: new Date().toISOString(),
      css: injectCSSOnce(),
      tapGuard: installTapGuard(),
      labelRescue: installLabelRescue(),
    };

    try {
      const scan = scanBlockingOverlays();
      if (scan?.blocked?.length) {
        log("warn", "Overlay(s) podem roubar clique: " + safeText(scan.blocked));
      } else {
        log("ok", "UI safety: nenhum overlay bloqueando (scan)");
      }
    } catch {}

    log("ok", "ui_safety.js instalado ✅ v1.0");
    return rep;
  }

  // auto install
  function boot() {
    try { install(); } catch (e) {
      log("err", "ui_safety boot fail :: " + (e?.message || String(e)));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  window.RCF_UI_SAFETY = { __v10: true, install, scanBlockingOverlays };
})();
