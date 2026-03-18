/* FILE: /app/js/core/factory_ai_orchestrator.js
   RControl Factory — Factory AI Orchestrator
   v1.1.2 ORCHESTRATOR CORE + FACTORY-FOCUSED CHAT POLICY + BACKEND ACTION FIX

   Objetivo:
   - atuar como camada central cognitiva da Factory AI
   - decidir entre planner local, actions locais e backend remoto
   - aproveitar snapshot consolidado da Factory
   - evitar chamadas quebradas por APIs antigas/inexistentes
   - manter fluxo supervisionado sem apply automático
   - responder como chat útil sem perder o foco da Factory
   - sempre fechar respostas puxando o usuário de volta para a Factory
   - funcionar como script clássico

   PATCH v1.1.2:
   - FIX: normaliza propose_patch -> propose-patch para backend
   - FIX: normaliza generate_code -> generate-code para backend
   - FIX: corrige precedência lógica no fallback do backend
   - mantém toda a estrutura atual com patch mínimo
*/

(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_ORCHESTRATOR && global.RCF_FACTORY_AI_ORCHESTRATOR.__v112) return;

  var VERSION = "v1.1.2";

  function safe(fn, fallback) {
    try {
      var v = fn();
      return v === undefined ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); }
    catch (_) { return obj || {}; }
  }

  function trimText(v) {
    return String(v == null ? "" : v).trim();
  }

  function lower(v) {
    return trimText(v).toLowerCase();
  }

  function nowISO() {
    try { return new Date().toISOString(); }
    catch (_) { return ""; }
  }

  function pushLog(level, msg, extra) {
    try {
      if (extra !== undefined) {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_ORCHESTRATOR] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_ORCHESTRATOR] " + msg);
      }
    } catch (_) {}

    try { console.log("[FACTORY_AI_ORCHESTRATOR]", level, msg, extra || ""); } catch (_) {}
  }

  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function getContext() {
    return safe(function () {
      if (global.RCF_CONTEXT && typeof global.RCF_CONTEXT.getSnapshot === "function") {
        return global.RCF_CONTEXT.getSnapshot();
      }
      if (global.RCF_CONTEXT && typeof global.RCF_CONTEXT.getContext === "function") {
        return global.RCF_CONTEXT.getContext();
      }
      return {};
    }, {});
  }

  function getFactoryState() {
    return safe(function () {
      if (global.RCF_FACTORY_STATE && typeof global.RCF_FACTORY_STATE.getState === "function") {
        return global.RCF_FACTORY_STATE.getState();
      }
      if (global.RCF_FACTORY_STATE && typeof global.RCF_FACTORY_STATE.status === "function") {
        return global.RCF_FACTORY_STATE.status();
      }
      return {};
    }, {});
  }

  function getModuleSummary() {
    return safe(function () {
      if (global.RCF_MODULE_REGISTRY && typeof global.RCF_MODULE_REGISTRY.summary === "function") {
        return global.RCF_MODULE_REGISTRY.summary();
      }
      return {};
    }, {});
  }

  function getTreeSummary() {
    return safe(function () {
      if (global.RCF_FACTORY_TREE && typeof global.RCF_FACTORY_TREE.summary === "function") {
        return global.RCF_FACTORY_TREE.summary();
      }
      return {};
    }, {});
  }

  function getDoctorState() {
    return safe(function () {
      if (global.RCF_DOCTOR_SCAN) {
        return {
          ready: true,
          version: global.RCF_DOCTOR_SCAN.version || "unknown",
          lastRun: global.RCF_DOCTOR_SCAN.lastRun || null,
          lastReport: global.RCF_DOCTOR_SCAN.lastReport || null
        };
      }

      return {
        ready: !!global.RCF_DOCTOR,
        version: safe(function () { return global.RCF_DOCTOR.version; }, "unknown"),
        lastRun: safe(function () { return global.RCF_DOCTOR.lastRun; }, null),
        lastReport: safe(function () { return global.RCF_DOCTOR.lastReport; }, null)
      };
    }, {});
  }

  function getLoggerTail(limit) {
    var max = Math.max(1, Number(limit || 30));

    return safe(function () {
      var logger = global.RCF_LOGGER;
      if (!logger) return [];

      if (Array.isArray(logger.items)) return logger.items.slice(-max);
      if (Array.isArray(logger.lines)) return logger.lines.slice(-max);

      if (typeof logger.getAll === "function") {
        var arr = logger.getAll();
        return Array.isArray(arr) ? arr.slice(-max) : [];
      }

      if (typeof logger.getText === "function") {
        var txt = String(logger.getText() || "").trim();
        return txt ? txt.split("\n").slice(-max) : [];
      }

      if (typeof logger.dump === "function") {
        var raw = String(logger.dump() || "").trim();
        return raw ? raw.split("\n").slice(-max) : [];
      }

      return [];
    }, []);
  }

  function buildSnapshot() {
    return {
      ts: nowISO(),
      snapshot: clone(getContext() || {}),
      factoryState: clone(getFactoryState() || {}),
      modules: clone(getModuleSummary() || {}),
      tree: clone(getTreeSummary() || {}),
      doctor: clone(getDoctorState() || {}),
      logs: getLoggerTail(20)
    };
  }

  function inferIntent(prompt) {
    var p = lower(prompt);

    if (!p) return "chat";

    if (p.indexOf("aprovar") >= 0 && p.indexOf("patch") >= 0) return "approve_patch";
    if (p.indexOf("validar") >= 0 && p.indexOf("patch") >= 0) return "validate_patch";
    if (p.indexOf("stage") >= 0 && p.indexOf("patch") >= 0) return "stage_patch";
    if (p.indexOf("aplicar") >= 0 && p.indexOf("patch") >= 0) return "apply_patch";

    if (p.indexOf("plano") >= 0 || p.indexOf("planejar") >= 0) return "plan";
    if (p.indexOf("próximo arquivo") >= 0 || p.indexOf("proximo arquivo") >= 0) return "next_file";
    if (p.indexOf("snapshot") >= 0 || p.indexOf("estado") >= 0 || p.indexOf("autonomia") >= 0) return "snapshot";
    if (p.indexOf("doctor") >= 0 || p.indexOf("diagnóstico") >= 0 || p.indexOf("diagnostico") >= 0) return "run_doctor";
    if (p.indexOf("logs") >= 0 || p.indexOf("erro") >= 0 || p.indexOf("falha") >= 0) return "collect_logs";

    if (
      p.indexOf("código") >= 0 ||
      p.indexOf("codigo") >= 0 ||
      p.indexOf("arquivo completo") >= 0 ||
      p.indexOf("gerar código") >= 0 ||
      p.indexOf("gerar codigo") >= 0
    ) {
      return "generate_code";
    }

    if (
      p.indexOf("patch") >= 0 ||
      p.indexOf("corrigir") >= 0 ||
      p.indexOf("corrige") >= 0 ||
      p.indexOf("ajuste") >= 0 ||
      p.indexOf("consertar") >= 0
    ) {
      return "propose_patch";
    }

    return "chat";
  }

  function normalizeBackendAction(action) {
    var raw = trimText(action || "");
    if (!raw) return "chat";

    if (raw === "generate_code") return "generate-code";
    if (raw === "propose_patch") return "propose-patch";
    return raw;
  }

  function getFactoryAnchor(snapshotPayload) {
    var state = safe(function () { return snapshotPayload.factoryState; }, {}) || {};
    var snap = safe(function () { return snapshotPayload.snapshot; }, {}) || {};
    var modules = safe(function () { return snapshotPayload.modules; }, {}) || {};
    var planner = safe(function () { return snap.factoryAI || snap.planner || {}; }, {}) || {};

    var activeView =
      trimText(state.activeView || "") ||
      trimText(safe(function () { return snap.factory.activeView; }, "") || "");

    var bootStatus =
      trimText(state.bootStatus || "") ||
      trimText(safe(function () { return snap.factory.bootStatus; }, "") || "") ||
      "unknown";

    var nextFile =
      trimText(safe(function () { return planner.lastNextFile; }, "") || "") ||
      trimText(safe(function () { return snap.summary && snap.summary.candidateFiles && snap.summary.candidateFiles[0]; }, "") || "");

    if (nextFile) {
      return "Voltando para a Factory: o próximo alvo mais seguro no runtime atual continua sendo " + nextFile + ".";
    }

    if (activeView) {
      return "Voltando para a Factory: a view ativa atual é '" + activeView + "' e o bootStatus está '" + bootStatus + "'.";
    }

    if (Array.isArray(modules.active) && modules.active.length) {
      return "Voltando para a Factory: os módulos ativos atuais são " + modules.active.slice(0, 6).join(", ") + ".";
    }

    return "Voltando para a Factory: siga pelo próximo passo supervisionado antes de qualquer apply automático.";
  }

  function ensureFactoryClosure(text, snapshotPayload) {
    var raw = trimText(text || "");
    var anchor = getFactoryAnchor(snapshotPayload);

    if (!raw) return anchor;

    var low = lower(raw);

    if (
      low.indexOf("voltando para a factory") >= 0 ||
      low.indexOf("voltando pra factory") >= 0 ||
      low.indexOf("próximo passo") >= 0 ||
      low.indexOf("proximo passo") >= 0
    ) {
      return raw;
    }

    return raw + "\n\n" + anchor;
  }

  function buildBackendPrompt(prompt, snapshotPayload) {
    var snap = safe(function () { return snapshotPayload.snapshot; }, {}) || {};
    var state = safe(function () { return snapshotPayload.factoryState; }, {}) || {};
    var modules = safe(function () { return snapshotPayload.modules; }, {}) || {};

    var activeView =
      trimText(state.activeView || "") ||
      trimText(safe(function () { return snap.factory.activeView; }, "") || "") ||
      "unknown";

    var bootStatus =
      trimText(state.bootStatus || "") ||
      trimText(safe(function () { return snap.factory.bootStatus; }, "") || "") ||
      "unknown";

    var activeModules = [];
    try {
      if (Array.isArray(modules.active)) activeModules = modules.active.slice(0, 10);
    } catch (_) {}

    return [
      "Você está respondendo como Factory AI da RControl Factory.",
      "Regras obrigatórias:",
      "- Responda de forma útil e natural, como um chat inteligente.",
      "- Não perca o foco do ecossistema Factory.",
      "- Se a pergunta for geral, responda normalmente, mas termine puxando de volta para a Factory.",
      "- Não trate esta conversa como bate-papo solto.",
      "- Não invente ações já aplicadas.",
      "- Nunca sugera apply automático sem fluxo supervisionado.",
      "- Sempre que possível, termine com orientação prática ligada à Factory.",
      "",
      "Estado atual conhecido:",
      "- bootStatus: " + bootStatus,
      "- activeView: " + activeView,
      "- activeModules: " + (activeModules.length ? activeModules.join(", ") : "desconhecido"),
      "",
      "Pergunta do usuário:",
      prompt
    ].join("\n");
  }

  async function runPlanner(prompt) {
    var planner = global.RCF_FACTORY_AI_PLANNER;

    if (!planner) {
      return { ok: false, msg: "planner indisponível" };
    }

    if (typeof planner.planFromRuntime === "function") {
      return planner.planFromRuntime({ prompt: prompt, goal: prompt, reason: prompt });
    }

    if (typeof planner.buildPlan === "function") {
      return planner.buildPlan({ prompt: prompt, goal: prompt, reason: prompt });
    }

    return { ok: false, msg: "planner sem API compatível" };
  }

  async function runActions(action, prompt) {
    var actions = global.RCF_FACTORY_AI_ACTIONS;

    if (!actions || typeof actions.dispatch !== "function") {
      return { ok: false, msg: "actions indisponível" };
    }

    return actions.dispatch({
      action: action,
      prompt: prompt
    });
  }

  function buildLocalFallback(intent, prompt, payload) {
    var anchor = getFactoryAnchor(payload);
    var state = safe(function () { return payload.factoryState; }, {}) || {};
    var modules = safe(function () { return payload.modules; }, {}) || {};
    var doctor = safe(function () { return payload.doctor; }, {}) || {};

    var lines = [];
    lines.push("1. Fatos confirmados");
    lines.push("- Intent detectado: " + intent);
    lines.push("- Boot status: " + (trimText(state.bootStatus || "") || "unknown"));
    lines.push("- Doctor ready: " + (!!doctor.ready));
    lines.push("");

    lines.push("2. Dados ausentes ou mal consolidados");
    lines.push("- O backend remoto não retornou resposta utilizável nesta tentativa.");
    lines.push("");

    lines.push("3. Inferências prováveis");
    if (Array.isArray(modules.active) && modules.active.length) {
      lines.push("- Módulos ativos atuais: " + modules.active.slice(0, 8).join(" | "));
    } else {
      lines.push("- Snapshot sem lista confiável de módulos ativos.");
    }
    lines.push("");

    lines.push("4. Próximo passo mínimo recomendado");
    lines.push("- Repetir a solicitação ou seguir pelo próximo fluxo supervisionado local.");
    lines.push("");

    lines.push("5. Direcionamento");
    lines.push("- " + anchor);

    return {
      ok: false,
      fallback: true,
      source: "orchestrator.local_fallback",
      analysis: lines.join("\n")
    };
  }

  async function callBackend(action, prompt, payload) {
    try {
      var normalizedAction = normalizeBackendAction(action);

      var res = await fetch("/api/admin-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: normalizedAction,
          prompt: buildBackendPrompt(prompt, payload),
          payload: payload,
          history: [],
          attachments: [],
          source: "factory-ai-orchestrator",
          version: VERSION,
          mode: "factory-focused-chat"
        })
      });

      var data = await res.json().catch(function () { return {}; });

      if (!res.ok) {
        return {
          ok: false,
          msg: "Falha HTTP no backend.",
          status: res.status,
          data: data
        };
      }

      return data;
    } catch (e) {
      return {
        ok: false,
        msg: String(e && e.message || e || "falha backend")
      };
    }
  }

  function normalizeResult(intent, raw, payload) {
    var result = clone(raw || {});

    if (intent === "plan" && result && result.id && !result.ok) {
      result = {
        ok: true,
        plan: clone(raw),
        analysis: "Plano local consolidado.",
        source: "planner.local"
      };
    }

    if (!result.analysis && result.plan) {
      result.analysis = "Plano local consolidado.";
    }

    if (!result.analysis && result.answer) {
      result.analysis = result.answer;
    }

    if (!result.analysis && result.result && typeof result.result === "string") {
      result.analysis = result.result;
    }

    if (result.analysis) {
      result.analysis = ensureFactoryClosure(result.analysis, payload);
    }

    return result;
  }

  async function orchestrate(input) {
    var prompt = trimText(safe(function () { return input.prompt; }, ""));
    var intent = inferIntent(prompt);
    var payload = buildSnapshot();

    pushLog("INFO", "orchestrate:start", {
      intent: intent,
      prompt: prompt
    });

    var result = null;

    if (intent === "plan") {
      result = await runPlanner(prompt);
      result = normalizeResult(intent, result, payload);

      emit("RCF:FACTORY_AI_ORCHESTRATED", {
        intent: intent,
        mode: "planner.local",
        result: clone(result)
      });

      return result;
    }

    if (
      intent === "approve_patch" ||
      intent === "validate_patch" ||
      intent === "stage_patch" ||
      intent === "apply_patch" ||
      intent === "run_doctor" ||
      intent === "collect_logs" ||
      intent === "snapshot" ||
      intent === "next_file"
    ) {
      result = await runActions(intent, prompt);
      result = normalizeResult(intent, result, payload);

      emit("RCF:FACTORY_AI_ORCHESTRATED", {
        intent: intent,
        mode: "actions.local",
        result: clone(result)
      });

      return result;
    }

    if (intent === "propose_patch" || intent === "generate_code" || intent === "chat") {
      result = await callBackend(normalizeBackendAction(intent), prompt, payload);

      if (!result || (result.ok === false && !result.analysis && !result.answer && !result.result)) {
        result = buildLocalFallback(intent, prompt, payload);
      }

      result = normalizeResult(intent, result, payload);

      emit("RCF:FACTORY_AI_ORCHESTRATED", {
        intent: intent,
        mode: "backend.remote",
        result: clone(result)
      });

      return result;
    }

    result = await callBackend("chat", prompt, payload);

    if (!result || (result.ok === false && !result.analysis && !result.answer && !result.result)) {
      result = buildLocalFallback("chat", prompt, payload);
    }

    result = normalizeResult("chat", result, payload);

    emit("RCF:FACTORY_AI_ORCHESTRATED", {
      intent: intent,
      mode: "backend.remote.fallback",
      result: clone(result)
    });

    return result;
  }

  function syncPresence() {
    try {
      if (global.RCF_FACTORY_STATE && typeof global.RCF_FACTORY_STATE.registerModule === "function") {
        global.RCF_FACTORY_STATE.registerModule("factoryAIOrchestrator");
      } else if (global.RCF_FACTORY_STATE && typeof global.RCF_FACTORY_STATE.setModule === "function") {
        global.RCF_FACTORY_STATE.setModule("factoryAIOrchestrator", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY && typeof global.RCF_MODULE_REGISTRY.register === "function") {
        global.RCF_MODULE_REGISTRY.register("factoryAIOrchestrator");
      }
    } catch (_) {}
  }

  function status() {
    return {
      version: VERSION,
      contextReady: !!global.RCF_CONTEXT,
      plannerReady: !!global.RCF_FACTORY_AI_PLANNER,
      actionsReady: !!global.RCF_FACTORY_AI_ACTIONS,
      bridgeReady: !!global.RCF_FACTORY_AI_BRIDGE,
      patchSupervisorReady: !!global.RCF_PATCH_SUPERVISOR
    };
  }

  function init() {
    syncPresence();
    pushLog("OK", "factory_ai_orchestrator ready ✅ " + VERSION);
    return status();
  }

  global.RCF_FACTORY_AI_ORCHESTRATOR = {
    __v100: true,
    __v101: true,
    __v110: true,
    __v111: true,
    __v112: true,
    version: VERSION,
    init: init,
    orchestrate: orchestrate,
    status: status
  };

  try { init(); } catch (_) {}

})(window);
