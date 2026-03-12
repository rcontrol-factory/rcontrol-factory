/* FILE: /app/js/ui/ui_projects.js
   RControl Factory — Projects Module
   Estrutura inicial da tela de projetos
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

    getProjects(){

      return [

        {
          name: "Painel Central",
          slug: "painel-central",
          description: "Sistema principal da Factory"
        },

        {
          name: "Chat IA",
          slug: "chat-ia",
          description: "Assistente e automação"
        },

        {
          name: "App Booking",
          slug: "app-booking",
          description: "Sistema de reservas"
        }

      ];

    },

    buildTabs(){

      return `
        <div class="rcfUiTabs">

          <button
            class="rcfUiTab active"
            data-tab="projects"
            type="button"
          >
            Projects
          </button>

          <button
            class="rcfUiTab"
            data-tab="code"
            type="button"
          >
            Código
          </button>

        </div>
      `;

    },

    buildProjectsList(){

      const d = this.d;
      const cards = window.RCF_UI_CARDS;
      const projects = this.getProjects();

      return projects.map(p => {

        if(cards && cards.buildListItem){

          return cards.buildListItem({

            title: p.name,
            description: p.description,
            icon: "◆"

          });

        }

        return `
          <div class="rcfUiListItem">

            <div class="rcfUiListItemIcon">◆</div>

            <div class="rcfUiListItemBody">

              <div class="rcfUiListItemTitle">
                ${d.escapeHtml ? d.escapeHtml(p.name) : p.name}
              </div>

              <div class="rcfUiListItemDesc">
                ${d.escapeHtml ? d.escapeHtml(p.description) : p.description}
              </div>

            </div>

            <div class="rcfUiListItemActions">
              <span class="rcfUiCardArrow">›</span>
            </div>

          </div>
        `;

      }).join("");

    },

    buildView(){

      return `
        <section class="rcfUiSection rcfUiProjectsSection">

          ${this.buildTabs()}

          <div
            class="rcfUiProjectsBody"
            data-projects-body
          >

            ${this.buildProjectsList()}

          </div>

        </section>
      `;

    },

    render(target){

      const d = this.d;

      try{

        const el = d.$ ? d.$(target) : null;

        if(!el) return false;

        el.innerHTML = this.buildView();

        return true;

      }catch(e){

        return false;

      }

    }

  };

  try{
    window.RCF_UI_PROJECTS = API;
  }catch(e){}

})();
