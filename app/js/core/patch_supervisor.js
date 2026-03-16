/* FILE: /app/js/core/patch_supervisor.js
   RControl Factory — Patch Supervisor
   v1.0.0 SUPERVISED APPLY LAYER

   Objetivo:
   - consumir planos aprovados vindos da Factory AI Bridge
   - validar risco / alvo / conteúdo antes de qualquer apply
   - NUNCA aplicar automaticamente sem aprovação explícita
   - preparar execução supervisionada em camadas
   - escrever preferencialmente em Overrides VFS quando disponível
   - manter fallback seguro em State.pending / localStorage
   - expor API global via window.RCF_PATCH_SUPERVISOR
   - funcionar como script clássico
*/

;(function (global) {
  "use strict";

  if (global.RCF_PATCH_SUPERVISOR && global.RCF_PATCH_SUPERVISOR.__v100) return;

  var VERSION = "v1.0.0";
  var STORAGE_KEY = "rcf:patch_supervisor";
  var APPLY_LOG_KEY = "rcf:patch_supervisor_apply_log";
  var MAX_LOG = 60;

  var state = {
    version: VERSION,
    ready: false,
    lastUpdate: null,
    lastPlanId: "",
    lastValidation: null,
    lastApply: null,
    applyCount: 0,
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

  function trimText(v) {
    return String(v == null ? "" : v).trim();
  }

  function safe(fn, fallback) {
    try {
      var v = fn();
      return v === undefined ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  function safeParse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; }
    catch (_) { return fallback; }
  }

  function merge(base, patch) {
    if (!patch || typeof patch !== "object") return base;

    Object.keys(patch).forEach(function (key) {
      var a = base[key];
      var b = patch[key];

      if (
        a && typeof a === "object" && !Array.isArray(a) &&
        b && typeof b === "object" && !Array.isArray(b)
      ) {
        base[key] = merge(clone(a), b);
      } else {
        base[key] = b;
      }
    });

    return base;
  }

  function persist() {
    try {
      state.lastUpdate = nowISO();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
      state = merge(clone(state), parsed);
      return true;
    } catch (_) {
      return false;
    }
  }

  function pushLog(level, msg, extra) {
    try {
      if (extra !== undefined) {
        global.RCF_LOGGER?.push?.(level, "[PATCH_SUPERVISOR] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[PATCH_SUPERVISOR] " + msg);
      }
    } catch (_) {}

    try { console.log("[PATCH_SUPERVISOR]", level, msg, extra || ""); } catch (_) {}
  }

  function readApplyLog() {
    return safeParse(localStorage.getItem(APPLY_LOG_KEY), []);
  }

  function writeApplyLog(list) {
    try { localStorage.setItem(APPLY_LOG_KEY, JSON.stringify(Array.isArray(list) ? list : [])); } catch (_) {}
  }

  function appendApplyLog(item) {
    var arr = readApplyLog();
    arr.push(clone(item || {}));
    if (arr.length > MAX_LOG) arr = arr.slice(-MAX_LOG);
    writeApplyLog(arr);
  }

  function normalizePath(path) {
    var p = trimText(path || "").replace(/\\/g, "/");
    if (!p) return "";
    if (p.indexOf("/") !== 0) p = "/" + p;
    p = p.replace(/\/{2,}/g, "/");
    return p;
  }

  function isAllowedPath(path) {
    var p = normalizePath(path);
    if (!p) return false;

    return (
      p.indexOf("/app/") === 0 ||
      p.indexOf("/functions/") === 0
    );
  }

  function normalizeRisk(value) {
    var raw = trimText(value).toLowerCase();
    if (!raw) return "unknown";
    if (raw.indexOf("low") >= 0 || raw.indexOf("baixo") >= 0 || raw.indexOf("safe") >= 0 || raw.indexOf("seguro") >= 0) return "low";
    if (raw.indexOf("medium") >= 0 || raw.indexOf("médio") >= 0 || raw.indexOf("medio") >= 0) return "medium";
    if (raw.indexOf("high") >= 0 || raw.indexOf("alto") >= 0 || raw.indexOf("critico") >= 0 || raw.indexOf("crítico") >= 0) return "high";
    return "unknown";
  }

  function buildValidation(plan) {
    var p = plan || {};
    var targetFile = normalizePath(p.targetFile || "");
    var proposedCode = String(p.proposedCode || "");
    var risk = normalizeRisk(p.risk || p.riskText || "");
    var issues = [];
    var warnings = [];

    if (!p || typeof p !== "object") {
      issues.push("plano ausente");
    }

    if (!p.id) {
      issues.push("planId ausente");
    }

    if (!targetFile) {
      issues.push("arquivo alvo ausente");
    }

    if (targetFile && !isAllowedPath(targetFile)) {
      issues.push("arquivo alvo fora do escopo permitido");
    }

    if (!proposedCode) {
      warnings.push("plano sem código sugerido");
    }

    if (risk === "high") {
      warnings.push("risco alto detectado");
    }

    if (risk === "unknown") {
      warnings.push("risco não consolidado");
    }

    return {
      ok: issues.length === 0,
      planId: String(p.id || ""),
      targetFile: targetFile,
      risk: risk,
      hasCode: !!proposedCode,
      issues: issues,
      warnings: warnings,
      checkedAt: nowISO()
    };
  }

  function getBridge() {
    return safe(function () {
      return global.RCF_FACTORY_AI_BRIDGE || null;
    }, null);
  }

  function getApprovedPlan(planId) {
    var bridge = getBridge();
    if (!bridge) return null;

    var can = false;
    try {
      can = !!bridge.canApplyApprovedPlan?.(planId);
    } catch (_) {}

    if (!can) return null;

    var plan = null;
    try {
      plan = bridge.getLastPlan?.() || null;
    } catch (_) {}

    if (!plan || typeof plan !== "object") return null;
    if (planId && String(plan.id || "") !== String(planId || "")) return null;

    return clone(plan);
  }

  function ensurePendingShape(obj) {
    var x = clone(obj || {});
    if (!x || typeof x !== "object") x = {};
    if (!x.patch || typeof x.patch !== "object") x.patch = null;
    if (!x.source) x.source = "";
    return x;
  }

  function writePendingPatch(plan, meta) {
    var pending = {
      patch: {
        id: String(plan.id || ""),
        targetFile: normalizePath(plan.targetFile || ""),
        code: String(plan.proposedCode || ""),
        lang: trimText(plan.proposedLang || ""),
        risk: normalizeRisk(plan.risk || plan.riskText || ""),
        summary: trimText(plan.patchSummary || plan.objective || ""),
        suggestedFiles: Array.isArray(plan.suggestedFiles) ? plan.suggestedFiles.slice(0, 20) : [],
        approvalStatus: trimText(plan.approvalStatus || "approved"),
        createdAt: trimText(plan.createdAt || nowISO())
      },
      source: "RCF_PATCH_SUPERVISOR",
      meta: clone(meta || {})
    };

    try {
      if (global.RCF && global.RCF.state) {
        global.RCF.state.pending = ensurePendingShape(pending);
        if (typeof global.RCF.state.pending === "object") {
          global.RCF.state.pending.patch = pending.patch;
          global.RCF.state.pending.source = pending.source;
          global.RCF.state.pending.meta = pending.meta;
        }
      }
    } catch (_) {}

    try {
      if (global.RCF_FACTORY_STATE?.setState) {
        global.RCF_FACTORY_STATE.setState({
          pendingPatch: {
            id: pending.patch.id,
            targetFile: pending.patch.targetFile,
            risk: pending.patch.risk,
            source: pending.source,
            updatedAt: nowISO()
          }
        });
      }
    } catch (_) {}

    try {
      localStorage.setItem("rcf:pending", JSON.stringify(pending));
    } catch (_) {}

    try {
      if (global.RCF?.state && typeof global.RCF.saveAll === "function") {
        global.RCF.saveAll("patch_supervisor.writePendingPatch");
      }
    } catch (_) {}

    return pending;
  }

  function getOverrideVFS() {
    return safe(function () {
      return global.RCF_OVERRIDES_VFS || null;
    }, null);
  }

  async function readCurrentFile(path) {
    var p = normalizePath(path);
    if (!p) return "";

    try {
      var vfs = getOverrideVFS();
      if (vfs && typeof vfs.readFile === "function") {
        var txt = await vfs.readFile(p);
        if (txt != null) return String(txt);
      }
    } catch (_) {}

    return "";
  }

  async function writeOverrideFile(path, content) {
    var p = normalizePath(path);
    var txt = String(content || "");
    var vfs = getOverrideVFS();

    if (!vfs || typeof vfs.writeFile !== "function") {
      return { ok: false, mode: "none", msg: "Overrides VFS indisponível" };
    }

    try {
      await vfs.writeFile(p, txt);
      return { ok: true, mode: "overrides_vfs", path: p };
    } catch (e) {
      return { ok: false, mode: "overrides_vfs", path: p, msg: String(e && e.message || e) };
    }
  }

  function syncFactoryStateAfterApply(plan, mode) {
    try {
      if (global.RCF_FACTORY_STATE?.setState) {
        global.RCF_FACTORY_STATE.setState({
          lastAppliedPatch: {
            id: String(plan.id || ""),
            targetFile: normalizePath(plan.targetFile || ""),
            risk: normalizeRisk(plan.risk || plan.riskText || ""),
            mode: String(mode || "unknown"),
            ts: nowISO()
          }
        });
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

  function syncFactoryPresence() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("patchSupervisor");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("patchSupervisor", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("patchSupervisor");
      } else if (global.RCF_MODULE_REGISTRY?.refresh) {
        global.RCF_MODULE_REGISTRY.refresh();
      }
    } catch (_) {}
  }

  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function status() {
    return {
      version: VERSION,
      ready: !!state.ready,
      lastUpdate: state.lastUpdate || null,
      lastPlanId: state.lastPlanId || "",
      applyCount: Number(state.applyCount || 0),
      lastValidation: clone(state.lastValidation || null),
      lastApply: clone(state.lastApply || null),
      historyCount: Array.isArray(state.history) ? state.history.length : 0
    };
  }

  function validateApprovedPlan(planId) {
    var plan = getApprovedPlan(planId);
    if (!plan) {
      var noPlan = {
        ok: false,
        planId: trimText(planId || ""),
        targetFile: "",
        risk: "unknown",
        hasCode: false,
        issues: ["plano aprovado não encontrado"],
        warnings: [],
        checkedAt: nowISO()
      };
      state.lastValidation = clone(noPlan);
      persist();
      return noPlan;
    }

    var validation = buildValidation(plan);
    state.lastPlanId = String(plan.id || "");
    state.lastValidation = clone(validation);
    persist();
    return validation;
  }

  async function stageApprovedPlan(planId) {
    var plan = getApprovedPlan(planId);
    if (!plan) {
      return { ok: false, msg: "plano aprovado não encontrado" };
    }

    var validation = buildValidation(plan);
    state.lastPlanId = String(plan.id || "");
    state.lastValidation = clone(validation);

    if (!validation.ok) {
      persist();
      return { ok: false, msg: "validação falhou", validation: validation };
    }

    var pending = writePendingPatch(plan, {
      stagedAt: nowISO(),
      stagedBy: "RCF_PATCH_SUPERVISOR",
      validation: clone(validation)
    });

    persist();

    emit("RCF:PATCH_STAGED", {
      planId: plan.id,
      targetFile: validation.targetFile,
      risk: validation.risk
    });

    pushLog("OK", "patch staged ✅", {
      planId: plan.id,
      targetFile: validation.targetFile,
      risk: validation.risk
    });

    return {
      ok: true,
      mode: "staged",
      pending: pending,
      validation: validation
    };
  }

  async function applyApprovedPlan(planId, opts) {
    var options = clone(opts || {});
    var plan = getApprovedPlan(planId);

    if (!plan) {
      return { ok: false, msg: "plano aprovado não encontrado" };
    }

    var validation = buildValidation(plan);
    state.lastPlanId = String(plan.id || "");
    state.lastValidation = clone(validation);

    if (!validation.ok) {
      persist();
      return { ok: false, msg: "validação falhou", validation: validation };
    }

    if (!validation.hasCode) {
      persist();
      return { ok: false, msg: "plano sem código para apply", validation: validation };
    }

    var previousText = await readCurrentFile(validation.targetFile);
    var writeResult = await writeOverrideFile(validation.targetFile, plan.proposedCode);

    if (!writeResult.ok) {
      state.lastApply = {
        ok: false,
        planId: String(plan.id || ""),
        targetFile: validation.targetFile,
        mode: writeResult.mode || "none",
        ts: nowISO(),
        msg: writeResult.msg || "falha ao aplicar"
      };
      persist();

      appendApplyLog(state.lastApply);
      emit("RCF:PATCH_APPLY_FAILED", clone(state.lastApply));
      pushLog("ERR", "apply falhou", state.lastApply);

      return {
        ok: false,
        msg: state.lastApply.msg,
        validation: validation,
        apply: clone(state.lastApply)
      };
    }

    var consumeResult = { ok: false };
    try {
      consumeResult = getBridge()?.consumeApprovedPlan?.(plan.id) || { ok: false };
    } catch (_) {}

    state.applyCount = Number(state.applyCount || 0) + 1;
    state.lastApply = {
      ok: true,
      planId: String(plan.id || ""),
      targetFile: validation.targetFile,
      mode: writeResult.mode || "overrides_vfs",
      ts: nowISO(),
      previousLength: String(previousText || "").length,
      nextLength: String(plan.proposedCode || "").length,
      risk: validation.risk,
      consumed: !!consumeResult.ok,
      force: !!options.force
    };

    if (!Array.isArray(state.history)) state.history = [];
    state.history.push({
      type: "apply",
      ts: state.lastApply.ts,
      planId: state.lastApply.planId,
      targetFile: state.lastApply.targetFile,
      risk: state.lastApply.risk,
      mode: state.lastApply.mode
    });
    if (state.history.length > 40) {
      state.history = state.history.slice(-40);
    }

    persist();
    appendApplyLog(state.lastApply);
    syncFactoryStateAfterApply(plan, state.lastApply.mode);

    emit("RCF:PATCH_APPLIED", clone(state.lastApply));
    pushLog("OK", "patch aplicado ✅", {
      planId: state.lastApply.planId,
      targetFile: state.lastApply.targetFile,
      mode: state.lastApply.mode,
      risk: state.lastApply.risk
    });

    return {
      ok: true,
      validation: validation,
      apply: clone(state.lastApply)
    };
  }

  function getApplyLog() {
    return clone(readApplyLog());
  }

  function getLastApply() {
    return clone(state.lastApply || null);
  }

  function getLastValidation() {
    return clone(state.lastValidation || null);
  }

  function resetPending() {
    try {
      if (global.RCF && global.RCF.state) {
        global.RCF.state.pending = { patch: null, source: "", meta: {} };
      }
    } catch (_) {}

    try {
      localStorage.setItem("rcf:pending", JSON.stringify({ patch: null, source: "", meta: {} }));
    } catch (_) {}

    emit("RCF:PATCH_PENDING_RESET", { ok: true });
    return true;
  }

  function init() {
    load();
    state.ready = true;
    state.version = VERSION;
    state.lastUpdate = nowISO();
    persist();
    syncFactoryPresence();
    pushLog("OK", "patch_supervisor ready ✅ " + VERSION);
    return status();
  }

  global.RCF_PATCH_SUPERVISOR = {
    __v100: true,
    version: VERSION,
    init: init,
    status: status,
    getState: function () { return clone(state); },
    getLastApply: getLastApply,
    getLastValidation: getLastValidation,
    getApplyLog: getApplyLog,
    validateApprovedPlan: validateApprovedPlan,
    stageApprovedPlan: stageApprovedPlan,
    applyApprovedPlan: applyApprovedPlan,
    resetPending: resetPending
  };

  try { init(); } catch (_) {}

})(window);
