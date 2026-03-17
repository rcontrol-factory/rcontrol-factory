/* FILE: /app/js/core/patch_supervisor.js
   RControl Factory — Patch Supervisor
   v1.0.1 SUPERVISED PATCH FLOW + SAFE WRITER FALLBACK

   Objetivo:
   - supervisionar fluxo de patch aprovado pela Factory AI
   - ligar Factory AI Bridge + runtime da Factory + arquivos alvo
   - validar plano antes de stage/apply
   - manter apply bloqueado sem aprovação explícita
   - preparar stage seguro antes de apply
   - NÃO executar patch automático sem aprovação
   - expor API global via window.RCF_PATCH_SUPERVISOR
   - funcionar como script clássico

   PATCH v1.0.1:
   - FIX: aceita targetFile OU nextFile
   - FIX: validação mais forte + contexto adicional
   - FIX: writer com mais fallbacks seguros
   - FIX: stage/apply mais consistente no Safari/PWA
   - FIX: status expõe melhor staged/apply state
*/

;(function (global) {
  "use strict";

  if (global.RCF_PATCH_SUPERVISOR && global.RCF_PATCH_SUPERVISOR.__v101) return;

  var VERSION = "v1.0.1";
  var STORAGE_KEY = "rcf:patch_supervisor";
  var MAX_HISTORY = 80;

  var state = {
    version: VERSION,
    ready: false,
    lastUpdate: null,
    stagedPlanId: "",
    stagedPatch: null,
    lastValidationResult: null,
    lastApplyResult: null,
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

  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function pushHistory(entry) {
    if (!Array.isArray(state.history)) state.history = [];
    state.history.push(clone(entry || {}));
    if (state.history.length > MAX_HISTORY) {
      state.history = state.history.slice(-MAX_HISTORY);
    }
    persist();
  }

  function getBridge() {
    return safe(function () { return global.RCF_FACTORY_AI_BRIDGE || null; }, null);
  }

  function getFactoryState() {
    return safe(function () {
      if (global.RCF_FACTORY_STATE?.getState) return global.RCF_FACTORY_STATE.getState();
      if (global.RCF_FACTORY_STATE?.status) return global.RCF_FACTORY_STATE.status();
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

  function getActiveApp() {
    return safe(function () {
      return global.RCF?.state?.active?.appSlug || "";
    }, "");
  }

  function getKnownFilesFromSnapshot() {
    var snapshot = getContextSnapshot();
    var tree = safe(function () { return snapshot.tree; }, {}) || {};
    var groups = safe(function () { return tree.pathGroups; }, {}) || {};
    var samples = Array.isArray(tree.samples) ? tree.samples.slice() : [];
    var out = []
      .concat(samples)
      .concat(Array.isArray(groups.core) ? groups.core : [])
      .concat(Array.isArray(groups.ui) ? groups.ui : [])
      .concat(Array.isArray(groups.admin) ? groups.admin : [])
      .concat(Array.isArray(groups.engine) ? groups.engine : [])
      .concat(Array.isArray(groups.functions) ? groups.functions : [])
      .concat(Array.isArray(snapshot.candidateFiles) ? snapshot.candidateFiles : []);

    var uniq = [];
    var seen = {};

    out.forEach(function (item) {
      var p = normalizePath(item);
      if (!p || seen[p]) return;
      seen[p] = true;
      uniq.push(p);
    });

    return uniq;
  }

  function fileExistsInSnapshot(path) {
    var want = normalizePath(path);
    if (!want) return false;

    var files = getKnownFilesFromSnapshot();
    for (var i = 0; i < files.length; i++) {
      if (files[i] === want) return true;
    }
    return false;
  }

  function normalizeRisk(value) {
    var raw = trimText(value || "").toLowerCase();
    if (!raw) return "unknown";
    if (raw.indexOf("low") >= 0 || raw.indexOf("baixo") >= 0 || raw.indexOf("safe") >= 0 || raw.indexOf("seguro") >= 0) return "low";
    if (raw.indexOf("medium") >= 0 || raw.indexOf("médio") >= 0 || raw.indexOf("medio") >= 0) return "medium";
    if (raw.indexOf("high") >= 0 || raw.indexOf("alto") >= 0 || raw.indexOf("crit") >= 0) return "high";
    return "unknown";
  }

  function normalizePlan(plan) {
    var p = clone(plan || {});
    return {
      id: trimText(p.id || ""),
      mode: trimText(p.mode || "analysis"),
      targetFile: normalizePath(p.targetFile || p.nextFile || ""),
      nextFile: normalizePath(p.nextFile || p.targetFile || ""),
      risk: normalizeRisk(p.risk || p.riskText || p.priority || ""),
      approvalRequired: !!p.approvalRequired,
      approvalStatus: trimText(p.approvalStatus || ""),
      objective: trimText(p.objective || ""),
      patchSummary: trimText(p.patchSummary || ""),
      proposedCode: String(p.proposedCode || ""),
      proposedLang: trimText(p.proposedLang || ""),
      nextStep: trimText(p.nextStep || ""),
      rawText: String(p.rawText || ""),
      createdAt: trimText(p.createdAt || ""),
      source: trimText(p.source || "")
    };
  }

  function validatePlanShape(plan) {
    var normalized = normalizePlan(plan);
    var out = {
      ok: true,
      errors: [],
      warnings: [],
      normalized: normalized
    };

    if (!normalized.id) out.errors.push("plan.id ausente");
    if (!normalized.targetFile) out.errors.push("targetFile/nextFile ausente");
    if (!normalized.mode) out.warnings.push("mode ausente");
    if (!normalized.proposedCode) out.warnings.push("proposedCode ausente");
    if (!normalized.approvalRequired) out.warnings.push("approvalRequired=false");
    if (normalized.approvalStatus !== "approved") out.warnings.push("approvalStatus não está approved");

    if (normalized.targetFile && !fileExistsInSnapshot(normalized.targetFile)) {
      out.warnings.push("targetFile não encontrado no snapshot atual");
    }

    out.ok = out.errors.length === 0;
    return out;
  }

  function validateApprovedPlan(planId) {
    var bridge = getBridge();

    if (!bridge || typeof bridge.getLastPlan !== "function") {
      var noBridge = {
        ok: false,
        msg: "Factory AI Bridge indisponível.",
        errors: ["bridge indisponível"],
        warnings: [],
        normalized: null
      };
      state.lastValidationResult = clone(noBridge);
      persist();
      return noBridge;
    }

    var plan = bridge.getLastPlan();
    if (!plan || typeof plan !== "object") {
      var noPlan = {
        ok: false,
        msg: "Nenhum plano atual encontrado.",
        errors: ["plano ausente"],
        warnings: [],
        normalized: null
      };
      state.lastValidationResult = clone(noPlan);
      persist();
      return noPlan;
    }

    var want = trimText(planId || plan.id);
    if (!want || want !== trimText(plan.id)) {
      var mismatch = {
        ok: false,
        msg: "planId não confere com o último plano.",
        errors: ["planId mismatch"],
        warnings: [],
        normalized: null
      };
      state.lastValidationResult = clone(mismatch);
      persist();
      return mismatch;
    }

    if (typeof bridge.canApplyApprovedPlan === "function" && !bridge.canApplyApprovedPlan(want)) {
      var notApproved = {
        ok: false,
        msg: "Plano ainda não está liberado como aprovado.",
        errors: ["plano não aprovado"],
        warnings: [],
        normalized: normalizePlan(plan)
      };
      state.lastValidationResult = clone(notApproved);
      persist();
      return notApproved;
    }

    var shape = validatePlanShape(plan);

    var result = {
      ok: !!shape.ok,
      msg: shape.ok ? "Plano validado ✅" : "Plano inválido para stage/apply.",
      planId: want,
      errors: shape.errors || [],
      warnings: shape.warnings || [],
      normalized: clone(shape.normalized || {}),
      plan: clone(plan),
      activeAppSlug: getActiveApp()
    };

    state.lastValidationResult = clone(result);
    persist();
    return result;
  }

  function buildStagedPatch(plan) {
    var normalized = normalizePlan(plan);

    return {
      stagedAt: nowISO(),
      planId: trimText(normalized.id || ""),
      targetFile: normalizePath(normalized.targetFile || normalized.nextFile || ""),
      risk: normalizeRisk(normalized.risk || ""),
      mode: trimText(normalized.mode || "analysis"),
      objective: trimText(normalized.objective || ""),
      nextStep: trimText(normalized.nextStep || ""),
      patchSummary: trimText(normalized.patchSummary || ""),
      proposedCode: String(normalized.proposedCode || ""),
      proposedLang: trimText(normalized.proposedLang || ""),
      approvalRequired: !!normalized.approvalRequired,
      source: "patch_supervisor",
      createdAt: nowISO()
    };
  }

  async function stageApprovedPlan(planId) {
    var validation = validateApprovedPlan(planId);

    if (!validation.ok) {
      var fail = {
        ok: false,
        msg: "Stage bloqueado.",
        validation: clone(validation)
      };

      state.stagedPlanId = "";
      state.stagedPatch = null;
      persist();

      pushHistory({
        type: "stage-fail",
        ts: nowISO(),
        result: clone(fail)
      });

      pushLog("WARN", "stageApprovedPlan bloqueado", fail);
      return fail;
    }

    var staged = buildStagedPatch(validation.plan);

    state.stagedPlanId = staged.planId;
    state.stagedPatch = clone(staged);
    persist();

    var result = {
      ok: true,
      msg: "Plano staged ✅",
      stagedPatch: clone(staged),
      targetFile: staged.targetFile,
      risk: staged.risk,
      mode: staged.mode,
      warnings: clone(validation.warnings || [])
    };

    pushHistory({
      type: "stage-ok",
      ts: nowISO(),
      result: clone(result)
    });

    emit("RCF:PATCH_STAGED", {
      planId: staged.planId,
      stagedPatch: clone(staged)
    });

    pushLog("OK", "stageApprovedPlan ✅", {
      planId: staged.planId,
      targetFile: staged.targetFile,
      risk: staged.risk
    });

    return result;
  }

  function tryWriter(label, fn) {
    try {
      var result = fn();
      return Promise.resolve(result)
        .then(function () {
          return { ok: true, mode: label };
        })
        .catch(function (e) {
          return { ok: false, mode: label, msg: String(e && e.message || e || "writer failed") };
        });
    } catch (e) {
      return Promise.resolve({
        ok: false,
        mode: label,
        msg: String(e && e.message || e || "writer failed")
      });
    }
  }

  async function tryWriteTargetFile(targetFile, content) {
    var path = normalizePath(targetFile);
    var text = String(content == null ? "" : content);

    if (!path) {
      return { ok: false, msg: "targetFile inválido", path: path };
    }

    var attempts = [];

    if (global.RCF_OVERRIDES_VFS && typeof global.RCF_OVERRIDES_VFS.writeFile === "function") {
      attempts.push(function () {
        return tryWriter("RCF_OVERRIDES_VFS.writeFile", function () {
          return global.RCF_OVERRIDES_VFS.writeFile(path, text);
        });
      });
    }

    if (global.RCF_OVERRIDES_VFS && typeof global.RCF_OVERRIDES_VFS.put === "function") {
      attempts.push(function () {
        return tryWriter("RCF_OVERRIDES_VFS.put", function () {
          return global.RCF_OVERRIDES_VFS.put(path, text);
        });
      });
    }

    if (global.RCF_RUNTIME && typeof global.RCF_RUNTIME.put === "function") {
      attempts.push(function () {
        return tryWriter("RCF_RUNTIME.put", function () {
          return global.RCF_RUNTIME.put(path, text);
        });
      });
    }

    if (global.RCF_VFS && typeof global.RCF_VFS.put === "function") {
      attempts.push(function () {
        return tryWriter("RCF_VFS.put", function () {
          return global.RCF_VFS.put(path, text);
        });
      });
    }

    if (global.RCF_INJECTOR_SAFE && typeof global.RCF_INJECTOR_SAFE.applyFilePatch === "function") {
      attempts.push(function () {
        return tryWriter("RCF_INJECTOR_SAFE.applyFilePatch", function () {
          return global.RCF_INJECTOR_SAFE.applyFilePatch({
            path: path,
            content: text,
            mode: "REPLACE"
          });
        });
      });
    }

    if (global.RCF_INJECTOR_SAFE && typeof global.RCF_INJECTOR_SAFE.writeFile === "function") {
      attempts.push(function () {
        return tryWriter("RCF_INJECTOR_SAFE.writeFile", function () {
          return global.RCF_INJECTOR_SAFE.writeFile(path, text);
        });
      });
    }

    var lastFail = null;

    for (var i = 0; i < attempts.length; i++) {
      var res = await attempts[i]();
      if (res && res.ok) {
        return {
          ok: true,
          mode: res.mode,
          path: path
        };
      }
      lastFail = res;
    }

    return {
      ok: false,
      msg: lastFail && lastFail.msg ? lastFail.msg : "Nenhum writer seguro disponível no runtime atual.",
      mode: lastFail && lastFail.mode ? lastFail.mode : "",
      path: path
    };
  }

  async function applyApprovedPlan(planId, opts) {
    var options = clone(opts || {});
    var validation = validateApprovedPlan(planId);

    if (!validation.ok) {
      var blocked = {
        ok: false,
        msg: "Apply bloqueado: plano inválido ou não aprovado.",
        validation: clone(validation)
      };

      state.lastApplyResult = clone(blocked);
      persist();

      pushHistory({
        type: "apply-blocked",
        ts: nowISO(),
        result: clone(blocked)
      });

      pushLog("WARN", "applyApprovedPlan bloqueado", blocked);
      return blocked;
    }

    var staged = state.stagedPatch;
    if (!staged || trimText(state.stagedPlanId) !== trimText(validation.planId)) {
      var stageResult = await stageApprovedPlan(validation.planId);
      if (!stageResult.ok) {
        var noStage = {
          ok: false,
          msg: "Apply bloqueado: stage falhou.",
          stage: clone(stageResult)
        };

        state.lastApplyResult = clone(noStage);
        persist();

        pushHistory({
          type: "apply-no-stage",
          ts: nowISO(),
          result: clone(noStage)
        });

        pushLog("WARN", "applyApprovedPlan sem stage", noStage);
        return noStage;
      }
      staged = clone(stageResult.stagedPatch || null);
    }

    if (!staged || !trimText(staged.targetFile)) {
      var invalidStage = {
        ok: false,
        msg: "Apply bloqueado: stagedPatch inválido."
      };

      state.lastApplyResult = clone(invalidStage);
      persist();

      pushHistory({
        type: "apply-invalid-stage",
        ts: nowISO(),
        result: clone(invalidStage)
      });

      pushLog("WARN", "applyApprovedPlan staged inválido", invalidStage);
      return invalidStage;
    }

    if (!String(staged.proposedCode || "")) {
      var noCode = {
        ok: false,
        msg: "Apply bloqueado: plano não contém proposedCode."
      };

      state.lastApplyResult = clone(noCode);
      persist();

      pushHistory({
        type: "apply-no-code",
        ts: nowISO(),
        result: clone(noCode)
      });

      pushLog("WARN", "applyApprovedPlan sem código", noCode);
      return noCode;
    }

    var writerResult = await tryWriteTargetFile(staged.targetFile, staged.proposedCode);

    var result = {
      ok: !!writerResult.ok,
      msg: writerResult.ok ? "Patch aplicado ✅" : "Falha ao aplicar patch.",
      planId: staged.planId,
      targetFile: staged.targetFile,
      risk: staged.risk,
      mode: writerResult.mode || "",
      writer: clone(writerResult),
      options: clone(options)
    };

    if (result.ok) {
      try {
        if (global.RCF_FACTORY_AI_BRIDGE?.consumeApprovedPlan) {
          global.RCF_FACTORY_AI_BRIDGE.consumeApprovedPlan(staged.planId);
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

      state.stagedPlanId = "";
      state.stagedPatch = null;
    }

    state.lastApplyResult = clone(result);
    persist();

    pushHistory({
      type: result.ok ? "apply-ok" : "apply-fail",
      ts: nowISO(),
      result: clone(result)
    });

    emit(result.ok ? "RCF:PATCH_APPLIED" : "RCF:PATCH_APPLY_FAILED", clone(result));
    pushLog(result.ok ? "OK" : "ERR", "applyApprovedPlan", result);

    return result;
  }

  function clearStage() {
    state.stagedPlanId = "";
    state.stagedPatch = null;
    persist();

    emit("RCF:PATCH_STAGE_CLEARED", { ok: true });
    pushLog("OK", "stage limpo ✅");

    return true;
  }

  function getStagedPatch() {
    return clone(state.stagedPatch || null);
  }

  function getLastApplyResult() {
    return clone(state.lastApplyResult || null);
  }

  function getLastValidationResult() {
    return clone(state.lastValidationResult || null);
  }

  function status() {
    return {
      version: VERSION,
      ready: !!state.ready,
      lastUpdate: state.lastUpdate || null,
      stagedPlanId: state.stagedPlanId || "",
      hasStagedPatch: !!state.stagedPatch,
      stagedTargetFile: safe(function () { return state.stagedPatch.targetFile; }, ""),
      stagedRisk: safe(function () { return state.stagedPatch.risk; }, "unknown"),
      lastApplyOk: safe(function () { return !!state.lastApplyResult.ok; }, false),
      lastApplyTargetFile: safe(function () { return state.lastApplyResult.targetFile; }, ""),
      historyCount: Array.isArray(state.history) ? state.history.length : 0,
      activeAppSlug: getActiveApp()
    };
  }

  function syncPresence() {
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
      }
    } catch (_) {}
  }

  function init() {
    load();
    state.ready = true;
    state.version = VERSION;
    state.lastUpdate = nowISO();
    persist();
    syncPresence();
    pushLog("OK", "patch_supervisor ready ✅ " + VERSION);
    return status();
  }

  global.RCF_PATCH_SUPERVISOR = {
    __v100: true,
    __v101: true,
    version: VERSION,
    init: init,
    status: status,
    validateApprovedPlan: validateApprovedPlan,
    stageApprovedPlan: stageApprovedPlan,
    applyApprovedPlan: applyApprovedPlan,
    clearStage: clearStage,
    getStagedPatch: getStagedPatch,
    getLastApplyResult: getLastApplyResult,
    getLastValidationResult: getLastValidationResult,
    getState: function () { return clone(state); }
  };

  try { init(); } catch (_) {}

})(window);
