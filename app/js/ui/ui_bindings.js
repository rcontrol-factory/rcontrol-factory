/* FILE: /app/js/ui/ui_bindings.js
   Centralized event bindings for UI
*/
(() => {
"use strict";

function bindClicks(){
  try{
    document.addEventListener("click",(e)=>{
      const btn = e.target.closest("[data-view]");
      if(!btn) return;
      const view = btn.getAttribute("data-view");
      if(window.RCF && typeof window.RCF.setView==="function"){
        window.RCF.setView(view);
      }
    });
  }catch{}
}

window.RCF_UI_BINDINGS = {
  init(){
    bindClicks();
  }
};

})();
