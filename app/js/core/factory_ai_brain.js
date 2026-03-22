/* FILE: /app/js/core/factory_ai_brain.js
   RControl Factory — Factory AI Brain
   v1.0.0 COGNITIVE ROUTER + IDENTITY DRIVEN THINKING

   Objetivo:
   - ser a camada cognitiva principal da Factory AI
   - usar identidade + contexto + diagnóstico + planner + orchestrator
   - interpretar melhor o pedido do usuário
   - escolher a melhor rota de resposta
   - evitar respostas rasas/genéricas
   - manter foco na evolução da Factory
   - preparar base para inteligência real antes de injection/apply
   - funcionar como script clássico
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_BRAIN && global.RCF_FACTORY_AI_BRAIN.__v100) return;

  var VERSION = "v1.0.1";
  var STORAGE_KEY = "rcf:factory_ai_brain";
  var MAX_HISTORY = 120;

  var state = {
    version: VERSION,
    ready: false,
    busy: false,
    lastUpdate: null,
    lastDecisionAt: null,
    lastIntent: "",
    lastRoute: "",
    lastPrompt: "",
    lastAnswer: "",
    lastTargetFile: "",
    lastReason: "",
    history: [],
    presenceSyncedAt: null,
    presenceSyncAttempts: 0
  };

  function nowISO() {
    try { return new Date().toISOString(); }
    catch (_) { return ""; }
  }

  function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); }
    catch (_) { return obj || {}; }
  }

  function safe(fn, fallback) {
    try {
      var v = fn();
      return v === undefined ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  function trimText(v) {
    return String(v == null ? "" : v).trim();
  }

  function lower(v) {
    return trimText(v).toLowerCase();
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function uniq(arr) {
    var out = [];
    var seen = {};
    asArray(arr).forEach(function (item) {
      var key = String(item || "");
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(item);
    });
    return out;
  }

  function persist() {
    try {
      state.lastUpdate = nowISO();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: state.version,
        ready: !!state.ready,
        lastUpdate: state.lastUpdate,
        lastDecisionAt: state.lastDecisionAt,
        lastIntent: state.lastIntent,
        lastRoute: state.lastRoute,
        lastPrompt: state.lastPrompt,
        lastAnswer: state.lastAnswer,
        lastTargetFile: state.lastTargetFile,
        lastReason: state.lastReason,
        history: clone(state.history || [])
      }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;

      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return false;

      state.version = VERSION;
      state.ready = !!parsed.ready;
      state.busy = false;
      state.lastUpdate = parsed.lastUpdate || null;
      state.lastDecisionAt = parsed.lastDecisionAt || null;
      state.lastIntent = trimText(parsed.lastIntent || "");
      state.lastRoute = trimText(parsed.lastRoute || "");
      state.lastPrompt = trimText(parsed.lastPrompt || "");
      state.lastAnswer = trimText(parsed.lastAnswer || "");
      state.lastTargetFile = trimText(parsed.lastTargetFile || "");
      state.lastReason = trimText(parsed.lastReason || "");
      state.history = Array.isArray(parsed.history) ? parsed.history.slice(-MAX_HISTORY) : [];

      return true;
    } catch (_) {
      return false;
    }
  }

  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function pushLog(level, msg, extra) {
    try {
      if (extra !== undefined) {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_BRAIN] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_BRAIN] " + msg);
      }
    } catch (_) {}

    try { console.log("[FACTORY_AI_BRAIN]", level, msg, extra || ""); } catch (_) {}
  }

  function pushHistory(entry) {
    if (!Array.isArray(state.history)) state.history = [];
    state.history.push(clone(entry || {}));
    if (state.history.length > MAX_HISTORY) {
      state.history = state.history.slice(-MAX_HISTORY);
    }
    persist();
  }

  function getIdentity() {
    return safe(function () {
      if (global.RCF_FACTORY_AI_IDENTITY?.get) return global.RCF_FACTORY_AI_IDENTITY.get();
      return {
        name: "Factory AI",
        role: "AI Architect of the RControl Factory",
        mission: "Evoluir a própria Factory e ajudar a construir aplicativos de alto nível.",
        primaryObjectives: [],
        capabilities: [],
        restrictions: []
      };
    }, {});
  }

  function getContextSummary() {
    return safe(function () {
      if (global.RCF_CONTEXT?.summary) return global.RCF_CONTEXT.summary();
      return {};
    }, {});
  }

  function getContextSnapshot() {
    return safe(function () {
      if (global.RCF_CONTEXT?.getSnapshot) return global.RCF_CONTEXT.getSnapshot();
      if (global.RCF_CONTEXT?.getContext) return global.RCF_CONTEXT.getContext();
      return {};
    }, {});
  }

  function getDiagnostics() {
    return safe(function () { return global.RCF_FACTORY_AI_DIAGNOSTICS || null; }, null);
  }

  function getPlanner() {
    return safe(function () { return global.RCF_FACTORY_AI_PLANNER || null; }, null);
  }

  function getOrchestrator() {
    return safe(function () { return global.RCF_FACTORY_AI_ORCHESTRATOR || null; }, null);
  }

  function getRuntime() {
    return safe(function () { return global.RCF_FACTORY_AI_RUNTIME || null; }, null);
  }

  function getActions() {
    return safe(function () { return global.RCF_FACTORY_AI_ACTIONS || null; }, null);
  }

  function getAutoHeal() {
    return safe(function () { return global.RCF_FACTORY_AI_AUTOHEAL || null; }, null);
  }

  function getEvolutionMode() {
    return safe(function () { return global.RCF_FACTORY_AI_EVOLUTION_MODE || null; }, null);
  }

  function getPhaseEngine() {
    return safe(function () { return global.RCF_FACTORY_PHASE_ENGINE || null; }, null);
  }

  function getMemory() {
    return safe(function () { return global.RCF_FACTORY_AI_MEMORY || null; }, null);
  }

  function getRecentChatHistory() {
    var out = [];
    asArray(state.history).slice(-12).forEach(function (item) {
      if (!item || typeof item !== "object") return;
      if (!item.prompt && !item.answer) return;
      if (item.prompt) out.push({ role: "user", text: String(item.prompt) });
      if (item.answer) out.push({ role: "assistant", text: String(item.answer) });
    });
    return out.slice(-12);
  }

  function inferIntent(prompt) {
    var p = lower(prompt);

    if (!p) return "chat";

    if (
      p.indexOf("quem você é") >= 0 ||
      p.indexOf("qual sua função") >= 0 ||
      p.indexOf("sua missão") >= 0 ||
      p.indexOf("sua funcao") >= 0 ||
      p.indexOf("sua obrigação") >= 0 ||
      p.indexOf("sua obrigacao") >= 0
    ) return "identity";

    if (
      p.indexOf("nível") >= 0 ||
      p.indexOf("nivel") >= 0 ||
      p.indexOf("como está") >= 0 ||
      p.indexOf("como esta") >= 0 ||
      p.indexOf("evolução") >= 0 ||
      p.indexOf("evolucao") >= 0 ||
      p.indexOf("capacidade") >= 0 ||
      p.indexOf("inteligência") >= 0 ||
      p.indexOf("inteligencia") >= 0
    ) return "evolution_status";

    if (
      p.indexOf("próximo arquivo") >= 0 ||
      p.indexOf("proximo arquivo") >= 0 ||
      p.indexOf("próximo passo") >= 0 ||
      p.indexOf("proximo passo") >= 0 ||
      p.indexOf("qual arquivo") >= 0
    ) return "next_file";

    if (
      p.indexOf("diagnóstico") >= 0 ||
      p.indexOf("diagnostico") >= 0 ||
      p.indexOf("saúde") >= 0 ||
      p.indexOf("saude") >= 0 ||
      p.indexOf("gargalo") >= 0
    ) return "diagnostics";

    if (
      p.indexOf("planejar") >= 0 ||
      p.indexOf("plano") >= 0 ||
      p.indexOf("prioridade") >= 0 ||
      p.indexOf("sequência") >= 0 ||
      p.indexOf("sequencia") >= 0
    ) return "planning";

    if (
      p.indexOf("corrigir") >= 0 ||
      p.indexOf("corrige") >= 0 ||
      p.indexOf("patch") >= 0 ||
      p.indexOf("autoheal") >= 0
    ) return "healing";

    if (
      p.indexOf("responder melhor") >= 0 ||
      p.indexOf("parar de responder genérico") >= 0 ||
      p.indexOf("parar de responder generico") >= 0 ||
      p.indexOf("ficar mais inteligente") >= 0
    ) return "cognitive_upgrade";

    return "chat";
  }

  function buildIdentityBlock(identity) {
    var primaryObjectives = asArray(identity.primaryObjectives).slice(0, 8);
    var capabilities = asArray(identity.capabilities).slice(0, 8);
    var restrictions = asArray(identity.restrictions).slice(0, 8);

    return {
      name: trimText(identity.name || "Factory AI"),
      role: trimText(identity.role || "AI Architect of the RControl Factory"),
      mission: trimText(identity.mission || ""),
      objectives: clone(primaryObjectives),
      capabilities: clone(capabilities),
      restrictions: clone(restrictions)
    };
  }

  function buildBrainContext() {
    var identity = buildIdentityBlock(getIdentity());
    var summary = getContextSummary();
    var snapshot = getContextSnapshot();

    var diagnosticsApi = getDiagnostics();
    var diagnosticsReport = safe(function () {
      return diagnosticsApi && diagnosticsApi.getLastReport ? diagnosticsApi.getLastReport() : null;
    }, null);

    var plannerApi = getPlanner();
    var plannerPlan = safe(function () {
      return plannerApi && plannerApi.getLastPlan ? plannerApi.getLastPlan() : null;
    }, null);

    var autoHealApi = getAutoHeal();
    var autoHealProposal = safe(function () {
      return autoHealApi && autoHealApi.getLastProposal ? autoHealApi.getLastProposal() : null;
    }, null);

    var evolutionModeApi = getEvolutionMode();
    var evolutionMode = safe(function () {
      return evolutionModeApi && evolutionModeApi.getMode ? evolutionModeApi.getMode() : "";
    }, "");

    var phaseApi = getPhaseEngine();
    var phaseCtx = safe(function () {
      return phaseApi && phaseApi.buildPhaseContext ? phaseApi.buildPhaseContext() : {};
    }, {});

    var memoryApi = getMemory();
    var memoryCtx = safe(function () {
      return memoryApi && memoryApi.buildMemoryContext ? memoryApi.buildMemoryContext(12) : {};
    }, {});

    return {
      identity: identity,
      summary: clone(summary || {}),
      snapshot: clone(snapshot || {}),
      diagnostics: clone(diagnosticsReport || null),
      planner: clone(plannerPlan || null),
      autoHeal: clone(autoHealProposal || null),
      evolutionMode: trimText(evolutionMode || ""),
      phase: {
        activePhaseId: trimText(safe(function () { return phaseCtx.activePhase.id; }, "")),
        activePhaseTitle: trimText(safe(function () { return phaseCtx.activePhase.title; }, "")),
        recommendedTargets: clone(safe(function () { return phaseCtx.recommendedTargets; }, []))
      },
      memory: {
        avoidFiles: clone(safe(function () { return memoryCtx.avoidFiles; }, [])),
        items: clone(asArray(safe(function () { return memoryCtx.items; }, [])).slice(0, 8))
      },
      recentChatHistory: getRecentChatHistory()
    };
  }

  function buildFocusAnchor(brainCtx) {
    var nextFocus =
      trimText(safe(function () { return brainCtx.diagnostics.nextFocus.targetFile; }, "")) ||
      trimText(safe(function () { return brainCtx.planner.targetFile || brainCtx.planner.nextFile; }, "")) ||
      trimText(safe(function () { return brainCtx.summary.plannerLastNextFile; }, "")) ||
      trimText(safe(function () { return brainCtx.autoHeal.targetFile; }, ""));

    if (nextFocus) {
      return "Voltando para a Factory: o alvo mais forte neste momento é " + nextFocus + ".";
    }

    var phaseTitle = trimText(safe(function () { return brainCtx.phase.activePhaseTitle; }, ""));
    if (phaseTitle) {
      return "Voltando para a Factory: a fase ativa atual é '" + phaseTitle + "'.";
    }

    return "Voltando para a Factory: o foco continua sendo evoluir a própria Factory com segurança.";
  }

  function buildFactoryAwarePrompt(prompt, brainCtx) {
    var identity = brainCtx.identity || {};
    var summary = brainCtx.summary || {};
    var diagnostics = brainCtx.diagnostics || {};
    var planner = brainCtx.planner || {};
    var autoHeal = brainCtx.autoHeal || {};
    var phase = brainCtx.phase || {};
    var evolutionMode = trimText(brainCtx.evolutionMode || "");

    var lines = [];

    lines.push("Você é a Factory AI da RControl Factory.");
    lines.push("Você não é um chat genérico.");
    lines.push("Seu papel: " + trimText(identity.role || "AI Architect of the RControl Factory") + ".");
    if (identity.mission) lines.push("Sua missão: " + trimText(identity.mission) + ".");
    if (evolutionMode) lines.push("Modo atual de evolução: " + evolutionMode + ".");
    if (summary.bootStatus) lines.push("Boot status atual: " + trimText(summary.bootStatus) + ".");
    if (summary.activeView) lines.push("View ativa atual: " + trimText(summary.activeView) + ".");
    if (summary.runtimeVFS) lines.push("Runtime atual: " + trimText(summary.runtimeVFS) + ".");
    if (phase.activePhaseTitle) lines.push("Fase ativa: " + trimText(phase.activePhaseTitle) + " (" + trimText(phase.activePhaseId) + ").");
    if (summary.plannerLastNextFile) lines.push("Planner lastNextFile: " + trimText(summary.plannerLastNextFile) + ".");
    if (safe(function () { return diagnostics.nextFocus.targetFile; }, "")) {
      lines.push("Diagnostics nextFocus: " + trimText(diagnostics.nextFocus.targetFile) + ".");
    }
    if (safe(function () { return planner.targetFile || planner.nextFile; }, "")) {
      lines.push("Planner target atual: " + trimText(planner.targetFile || planner.nextFile) + ".");
    }
    if (safe(function () { return autoHeal.targetFile; }, "")) {
      lines.push("AutoHeal target atual: " + trimText(autoHeal.targetFile) + ".");
    }

    lines.push("Regras:");
    lines.push("- responda em português do Brasil;");
    lines.push("- mantenha foco na Factory;");
    lines.push("- evite resposta genérica;");
    lines.push("- não proponha injection/apply automático agora;");
    lines.push("- priorize entendimento, missão, evolução e próximo passo útil;");
    lines.push("- quando possível, feche a resposta puxando de volta para a Factory.");

    lines.push("Pedido atual do usuário:");
    lines.push(trimText(prompt || "") || "(vazio)");

    return lines.join("\n");
  }

  function buildLocalIdentityAnswer(brainCtx) {
    var identity = brainCtx.identity || {};
    var summary = brainCtx.summary || {};
    var phase = brainCtx.phase || {};

    var text = [
      "Você é a " + trimText(identity.name || "Factory AI") + ".",
      trimText(identity.mission || "Sua missão é evoluir a própria Factory e ajudar a construir aplicativos."),
      "Agora seu foco principal não é aplicar patch nem injetar nada, e sim entender a Factory, responder com mais inteligência e organizar a evolução do núcleo.",
      summary.bootStatus ? ("Boot status atual: " + trimText(summary.bootStatus) + ".") : "",
      summary.activeView ? ("View ativa: " + trimText(summary.activeView) + ".") : "",
      phase.activePhaseTitle ? ("Fase ativa: " + trimText(phase.activePhaseTitle) + ".") : "",
      buildFocusAnchor(brainCtx)
    ].filter(Boolean).join(" ");

    return {
      ok: true,
      route: "brain.local.identity",
      analysis: text,
      targetFile: trimText(safe(function () { return brainCtx.summary.plannerLastNextFile; }, "")),
      reason: "identity-driven response"
    };
  }

  function buildLocalEvolutionAnswer(brainCtx) {
    var diagnostics = brainCtx.diagnostics || {};
    var summary = brainCtx.summary || {};
    var planner = brainCtx.planner || {};
    var autoHeal = brainCtx.autoHeal || {};
    var evolutionMode = trimText(brainCtx.evolutionMode || "");
    var score = Number(safe(function () { return diagnostics.health.score; }, 0) || safe(function () { return diagnostics.health.score; }, 0));
    var grade = trimText(safe(function () { return diagnostics.health.grade; }, ""));

    var targetFile =
      trimText(safe(function () { return diagnostics.nextFocus.targetFile; }, "")) ||
      trimText(safe(function () { return planner.targetFile || planner.nextFile; }, "")) ||
      trimText(safe(function () { return autoHeal.targetFile; }, "")) ||
      trimText(summary.plannerLastNextFile || "");

    var parts = [];
    parts.push("A Factory AI já saiu da fase bruta e agora está em uma fase intermediária de inteligência operacional.");
    if (evolutionMode) parts.push("Modo atual: " + evolutionMode + ".");
    if (grade || score) parts.push("Saúde/força cognitiva atual: " + (grade || "unknown") + (score ? " (" + score + ")" : "") + ".");
    parts.push("Ela já tem base de contexto, planner, bridge, actions, diagnostics, autoheal e governor.");
    parts.push("O que ainda falta não é mais estrutura básica, e sim melhorar como ela entende o pedido, responde e decide o próximo alvo com constância.");
    if (targetFile) parts.push("Hoje o próximo foco mais forte continua sendo " + targetFile + ".");
    parts.push(buildFocusAnchor(brainCtx));

    return {
      ok: true,
      route: "brain.local.evolution_status",
      analysis: parts.join(" "),
      targetFile: targetFile,
      reason: "evolution status synthesized from diagnostics/planner/context"
    };
  }

  function buildLocalNextFileAnswer(brainCtx) {
    var diagnostics = brainCtx.diagnostics || {};
    var planner = brainCtx.planner || {};
    var autoHeal = brainCtx.autoHeal || {};
    var phase = brainCtx.phase || {};

    var targetFile =
      trimText(safe(function () { return diagnostics.nextFocus.targetFile; }, "")) ||
      trimText(safe(function () { return planner.targetFile || planner.nextFile; }, "")) ||
      trimText(safe(function () { return autoHeal.targetFile; }, "")) ||
      trimText(safe(function () { return brainCtx.summary.plannerLastNextFile; }, ""));

    var reason =
      trimText(safe(function () { return diagnostics.nextFocus.reason; }, "")) ||
      trimText(safe(function () { return planner.nextStep || planner.reason; }, "")) ||
      trimText(safe(function () { return autoHeal.reason; }, "")) ||
      "seguir pelo próximo alvo que mais aumenta a inteligência prática da Factory";

    var text = [
      targetFile
        ? ("O próximo arquivo mais útil agora é " + targetFile + ".")
        : "Ainda não existe alvo totalmente consolidado.",
      reason ? ("Motivo: " + reason + ".") : "",
      phase.activePhaseTitle ? ("Fase ativa: " + trimText(phase.activePhaseTitle) + ".") : "",
      buildFocusAnchor(brainCtx)
    ].filter(Boolean).join(" ");

    return {
      ok: true,
      route: "brain.local.next_file",
      analysis: text,
      targetFile: targetFile,
      reason: reason
    };
  }

  async function routeToDiagnostics(prompt, brainCtx) {
    var api = getDiagnostics();
    if (!api) {
      return buildLocalEvolutionAnswer(brainCtx);
    }

    var report = safe(function () {
      return api.scan ? api.scan() : api.getLastReport();
    }, null);

    if (!report) {
      return buildLocalEvolutionAnswer(brainCtx);
    }

    var text = [
      "1. Fatos confirmados",
      "- A Factory AI está em fase de fortalecimento do núcleo.",
      report.health && report.health.grade ? ("- Saúde atual: " + report.health.grade + " (" + String(report.health.score || 0) + ").") : "- Saúde atual: dado ausente.",
      "",
      "2. Dados ausentes ou mal consolidados",
      "- Ainda podem existir áreas com leitura parcial do runtime.",
      "",
      "3. Inferências prováveis",
      report.nextFocus && report.nextFocus.targetFile
        ? ("- Próximo foco mais provável: " + report.nextFocus.targetFile)
        : "- Próximo foco ainda não consolidado.",
      "",
      "4. Próximo passo mínimo recomendado",
      report.nextFocus && report.nextFocus.reason
        ? ("- " + report.nextFocus.reason)
        : "- Consolidar o próximo alvo cognitivo antes de injection.",
      "",
      "5. Arquivos mais prováveis de ajuste",
      asArray(report.recommendations || []).slice(0, 6).map(function (x) { return "- " + x; }).join("\n")
    ].join("\n");

    return {
      ok: true,
      route: "brain.diagnostics",
      analysis: text + "\n\n" + buildFocusAnchor(brainCtx),
      targetFile: trimText(safe(function () { return report.nextFocus.targetFile; }, "")),
      reason: trimText(safe(function () { return report.nextFocus.reason; }, ""))
    };
  }

  async function routeToPlanning(prompt, brainCtx) {
    var planner = getPlanner();

    if (!planner) {
      return buildLocalNextFileAnswer(brainCtx);
    }

    var req = {
      prompt: prompt,
      goal: prompt,
      reason: prompt,
      source: "factory_ai_brain"
    };

    var plan = null;

    try {
      if (typeof planner.planFromRuntime === "function") {
        plan = planner.planFromRuntime(req);
      } else if (typeof planner.buildPlan === "function") {
        plan = planner.buildPlan(req);
      }
    } catch (_) {}

    if (!plan || !plan.id) {
      return buildLocalNextFileAnswer(brainCtx);
    }

    return {
      ok: true,
      route: "brain.planner",
      analysis: [
        "Plano consolidado.",
        "Objetivo: " + trimText(plan.objective || plan.reason || ""),
        "Próximo arquivo: " + trimText(plan.targetFile || plan.nextFile || ""),
        "Prioridade/Risco: " + trimText(plan.priority || plan.risk || "unknown"),
        "Próximo passo: " + trimText(plan.nextStep || ""),
        buildFocusAnchor(brainCtx)
      ].join("\n"),
      plan: clone(plan),
      targetFile: trimText(plan.targetFile || plan.nextFile || ""),
      reason: trimText(plan.reason || plan.nextStep || "")
    };
  }

  async function routeToHealing(prompt, brainCtx) {
    var autoHeal = getAutoHeal();

    if (!autoHeal || typeof autoHeal.scan !== "function") {
      return buildLocalNextFileAnswer(brainCtx);
    }

    var result = safe(function () { return autoHeal.scan(); }, null);

    if (!result || !result.ok || !result.proposal) {
      return buildLocalNextFileAnswer(brainCtx);
    }

    var proposal = result.proposal || {};

    return {
      ok: true,
      route: "brain.autoheal",
      analysis: [
        "Proposta supervisionada de autoheal calculada.",
        "Objetivo: " + trimText(proposal.objective || ""),
        "Arquivo alvo: " + trimText(proposal.targetFile || ""),
        "Risco: " + trimText(proposal.risk || "unknown"),
        "Próximo passo: " + trimText(proposal.nextStep || ""),
        buildFocusAnchor(brainCtx)
      ].join("\n"),
      proposal: clone(proposal),
      targetFile: trimText(proposal.targetFile || ""),
      reason: trimText(proposal.reason || proposal.nextStep || "")
    };
  }

  async function routeToOrchestrator(prompt, brainCtx) {
    var orchestrator = getOrchestrator();

    if (!orchestrator || typeof orchestrator.orchestrate !== "function") {
      return {
        ok: false,
        route: "brain.orchestrator.unavailable",
        analysis: "",
        targetFile: "",
        reason: "orchestrator indisponível"
      };
    }

    var enrichedPrompt = buildFactoryAwarePrompt(prompt, brainCtx);
    var result = await orchestrator.orchestrate({
      prompt: enrichedPrompt,
      source: "factory_ai_brain"
    });

    return {
      ok: !!safe(function () { return result.ok; }, true),
      route: "brain.orchestrator",
      analysis: trimText(safe(function () { return result.analysis || result.answer || result.result; }, "")),
      raw: clone(result || {}),
      targetFile:
        trimText(safe(function () { return result.plan.targetFile || result.plan.nextFile; }, "")) ||
        trimText(safe(function () { return result.hints.targetFile; }, "")) ||
        trimText(safe(function () { return result.nextFileCandidate; }, "")),
      reason: "orchestrator response"
    };
  }

  async function routeToRuntime(prompt, brainCtx) {
    var runtime = getRuntime();

    if (!runtime || typeof runtime.ask !== "function") {
      return {
        ok: false,
        route: "brain.runtime.unavailable",
        analysis: "",
        targetFile: "",
        reason: "runtime indisponível"
      };
    }

    var result = await runtime.ask({
      action: "chat",
      prompt: buildFactoryAwarePrompt(prompt, brainCtx),
      history: brainCtx.recentChatHistory || [],
      source: "factory_ai_brain"
    });

    return {
      ok: !!safe(function () { return result.ok; }, true),
      route: "brain.runtime",
      analysis: trimText(safe(function () { return result.response.analysis; }, "")),
      raw: clone(result || {}),
      targetFile: trimText(safe(function () { return result.plan.targetFile || result.plan.nextFile; }, "")),
      reason: "runtime response"
    };
  }

  function normalizeAnswerText(text, brainCtx) {
    var raw = trimText(text || "");
    var anchor = buildFocusAnchor(brainCtx);

    if (!raw) return anchor;

    var low = lower(raw);
    if (
      low.indexOf("voltando para a factory") >= 0 ||
      low.indexOf("foco continua sendo") >= 0 ||
      low.indexOf("alvo mais forte") >= 0
    ) {
      return raw;
    }

    return raw + "\n\n" + anchor;
  }

  function rememberDecision(intent, route, prompt, answer, targetFile, reason) {
    state.lastDecisionAt = nowISO();
    state.lastIntent = trimText(intent || "");
    state.lastRoute = trimText(route || "");
    state.lastPrompt = trimText(prompt || "");
    state.lastAnswer = trimText(answer || "");
    state.lastTargetFile = trimText(targetFile || "");
    state.lastReason = trimText(reason || "");
    persist();

    pushHistory({
      type: "brain-decision",
      ts: state.lastDecisionAt,
      intent: state.lastIntent,
      route: state.lastRoute,
      prompt: state.lastPrompt,
      answer: state.lastAnswer,
      targetFile: state.lastTargetFile,
      reason: state.lastReason
    });
  }

  async function think(input) {
    if (state.busy) {
      return {
        ok: false,
        msg: "factory_ai_brain ocupado"
      };
    }

    var prompt = trimText(safe(function () { return input.prompt; }, input || ""));
    if (!prompt) {
      return {
        ok: false,
        msg: "Prompt vazio."
      };
    }

    state.busy = true;
    persist();

    var intent = inferIntent(prompt);
    var brainCtx = buildBrainContext();
    var result = null;

    emit("RCF:FACTORY_AI_BRAIN_START", {
      prompt: prompt,
      intent: intent,
      ts: nowISO()
    });

    try {
      if (intent === "identity") {
        result = buildLocalIdentityAnswer(brainCtx);
      } else if (intent === "evolution_status") {
        result = buildLocalEvolutionAnswer(brainCtx);
      } else if (intent === "next_file") {
        result = buildLocalNextFileAnswer(brainCtx);
      } else if (intent === "diagnostics") {
        result = await routeToDiagnostics(prompt, brainCtx);
      } else if (intent === "planning") {
        result = await routeToPlanning(prompt, brainCtx);
      } else if (intent === "healing") {
        result = await routeToHealing(prompt, brainCtx);
      } else if (intent === "cognitive_upgrade") {
        result = await routeToOrchestrator(prompt, brainCtx);
        if (!result || !trimText(result.analysis || "")) {
          result = buildLocalEvolutionAnswer(brainCtx);
        }
      } else {
        result = await routeToOrchestrator(prompt, brainCtx);
        if (!result || !trimText(result.analysis || "")) {
          result = await routeToRuntime(prompt, brainCtx);
        }
        if (!result || !trimText(result.analysis || "")) {
          result = buildLocalEvolutionAnswer(brainCtx);
        }
      }

      var answer = normalizeAnswerText(trimText(result && result.analysis || ""), brainCtx);
      var targetFile = trimText(result && result.targetFile || "");
      var reason = trimText(result && result.reason || "");

      rememberDecision(intent, trimText(result && result.route || ""), prompt, answer, targetFile, reason);

      var out = {
        ok: true,
        intent: intent,
        route: trimText(result && result.route || ""),
        answer: answer,
        targetFile: targetFile,
        reason: reason,
        raw: clone(result || {})
      };

      emit("RCF:FACTORY_AI_BRAIN_DONE", clone(out));
      pushLog("OK", "think ✅", {
        intent: intent,
        route: out.route,
        targetFile: targetFile
      });

      return out;
    } catch (e) {
      var fail = {
        ok: false,
        msg: String(e && e.message || e || "falha no brain"),
        intent: intent
      };

      pushHistory({
        type: "brain-error",
        ts: nowISO(),
        intent: intent,
        prompt: prompt,
        error: fail.msg
      });

      emit("RCF:FACTORY_AI_BRAIN_ERROR", clone(fail));
      pushLog("ERR", "think exception", fail);
      return fail;
    } finally {
      state.busy = false;
      persist();
    }
  }

  function explainState() {
    return {
      ok: true,
      text: [
        "Intent: " + trimText(state.lastIntent || ""),
        "Route: " + trimText(state.lastRoute || ""),
        "Last target: " + trimText(state.lastTargetFile || ""),
        "Reason: " + trimText(state.lastReason || "")
      ].join("\n")
    };
  }

  function status() {
    return {
      version: VERSION,
      ready: !!state.ready,
      busy: !!state.busy,
      lastUpdate: state.lastUpdate || null,
      lastDecisionAt: state.lastDecisionAt || null,
      lastIntent: state.lastIntent || "",
      lastRoute: state.lastRoute || "",
      lastTargetFile: state.lastTargetFile || "",
      historyCount: asArray(state.history).length
    };
  }

  function syncPresence() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAIBrain");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAIBrain", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAIBrain");
      }
    } catch (_) {}

    try {
      if (global.RCF_FACTORY_STATE?.refreshRuntime) {
        global.RCF_FACTORY_STATE.refreshRuntime();
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.refresh) {
        global.RCF_MODULE_REGISTRY.refresh();
      }
    } catch (_) {}
  }

  function bindEvents() {
    try {
      global.addEventListener("RCF:UI_READY", function () {
        try { syncPresence(); } catch (_) {}
      }, { passive: true });
    } catch (_) {}
  }

  function init() {
    load();
    state.ready = true;
    state.version = VERSION;
    persist();
    syncPresence();
    schedulePresenceResync();
    bindEvents();
    pushLog("OK", "factory_ai_brain ready ✅ " + VERSION);
    return status();
  }

  global.RCF_FACTORY_AI_BRAIN = {
    __v100: true,
    version: VERSION,
    init: init,
    status: status,
    think: think,
    explainState: explainState,
    getState: function () { return clone(state); }
  };

  try { init(); } catch (_) {}

})(window);
