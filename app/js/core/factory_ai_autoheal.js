/* FILE: /app/js/core/factory_ai_autoheal.js
   RControl Factory — Factory AI AutoHeal
   v1.0.1 SUPERVISED AUTOHEAL ENGINE

   Objetivo:
   - transformar diagnóstico em proposta concreta de correção supervisionada
   - evitar repetição burra do mesmo alvo sem avanço real
   - usar diagnostics + memory + planner + phase engine
   - sugerir patch mínimo antes de qualquer apply
   - preparar base para proposal ui / autoloop / self evolution
   - NUNCA aplicar patch automático
   - funcionar como script clássico

   PATCH v1.0.1:
   - FIX: bindEvents usa guarda própria para evitar duplo bind
   - FIX: adiciona scheduleScan leve para evitar tempestade de scans em cascata
   - FIX: getPhaseContext mais robusto com fallback para activePhaseId/activePhaseTitle
   - FIX: getPendingPlan usa fallback seguro para getLastPlan
   - FIX: hasPendingHumanStep aceita stagedPlanId/planId alternativos do supervisor
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_AUTOHEAL && global.RCF_FACTORY_AI_AUTOHEAL.__v101) return;

  var VERSION = "v1.0.1";
  var STORAGE_KEY = "rcf:factory_ai_autoheal";
  var MAX_HISTORY = 80;
  var SCAN_DEBOUNCE_MS = 220;

  var state = {
    version: VERSION,
    ready: false,
    busy: false,
    lastUpdate: null,
    lastRunAt: null,
    lastProposal: null,
    history: []
  };

  var __scanTimer = null;

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

  function normalizePath(path) {
    var p = trimText(path || "").replace(/\\/g, "/");
    if (!p) return "";
    if (p.charAt(0) !== "/") p = "/" + p;
    p = p.replace(/\/{2,}/g, "/");
    return p;
  }

  function normalizeRisk(risk) {
    var r = trimText(risk || "").toLowerCase();
    if (!r) return "unknown";
    if (r.indexOf("low") >= 0 || r.indexOf("baixo") >= 0 || r.indexOf("safe") >= 0 || r.indexOf("seguro") >= 0) return "low";
    if (r.indexOf("medium") >= 0 || r.indexOf("médio") >= 0 || r.indexOf("medio") >= 0) return "medium";
    if (r.indexOf("high") >= 0 || r.indexOf("alto") >= 0 || r.indexOf("crit") >= 0) return "high";
    return "unknown";
  }

  function persist() {
    try {
      state.lastUpdate = nowISO();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: state.version,
        ready: !!state.ready,
        busy: !!state.busy,
        lastUpdate: state.lastUpdate,
        lastRunAt: state.lastRunAt,
        lastProposal: clone(state.lastProposal || null),
        history: Array.isArray(state.history) ? state.history.slice(-MAX_HISTORY) : []
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
      state.lastRunAt = parsed.lastRunAt || null;
      state.lastProposal = clone(parsed.lastProposal || null);
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
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_AUTOHEAL] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_AUTOHEAL] " + msg);
      }
    } catch (_) {}

    try { console.log("[FACTORY_AI_AUTOHEAL]", level, msg, extra || ""); } catch (_) {}
  }

  function pushHistory(entry) {
    if (!Array.isArray(state.history)) state.history = [];
    state.history.push(clone(entry || {}));
    if (state.history.length > MAX_HISTORY) {
      state.history = state.history.slice(-MAX_HISTORY);
    }
    persist();
  }

  function getDiagnostics() {
    return safe(function () { return global.RCF_FACTORY_AI_DIAGNOSTICS || null; }, null);
  }

  function getMemory() {
    return safe(function () { return global.RCF_FACTORY_AI_MEMORY || null; }, null);
  }

  function getPlanner() {
    return safe(function () { return global.RCF_FACTORY_AI_PLANNER || null; }, null);
  }

  function getPhaseEngine() {
    return safe(function () { return global.RCF_FACTORY_PHASE_ENGINE || null; }, null);
  }

  function getBridge() {
    return safe(function () { return global.RCF_FACTORY_AI_BRIDGE || null; }, null);
  }

  function getPatchSupervisor() {
    return safe(function () { return global.RCF_PATCH_SUPERVISOR || null; }, null);
  }

  function getDiagnosticsReport() {
    var api = getDiagnostics();
    if (!api) return null;

    try {
      if (typeof api.getLastReport === "function") {
        var last = api.getLastReport();
        if (last) return clone(last);
      }
    } catch (_) {}

    try {
      if (typeof api.scan === "function") {
        return clone(api.scan());
      }
    } catch (_) {}

    return null;
  }

  function getMemoryContext() {
    var api = getMemory();
    if (!api || typeof api.buildMemoryContext !== "function") {
      return {
        ok: false,
        items: [],
        avoidFiles: [],
        phase: null
      };
    }

    return clone(api.buildMemoryContext(20) || {});
  }

  function getPhaseContext() {
    var api = getPhaseEngine();
    if (!api || typeof api.buildPhaseContext !== "function") {
      return {
        activePhaseId: "",
        activePhaseTitle: "",
        activePhase: null,
        recommendedTargets: []
      };
    }

    var ctx = clone(api.buildPhaseContext() || {});
    var activePhase = clone(safe(function () { return ctx.activePhase; }, null));
    var activePhaseId =
      trimText(safe(function () { return ctx.activePhaseId; }, "")) ||
      trimText(safe(function () { return ctx.phaseId; }, "")) ||
      trimText(safe(function () { return activePhase.id; }, ""));
    var activePhaseTitle =
      trimText(safe(function () { return ctx.activePhaseTitle; }, "")) ||
      trimText(safe(function () { return activePhase.title; }, ""));

    return {
      activePhaseId: activePhaseId,
      activePhaseTitle: activePhaseTitle,
      activePhase: activePhase,
      recommendedTargets: clone(safe(function () { return ctx.recommendedTargets; }, []))
    };
  }

  function getPendingPlan() {
    var bridge = getBridge();
    if (!bridge) return null;

    try {
      if (typeof bridge.getPendingPlan === "function") {
        var pending = bridge.getPendingPlan();
        if (pending && typeof pending === "object") return clone(pending);
      }
    } catch (_) {}

    try {
      if (typeof bridge.getLastPlan === "function") {
        var last = bridge.getLastPlan();
        if (
          last &&
          typeof last === "object" &&
          trimText(last.approvalStatus || "") !== "approved" &&
          trimText(last.approvalStatus || "") !== "consumed" &&
          trimText(last.approvalStatus || "") !== "rejected"
        ) {
          return clone(last);
        }
      }
    } catch (_) {}

    return null;
  }

  function getPatchSupervisorStatus() {
    var sup = getPatchSupervisor();
    if (!sup || typeof sup.status !== "function") return {};
    return clone(sup.status() || {});
  }

  function getPlannerLastPlan() {
    var planner = getPlanner();
    if (!planner || typeof planner.getLastPlan !== "function") return null;
    return clone(planner.getLastPlan() || null);
  }

  function getAvoidMap(memoryCtx) {
    var map = {};
    asArray(memoryCtx && memoryCtx.avoidFiles).forEach(function (item) {
      var file = normalizePath(item && item.file || "");
      if (!file) return;
      map[file] = {
        file: file,
        reason: trimText(item && item.reason || "arquivo em cooldown")
      };
    });
    return map;
  }

  function hasPendingHumanStep() {
    var pending = getPendingPlan();
    if (pending && pending.id) {
      return {
        blocked: true,
        reason: "já existe plano pendente aguardando aprovação",
        planId: trimText(pending.id || ""),
        targetFile: normalizePath(pending.targetFile || pending.nextFile || "")
      };
    }

    var patch = getPatchSupervisorStatus();
    if (patch && patch.hasStagedPatch) {
      return {
        blocked: true,
        reason: "já existe staged patch aguardando resolução",
        planId: trimText(patch.stagedPlanId || patch.planId || ""),
        targetFile: normalizePath(patch.stagedTargetFile || patch.targetFile || "")
      };
    }

    return {
      blocked: false,
      reason: ""
    };
  }

  function getCandidateList(report, phaseCtx, plannerPlan) {
    var out = [];

    try {
      if (report && report.nextFocus && report.nextFocus.targetFile) {
        out.push(report.nextFocus.targetFile);
      }
    } catch (_) {}

    try {
      if (plannerPlan && (plannerPlan.targetFile || plannerPlan.nextFile)) {
        out.push(plannerPlan.targetFile || plannerPlan.nextFile);
      }
    } catch (_) {}

    try {
      out = out.concat(asArray(report && report.phase && report.phase.recommendedTargets));
    } catch (_) {}

    try {
      out = out.concat(asArray(phaseCtx && phaseCtx.recommendedTargets));
    } catch (_) {}

    try {
      out = out.concat(asArray(report && report.recommendations).map(function (line) {
        var m = String(line || "").match(/(\/(?:app|functions)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+)/);
        return m ? m[1] : "";
      }));
    } catch (_) {}

    return uniq(out.map(normalizePath).filter(Boolean));
  }

  function selectTarget(report, memoryCtx, phaseCtx, plannerPlan) {
    var candidates = getCandidateList(report, phaseCtx, plannerPlan);
    var avoidMap = getAvoidMap(memoryCtx);
    var chosen = "";
    var skipped = [];

    for (var i = 0; i < candidates.length; i++) {
      var file = candidates[i];
      if (avoidMap[file]) {
        skipped.push({
          file: file,
          reason: avoidMap[file].reason
        });
        continue;
      }
      chosen = file;
      break;
    }

    if (!chosen && candidates.length) {
      chosen = candidates[0];
    }

    return {
      targetFile: normalizePath(chosen),
      candidates: clone(candidates),
      skipped: clone(skipped)
    };
  }

  function buildObjective(report, phaseCtx, targetFile) {
    var phaseTitle =
      trimText(safe(function () { return phaseCtx.activePhaseTitle; }, "")) ||
      trimText(safe(function () { return phaseCtx.activePhase.title; }, "")) ||
      trimText(safe(function () { return report.phase.activePhaseTitle; }, "")) ||
      "Factory AI supervisionada";

    if (!targetFile) {
      return "Consolidar a próxima autocorreção supervisionada da " + phaseTitle;
    }

    return "Consolidar autocorreção supervisionada focando em " + targetFile + " na fase " + phaseTitle;
  }

  function buildReason(report, selection) {
    var focusReason = trimText(safe(function () { return report.nextFocus.reason; }, ""));
    var targetFile = trimText(selection && selection.targetFile || "");

    if (focusReason && targetFile) {
      return "O diagnóstico atual indica " + targetFile + " como próximo alvo porque " + focusReason + ".";
    }

    if (focusReason) {
      return focusReason;
    }

    if (targetFile) {
      return "O diagnóstico atual mantém " + targetFile + " como alvo mais seguro para avanço supervisionado.";
    }

    return "Ainda falta foco consolidado; a autoheal deve reforçar o próximo alvo supervisionado com base no diagnóstico.";
  }

  function buildPatchSummary(report, selection, blockers) {
    var parts = [];
    var targetFile = trimText(selection && selection.targetFile || "");
    var grade = trimText(safe(function () { return report.health.grade; }, ""));
    var score = String(safe(function () { return report.health.score; }, 0));

    if (targetFile) {
      parts.push("Priorizar " + targetFile + " com ajuste mínimo supervisionado.");
    }

    if (grade) {
      parts.push("Saúde atual da Factory AI: " + grade + " (" + score + ").");
    }

    if (asArray(blockers).length) {
      parts.push("Antes de qualquer apply, resolver bloqueios principais: " + asArray(blockers).slice(0, 2).join("; ") + ".");
    }

    return parts.join(" ").trim();
  }

  function buildNextStep(selection, report, phaseCtx) {
    var targetFile = trimText(selection && selection.targetFile || "");
    var phaseId =
      trimText(safe(function () { return phaseCtx.activePhaseId; }, "")) ||
      trimText(safe(function () { return phaseCtx.activePhase.id; }, "")) ||
      trimText(safe(function () { return report.phase.activePhaseId; }, ""));

    if (targetFile) {
      return "Gerar proposta supervisionada para " + targetFile + " e enviar para aprovação humana antes de stage/apply" + (phaseId ? " na fase " + phaseId : "") + ".";
    }

    return "Reforçar diagnóstico, recalcular alvo e só então gerar proposta supervisionada.";
  }

  function buildTags(targetFile, phaseCtx) {
    return uniq([
      "autoheal",
      "self-structure",
      trimText(safe(function () { return phaseCtx.activePhaseId; }, "")) ||
      trimText(safe(function () { return phaseCtx.activePhase.id; }, "")),
      targetFile ? "targeted" : "untargeted"
    ].filter(Boolean));
  }

  function buildProposal(report, memoryCtx, phaseCtx, plannerPlan) {
    var humanBlock = hasPendingHumanStep();
    var selection = selectTarget(report, memoryCtx, phaseCtx, plannerPlan);
    var blockers = asArray(safe(function () { return report.health.blockers; }, []));
    var warnings = asArray(safe(function () { return report.health.warnings; }, []));
    var positives = asArray(safe(function () { return report.health.positives; }, []));
    var targetFile = normalizePath(selection.targetFile || "");
    var phaseAllow = clone(safe(function () { return phaseCtx.activePhase.allow; }, {}));
    var score = Number(safe(function () { return report.health.score; }, 0)) || 0;
    var risk = normalizeRisk(score >= 80 ? "low" : (score >= 60 ? "medium" : "high"));

    return {
      id: "autoheal_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now(),
      version: VERSION,
      createdAt: nowISO(),
      source: "factory_ai_autoheal",
      mode: "patch",
      approvalRequired: true,
      approvalStatus: "pending",
      targetFile: targetFile,
      nextFile: targetFile,
      objective: buildObjective(report, phaseCtx, targetFile),
      reason: buildReason(report, selection),
      nextStep: buildNextStep(selection, report, phaseCtx),
      patchSummary: buildPatchSummary(report, selection, blockers),
      risk: risk,
      tags: buildTags(targetFile, phaseCtx),
      blocked: !!humanBlock.blocked,
      blockedReason: trimText(humanBlock.reason || ""),
      blockedPlanId: trimText(humanBlock.planId || ""),
      blockedTargetFile: normalizePath(humanBlock.targetFile || ""),
      health: clone(report.health || {}),
      phase: {
        activePhaseId:
          trimText(safe(function () { return phaseCtx.activePhaseId; }, "")) ||
          trimText(safe(function () { return phaseCtx.activePhase.id; }, "")),
        activePhaseTitle:
          trimText(safe(function () { return phaseCtx.activePhaseTitle; }, "")) ||
          trimText(safe(function () { return phaseCtx.activePhase.title; }, "")),
        allow: clone(phaseAllow || {})
      },
      diagnostics: {
        nextFocus: clone(report.nextFocus || {}),
        recommendations: clone(report.recommendations || []),
        blockers: clone(blockers),
        warnings: clone(warnings),
        positives: clone(positives)
      },
      memory: {
        avoidFiles: clone(safe(function () { return memoryCtx.avoidFiles; }, [])),
        recentItems: asArray(safe(function () { return memoryCtx.items; }, [])).slice(0, 12)
      },
      planner: {
        planId: trimText(safe(function () { return plannerPlan.id; }, "")),
        targetFile: normalizePath(safe(function () { return plannerPlan.targetFile || plannerPlan.nextFile; }, "")),
        priority: trimText(safe(function () { return plannerPlan.priority; }, "")),
        objective: trimText(safe(function () { return plannerPlan.objective; }, "")),
        nextStep: trimText(safe(function () { return plannerPlan.nextStep; }, ""))
      },
      candidates: clone(selection.candidates || []),
      skippedCandidates: clone(selection.skipped || []),
      suggestedFiles: uniq([targetFile].concat(asArray(selection.candidates))).filter(Boolean),
      proposedCode: "",
      proposedLang: ""
    };
  }

  function rememberProposal(proposal) {
    state.lastRunAt = nowISO();
    state.lastProposal = clone(proposal || null);
    persist();

    pushHistory({
      type: "autoheal-proposal",
      ts: state.lastRunAt,
      proposalId: trimText(safe(function () { return proposal.id; }, "")),
      targetFile: normalizePath(safe(function () { return proposal.targetFile; }, "")),
      blocked: !!safe(function () { return proposal.blocked; }, false),
      risk: trimText(safe(function () { return proposal.risk; }, "unknown"))
    });
  }

  function rememberIntoMemory(proposal) {
    var memory = getMemory();
    if (!memory) return false;

    try {
      if (typeof memory.rememberDecision === "function") {
        memory.rememberDecision({
          title: proposal.blocked ? "AutoHeal bloqueado por etapa humana pendente" : "AutoHeal gerou proposta supervisionada",
          summary: trimText(proposal.blocked ? proposal.blockedReason : proposal.nextStep || proposal.reason || "Proposta de autocorreção gerada."),
          targetFile: normalizePath(proposal.targetFile || ""),
          risk: normalizeRisk(proposal.risk || ""),
          tags: clone(proposal.tags || []),
          source: "factory_ai_autoheal",
          planId: trimText(proposal.id || ""),
          approvalStatus: trimText(proposal.approvalStatus || "pending"),
          meta: {
            health: clone(proposal.health || {}),
            phase: clone(proposal.phase || {}),
            diagnostics: clone(proposal.diagnostics || {}),
            blocked: !!proposal.blocked,
            blockedPlanId: trimText(proposal.blockedPlanId || ""),
            blockedTargetFile: normalizePath(proposal.blockedTargetFile || "")
          }
        });
        return true;
      }
    } catch (_) {}

    return false;
  }

  function scan() {
    if (state.busy) {
      return {
        ok: false,
        msg: "autoheal ocupado"
      };
    }

    state.busy = true;
    persist();

    try {
      var report = getDiagnosticsReport();
      if (!report) {
        var failNoDiag = { ok: false, msg: "diagnostics indisponível" };
        pushHistory({
          type: "autoheal-fail",
          ts: nowISO(),
          msg: failNoDiag.msg
        });
        return failNoDiag;
      }

      var memoryCtx = getMemoryContext();
      var phaseCtx = getPhaseContext();
      var plannerPlan = getPlannerLastPlan();
      var proposal = buildProposal(report, memoryCtx, phaseCtx, plannerPlan);

      rememberProposal(proposal);
      rememberIntoMemory(proposal);

      emit("RCF:FACTORY_AI_AUTOHEAL_PROPOSAL", {
        proposal: clone(proposal),
        report: clone(report)
      });

      pushLog("OK", "autoheal proposal ✅", {
        proposalId: proposal.id,
        targetFile: proposal.targetFile,
        blocked: proposal.blocked,
        risk: proposal.risk
      });

      return {
        ok: true,
        proposal: clone(proposal),
        report: clone(report)
      };
    } catch (e) {
      var fail = {
        ok: false,
        msg: String(e && e.message || e || "falha no autoheal")
      };

      pushHistory({
        type: "autoheal-exception",
        ts: nowISO(),
        msg: fail.msg
      });

      pushLog("ERR", "autoheal scan exception", fail);
      return fail;
    } finally {
      state.busy = false;
      persist();
    }
  }

  function scheduleScan(reason) {
    try {
      if (__scanTimer) clearTimeout(__scanTimer);
    } catch (_) {}

    __scanTimer = setTimeout(function () {
      __scanTimer = null;
      try {
        pushLog("INFO", "autoheal scheduled scan", { reason: trimText(reason || "") });
        scan();
      } catch (_) {}
    }, SCAN_DEBOUNCE_MS);

    return true;
  }

  function getLastProposal() {
    return clone(state.lastProposal || null);
  }

  function explainLastProposal() {
    var proposal = getLastProposal();
    if (!proposal) {
      return {
        ok: false,
        msg: "Nenhuma proposta gerada ainda."
      };
    }

    return {
      ok: true,
      proposal: clone(proposal),
      text: [
        "Objetivo: " + trimText(proposal.objective || ""),
        "Arquivo alvo: " + trimText(proposal.targetFile || ""),
        "Risco: " + trimText(proposal.risk || "unknown"),
        "Bloqueado: " + String(!!proposal.blocked),
        "Motivo: " + trimText(proposal.reason || ""),
        "Próximo passo: " + trimText(proposal.nextStep || "")
      ].join("\n")
    };
  }

  function buildProposalText() {
    var proposal = getLastProposal();
    if (!proposal) return "";

    return [
      "1. Objetivo",
      trimText(proposal.objective || "dado ausente"),
      "",
      "2. Arquivo alvo",
      trimText(proposal.targetFile || "dado ausente"),
      "",
      "3. Risco",
      trimText(proposal.risk || "unknown"),
      "",
      "4. Patch mínimo sugerido",
      trimText(proposal.patchSummary || "dado ausente"),
      "",
      "5. Próximo passo mínimo recomendado",
      trimText(proposal.nextStep || "dado ausente"),
      "",
      "6. Observações",
      proposal.blocked
        ? ("Bloqueado por etapa humana pendente: " + trimText(proposal.blockedReason || "dado ausente"))
        : "Pronto para seguir para proposal ui / aprovação humana."
    ].join("\n");
  }

  function status() {
    return {
      version: VERSION,
      ready: !!state.ready,
      busy: !!state.busy,
      lastUpdate: state.lastUpdate || null,
      lastRunAt: state.lastRunAt || null,
      hasProposal: !!state.lastProposal,
      lastTargetFile: safe(function () { return state.lastProposal.targetFile; }, ""),
      lastRisk: safe(function () { return state.lastProposal.risk; }, "unknown"),
      lastBlocked: safe(function () { return !!state.lastProposal.blocked; }, false),
      historyCount: Array.isArray(state.history) ? state.history.length : 0
    };
  }

  function syncPresence() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAIAutoHeal");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAIAutoHeal", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAIAutoHeal");
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
      if (global.__RCF_FACTORY_AI_AUTOHEAL_EVENTS_V101) return;
      global.__RCF_FACTORY_AI_AUTOHEAL_EVENTS_V101 = true;

      global.addEventListener("RCF:FACTORY_AI_DIAGNOSTICS_REPORT", function () {
        try { scheduleScan("RCF:FACTORY_AI_DIAGNOSTICS_REPORT"); } catch (_) {}
      }, { passive: true });

      global.addEventListener("RCF:FACTORY_PHASE_CHANGED", function () {
        try { scheduleScan("RCF:FACTORY_PHASE_CHANGED"); } catch (_) {}
      }, { passive: true });

      global.addEventListener("RCF:FACTORY_AI_PLAN_READY", function () {
        try { scheduleScan("RCF:FACTORY_AI_PLAN_READY"); } catch (_) {}
      }, { passive: true });

      global.addEventListener("RCF:PATCH_STAGED", function () {
        try { scheduleScan("RCF:PATCH_STAGED"); } catch (_) {}
      }, { passive: true });

      global.addEventListener("RCF:PATCH_APPLIED", function () {
        try { scheduleScan("RCF:PATCH_APPLIED"); } catch (_) {}
      }, { passive: true });

      global.addEventListener("RCF:PATCH_APPLY_FAILED", function () {
        try { scheduleScan("RCF:PATCH_APPLY_FAILED"); } catch (_) {}
      }, { passive: true });
    } catch (_) {}
  }

  function init() {
    load();
    state.ready = true;
    state.version = VERSION;
    persist();
    syncPresence();
    bindEvents();

    pushLog("OK", "factory_ai_autoheal ready ✅ " + VERSION);
    return status();
  }

  global.RCF_FACTORY_AI_AUTOHEAL = {
    __v100: true,
    __v101: true,
    version: VERSION,
    init: init,
    status: status,
    scan: scan,
    scheduleScan: scheduleScan,
    getLastProposal: getLastProposal,
    explainLastProposal: explainLastProposal,
    buildProposalText: buildProposalText,
    getState: function () { return clone(state); }
  };

  try { init(); } catch (_) {}

})(window);
