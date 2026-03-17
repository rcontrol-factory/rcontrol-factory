/* FILE: /app/js/core/factory_ai_supervisor.js
   RControl Factory — Factory AI Supervisor
   v1.0.0 SUPERVISED EXECUTION CONTROLLER

   Objetivo:
   - coordenar execução dos módulos da Factory AI
   - evitar conflito entre diagnostics / autoheal / planner / autoloop
   - respeitar modo operacional da Factory AI
   - garantir fluxo supervisionado
   - impedir execução desnecessária repetitiva
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_SUPERVISOR && global.RCF_FACTORY_AI_SUPERVISOR.__v100) return;

  var VERSION = "1.0.0";
  var STORAGE_KEY = "rcf:factory_ai_supervisor";

  var state = {
    version: VERSION,
    ready: false,
    busy: false,
    lastRun: null,
    lastAction: "",
    history: []
  };

  function nowISO(){
    try{ return new Date().toISOString(); }
    catch(_){ return ""; }
  }

  function clone(v){
    try{ return JSON.parse(JSON.stringify(v)); }
    catch(_){ return v || {}; }
  }

  function persist(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }catch(_){}
  }

  function load(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return;

      var parsed = JSON.parse(raw);
      if(!parsed) return;

      state.lastRun = parsed.lastRun || null;
      state.lastAction = parsed.lastAction || "";
      state.history = parsed.history || [];

    }catch(_){}
  }

  function log(msg, extra){
    try{
      global.RCF_LOGGER?.push?.("INFO","[FACTORY_AI_SUPERVISOR] "+msg+" "+JSON.stringify(extra||{}));
    }catch(_){}

    try{
      console.log("[FACTORY_AI_SUPERVISOR]",msg,extra||"");
    }catch(_){}
  }

  function emit(name,detail){
    try{
      global.dispatchEvent(new CustomEvent(name,{detail:detail||{}}));
    }catch(_){}
  }

  function getMode(){

    try{
      return global.RCF_FACTORY_AI_EVOLUTION_MODE?.getMode?.();
    }catch(_){}

    return "diagnostic";
  }

  function getDiagnostics(){
    return global.RCF_FACTORY_AI_DIAGNOSTICS || null;
  }

  function getAutoheal(){
    return global.RCF_FACTORY_AI_AUTOHEAL || null;
  }

  function getRuntime(){
    return global.RCF_FACTORY_AI_RUNTIME || null;
  }

  function getPatchSupervisor(){
    return global.RCF_PATCH_SUPERVISOR || null;
  }

  function hasPendingPatch(){

    try{

      var sup = getPatchSupervisor();

      if(!sup) return false;

      var st = sup.status?.();

      if(st?.hasStagedPatch) return true;

    }catch(_){}

    return false;
  }

  function pushHistory(entry){

    state.history.push(clone(entry||{}));

    if(state.history.length > 60){
      state.history = state.history.slice(-60);
    }

    persist();
  }

  function runDiagnostics(){

    var diag = getDiagnostics();

    if(!diag || typeof diag.scan !== "function") return false;

    log("running diagnostics");

    diag.scan();

    state.lastAction = "diagnostics";

    return true;
  }

  function runAutoheal(){

    var autoheal = getAutoheal();

    if(!autoheal || typeof autoheal.scan !== "function") return false;

    log("running autoheal");

    autoheal.scan();

    state.lastAction = "autoheal";

    return true;
  }

  function runSupervisorCycle(){

    if(state.busy){
      return {
        ok:false,
        msg:"supervisor busy"
      };
    }

    state.busy = true;

    try{

      var mode = getMode();

      log("cycle start",{mode:mode});

      if(hasPendingPatch()){

        log("patch pending — supervisor paused");

        return {
          ok:true,
          msg:"patch pending"
        };
      }

      if(mode === "diagnostic"){

        runDiagnostics();

      }

      if(mode === "autoheal"){

        runAutoheal();

      }

      if(mode === "proposal"){

        log("proposal mode active");

      }

      if(mode === "supervised_loop"){

        runDiagnostics();
        runAutoheal();

      }

      state.lastRun = nowISO();

      pushHistory({
        ts:state.lastRun,
        mode:mode,
        action:state.lastAction
      });

      emit("RCF:FACTORY_AI_SUPERVISOR_CYCLE",{
        mode:mode,
        action:state.lastAction
      });

      return {
        ok:true,
        mode:mode,
        action:state.lastAction
      };

    }catch(e){

      return {
        ok:false,
        msg:String(e?.message||e)
      };

    }finally{

      state.busy = false;

      persist();
    }
  }

  function status(){

    return {
      version:VERSION,
      ready:state.ready,
      busy:state.busy,
      lastRun:state.lastRun,
      lastAction:state.lastAction,
      historyCount:state.history.length
    };
  }

  function bindEvents(){

    try{

      global.addEventListener("RCF:UI_READY",function(){

        setTimeout(function(){

          runSupervisorCycle();

        },500);

      },{passive:true});

    }catch(_){}

    try{

      global.addEventListener("RCF:FACTORY_AI_MODE_CHANGED",function(){

        setTimeout(function(){

          runSupervisorCycle();

        },200);

      },{passive:true});

    }catch(_){}
  }

  function init(){

    load();

    state.ready = true;

    persist();

    bindEvents();

    log("factory_ai_supervisor ready");

    return status();
  }

  global.RCF_FACTORY_AI_SUPERVISOR = {
    __v100:true,
    version:VERSION,
    init:init,
    status:status,
    runCycle:runSupervisorCycle
  };

  try{ init(); }catch(_){}

})(window);
