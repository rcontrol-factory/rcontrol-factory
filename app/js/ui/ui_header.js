/* FILE: /app/js/ui/ui_header.js
   RControl Factory — UI Header
   - Header central da Factory
   - Branding + status + ações
*/

(() => {

  "use strict";

  function qs(sel, root = document){
    try { return root.querySelector(sel); } catch { return null; }
  }

  function escapeHtml(v){
    return String(v ?? "").replace(/[&<>"]/g, ch => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;"
    }[ch] || ch));
  }

  function navTo(view){
    try{
      if(window.RCF && typeof window.RCF.setView === "function"){
        window.RCF.setView(view);
        return true;
      }
    }catch{}

    try{
      document.dispatchEvent(new CustomEvent("rcf:view", {
        detail: { view }
      }));
      return true;
    }catch{}

    return false;
  }

  const API = {

    mount(){

      const root = qs("#rcfHeader");
      if(!root) return false;

      const cfg = window.RCF_UI_CONFIG;

      const title =
        cfg?.get?.("branding.title","RControl Factory")
        ?? "RControl Factory";

      const subtitle =
        cfg?.get?.("branding.subtitle","Factory System")
        ?? "Factory System";

      const currentSig = JSON.stringify({
        title: String(title),
        subtitle: String(subtitle)
      });

      if(root.getAttribute("data-rcf-header-mounted")==="1"
        && root.getAttribute("data-rcf-header-sig") === currentSig){
        this.bindActions(root);
        return true;
      }

      root.innerHTML = `
        <div class="rcfHeaderInner">

          <div class="rcfHeaderBrand">

            <div class="rcfHeaderLogo" aria-hidden="true">
              <img
                src="./assets/icons/app/app-icon.png"
                alt=""
                class="rcfHeaderLogoImg"
              />
            </div>

            <div class="rcfHeaderTitles">
              <div class="rcfHeaderTitleWrap">
                <img
                  src="./assets/branding/header-logo.jpeg"
                  alt="Factory by RCONTROL"
                  class="rcfHeaderBrandArt"
                />
                <div class="rcfHeaderTitle rcf-visually-hidden">${escapeHtml(title)}</div>
              </div>
              <div class="rcfHeaderSubtitle">${escapeHtml(subtitle)}</div>
            </div>

          </div>

          <div class="rcfHeaderActions">

            <button class="btn small ghost"
              data-rcf-header-action="dashboard"
              type="button">
              Dashboard
            </button>

            <button class="btn small ghost"
              data-rcf-header-action="editor"
              type="button">
              Editor
            </button>

            <button class="btn small ghost"
              data-rcf-header-action="agent"
              type="button">
              Agent
            </button>

            <button class="btn small"
              data-rcf-header-action="admin"
              type="button">
              Factory
            </button>

          </div>

        </div>
      `;

      root.setAttribute("data-rcf-header-mounted","1");
      root.setAttribute("data-rcf-header-sig", currentSig);

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

            navTo(act);

          }, { passive:true });

        });

      }catch{}

    }

  };

  try{
    window.RCF_UI_HEADER = API;
  }catch{}

})();
