/* FILE: /app/js/admin.admin_ai.js
   RControl Factory — Admin AI Integration
   Fase IA-1
*/

(function(){

if(window.RCF_ADMIN_AI_INSTALLED){
  return;
}

window.RCF_ADMIN_AI_INSTALLED = true;

function log(msg){
  try{
    if(window.RCF_LOG){
      window.RCF_LOG("ADMIN_AI: " + msg);
    }else{
      console.log("ADMIN_AI:",msg);
    }
  }catch(e){}
}

function createUI(){

  const root = document.querySelector("#rcfAdminIntegrations") 
            || document.querySelector("#rcfAdminPanel") 
            || document.body;

  if(!root){
    log("root não encontrado");
    return;
  }

  if(document.querySelector("#rcfAdminAIBox")){
    return;
  }

  const box = document.createElement("div");
  box.id = "rcfAdminAIBox";

  box.style.marginTop = "20px";
  box.style.padding = "16px";
  box.style.border = "1px solid #333";
  box.style.borderRadius = "10px";
  box.style.background = "#111";

  box.innerHTML = `
    <h3 style="margin-top:0">Admin AI</h3>

    <div style="margin-bottom:10px">
      <button id="rcfAIAnalyzeFactory">Analisar Factory</button>
      <button id="rcfAIAnalyzeLogs">Analisar Logs</button>
      <button id="rcfAISuggest">Sugerir melhoria</button>
    </div>

    <div id="rcfAIStatus" style="margin-bottom:10px;color:#888">
      aguardando
    </div>

    <pre id="rcfAIResult" style="
      max-height:300px;
      overflow:auto;
      background:#000;
      padding:10px;
      border-radius:6px;
      font-size:12px;
      color:#0f0;
    "></pre>
  `;

  root.appendChild(box);

  bind();
}

function setStatus(txt){
  const el = document.querySelector("#rcfAIStatus");
  if(el) el.textContent = txt;
}

function setResult(txt){
  const el = document.querySelector("#rcfAIResult");
  if(el) el.textContent = txt;
}

async function callAI(action,payload){

  setStatus("carregando...");
  setResult("");

  try{

    const res = await fetch("/api/admin-ai",{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        action,
        payload
      })
    });

    const data = await res.json();

    if(!data.ok){
      setStatus("erro");
      setResult(JSON.stringify(data,null,2));
      return;
    }

    setStatus("concluído");
    setResult(data.analysis || JSON.stringify(data,null,2));

  }catch(err){

    setStatus("erro");
    setResult(String(err));

  }

}

function collectLogs(){

  try{

    if(window.RCF_LOG_BUFFER){
      return window.RCF_LOG_BUFFER.slice(-200);
    }

  }catch(e){}

  return "logs indisponíveis";
}

function collectFactoryInfo(){

  const info = {
    runtime: window.RCF_RUNTIME || "unknown",
    version: window.RCF_VERSION || "unknown",
    location: location.href,
    userAgent: navigator.userAgent
  };

  return info;
}

function bind(){

  const btnFactory = document.querySelector("#rcfAIAnalyzeFactory");
  const btnLogs = document.querySelector("#rcfAIAnalyzeLogs");
  const btnSuggest = document.querySelector("#rcfAISuggest");

  if(btnFactory){
    btnFactory.onclick = () => {
      callAI(
        "analyze-architecture",
        collectFactoryInfo()
      );
    };
  }

  if(btnLogs){
    btnLogs.onclick = () => {
      callAI(
        "analyze-logs",
        collectLogs()
      );
    };
  }

  if(btnSuggest){
    btnSuggest.onclick = () => {
      callAI(
        "suggest-improvement",
        collectFactoryInfo()
      );
    };
  }

}

function waitAdmin(){

  let tries = 0;

  const t = setInterval(()=>{

    tries++;

    const admin =
      document.querySelector("#rcfAdminPanel") ||
      document.querySelector("#rcfAdminIntegrations");

    if(admin){
      clearInterval(t);
      createUI();
      log("Admin AI UI instalada");
    }

    if(tries > 40){
      clearInterval(t);
      log("Admin AI timeout aguardando Admin");
    }

  },250);

}

document.addEventListener("DOMContentLoaded",waitAdmin);

})();
