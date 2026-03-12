/* FILE: /app/js/ui/ui_nav.js
   RControl Factory — UI Navigation Module
   - Estrutura inicial
   - Navegação desacoplada do app.js
   - Sem lógica pesada ainda
*/

(() => {
  "use strict";

  const API = {

    __deps: null,

    init(deps){
      this.__deps = deps || this.__deps || {};
      return this;
    },

    get d(){
      return this.__deps || {};
    },

    /* =========================================
       NAV STATE
    ========================================= */

    currentView: null,

    /* =========================================
       SET ACTIVE VIEW
    ========================================= */

    setActive(viewName){

      const d = this.d;

      this.currentView = viewName;

      try{

        const buttons = d.$$ ? d.$$("[data-nav]") : [];

        buttons.forEach(btn=>{
          const v = btn.getAttribute("data-nav");

          if(v === viewName){
            btn.classList.add("active");
          }else{
            btn.classList.remove("active");
          }

        });

      }catch(e){}

    },

    /* =========================================
       GET CURRENT VIEW
    ========================================= */

    getCurrent(){

      return this.currentView;

    },

    /* =========================================
       RESET NAV
    ========================================= */

    reset(){

      this.currentView = null;

    }

  };

  try{
    window.RCF_UI_NAV = API;
  }catch(e){}

})();
