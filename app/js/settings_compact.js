/* app/js/settings_compact.js
   - Remove o card "Logs" de dentro da aba Settings (porque já existe aba Logs)
   - Adiciona botão "Abrir Logs" dentro do Settings
   - SAFE: não mexe no core, só DOM
*/
(() => {
  "use strict";

  const TAG = "[SETTINGS-COMPACT]";

  const log = (...a) => { try { console.log(TAG, ...a); } catch {} };

  function textNorm(s) {
    return String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function findLogsTabButton() {
    // tenta achar o botão/aba "Logs" no topo
    const btns = Array.from(document.querySelectorAll("button, a, [role='tab']"));
    for (const b of btns) {
      const t = textNorm(b.textContent);
      if (t === "logs") return b;
    }
    return null;
  }

  function gotoLogs() {
    const b = findLogsTabButton();
    if (b && typeof b.click === "function") b.click();
  }

  function ensureGoLogsButton(settingsView) {
    if (!settingsView) return;
    if (document.getElementById("btnGoLogsFromSettings")) return;

    // tenta colocar perto do topo do Settings
    const btn = document.createElement("button");
    btn.id = "btnGoLogsFromSettings";
    btn.className = "btn";
    btn.type = "button";
    btn.textContent = "Abrir Logs";
    btn.style.marginTop = "10px";

    btn.addEventListener("click", (e) => {
      try { e.preventDefault(); } catch {}
      gotoLogs();
    });

    // tenta inserir antes do primeiro card
    const firstCard = settingsView.querySelector(".card");
    if (firstCard && firstCard.parentNode) {
      firstCard.parentNode.insertBefore(btn, firstCard);
    } else {
      settingsView.appendChild(btn);
    }
  }

  function removeLogsCardFromSettings() {
    const settingsView =
      document.getElementById("view-settings") ||
      document.querySelector("[data-view='settings']") ||
      document.querySelector("#settingsView") ||
      null;

    if (!settingsView) return false;

    // cria botão pra abrir Logs
    ensureGoLogsButton(settingsView);

    // encontrar cards dentro do settings
    const cards = Array.from(settingsView.querySelectorAll(".card"));
    let removed = 0;

    for (const c of cards) {
      const h = c.querySelector("h1,h2,h3,h4");
      const title = textNorm(h ? h.textContent : "");

      // Heurística: se o título for "Logs" OU tiver botões típicos de logs
      const hasLogsButtons =
        !!c.querySelector("button") &&
        Array.from(c.querySelectorAll("button")).some(b => {
          const t = textNorm(b.textContent);
          return t.includes("exportar") || t.includes("limpar logs") || t.includes("atualizar");
        });

      if (title === "logs" || hasLogsButtons) {
        // remove só do SETTINGS
        try {
          c.remove();
          removed++;
        } catch {
          try { c.style.display = "none"; removed++; } catch {}
        }
      }
    }

    if (removed) log("Removed Logs card(s) from Settings:", removed);
    return removed > 0;
  }

  function run() {
    try { removeLogsCardFromSettings(); } catch (e) { log("err", e?.message || e); }
  }

  // roda agora + quando mudar de aba (sem depender do router interno)
  let lastKey = "";
  function tick() {
    try {
      const key = (location.pathname || "") + "|" + (location.hash || "") + "|" + (document.body?.innerText?.length || 0);
      if (key !== lastKey) {
        lastKey = key;
        run();
      }
    } catch {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { run(); setInterval(tick, 600); });
  } else {
    run();
    setInterval(tick, 600);
  }

  log("loaded");
})();
