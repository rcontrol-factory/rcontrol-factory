/* FILE: /app/js/core/factory_ai_controller.js
   RControl Factory — Factory AI Controller
   v1.0.0 CORE ORCHESTRATOR

   Responsável por:
   - orquestrar comportamento da Factory AI
   - integrar runtime, planner e bridge
   - escolher próximos passos da evolução da Factory
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_CONTROLLER) return;

  const VERSION = "1.0.0";

  const state = {
    version: VERSION,
    ready: false,
    busy: false,
    lastAction: "",
    lastPlanId: "",
    lastAnalysis: null
  };

  function log(msg, extra) {
    try {
      global.RCF_LOGGER?.push?.("INFO", "[FACTORY_AI_CONTROLLER] " + msg + " " + JSON.stringify(extra || {}));
    } catch (_) {}

    try {
      console.log("[FACTORY_AI_CONTROLLER]", msg, extra || "");
    } catch (_) {}
  }

  function getRuntime() {
    return global.RCF_FACTORY_AI_RUNTIME || null;
  }

  function getBridge() {
    return global.RCF_FACTORY_AI_BRIDGE || null;
  }

  function getPlanner() {
    return global.RCF_FACTORY_AI_PLANNER || null;
  }

  function getPatchSupervisor() {
    return global.RCF_PATCH_SUPERVISOR || null;
  }

  async function analyzeFactory() {

    const runtime = getRuntime();

    if (!runtime) {
      return { ok:false, msg:"Factory AI Runtime não encontrado" };
    }

    state.busy = true;

    const result = await runtime.ask({
      action:"analyze-architecture",
      prompt:"Analise a arquitetura atual da RControl Factory e sugira melhorias estruturais."
    });

    state.busy = false;

    if(result?.plan){
      state.lastPlanId = result.plan.id;
    }

    return result;
  }

  async function approveLastPlan(){

    const runtime = getRuntime();

    if(!runtime){
      return {ok:false,msg:"runtime ausente"};
    }

    return runtime.approvePlan();
  }

  async function validatePlan(){

    const supervisor = getPatchSupervisor();

    if(!supervisor){
      return {ok:false,msg:"patch supervisor ausente"};
    }

    return supervisor.validateApprovedPlan();
  }

  async function stagePlan(){

    const supervisor = getPatchSupervisor();

    if(!supervisor){
      return {ok:false,msg:"patch supervisor ausente"};
    }

    return supervisor.stageApprovedPlan();
  }

  async function applyPlan(){

    const supervisor = getPatchSupervisor();

    if(!supervisor){
      return {ok:false,msg:"patch supervisor ausente"};
    }

    return supervisor.applyApprovedPlan();
  }

  async function runEvolutionStep(){

    if(state.busy){
      return {ok:false,msg:"controller ocupado"};
    }

    log("executando evolução da Factory");

    const analysis = await analyzeFactory();

    if(!analysis.ok){
      return analysis;
    }

    return {
      ok:true,
      msg:"Análise concluída",
      planId: state.lastPlanId
    };
  }

  function status(){
    return {
      version:VERSION,
      ready:state.ready,
      busy:state.busy,
      lastPlanId:state.lastPlanId
    };
  }

  function init(){

    state.ready = true;

    log("Factory AI Controller iniciado");

    return status();
  }

  global.RCF_FACTORY_AI_CONTROLLER = {
    version:VERSION,
    init:init,
    status:status,
    analyzeFactory:analyzeFactory,
    approveLastPlan:approveLastPlan,
    validatePlan:validatePlan,
    stagePlan:stagePlan,
    applyPlan:applyPlan,
    runEvolutionStep:runEvolutionStep
  };

  try{ init(); }catch(_){}

})(window);
