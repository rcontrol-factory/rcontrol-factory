/* FILE: /app/js/ui/ui_code_panel.js
   RControl Factory — Code Panel Module
   Estrutura inicial do painel de código/deploy
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

    getExampleCode(){

      return `
var AUTO_TRIGGER = true;
var WAIT_TIME = "1h";

function startFactoryDeploy(){

  console.log("Starting Factory Deploy...");

  if(AUTO_TRIGGER){
    console.log("Auto trigger enabled");
  }

  console.log("Waiting:", WAIT_TIME);

}

startFactoryDeploy();
      `.trim();

    },

    buildPanel(){

      const d = this.d;
      const code = this.getExampleCode();

      return `
        <div class="rcfUiCodePanel">

          <div class="rcfUiCodeHeader">
            <span class="rcfUiCodeTitle">Factory Deploy Script</span>
          </div>

          <pre class="rcfUiCodeBlock">
${d.escapeHtml ? d.escapeHtml(code) : code}
          </pre>

        </div>
      `;

    },

    render(target){

      const d = this.d;

      try{

        const el = d.$ ? d.$(target) : null;

        if(!el) return false;

        el.innerHTML = this.buildPanel();

        return true;

      }catch(e){

        return false;

      }

    }

  };

  try{
    window.RCF_UI_CODE_PANEL = API;
  }catch(e){}

})();
