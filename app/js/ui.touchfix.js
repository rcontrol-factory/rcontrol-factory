/* /app/js/ui.touchfix.js
   RCF TouchFix HARD (iOS/Android)
   - Se um overlay invisível capturar o toque, a gente procura o botão REAL com elementsFromPoint()
   - Força click() no elemento clicável mais adequado
   - Loga no console quando precisou “salvar” o clique
*/

(() => {
  "use strict";

  const CLICKABLE_SEL = [
    "button",
    "a[href]",
    "input[type=button]",
    "input[type=submit]",
    "input[type=checkbox]",
    "label",
    ".btn",
    ".tab",
    ".dockbtn"
  ].join(",");

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function isPointerActive(el) {
    const cs = getComputedStyle(el);
    return cs.pointerEvents !== "none";
  }

  function isClickable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (!isVisible(el)) return false;
    if (!isPointerActive(el)) return false;

    // se for label, só vale se estiver associado a input ou tiver onclick
    if (el.tagName === "LABEL") return true;

    if (el.matches(CLICKABLE_SEL)) return true;

    // pega pai mais próximo que seja clicável
    const up = el.closest ? el.closest(CLICKABLE_SEL) : null;
    return !!up;
  }

  function pickBestClickable(x, y) {
    const stack = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [document.elementFromPoint(x, y)];
    for (const el of stack) {
      if (!el) continue;

      // se tocar num filho dentro de um botão, sobe pro botão
      const up = el.closest ? el.closest(CLICKABLE_SEL) : el;
      const cand = up || el;

      if (cand && isClickable(cand)) return cand;
    }
    return null;
  }

  let lastTap = { x: 0, y: 0, t: 0, moved: false };

  // Marca início do toque
  document.addEventListener("touchstart", (ev) => {
    const t = ev.touches && ev.touches[0];
    if (!t) return;
    lastTap = { x: t.clientX, y: t.clientY, t: Date.now(), moved: false };
  }, { passive: true, capture: true });

  // Se arrastar muito, não força click
  document.addEventListener("touchmove", (ev) => {
    const t = ev.touches && ev.touches[0];
    if (!t) return;
    const dx = Math.abs(t.clientX - lastTap.x);
    const dy = Math.abs(t.clientY - lastTap.y);
    if (dx > 10 || dy > 10) lastTap.moved = true;
  }, { passive: true, capture: true });

  // Resgate do clique
  document.addEventListener("touchend", (ev) => {
    // não atrapalhar digitação/seleção
    const target = ev.target;
    if (target && target.closest) {
      if (target.closest("input, textarea, select")) return;
    }

    const dt = Date.now() - lastTap.t;
    if (lastTap.moved) return;
    if (dt > 550) return; // long press, não

    const changed = ev.changedTouches && ev.changedTouches[0];
    const x = changed ? changed.clientX : lastTap.x;
    const y = changed ? changed.clientY : lastTap.y;

    const best = pickBestClickable(x, y);
    if (!best) return;

    // Se o toque caiu em um overlay, o target não será o botão.
    // Aí a gente força o click no botão “real”.
    const targetClickable = (target && target.closest) ? target.closest(CLICKABLE_SEL) : null;

    if (best && best !== target && best !== targetClickable) {
      try {
        ev.preventDefault();  // evita “tap fantasma”
        ev.stopPropagation();

        // Se for label, manda click nela (ela vai acionar input)
        if (best.tagName === "LABEL") {
          best.click();
        } else {
          best.click();
        }

        // debug rápido
        console.log("[RCF_TOUCHFIX] rescued click ->", best.tagName, best.id || "", best.className || "");
      } catch (e) {
        console.warn("[RCF_TOUCHFIX] rescue failed", e);
      }
    }
  }, { passive: false, capture: true });

})();
