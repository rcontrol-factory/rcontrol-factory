/* =========================================================
  app/js/mother_boot.js (FULL)
  - Força a seção "Mãe / Maintenance" reaparecer no Admin
  - Escreve no #adminOut quando carregou (pra você ver)
  - Re-tenta quando você troca de aba/view (caso renderize tarde)
========================================================= */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function mark(msg) {
    const out = $("adminOut");
    if (!out) return;
    const prev = (out.textContent || "").trim();
    out.textContent = (prev ? prev + "\n" : "") + msg;
  }

  function ensureMotherCardExists() {
    const adminView = $("view-admin");
    if (!adminView) return false;

    // já existe?
    if ($("motherMaintCard")) return true;

    // Se você está usando mother_selfupdate.js, ele tem ensureCard() lá.
    // Como não dá pra chamar direto, a gente faz um fallback mínimo aqui.
    const card = document.createElement("div");
    card.className = "card";
    card.id = "motherMaintCard";
    card.style.pointerEvents = "auto";

    card.innerHTML = `
      <h2 style="margin-top:4px">MAINTENANCE • Self-Update (Mãe)</h2>
      <p class="hint">A Mãe sumiu e foi forçada por mother_boot.js ✅</p>

      <div class="row" style="flex-wrap:wrap; gap:10px">
        <button class="btn ok" id="btnMotherPing" type="button">Ping</button>
        <button class="btn" id="btnMotherShow" type="button">Mostrar status</button>
      </div>

      <pre class="mono small" id="motherMaintOut" style="margin-top:10px">Pronto.</pre>
    `;

    // coloca depois do primeiro card do admin
    const firstCard = adminView.querySelector(".card");
    if (firstCard && firstCard.parentNode) firstCard.parentNode.insertBefore(card, firstCard.nextSibling);
    else adminView.appendChild(card);

    // binds simples (só pra provar clique/vida)
    const ping = $("btnMotherPing");
    const show = $("btnMotherShow");
    const mout = $("motherMaintOut");

    const tap = (el, fn) => {
      if (!el) return;
      const handler = (e) => {
        try { e.preventDefault(); e.stopPropagation(); } catch {}
        try { fn(); } catch {}
      };
      el.style.pointerEvents = "auto";
      el.style.touchAction = "manipulation";
      el.addEventListener("touchend", handler, { passive: false, capture: true });
      el.addEventListener("click", handler, { passive: false, capture: true });
    };

    tap(ping, () => {
      if (mout) mout.textContent = "✅ PING OK — " + new Date().toLocaleString();
    });

    tap(show, () => {
      const hasTh = !!window.RCF_THOMPSON;
      const hasGh = !!window.RCF_GH;
      if (mout) mout.textContent =
        "STATUS\n" +
        "Thompson: " + (hasTh ? "OK ✅" : "NÃO ❌") + "\n" +
        "GitHubSync: " + (hasGh ? "OK ✅" : "NÃO ❌") + "\n" +
        "view-admin: OK ✅";
    });

    return true;
  }

  function tryNow(tag) {
    const ok = ensureMotherCardExists();
    if (ok) mark("MOTHER_BOOT ✅ (" + tag + ") — motherMaintCard OK");
    else mark("MOTHER_BOOT ⚠️ (" + tag + ") — view-admin não encontrado");
  }

  function init() {
    // tenta no boot
    tryNow("boot");

    // tenta mais 2 vezes (caso DOM atrasou / iOS)
    setTimeout(() => tryNow("retry1"), 300);
    setTimeout(() => tryNow("retry2"), 900);

    // tenta quando você clica nas tabs (troca view)
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-view") === "admin") {
        setTimeout(() => tryNow("open-admin"), 120);
      }
    }, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
