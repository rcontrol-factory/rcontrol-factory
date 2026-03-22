/* FILE: /app/js/core/factory_ai_context_builder.js
   RControl Factory
   Factory AI Context Builder
   v1.0.0

   Objetivo:
   - construir snapshot completo para o backend
   - aumentar inteligência contextual da Factory AI
   - fornecer tree + modules + phase + memory
*/

(function (global) {
"use strict";

if (global.RCF_FACTORY_AI_CONTEXT && global.RCF_FACTORY_AI_CONTEXT.__v100) return;

var VERSION = "1.0.1";

function safe(fn, fallback){
  try{
    var v = fn();
    return v === undefined ? fallback : v;
  }catch(_){
    return fallback;
  }
}

function getModules(){

  return safe(function(){

    if(global.RCF_MODULE_REGISTRY?.summary){
      return global.RCF_MODULE_REGISTRY.summary();
    }

    return {};

  },{});
}

function getFactoryState(){

  return safe(function(){

    if(global.RCF_FACTORY_STATE?.getState){
      return global.RCF_FACTORY_STATE.getState() || {};
    }

    return {};

  },{});
}

function getRuntimeLayer(){

  return safe(function(){

    if(global.RCF_FACTORY_AI_RUNTIME?.status){
      return global.RCF_FACTORY_AI_RUNTIME.status() || {};
    }

    return {};

  },{});
}

function getFrontTelemetry(){

  return safe(function(){

    if(global.RCF_FACTORY_AI?.getFrontTelemetry){
      return global.RCF_FACTORY_AI.getFrontTelemetry() || {};
    }

    return {};

  },{});
}

function getDoctor(){

  return safe(function(){

    return {
      lastRun: global.RCF_DOCTOR_SCAN?.lastRun || global.RCF_DOCTOR?.lastRun || null,
      lastReport: global.RCF_DOCTOR_SCAN?.lastReport || global.RCF_DOCTOR?.lastReport || null,
      version: global.RCF_DOCTOR_SCAN?.version || global.RCF_DOCTOR?.version || ""
    };

  },{});
}

function getLiveContext(){

  var factoryState = getFactoryState();
  var runtimeLayer = getRuntimeLayer();
  var frontTelemetry = getFrontTelemetry();
  var doctor = getDoctor();
  var modules = getModules();

  return {
    runtimeLayer: runtimeLayer,
    frontTelemetry: frontTelemetry,
    doctor: doctor,
    factoryState: {
      activeModulesCount: Number(factoryState.activeModulesCount || 0) || 0,
      activeList: Array.isArray(factoryState.activeList) ? factoryState.activeList.slice(0,60) : [],
      doctorLastRun: factoryState.doctorLastRun || null,
      frontTelemetry: factoryState.frontTelemetry || {},
      runtimeLayer: factoryState.runtimeLayer || {}
    },
    moduleRegistry: {
      version: modules.version || "",
      activeCount: Number(modules.activeCount || 0) || 0,
      active: Array.isArray(modules.active) ? modules.active.slice(0,60) : []
    }
  };
}

function getTree(){

  return safe(function(){

    if(global.RCF_FACTORY_TREE?.summary){
      return global.RCF_FACTORY_TREE.summary();
    }

    return {};

  },{});
}

function getCandidateFiles(){

  return safe(function(){

    if(global.RCF_FACTORY_TREE?.getKnownPaths){
      return global.RCF_FACTORY_TREE.getKnownPaths().slice(0,40);
    }

    return [];

  },[]);
}

function getPhase(){

  return safe(function(){

    if(global.RCF_FACTORY_PHASE_ENGINE?.buildPhaseContext){
      return global.RCF_FACTORY_PHASE_ENGINE.buildPhaseContext();
    }

    return {};

  },{});
}

function getMemory(){

  return safe(function(){

    if(global.RCF_FACTORY_AI_MEMORY?.summary){
      return global.RCF_FACTORY_AI_MEMORY.summary();
    }

    return {};

  },{});
}

function buildSnapshot(){

  return {
    ts: Date.now(),
    modules: getModules(),
    tree: getTree(),
    candidateFiles: getCandidateFiles(),
    phase: getPhase(),
    memory: getMemory(),
    live: getLiveContext()
  };
}

function buildPayload(extra){

  var snapshot = buildSnapshot();

  return {
    snapshot: snapshot,
    payload: extra || {}
  };
}

global.RCF_FACTORY_AI_CONTEXT = {

  __v100: true,
  __v101: true,
  version: VERSION,

  buildSnapshot: buildSnapshot,
  buildPayload: buildPayload

};

try{
  console.log("[RCF] factory_ai_context_builder ready",VERSION);
}catch(_){}

})(window);
