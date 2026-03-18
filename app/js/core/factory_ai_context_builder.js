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

var VERSION = "1.0.0";

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
    memory: getMemory()
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
  version: VERSION,

  buildSnapshot: buildSnapshot,
  buildPayload: buildPayload

};

try{
  console.log("[RCF] factory_ai_context_builder ready",VERSION);
}catch(_){}

})(window);
