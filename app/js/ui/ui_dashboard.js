/* FILE: /app/js/ui/ui_dashboard.js
   RControl Factory — Dashboard Module
   Estrutura inicial do dashboard UI
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

    /* ===============================
       REFRESH DASHBOARD
    =============================== */

    refresh(){

      const d = this.d;

      try{

        const State = d.State;
        const Logger = d.Logger;

        const appsCount = Array.isArray(State?.apps)
          ? State.apps.length
          : 0;

        const elApps = d.$("#dashAppsCount");
        if(elApps) elApps.textContent = String(appsCount).padStart(2,"0");

        const elProjects = d.$("#dashProjectsCount");
        if(elProjects) elProjects.textContent = String(appsCount).padStart(2,"0");

        const elBuilds = d.$("#dashBuildsCount");
        if(elBuilds) elBuilds.textContent = String(appsCount).padStart(2,"0");

        const box = d.$("#dashActivityList");

        if(box){

          const logs = Logger?.getAll
            ? Logger.getAll()
            : [];

          const recent = logs.slice(-4).reverse();

          if(!recent.length){

            box.innerHTML = `<div class="hint">Aguardando atividade...</div>`;

          }else{

            box.innerHTML = recent
              .map(line => `<div class="rcfActivityItem">${d.escapeHtml(String(line))}</div>`)
              .join("");

          }

        }

      }catch(e){}

    }

  };

  try{
    window.RCF_UI_DASHBOARD = API;
  }catch(e){}

})();
