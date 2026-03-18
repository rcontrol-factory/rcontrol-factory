/* FILE: /app/js/core/factory_ai_supervisor.js
   RControl Factory — Factory AI Supervisor
   v1.0.1 SUPERVISED EXECUTION CONTROLLER + HUMAN STEP GUARD

   Objetivo:
   - coordenar execução dos módulos da Factory AI
   - evitar conflito entre diagnostics / autoheal / planner / autoloop
   - respeitar modo operacional da Factory AI
   - garantir fluxo supervisionado
   - impedir execução desnecessária repetitiva

   PATCH v1.0.1:
   - FIX: pausa também quando houver plano pendente no bridge
   - FIX: suporta scan síncrono/assíncrono em diagnostics e autoheal
   - FIX: adiciona cooldown curto para evitar ciclo duplicado em cascata
   - ADD: syncPresence com factory_state / module_registry
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_SUPERVISOR && global.RCF_FACTORY_AI_SUPERVISOR.__v101) return;

  var VERSION = "1.0.1";
  var STORAGE_KEY = "rcf:factory_ai_supervisor";
  var MAX_HISTORY = 60;
  var MIN_CYCLE_GAP_MS = 1200;

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

  function nowMS(){
    try{ return Date.now(); }
    catch(_){ return 0; }
  }

  function clone(v){
    try{ return JSON.parse(JSON.stringify(v)); }
    catch(_){ return v || {}; }
  }

  function trimText(v){
    return String(v == null ? "" : v).trim();
  }

  function safe(fn,fallback){
    try{
      var v = fn();
      return v === undefined ? fallback : v;
    }catch(_){
      return fallback;
    }
  }

  function persist(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: VERSION,
        ready: !!state.ready,
        busy: false,
        lastRun: state.lastRun || null,
        lastAction: state.lastAction || "",
        history: Array.isArray(state.history) ? state.history.slice(-MAX_HISTORY) : []
      }));
    }catch(_){}
  }

  function load(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return;

      var parsed = JSON.parse(raw);
      if(!parsed || typeof parsed !== "object") return;

      state.version = VERSION;
      state.ready = !!parsed.ready;
      state.busy = false;
      state.lastRun = parsed.lastRun || null;
      state.lastAction = trimText(parsed.lastAction || "");
      state.history = Array.isArray(parsed.history) ? parsed.history.slice(-MAX_HISTORY) : [];

    }catch(_){}
  }

  function log(msg, extra){
    try{
      global.RCF_LOGGER?.push?.("INFO","[FACTORY_AI_SUPERVISOR] " + msg + " " + JSON.stringify(extra || {}));
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
      return trimText(global.RCF_FACTORY_AI_EVOLUTION_MODE?.getMode?.() || "");
    }catch(_){}
    return "diagnostic";
  }

  function getDiagnostics(){
    return global.RCF_FACTORY_AI_DIAGNOSTICS || null;
  }

  function getAutoheal(){
    return global.RCF_FACTORY_AI_AUTOHEAL || null;
  }

  function getBridge(){
    return global.RCF_FACTORY_AI_BRIDGE || null;
  }

  function getPatchSupervisor(){
    return global.RCF_PATCH_SUPERVISOR || null;
  }

  function hasPendingHumanStep(){
    try{
      var bridge = getBridge();

      if (bridge && typeof bridge.getPendingPlan === "function") {
        var pending = bridge.getPendingPlan();
        if (pending && typeof pending === "object" && pending.id) {
          return {
            blocked: true,
            reason: "pending plan",
            planId: trimText(pending.id || ""),
            targetFile: trimText(pending.targetFile || pending.nextFile || "")
          };
        }
      }
    }catch(_){}

    try{
      var sup = getPatchSupervisor();

      if(!sup) return { blocked:false, reason:"" };

      var st = sup.status?.() || {};

      if(st?.hasStagedPatch) {
        return {
          blocked: true,
          reason: "staged patch",
          planId: trimText(st.stagedPlanId || ""),
          targetFile: trimText(st.stagedTargetFile || "")
        };
      }

    }catch(_){}

    return {
      blocked:false,
      reason:""
    };
  }

  function pushHistory(entry){
    state.history.push(clone(entry||{}));

    if(state.history.length > MAX_HISTORY){
      state.history = state.history.slice(-MAX_HISTORY);
    }

    persist();
  }

  async function runDiagnostics(){
    var diag = getDiagnostics();

    if(!diag || typeof diag.scan !== "function") return false;

    log("running diagnostics");

    try{
      var out = diag.scan();
      if (out && typeof out.then === "function") {
        await out;
      }
    }catch(_){}

    state.lastAction = "diagnostics";
    return true;
  }

  async function runAutoheal(){
    var autoheal = getAutoheal();

    if(!autoheal || typeof autoheal.scan !== "function") return false;

    log("running autoheal");

    try{
      var out = autoheal.scan();
      if (out && typeof out.then === "function") {
        await out;
      }
    }catch(_){}

    state.lastAction = "autoheal";
    return true;
  }

  function isCoolingDown(){
    var last = trimText(state.lastRun || "");
    if (!last) return false;

    var lastMs = Date.parse(last);
    if (!lastMs || !isFinite(lastMs)) return false;

    return (nowMS() - lastMs) < MIN_CYCLE_GAP_MS;
  }

  async function runSupervisorCycle(){
    if(state.busy){
      return {
        ok:false,
        msg:"supervisor busy"
      };
    }

    if (isCoolingDown()) {
      return {
        ok:true,
        skipped:true,
        msg:"cooldown active"
      };
    }

    state.busy = true;

    try{
      var mode = getMode() || "diagnostic";

      log("cycle start",{mode:mode});

      var pending = hasPendingHumanStep();

      if(pending.blocked){
        log("human step pending — supervisor paused", pending);

        state.lastRun = nowISO();
        state.lastAction = "paused:" + trimText(pending.reason || "pending");

        pushHistory({
          ts: state.lastRun,
          mode: mode,
          action: state.lastAction,
          blocked: true,
          planId: trimText(pending.planId || ""),
          targetFile: trimText(pending.targetFile || "")
        });

        return {
          ok:true,
          paused:true,
          msg: pending.reason || "human step pending",
          planId: trimText(pending.planId || ""),
          targetFile: trimText(pending.targetFile || "")
        };
      }

      if(mode === "diagnostic"){
        await runDiagnostics();
      }

      if(mode === "autoheal"){
        await runAutoheal();
      }

      if(mode === "proposal"){
        log("proposal mode active");
        state.lastAction = "proposal";
      }

      if(mode === "supervised_loop"){
        await runDiagnostics();
        await runAutoheal();
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
      historyCount:Array.isArray(state.history) ? state.history.length : 0
    };
  }

  function syncPresence(){
    try{
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAISupervisor");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAISupervisor", true);
      }
    }catch(_){}

    try{
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAISupervisor");
      }
    }catch(_){}

    try{
      if (global.RCF_FACTORY_STATE?.refreshRuntime) {
        global.RCF_FACTORY_STATE.refreshRuntime();
      }
    }catch(_){}
  }

  function bindEvents(){
    try{
      global.addEventListener("RCF:UI_READY",function(){
        setTimeout(function(){
          try{ runSupervisorCycle(); }catch(_){}
        },500);
      },{passive:true});
    }catch(_){}

    try{
      global.addEventListener("RCF:FACTORY_AI_MODE_CHANGED",function(){
        setTimeout(function(){
          try{ runSupervisorCycle(); }catch(_){}
        },200);
      },{passive:true});
    }catch(_){}

    try{
      global.addEventListener("RCF:PATCH_STAGED",function(){
        try{ persist(); }catch(_){}
      },{passive:true});
    }catch(_){}

    try{
      global.addEventListener("RCF:PATCH_APPLIED",function(){
        setTimeout(function(){
          try{ runSupervisorCycle(); }catch(_){}
        },250);
      },{passive:true});
    }catch(_){}
  }

  function init(){
    load();

    state.version = VERSION;
    state.ready = true;
    state.busy = false;

    persist();
    syncPresence();
    bindEvents();

    log("factory_ai_supervisor ready");

    return status();
  }

  global.RCF_FACTORY_AI_SUPERVISOR = {
    __v100:true,
    __v101:true,
    version:VERSION,
    init:init,
    status:status,
    runCycle:runSupervisorCycle
  };

  try{ init(); }catch(_){}

})(window);
