// /app/js/ui.gear.js
(() => {
  "use strict";

  const $ = (s, r=document) => r.querySelector(s);

  function openGear() {
    // remove se já existir
    closeGear();

    const backdrop = document.createElement("div");
    backdrop.className = "rcf-gear-backdrop";
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeGear();
    });

    const sheet = document.createElement("div");
    sheet.className = "rcf-gear-sheet";

    sheet.innerHTML = `
      <h3>⚙️ Menu</h3>
      <div class="rcf-gear-grid">
        <button class="btn" id="gearGoSettings" type="button">Settings</button>
        <button class="btn" id="gearGoAdmin" type="button">Admin</button>
        <button class="btn" id="gearGoDiag" type="button">Diag</button>
        <button class="btn" id="gearGoLogs" type="button">Logs</button>
        <button class="btn danger" id="gearClose" type="button">Fechar</button>
      </div>
      <p class="hint" style="margin:10px 0 0 0; opacity:.8;">
        (Se algum botão não existir no seu build, ele só não faz nada.)
      </p>
    `;

    backdrop.appendChild(sheet);
    document.body.appendChild(backdrop);

    $("#gearClose", sheet)?.addEventListener("click", closeGear);

    // Navegação: tenta usar router existente, senão clica na tab
    function go(view){
      closeGear();
      if (window.RCF_ROUTER?.go) return window.RCF_ROUTER.go(view);
      const tab = document.querySelector(`.tab[data-view="${view}"]`);
      tab?.click();
    }

    $("#gearGoSettings", sheet)?.addEventListener("click", () => go("settings"));
    $("#gearGoAdmin", sheet)?.addEventListener("click", () => go("admin"));
    $("#gearGoDiag", sheet)?.addEventListener("click", () => go("diag"));
    $("#gearGoLogs", sheet)?.addEventListener("click", () => go("logs"));
  }

  function closeGear(){
    document.querySelectorAll(".rcf-gear-backdrop").forEach(el => el.remove());
  }

  function bindGear(){
    const btn = $("#btnGear");
    if (!btn) return;

    // iOS fallback: captura no topo (se overlay travar)
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openGear();
    }, { passive:false });

    // fallback extra: se por algum motivo click não vier, pega pointerup
    btn.addEventListener("pointerup", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openGear();
    }, { passive:false });
  }

  window.addEventListener("load", () => setTimeout(bindGear, 200));
})();
