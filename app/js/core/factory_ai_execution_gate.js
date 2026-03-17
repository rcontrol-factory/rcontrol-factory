/* FILE: /app/js/core/factory_ai_execution_gate.js
   RControl Factory — Factory AI Execution Gate
   v1.0.0 SUPERVISED EXECUTION GATE

   Objetivo:
   - transformar aprovação humana em execução real supervisionada
   - bloquear qualquer apply sem aprovação explícita
   - ligar proposal/bridge/runtime/patch supervisor/memory
   - impedir execução duplicada ou concorrente
   - registrar validate -> stage -> apply com rastreabilidade
   - devolver status claro para UI e supervisor
   - funcionar como script clássico
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_EXECUTION_GATE && global.RCF_FACTORY_AI_EXECUTION_GATE.__v100) return;

  var VERSION = "v1.0.0";
  var STORAGE_KEY = "rcf:factory_ai_execution_gate";
  var MAX_HISTORY = 100;

  var state = {
    version: VERSION,
    ready: false,
    busy: false,
    locked: false,
    lastUpdate: null,
    lastApprovalAt: null,
    lastPlanId: "",
    lastTargetFile: "",
    lastStatus: "idle",
    lastError: "",
    lastFlowResult: null,
    history: []
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

  function normalizePath(path) {
    var p = trimText(path || "").replace(/\\/g, "/");
    if (!p) return "";
    if (p.charAt(0) !== "/") p = "/" + p;
    p = p.replace(/\/{2,}/g, "/");
    return p;
  }

  function normalizeRisk(v) {
    var raw = trimText(v || "").toLowerCase();
    if (!raw) return "unknown";
    if (raw.indexOf("low") >= 0 || raw.indexOf("baixo") >= 0 || raw.indexOf("safe") >= 0 || raw.indexOf("seguro") >= 0) return "low";
    if (raw.indexOf("medium") >= 0 || raw.indexOf("médio") >= 0 || raw.indexOf("medio") >= 0) return "medium";
    if (raw.indexOf("high") >= 0 || raw.indexOf("alto") >= 0 || raw.indexOf("crit") >= 0) return "high";
    return "unknown";
  }

  function persist() {
    try {
      state.lastUpdate = nowISO();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: state.version,
        ready: !!state.ready,
        busy: !!state.busy,
        locked: !!state.locked,
        lastUpdate: state.lastUpdate,
        lastApprovalAt: state.lastApprovalAt,
        lastPlanId: state.lastPlanId,
        lastTargetFile: state.lastTargetFile,
        lastStatus: state.lastStatus,
        lastError: state.lastError,
        lastFlowResult: clone(state.lastFlowResult || null),
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
      state.locked = !!parsed.locked;
      state.lastUpdate = parsed.lastUpdate || null;
      state.lastApprovalAt = parsed.lastApprovalAt || null;
      state.lastPlanId = trimText(parsed.lastPlanId || "");
      state.lastTargetFile = normalizePath(parsed.lastTargetFile || "");
      state.lastStatus = trimText(parsed.lastStatus || "idle");
      state.lastError = trimText(parsed.lastError || "");
      state.lastFlowResult = clone(parsed.lastFlowResult || null);
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
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_EXECUTION_GATE] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_EXECUTION_GATE] " + msg);
      }
    } catch (_) {}

    try { console.log("[FACTORY_AI_EXECUTION_GATE]", level, msg, extra || ""); } catch (_) {}
  }

  function pushHistory(entry) {
    if (!Array.isArray(state.history)) state.history = [];
    state.history.push(clone(entry || {}));
    if (state.history.length > MAX_HISTORY) {
      state.history = state.history.slice(-MAX_HISTORY);
    }
    persist();
  }

  function getRuntime() {
    return safe(function () { return global.RCF_FACTORY_AI_RUNTIME || null; }, null);
  }

  function getBridge() {
    return safe(function () { return global.RCF_FACTORY_AI_BRIDGE || null; }, null);
  }

  function getPatchSupervisor() {
    return safe(function () { return global.RCF_PATCH_SUPERVISOR || null; }, null);
  }

  function getMemory() {
    return safe(function () { return global.RCF_FACTORY_AI_MEMORY || null; }, null);
  }

  function getAutoHeal() {
    return safe(function () { return global.RCF_FACTORY_AI_AUTOHEAL || null; }, null);
  }

  function getProposalUI() {
    return safe(function () { return global.RCF_FACTORY_AI_PROPOSAL_UI || null; }, null);
  }

  function getEvolutionMode() {
    return safe(function () { return global.RCF_FACTORY_AI_EVOLUTION_MODE || null; }, null);
  }

  function getPhaseEngine() {
    return safe(function () { return global.RCF_FACTORY_PHASE_ENGINE || null; }, null);
  }

  function getCurrentProposal() {
    var autoheal = getAutoHeal();
    if (autoheal && typeof autoheal.getLastProposal === "function") {
      var proposal = clone(autoheal.getLastProposal() || null);
      if (proposal && (proposal.id || proposal.targetFile || proposal.nextFile)) return proposal;
    }

    var bridge = getBridge();
    if (bridge && typeof bridge.getPendingPlan === "function") {
      var pending = clone(bridge.getPendingPlan() || null);
      if (pending && (pending.id || pending.targetFile || pending.nextFile)) return pending;
    }

    if (bridge && typeof bridge.getLastPlan === "function") {
      var last = clone(bridge.getLastPlan() || null);
      if (last && (last.id || last.targetFile || last.nextFile)) return last;
    }

    return null;
  }

  function getCurrentPlanId() {
    var runtime = getRuntime();

    try {
      if (runtime && typeof runtime.getApprovedPlan === "function") {
        var approved = runtime.getApprovedPlan();
        if (approved && approved.id) return trimText(approved.id);
      }
    } catch (_) {}

    try {
      if (runtime && typeof runtime.getPendingPlan === "function") {
        var pending = runtime.getPendingPlan();
        if (pending && pending.id) return trimText(pending.id);
      }
    } catch (_) {}

    var proposal = getCurrentProposal();
    return trimText(safe(function () { return proposal.id; }, ""));
  }

  function getCurrentTargetFile() {
    var proposal = getCurrentProposal();
    return normalizePath(
      safe(function () { return proposal.targetFile; }, "") ||
      safe(function () { return proposal.nextFile; }, "")
    );
  }

  function isApplyAllowedByPhase() {
    var phase = getPhaseEngine();
    if (!phase || typeof phase.buildPhaseContext !== "function") return true;

    var ctx = safe(function () { return phase.buildPhaseContext(); }, {}) || {};
    var allow = safe(function () { return ctx.activePhase.allow; }, {}) || {};

    if (typeof allow.apply === "boolean") return !!allow.apply;
    return true;
  }

  function rememberIntoMemory(kind, payload) {
    var memory = getMemory();
    if (!memory) return false;

    var data = clone(payload || {});
    var ok = false;

    try {
      if (kind === "approval" && typeof memory.rememberApproval === "function") {
        memory.rememberApproval(data);
        ok = true;
      } else if (kind === "patch" && typeof memory.rememberPatch === "function") {
        memory.rememberPatch(data);
        ok = true;
      } else if (kind === "decision" && typeof memory.rememberDecision === "function") {
        memory.rememberDecision(data);
        ok = true;
      } else if (kind === "error" && typeof memory.rememberError === "function") {
        memory.rememberError(data);
        ok = true;
      } else if (typeof memory.rememberNote === "function") {
        memory.rememberNote(data);
        ok = true;
      }
    } catch (_) {}

    return ok;
  }

  function summarizeResult(label, result) {
    return {
      ok: !!safe(function () { return result.ok; }, false),
      label: trimText(label || ""),
      planId: trimText(
        safe(function () { return result.planId; }, "") ||
        safe(function () { return result.summary.planId; }, "") ||
        state.lastPlanId
      ),
      targetFile: normalizePath(
        safe(function () { return result.targetFile; }, "") ||
        safe(function () { return result.summary.targetFile; }, "") ||
        state.lastTargetFile
      ),
      risk: normalizeRisk(
        safe(function () { return result.risk; }, "") ||
        safe(function () { return result.summary.risk; }, "")
      ),
      msg: trimText(
        safe(function () { return result.msg; }, "") ||
        safe(function () { return result.error; }, "")
      )
    };
  }

  function setBusy(on, status) {
    state.busy = !!on;
    if (status) state.lastStatus = trimText(status);
    persist();
  }

  function setLock(on) {
    state.locked = !!on;
    persist();
  }

  function buildGuardResult(ok, msg, extra) {
    return clone(Object.assign({
      ok: !!ok,
      msg: trimText(msg || "")
    }, clone(extra || {})));
  }

  function canExecute(planId) {
    if (state.busy) {
      return buildGuardResult(false, "execution gate ocupado", {
        code: "busy"
      });
    }

    if (state.locked) {
      return buildGuardResult(false, "execution gate bloqueado", {
        code: "locked"
      });
    }

    var targetPlanId = trimText(planId || getCurrentPlanId());
    if (!targetPlanId) {
      return buildGuardResult(false, "nenhum plano disponível", {
        code: "no_plan"
      });
    }

    if (!isApplyAllowedByPhase()) {
      return buildGuardResult(false, "fase atual não permite apply supervisionado ainda", {
        code: "phase_blocked",
        planId: targetPlanId
      });
    }

    return buildGuardResult(true, "execução permitida", {
      code: "ok",
      planId: targetPlanId,
      targetFile: getCurrentTargetFile()
    });
  }

  async function approvePlan(planId, meta) {
    var runtime = getRuntime();
    var bridge = getBridge();
    var targetPlanId = trimText(planId || getCurrentPlanId());

    if (!targetPlanId) {
      return buildGuardResult(false, "nenhum plano disponível para aprovação");
    }

    state.lastPlanId = targetPlanId;
    state.lastTargetFile = getCurrentTargetFile();
    state.lastStatus = "approving";
    persist();

    var result = null;

    try {
      if (runtime && typeof runtime.approvePlan === "function") {
        result = await runtime.approvePlan(targetPlanId, meta || {});
      } else if (bridge && typeof bridge.approvePlan === "function") {
        result = bridge.approvePlan(targetPlanId, meta || {});
      } else {
        result = buildGuardResult(false, "runtime/bridge indisponível para aprovação");
      }
    } catch (e) {
      result = buildGuardResult(false, String(e && e.message || e || "erro ao aprovar plano"));
    }

    var summary = summarizeResult("approve", result);
    if (summary.ok) {
      state.lastApprovalAt = nowISO();
      state.lastApprovedPlanId = targetPlanId;
      state.lastStatus = "approved";
      state.lastError = "";
      persist();

      rememberIntoMemory("approval", {
        title: "Plano aprovado pelo Execution Gate",
        summary: "Aprovação humana confirmada para seguir no fluxo supervisionado.",
        planId: targetPlanId,
        targetFile: normalizePath(summary.targetFile || state.lastTargetFile),
        risk: normalizeRisk(summary.risk),
        approvalStatus: "approved",
        tags: ["approval", "execution-gate", "approved"],
        source: "factory_ai_execution_gate",
        meta: clone(meta || {})
      });

      emit("RCF:FACTORY_AI_EXECUTION_GATE_APPROVED", {
        planId: targetPlanId,
        targetFile: normalizePath(summary.targetFile || state.lastTargetFile),
        result: clone(result || {})
      });

      pushLog("OK", "approvePlan ✅", {
        planId: targetPlanId,
        targetFile: normalizePath(summary.targetFile || state.lastTargetFile)
      });
    } else {
      state.lastStatus = "approval-failed";
      state.lastError = summary.msg;
      persist();

      rememberIntoMemory("error", {
        title: "Falha na aprovação pelo Execution Gate",
        summary: summary.msg || "Falha ao aprovar plano supervisionado.",
        planId: targetPlanId,
        targetFile: normalizePath(summary.targetFile || state.lastTargetFile),
        tags: ["approval", "execution-gate", "error"],
        source: "factory_ai_execution_gate",
        meta: clone(result || {})
      });

      pushLog("ERR", "approvePlan falhou", {
        planId: targetPlanId,
        msg: summary.msg
      });
    }

    pushHistory({
      type: summary.ok ? "approve-ok" : "approve-fail",
      ts: nowISO(),
      planId: targetPlanId,
      targetFile: normalizePath(summary.targetFile || state.lastTargetFile),
      result: clone(result || {})
    });

    return clone(result || buildGuardResult(false, "falha ao aprovar plano"));
  }

  async function validateApprovedPlan(planId) {
    var runtime = getRuntime();
    var supervisor = getPatchSupervisor();
    var targetPlanId = trimText(planId || getCurrentPlanId());

    if (!targetPlanId) {
      return buildGuardResult(false, "nenhum plano aprovado disponível para validação");
    }

    state.lastPlanId = targetPlanId;
    state.lastStatus = "validating";
    persist();

    var result = null;

    try {
      if (runtime && typeof runtime.validateApprovedPlan === "function") {
        result = await runtime.validateApprovedPlan(targetPlanId);
      } else if (supervisor && typeof supervisor.validateApprovedPlan === "function") {
        result = supervisor.validateApprovedPlan(targetPlanId);
      } else {
        result = buildGuardResult(false, "runtime/patch supervisor indisponível para validação");
      }
    } catch (e) {
      result = buildGuardResult(false, String(e && e.message || e || "erro ao validar plano"));
    }

    var summary = summarizeResult("validate", result);
    if (summary.ok) {
      state.lastStatus = "validated";
      state.lastError = "";
    } else {
      state.lastStatus = "validate-failed";
      state.lastError = summary.msg;
    }
    persist();

    pushHistory({
      type: summary.ok ? "validate-ok" : "validate-fail",
      ts: nowISO(),
      planId: targetPlanId,
      targetFile: normalizePath(summary.targetFile || state.lastTargetFile),
      result: clone(result || {})
    });

    emit("RCF:FACTORY_AI_EXECUTION_GATE_VALIDATED", {
      planId: targetPlanId,
      targetFile: normalizePath(summary.targetFile || state.lastTargetFile),
      result: clone(result || {})
    });

    pushLog(summary.ok ? "OK" : "WARN", "validateApprovedPlan", {
      planId: targetPlanId,
      ok: summary.ok,
      msg: summary.msg
    });

    return clone(result || buildGuardResult(false, "falha na validação"));
  }

  async function stageApprovedPlan(planId) {
    var runtime = getRuntime();
    var supervisor = getPatchSupervisor();
    var targetPlanId = trimText(planId || getCurrentPlanId());

    if (!targetPlanId) {
      return buildGuardResult(false, "nenhum plano aprovado disponível para stage");
    }

    state.lastPlanId = targetPlanId;
    state.lastStatus = "staging";
    persist();

    var result = null;

    try {
      if (runtime && typeof runtime.stageApprovedPlan === "function") {
        result = await runtime.stageApprovedPlan(targetPlanId);
      } else if (supervisor && typeof supervisor.stageApprovedPlan === "function") {
        result = await supervisor.stageApprovedPlan(targetPlanId);
      } else {
        result = buildGuardResult(false, "runtime/patch supervisor indisponível para stage");
      }
    } catch (e) {
      result = buildGuardResult(false, String(e && e.message || e || "erro ao fazer stage"));
    }

    var summary = summarizeResult("stage", result);
    if (summary.ok) {
      state.lastStatus = "staged";
      state.lastError = "";
      state.lastTargetFile = normalizePath(summary.targetFile || state.lastTargetFile);
      persist();

      rememberIntoMemory("patch", {
        title: "Patch staged pelo Execution Gate",
        summary: "Patch preparado com sucesso para execução supervisionada.",
        planId: targetPlanId,
        targetFile: normalizePath(summary.targetFile || state.lastTargetFile),
        risk: normalizeRisk(summary.risk),
        approvalStatus: "approved",
        tags: ["patch", "staged", "execution-gate"],
        source: "factory_ai_execution_gate",
        meta: clone(result || {})
      });
    } else {
      state.lastStatus = "stage-failed";
      state.lastError = summary.msg;
      persist();
    }

    pushHistory({
      type: summary.ok ? "stage-ok" : "stage-fail",
      ts: nowISO(),
      planId: targetPlanId,
      targetFile: normalizePath(summary.targetFile || state.lastTargetFile),
      result: clone(result || {})
    });

    emit("RCF:FACTORY_AI_EXECUTION_GATE_STAGED", {
      planId: targetPlanId,
      targetFile: normalizePath(summary.targetFile || state.lastTargetFile),
      result: clone(result || {})
    });

    pushLog(summary.ok ? "OK" : "WARN", "stageApprovedPlan", {
      planId: targetPlanId,
      ok: summary.ok,
      msg: summary.msg
    });

    return clone(result || buildGuardResult(false, "falha no stage"));
  }

  async function applyApprovedPlan(planId, opts) {
    var runtime = getRuntime();
    var supervisor = getPatchSupervisor();
    var targetPlanId = trimText(planId || getCurrentPlanId());

    if (!targetPlanId) {
      return buildGuardResult(false, "nenhum plano aprovado disponível para apply");
    }

    if (!isApplyAllowedByPhase()) {
      return buildGuardResult(false, "fase atual ainda bloqueia apply supervisionado", {
        planId: targetPlanId
      });
    }

    state.lastPlanId = targetPlanId;
    state.lastStatus = "applying";
    persist();

    var result = null;

    try {
      if (runtime && typeof runtime.applyApprovedPlan === "function") {
        result = await runtime.applyApprovedPlan(targetPlanId, opts || {});
      } else if (supervisor && typeof supervisor.applyApprovedPlan === "function") {
        result = await supervisor.applyApprovedPlan(targetPlanId, opts || {});
      } else {
        result = buildGuardResult(false, "runtime/patch supervisor indisponível para apply");
      }
    } catch (e) {
      result = buildGuardResult(false, String(e && e.message || e || "erro ao aplicar plano"));
    }

    var summary = summarizeResult("apply", result);
    state.lastTargetFile = normalizePath(summary.targetFile || state.lastTargetFile);

    if (summary.ok) {
      state.lastStatus = "applied";
      state.lastError = "";
      state.lastFlowResult = clone(result || {});
      persist();

      rememberIntoMemory("patch", {
        title: "Patch aplicado pelo Execution Gate",
        summary: "Patch aplicado com sucesso após aprovação humana.",
        planId: targetPlanId,
        targetFile: normalizePath(summary.targetFile || state.lastTargetFile),
        risk: normalizeRisk(summary.risk),
        approvalStatus: "approved",
        tags: ["patch", "applied", "execution-gate"],
        source: "factory_ai_execution_gate",
        meta: clone(result || {})
      });
    } else {
      state.lastStatus = "apply-failed";
      state.lastError = summary.msg;
      state.lastFlowResult = clone(result || {});
      persist();

      rememberIntoMemory("error", {
        title: "Falha no apply pelo Execution Gate",
        summary: summary.msg || "Falha ao aplicar patch supervisionado.",
        planId: targetPlanId,
        targetFile: normalizePath(summary.targetFile || state.lastTargetFile),
        tags: ["patch", "apply", "execution-gate", "error"],
        source: "factory_ai_execution_gate",
        meta: clone(result || {})
      });
    }

    pushHistory({
      type: summary.ok ? "apply-ok" : "apply-fail",
      ts: nowISO(),
      planId: targetPlanId,
      targetFile: normalizePath(summary.targetFile || state.lastTargetFile),
      result: clone(result || {})
    });

    emit(summary.ok ? "RCF:FACTORY_AI_EXECUTION_GATE_APPLIED" : "RCF:FACTORY_AI_EXECUTION_GATE_APPLY_FAILED", {
      planId: targetPlanId,
      targetFile: normalizePath(summary.targetFile || state.lastTargetFile),
      result: clone(result || {})
    });

    pushLog(summary.ok ? "OK" : "ERR", "applyApprovedPlan", {
      planId: targetPlanId,
      ok: summary.ok,
      targetFile: normalizePath(summary.targetFile || state.lastTargetFile),
      msg: summary.msg
    });

    return clone(result || buildGuardResult(false, "falha no apply"));
  }

  async function runApprovedFlow(input) {
    var opts = clone(input || {});
    var targetPlanId = trimText(opts.planId || getCurrentPlanId());
    var gate = canExecute(targetPlanId);

    if (!gate.ok) {
      return clone(gate);
    }

    setLock(true);
    setBusy(true, "running-approved-flow");
    state.lastPlanId = targetPlanId;
    state.lastTargetFile = normalizePath(opts.targetFile || getCurrentTargetFile());
    state.lastError = "";
    persist();

    emit("RCF:FACTORY_AI_EXECUTION_GATE_FLOW_START", {
      planId: targetPlanId,
      targetFile: state.lastTargetFile
    });

    try {
      var approved = await approvePlan(targetPlanId, clone(opts.meta || {}));
      if (!approved || !approved.ok) {
        return {
          ok: false,
          stage: "approve",
          planId: targetPlanId,
          result: clone(approved || {})
        };
      }

      var validated = await validateApprovedPlan(targetPlanId);
      if (!validated || !validated.ok) {
        return {
          ok: false,
          stage: "validate",
          planId: targetPlanId,
          result: clone(validated || {})
        };
      }

      var staged = await stageApprovedPlan(targetPlanId);
      if (!staged || !staged.ok) {
        return {
          ok: false,
          stage: "stage",
          planId: targetPlanId,
          result: clone(staged || {})
        };
      }

      if (opts.approveOnly === true) {
        var stageOnly = {
          ok: true,
          stage: "stage",
          planId: targetPlanId,
          targetFile: normalizePath(
            safe(function () { return staged.targetFile; }, "") ||
            state.lastTargetFile
          ),
          msg: "Fluxo concluído até stage. Apply mantido para momento posterior."
        };

        state.lastStatus = "staged";
        state.lastFlowResult = clone(stageOnly);
        persist();

        emit("RCF:FACTORY_AI_EXECUTION_GATE_FLOW_DONE", clone(stageOnly));
        return stageOnly;
      }

      var applied = await applyApprovedPlan(targetPlanId, clone(opts.applyOptions || {}));
      if (!applied || !applied.ok) {
        return {
          ok: false,
          stage: "apply",
          planId: targetPlanId,
          result: clone(applied || {})
        };
      }

      var done = {
        ok: true,
        stage: "done",
        planId: targetPlanId,
        targetFile: normalizePath(
          safe(function () { return applied.targetFile; }, "") ||
          state.lastTargetFile
        ),
        approved: clone(approved || {}),
        validated: clone(validated || {}),
        staged: clone(staged || {}),
        applied: clone(applied || {})
      };

      state.lastStatus = "done";
      state.lastFlowResult = clone(done);
      state.lastError = "";
      persist();

      emit("RCF:FACTORY_AI_EXECUTION_GATE_FLOW_DONE", clone(done));
      pushLog("OK", "runApprovedFlow ✅", {
        planId: targetPlanId,
        targetFile: done.targetFile
      });

      return done;
    } catch (e) {
      var fail = {
        ok: false,
        stage: "exception",
        planId: targetPlanId,
        msg: String(e && e.message || e || "falha no fluxo supervisionado")
      };

      state.lastStatus = "flow-failed";
      state.lastError = fail.msg;
      state.lastFlowResult = clone(fail);
      persist();

      rememberIntoMemory("error", {
        title: "Falha no fluxo supervisionado do Execution Gate",
        summary: fail.msg,
        planId: targetPlanId,
        targetFile: normalizePath(state.lastTargetFile || ""),
        tags: ["execution-gate", "flow", "error"],
        source: "factory_ai_execution_gate",
        meta: clone(fail)
      });

      emit("RCF:FACTORY_AI_EXECUTION_GATE_FLOW_FAILED", clone(fail));
      pushLog("ERR", "runApprovedFlow exception", fail);
      return fail;
    } finally {
      setBusy(false, state.lastStatus || "idle");
      setLock(false);
    }
  }

  async function approveAndRun(planId, meta) {
    return runApprovedFlow({
      planId: planId,
      meta: clone(meta || {}),
      approveOnly: false
    });
  }

  async function approveValidateStage(planId, meta) {
    return runApprovedFlow({
      planId: planId,
      meta: clone(meta || {}),
      approveOnly: true
    });
  }

  function clearLock() {
    state.locked = false;
    state.busy = false;
    if (state.lastStatus === "running-approved-flow") {
      state.lastStatus = "idle";
    }
    persist();

    emit("RCF:FACTORY_AI_EXECUTION_GATE_UNLOCKED", {
      ok: true
    });

    pushLog("WARN", "execution gate unlocked manually");
    return true;
  }

  function status() {
    return {
      version: VERSION,
      ready: !!state.ready,
      busy: !!state.busy,
      locked: !!state.locked,
      lastUpdate: state.lastUpdate || null,
      lastApprovalAt: state.lastApprovalAt || null,
      lastPlanId: state.lastPlanId || "",
      lastTargetFile: state.lastTargetFile || "",
      lastStatus: state.lastStatus || "idle",
      lastError: state.lastError || "",
      hasFlowResult: !!state.lastFlowResult,
      historyCount: Array.isArray(state.history) ? state.history.length : 0,
      phaseApplyAllowed: !!isApplyAllowedByPhase()
    };
  }

  function syncPresence() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAIExecutionGate");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAIExecutionGate", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAIExecutionGate");
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
      global.addEventListener("RCF:FACTORY_AI_AUTOHEAL_PROPOSAL", function (ev) {
        try {
          var detail = ev && ev.detail ? ev.detail : {};
          var proposal = detail.proposal || {};
          state.lastPlanId = trimText(proposal.id || state.lastPlanId);
          state.lastTargetFile = normalizePath(proposal.targetFile || proposal.nextFile || state.lastTargetFile);
          persist();
        } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      global.addEventListener("RCF:PATCH_APPLIED", function (ev) {
        try {
          var detail = ev && ev.detail ? ev.detail : {};
          state.lastPlanId = trimText(detail.planId || state.lastPlanId);
          state.lastTargetFile = normalizePath(detail.targetFile || state.lastTargetFile);
          state.lastStatus = "applied";
          state.lastError = "";
          persist();
        } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      global.addEventListener("RCF:PATCH_APPLY_FAILED", function (ev) {
        try {
          var detail = ev && ev.detail ? ev.detail : {};
          state.lastPlanId = trimText(detail.planId || state.lastPlanId);
          state.lastTargetFile = normalizePath(detail.targetFile || state.lastTargetFile);
          state.lastStatus = "apply-failed";
          state.lastError = trimText(detail.msg || state.lastError);
          persist();
        } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      global.addEventListener("RCF:FACTORY_AI_MODE_CHANGED", function () {
        try { persist(); } catch (_) {}
      }, { passive: true });
    } catch (_) {}

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
    state.busy = false;
    persist();
    syncPresence();
    bindEvents();

    pushLog("OK", "factory_ai_execution_gate ready ✅ " + VERSION);
    return status();
  }

  global.RCF_FACTORY_AI_EXECUTION_GATE = {
    __v100: true,
    version: VERSION,
    init: init,
    status: status,
    canExecute: canExecute,
    getCurrentPlanId: getCurrentPlanId,
    getCurrentProposal: getCurrentProposal,
    approvePlan: approvePlan,
    validateApprovedPlan: validateApprovedPlan,
    stageApprovedPlan: stageApprovedPlan,
    applyApprovedPlan: applyApprovedPlan,
    approveValidateStage: approveValidateStage,
    approveAndRun: approveAndRun,
    runApprovedFlow: runApprovedFlow,
    clearLock: clearLock,
    getState: function () { return clone(state); }
  };

  try { init(); } catch (_) {}

})(window);
