/* FILE: /app/js/ui/ui_projects.js
   RControl Factory — Projects Module
   Estrutura inicial da tela de projetos
   - Agora com slot oficial para code panel
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
            icon: "◆",
            actionLabel: "Abrir"
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
              <button class="btn small ghost" type="button">Abrir</button>
            </div>

          </div>
        `;

      }).join("");

    },

    buildCodeSlot(){

      return `
        <div
          class="rcfUiProjectsCodeWrap"
          data-rcf-projects-code-wrap="1"
        >
          <div
            class="rcfUiProjectsCodeSlot"
            data-rcf-projects-code-slot
          ></div>
        </div>
      `;

    },

    buildProjectsSlot(){

      return `
        <div
          class="rcfUiProjectsBody"
          data-projects-body
        >
          ${this.buildProjectsList()}
        </div>
      `;

    },

    buildView(){

      return `
        <section class="rcfUiSection rcfUiProjectsSection">

          ${this.buildTabs()}

          ${this.buildCodeSlot()}

          ${this.buildProjectsSlot()}

        </section>
      `;

    },

    bindTabs(root){

      try{

        const tabs = Array.from(root.querySelectorAll("[data-tab]"));
        const codeWrap = root.querySelector("[data-rcf-projects-code-wrap='1']");
        const projectsBody = root.querySelector("[data-projects-body]");

        if(!tabs.length || !codeWrap || !projectsBody) return false;

        tabs.forEach(btn => {

          if(btn.__rcf_tab_bound__) return;
          btn.__rcf_tab_bound__ = true;

          btn.addEventListener("click", () => {

            const tab = btn.getAttribute("data-tab");

            tabs.forEach(x => x.classList.remove("active"));
            btn.classList.add("active");

            if(tab === "code"){
              codeWrap.style.display = "";
              projectsBody.style.display = "none";
            }else{
              codeWrap.style.display = "";
              projectsBody.style.display = "";
            }

          }, { passive: true });

        });

        return true;

      }catch(e){

        return false;

      }

    },

    render(target){

      const d = this.d;

      try{

        const el = d.$ ? d.$(target) : null;

        if(!el) return false;

        el.innerHTML = this.buildView();

        this.bindTabs(el);

        try{
          if(window.RCF_UI_CODE_PANEL?.render){
            window.RCF_UI_CODE_PANEL.render("[data-rcf-projects-code-slot]");
          }
        }catch(e){}

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
