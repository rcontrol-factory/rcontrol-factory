/* FILE: /app/js/core/factory_ai_orchestrator.js
   RControl Factory — Factory AI Orchestrator
   v1.0.0

   Camada central cognitiva da Factory AI
*/

(function(){

if (globalThis.RCF_FACTORY_AI_ORCHESTRATOR) return;

const VERSION = "1.0.0";

function safe(fn, fallback=null){
  try{ return fn(); }catch{ return fallback; }
}

function getContext(){
  return safe(()=>{
    if(globalThis.RCF_CONTEXT?.getSnapshot){
      return globalThis.RCF_CONTEXT.getSnapshot();
    }
    if(globalThis.RCF_CONTEXT?.getContext){
      return globalThis.RCF_CONTEXT.getContext();
    }
    return {};
  },{});
}

function getFactoryState(){
  return safe(()=>{
    return globalThis.RCF_FACTORY_STATE?.getState?.() || {};
  },{});
}

function getModuleSummary(){
  return safe(()=>{
    return globalThis.RCF_MODULE_REGISTRY?.summary?.() || {};
  },{});
}

function getTreeSummary(){
  return safe(()=>{
    return globalThis.RCF_FACTORY_TREE?.summary?.() || {};
  },{});
}

function inferIntent(prompt){

  const p = String(prompt||"").toLowerCase();

  if(p.includes("plano") || p.includes("planejar")) return "plan";

  if(p.includes("patch")) return "patch";

  if(p.includes("doctor") || p.includes("diagnóstico")) return "doctor";

  if(p.includes("snapshot") || p.includes("estado")) return "snapshot";

  if(p.includes("próximo arquivo") || p.includes("proximo arquivo")) return "next_file";

  if(p.includes("logs")) return "logs";

  if(p.includes("código") || p.includes("codigo") || p.includes("arquivo completo")) return "generate_code";

  return "chat";
}

async function runPlanner(prompt){

  const planner = globalThis.RCF_FACTORY_AI_PLANNER;

  if(!planner?.plan){
    return { ok:false, msg:"planner indisponível" };
  }

  return await planner.plan({
    goal: prompt
  });
}

async function runActions(action,prompt){

  const actions = globalThis.RCF_FACTORY_AI_ACTIONS;

  if(!actions?.dispatch){
    return { ok:false, msg:"actions indisponível" };
  }

  return await actions.dispatch({
    action,
    prompt
  });
}

async function callBackend(prompt,snapshot){

  try{

    const res = await fetch("/api/admin-ai",{
      method:"POST",
      headers:{ "Content-Type":"application/json"},
      body:JSON.stringify({
        prompt,
        snapshot
      })
    });

    return await res.json();

  }catch(e){

    return {
      ok:false,
      msg:String(e)
    };

  }
}

async function orchestrate(input){

  const prompt = input?.prompt || "";

  const intent = inferIntent(prompt);

  const context = getContext();
  const factoryState = getFactoryState();
  const modules = getModuleSummary();
  const tree = getTreeSummary();

  const snapshot = {
    context,
    factoryState,
    modules,
    tree
  };

  if(intent === "plan"){
    return await runPlanner(prompt);
  }

  if(intent === "patch"){
    return await runActions("propose_patch",prompt);
  }

  if(intent === "doctor"){
    return await runActions("run_doctor",prompt);
  }

  if(intent === "next_file"){
    return await runActions("next_file",prompt);
  }

  if(intent === "logs"){
    return await runActions("collect_logs",prompt);
  }

  return await callBackend(prompt,snapshot);
}

function status(){

  return {
    version: VERSION,
    contextReady: !!globalThis.RCF_CONTEXT,
    plannerReady: !!globalThis.RCF_FACTORY_AI_PLANNER,
    actionsReady: !!globalThis.RCF_FACTORY_AI_ACTIONS,
    bridgeReady: !!globalThis.RCF_FACTORY_AI_BRIDGE,
    patchSupervisorReady: !!globalThis.RCF_PATCH_SUPERVISOR
  };
}

globalThis.RCF_FACTORY_AI_ORCHESTRATOR = {
  version: VERSION,
  orchestrate,
  status
};

console.log("[FACTORY_AI_ORCHESTRATOR] loaded",VERSION);

})();
