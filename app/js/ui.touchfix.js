/* =========================================================
  RCF — ui.touchfix.js (v1)
  Objetivo: acabar com "botões não clicáveis" no iOS/Chrome
  - Força pointer-events em elementos interativos
  - Captura touch/click e tenta "encaminhar" pro botão real
  - Debug opcional: mostra qual elemento está bloqueando
========================================================= */
(() => {
  "use strict";

  const INTERACTIVE_SEL = "button, a, input, textarea, select, label, .btn, .tab, .dockbtn, .gear";

  function isEl(x) { return x && x.nodeType === 1; }

  function hardenInteractive(root = document) {
    try {
      root.querySelectorAll(INTERACTIVE_SEL).forEach(el => {
        el.style.pointerEvents = "auto";
        el.style.touchAction = "manipulation";
        el.style.webkitTapHighlightColor = "transparent";
        // melhora iOS
        if (el.tagName === "BUTTON") el.type = el.type || "button";
      });

      // checkboxes: garantir que apareçam e marquem
      root.querySelectorAll('input[type="checkbox"]').forEach(el => {
        el.style.pointerEvents = "auto";
        el.style.webkitAppearance = "auto";
        el.style.appearance = "auto";
        el.style.touchAction = "manipulation";
      });

      // containers principais
      ["app", "view-admin", "view-settings"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.pointerEvents = "auto";
      });
    } catch {}
  }

  // -------- Debug overlay (opcional) --------
  let DEBUG = false;
  let debugBox = null;

  function setDebug(on) {
    DEBUG = !!on;
    if (DEBUG && !debugBox) {
      debugBox = document.createElement("div");
      debugBox.id = "rcfTouchDebugBox";
      debugBox.style.cssText = `
        position:fixed; left:10px; right:10px; bottom:10px;
        z-index: 999999;
        background: rgba(0,0,0,.75);
        color: rgba(255,255,255,.92);
        border: 1px solid rgba(255,255,255,.15);
        border-radius: 14px;
        padding: 10px 12px;
        font: 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        pointer-events:none;
        white-space: pre-wrap;
      `;
      debugBox.textContent = "Touch Debug ON";
      document.body.appendChild(debugBox);
    }
    if (!DEBUG && debugBox) {
      debugBox.remove();
      debugBox = null;
    }
  }

  function dbg(text) {
    if (!DEBUG || !debugBox) return;
    debugBox.textContent = text;
  }

  // pega “quem está por cima”
  function topAt(x, y) {
    try {
      const list = document.elementsFromPoint(x, y);
      return Array.isArray(list) ? list : [];
    } catch {
      const el = document.elementFromPoint(x, y);
      return el ? [el] : [];
    }
  }

  // tenta achar o botão real
  function findInteractiveTarget(el) {
    if (!isEl(el)) return null;
    const t = el.closest ? el.closest(INTERACTIVE_SEL) : null;
    if (t) return t;

    // label -> input for=
    if (el.tagName === "LABEL") {
      const fid = el.getAttribute("for");
      if (fid) {
        const inp = document.getElementById(fid);
        if (inp) return inp;
      }
    }
    return null;
  }

  // encaminhamento (quando clique cai num wrapper)
  function forwardEvent(ev) {
    const t = ev.target;
    if (!isEl(t)) return;

    const real = findInteractiveTarget(t);
    if (!real) return;

    // Se tocou no wrapper mas existe botão dentro, clique nele
    if (real !== t && typeof real.click === "function") {
      try {
        ev.preventDefault?.();
        ev.stopPropagation?.();
      } catch {}
      try { real.click(); } catch {}
    }
  }

  function onTouchEnd(ev) {
    // se tiver overlay pegando toque, debug mostra
    const touch = ev.changedTouches && ev.changedTouches[0];
    if (touch) {
      const stack = topAt(touch.clientX, touch.clientY).slice(0, 6);
      if (DEBUG) {
        dbg(stack.map((el, i) => {
          const id = el.id ? `#${el.id}` : "";
          const cls = el.className ? `.${String(el.className).split(/\s+/).slice(0,3).join(".")}` : "";
          const z = getComputedStyle(el).zIndex;
          const pe = getComputedStyle(el).pointerEvents;
          const pos = getComputedStyle(el).position;
          return `${i+1}) ${el.tagName.toLowerCase()}${id}${cls}  z=${z} pe=${pe} pos=${pos}`;
        }).join("\n"));
      }
    }

    forwardEvent(ev);
  }

  function onClick(ev) {
    forwardEvent(ev);
  }

  // API para ligar debug pela UI
  window.RCF_TOUCHFIX = {
    harden: hardenInteractive,
    debugOn: () => setDebug(true),
    debugOff: () => setDebug(false),
    debugToggle: () => setDebug(!DEBUG)
  };

  // init
  function init() {
    hardenInteractive();

    // reforço por alguns segundos (porque o app re-renderiza)
    let n = 0;
    const timer = setInterval(() => {
      hardenInteractive();
      n++;
      if (n >= 8) clearInterval(timer);
    }, 600);

    // captura alto (pega antes de qualquer overlay estranho)
    document.addEventListener("touchend", onTouchEnd, { capture: true, passive: false });
    document.addEventListener("click", onClick, { capture: true, passive: false });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
