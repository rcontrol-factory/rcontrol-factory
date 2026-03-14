/* FILE: /app/js/ui/ui_projects.js
   RControl Factory — Projects Module
   PATCH MÍNIMO:
   - remove Factory AI de Projects
   - remove Admin de Projects
   - mantém tabs Projects/Código
   - mantém ações "Abrir" via data-view
   - preserva estrutura estável
*/

(() => {

  "use strict";

  function qs(sel, root = document){
    try { return root.querySelector(sel); } catch { return null; }
  }

  const API = {

    __deps: null,

    init(deps){
      this.__deps = deps || this.__deps || {};
      return this;
    },

    get d(){
      return this.__deps || {};
    },

    escHtml(v){
      try{
        if(this.d.escapeHtml) return this.d.escapeHtml(v);
      }catch{}
      return String(v ?? "");
    },

    escAttr(v){
      try{
        if(this.d.escapeAttr) return this.d.escapeAttr(v);
      }catch{}
      return String(v ?? "");
    },

    getProjects(){

      return [

        {
          name: "Painel Central",
          slug: "painel-central",
          description: "Sistema principal da Factory",
          view: "dashboard"
        },

        {
          name: "App Booking",
          slug: "app-booking",
          description: "Sistema de reservas",
          view: "editor"
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

      const cards = window.RCF_UI_CARDS;
      const projects = this.getProjects();

      return projects.map(p => {

        if(cards && typeof cards.buildListItem === "function"){

          return cards.buildListItem({
            title: p.name,
            description: p.description,
            icon: "◆",
            actionLabel: "Abrir",
            actionAttr: p.view ? `data-view="${this.escAttr(p.view)}"` : "",
            className: p.slug ? `rcfProject-${p.slug}` : ""
          });

        }

        return `
          <div class="rcfUiListItem ${p.slug ? this.escAttr(`rcfProject-${p.slug}`) : ""}">

            <div class="rcfUiListItemIcon">◆</div>

            <div class="rcfUiListItemBody">

              <div class="rcfUiListItemTitle">
                ${this.escHtml(p.name)}
              </div>

              <div class="rcfUiListItemDesc">
                ${this.escHtml(p.description)}
              </div>

            </div>

            <div class="rcfUiListItemActions">
              ${
                p.view
                  ? `<button class="btn small ghost" type="button" data-view="${this.escAttr(p.view)}">Abrir</button>`
                  : `<button class="btn small ghost" type="button">Abrir</button>`
              }
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
          style="display:none"
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
          style="display:block"
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

    bindNav(root){

      try{
        const cards = window.RCF_UI_CARDS;

        if(cards && typeof cards.bindNav === "function"){
          cards.bindNav(root);
          return true;
        }
      }catch{}

      try{
        const nodes = Array.from(root.querySelectorAll("[data-view]"));

        nodes.forEach(node => {

          if(node.__rcf_nav_bound__) return;
          node.__rcf_nav_bound__ = true;

          node.addEventListener("click", () => {

            const view = node.getAttribute("data-view");
            if(!view) return;

            try{
              window.RCF?.setView?.(view);
            }catch{}

          }, { passive:true });

        });

        return true;
      }catch{
        return false;
      }

    },

    bindTabs(root){

      try{

        const tabs = Array.from(root.querySelectorAll("[data-tab]"));
        const codeWrap = root.querySelector("[data-rcf-projects-code-wrap='1']");
        const projectsBody = root.querySelector("[data-projects-body]");

        if(!tabs.length || !codeWrap || !projectsBody) return false;

        const applyTab = (tab) => {
          tabs.forEach(x => x.classList.toggle("active", x.getAttribute("data-tab") === tab));

          if(tab === "code"){
            codeWrap.style.display = "";
            projectsBody.style.display = "none";
          }else{
            codeWrap.style.display = "none";
            projectsBody.style.display = "";
          }
        };

        tabs.forEach(btn => {

          if(btn.__rcf_tab_bound__) return;
          btn.__rcf_tab_bound__ = true;

          btn.addEventListener("click", () => {
            const tab = btn.getAttribute("data-tab") || "projects";
            applyTab(tab);
          }, { passive: true });

        });

        applyTab("projects");

        return true;

      }catch(e){

        return false;

      }

    },

    render(target){

      try{

        const el = this.d.$ ? this.d.$(target) : qs(target);

        if(!el) return false;

        el.innerHTML = this.buildView();

        this.bindTabs(el);
        this.bindNav(el);

        try{
          if(window.RCF_UI_CODE_PANEL?.render){
            window.RCF_UI_CODE_PANEL.render("[data-rcf-projects-code-slot]");
          }
        }catch(e){}

        return true;

      }catch(e){

        return false;

      }

    },

    refresh(){

      try{
        const root = document.querySelector(".rcfUiProjectsSection");
        if(!root) return false;

        this.bindTabs(root);
        this.bindNav(root);

        return true;
      }catch{
        return false;
      }

    }

  };

  try{
    window.RCF_UI_PROJECTS = API;
  }catch(e){}

})();
