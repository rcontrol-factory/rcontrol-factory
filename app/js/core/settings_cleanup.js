/* core/settings_cleanup.js
   - Remove o card "Logs" dentro do Settings (porque já existe aba Logs)
   - NÃO mexe na aba Logs, só limpa no Settings pra liberar espaço no iPhone
*/
(() => {
  "use strict";

  function findSettingsRoot() {
    return document.getElementById("view-settings") || document.querySelector("[data-view='settings']") || null;
  }

  function isLogsCard(card) {
    if (!card) return false;
    const txt = (card.textContent || "").toLowerCase();

    // heurística segura: título Logs + botões comuns
    const hasTitle = txt.includes("logs");
    const hasButtons =
      txt.includes("exportar") ||
      txt.includes("limpar logs") ||
      txt.includes("atualizar");

    return hasTitle && hasButtons;
  }

  function removeLogsFromSettings() {
    const root = findSettingsRoot();
    if (!root) return false;

    const cards = Array.from(root.querySelectorAll(".card"));
    let removed = 0;

    for (const c of cards) {
      if (isLogsCard(c)) {
        c.remove();
        removed++;
      }
    }

    return removed > 0;
  }

  function installObserver() {
    // roda uma vez já
    removeLogsFromSettings();

    const obs = new MutationObserver(() => {
      removeLogsFromSettings();
    });

    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installObserver);
  } else {
    installObserver();
  }
})();
