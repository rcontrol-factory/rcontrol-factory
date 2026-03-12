/* FILE: /app/js/ui/ui_header.js
   RControl Factory — UI Header
   - Header central da Factory
   - Branding + status + ações
*/

(() => {

  "use strict";

  function qs(sel){
    try { return document.querySelector(sel); } catch { return null; }
  }

  const API = {

    mount(){

      const root = qs("#rcfHeader");
      if(!root) return false;

      if(root.getAttribute("data-rcf-header-mounted")==="1") return true;

      const cfg = window.RCF_UI_CONFIG;

      const title =
        cfg?.get?.("branding.title","RControl Factory")
        ?? "RControl Factory";

      const subtitle =
        cfg?.get?.("branding.subtitle","Factory System")
        ?? "Factory System";

      root.innerHTML = `

        <div class="rcfHeaderInner">

          <div class="rcfHeaderBrand">

            <div class="rcfHeaderLogo">
              <span class="rcfUiIcon rcfUiIcon--factory"></span>
            </div>

            <div class="rcfHeaderTitles">
              <div class="rcfHeaderTitle">${title}</div>
              <div class="rcfHeaderSubtitle">${subtitle}</div>
            </div>

          </div>

          <div class="rcfHeaderActions">

            <button class="btn small ghost"
              data-rcf-header-action="dashboard">
              Dashboard
            </button>

            <button class="btn small ghost"
              data-rcf-header-action="editor">
              Editor
            </button>

            <button class="btn small ghost"
              data-rcf-header-action="agent">
              Agent
            </button>

            <button class="btn small"
              data-rcf-header-action="admin">
              Factory
            </button>

          </div>

        </div>

      `;

      root.setAttribute("data-rcf-header-mounted","1");

      this.bindActions(root);

      return true;
    },

    bindActions(root){

      try{

        const buttons =
          Array.from(
            root.querySelectorAll("[data-rcf-header-action]")
          );

        buttons.forEach(btn => {

          if(btn.__rcf_bound__) return;
          btn.__rcf_bound__ = true;

          btn.addEventListener("click", () => {

            const act =
              btn.getAttribute("data-rcf-header-action");

            if(!act) return;

            try{
              window.RCF?.setView?.(act);
            }catch{}

          }, { passive:true });

        });

      }catch{}

    }

  };

  try{
    window.RCF_UI_HEADER = API;
  }catch{}

})();
