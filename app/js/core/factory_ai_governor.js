/* FILE: /app/js/core/factory_ai_governor.js
   RControl Factory — Factory AI Governor
   v1.0.0 SUPERVISION ENGINE

   Objetivo:
   - coordenar fluxo global da Factory AI
   - evitar conflitos entre módulos
   - decidir quando rodar architect / planner / runtime
   - impedir apply automático
*/

(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_GOVERNOR && global.RCF_FACTORY_AI_GOVERNOR.__v100) return;

  var VERSION = "1.0.0";

  var state = {
    status: "idle",
    lastDecision: "",
    lastProposalId: "",
    lastUpdate: null
  };

  function nowISO(){
    try { return new Date().toISOString(); }
    catch (_) { return ""; }
  }

  function clone(obj){
    try { return JSON.parse(JSON.stringify(obj)); }
    catch(_) { return obj || {}; }
  }

  function safe(fn,fallback){
    try{
      var v = fn();
      return v===undefined ? fallback : v;
    }catch(_){
      return fallback;
    }
  }

  function log(msg,extra){
    try{
      global.RCF_LOGGER?.push?.(
        "INFO",
        "[FACTORY_AI_GOVERNOR] "+msg+" "+JSON.stringify(extra||{})
      );
    }catch(_){}

    try{ console.log("[FACTORY_AI_GOVERNOR]",msg,extra||""); }catch(_){}
  }

  function getPhase(){
    return safe(function(){
      return global.RCF_FACTORY_PHASE_ENGINE.buildPhaseContext();
    },{});
  }

  function getArchitect(){
    return global.RCF_FACTORY_AI_ARCHITECT || null;
  }

  function getRuntime(){
    return global.RCF_FACTORY_AI_RUNTIME || null;
  }

  function getSupervisor(){
    return global.RCF_PATCH_SUPERVISOR || null;
  }

  function hasPendingProposal(){
    var architect = getArchitect();

    if(!architect) return false;

    var proposal = safe(function(){
      return architect.getLastProposal();
    },null);

    if(!proposal) return false;

    return proposal.approvalStatus === "pending";
  }

  function decide(){

    var phase = getPhase();

    var phaseId = safe(function(){
      return phase.activePhase.id;
    },"");

    if(hasPendingProposal()){
      state.status = "waiting-approval";
      state.lastDecision = "aguardando aprovação de proposta";
      return state.status;
    }

    if(
      phaseId==="factory-ai-supervised" ||
      phaseId==="factory-ai-autoloop-supervised"
    ){
      state.status="analyze";
      state.lastDecision="rodar architect";
      return state.status;
    }

    state.status="idle";
    state.lastDecision="nenhuma ação necessária";
    return state.status;
  }

  async function tick(){

    var decision = decide();

    if(decision==="analyze"){

      var architect = getArchitect();

      if(!architect){
        return {ok:false,msg:"architect ausente"};
      }

      var result = architect.analyze();

      state.lastProposalId = safe(function(){
        return result.proposal.id;
      },"");

      state.status="proposal-ready";
      state.lastUpdate=nowISO();

      return {
        ok:true,
        status:state.status,
        proposal:clone(result.proposal||{})
      };
    }

    return {
      ok:true,
      status:state.status,
      decision:state.lastDecision
    };
  }

  function approve(){

    var runtime = getRuntime();

    if(!runtime){
      return {ok:false,msg:"runtime ausente"};
    }

    state.status="validated";

    return runtime.approvePlan();
  }

  function validate(){

    var sup = getSupervisor();

    if(!sup){
      return {ok:false,msg:"patch supervisor ausente"};
    }

    state.status="validated";

    return sup.validateApprovedPlan();
  }

  function stage(){

    var sup = getSupervisor();

    if(!sup){
      return {ok:false,msg:"patch supervisor ausente"};
    }

    state.status="staged";

    return sup.stageApprovedPlan();
  }

  function apply(){

    var sup = getSupervisor();

    if(!sup){
      return {ok:false,msg:"patch supervisor ausente"};
    }

    state.status="applied";

    return sup.applyApprovedPlan();
  }

  function status(){
    return clone({
      version:VERSION,
      status:state.status,
      lastDecision:state.lastDecision,
      lastProposalId:state.lastProposalId,
      lastUpdate:state.lastUpdate
    });
  }

  function init(){

    state.lastUpdate=nowISO();

    log("Factory AI Governor iniciado");

    return status();
  }

  global.RCF_FACTORY_AI_GOVERNOR = {
    __v100:true,
    version:VERSION,
    init:init,
    tick:tick,
    status:status,
    approve:approve,
    validate:validate,
    stage:stage,
    apply:apply
  };

  try{ init(); }catch(_){}

})(window);
