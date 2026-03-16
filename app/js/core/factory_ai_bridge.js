/* FILE: /app/js/core/factory_ai_bridge.js
   RControl Factory — Factory AI Bridge
   v1.0.0 SUPERVISED ACTION BRIDGE

   Objetivo:
   - criar a ponte supervisionada entre resposta da Factory AI e ações futuras da Factory
   - receber resposta textual/técnica da IA e converter em plano operacional estruturado
   - separar análise, sugestão, patch proposto, arquivo alvo, risco e necessidade de aprovação
   - NÃO aplicar patch automaticamente
   - preparar base para patch_supervisor / factory_ai_actions
   - funcionar como script clássico
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_BRIDGE && global.RCF_FACTORY_AI_BRIDGE.__v100) return;

  var VERSION = "v1.0.0";
  var STORAGE_KEY = "rcf:factory_ai_bridge";
  var LAST_PLAN_KEY = "rcf:factory_ai_bridge_last_plan";

  var state = {
    version: VERSION,
    ready: false,
    lastUpdate: null,
    lastInput: null,
    lastResponseText: "",
    lastPlan: null,
    approvedPlanId: "",
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

  function safeParse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; }
    catch (_) { return fallback; }
  }

  function trimText(v) {
    return String(v == null ? "" : v).trim();
  }

  function normalizeSpace(v) {
    return trimText(v).replace(/\r/g, "");
  }

  function safeLines(text) {
    return normalizeSpace(text).split("\n");
  }

  function unique(arr) {
    var out = [];
    var seen = {};
    (Array.isArray(arr) ? arr : []).forEach(function (item) {
      var key = String(item || "");
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(item);
    });
    return out;
  }

  function pushLog(level, msg, extra) {
    try {
      if (extra !== undefined) {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_BRIDGE] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_BRIDGE] " + msg);
      }
    } catch (_) {}

    try { console.log("[FACTORY_AI_BRIDGE]", level, msg, extra || ""); } catch (_) {}
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

  function buildPlanId() {
    return "fab_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now();
  }

  function looksLikeRisk(text) {
    var s = trimText(text).toLowerCase();
    if (!s) return false;
    return (
      s.indexOf("risco") >= 0 ||
      s.indexOf("baixo") >= 0 ||
      s.indexOf("médio") >= 0 ||
      s.indexOf("medio") >= 0 ||
      s.indexOf("alto") >= 0 ||
      s.indexOf("safe") >= 0 ||
      s.indexOf("seguro") >= 0
    );
  }

  function normalizeRisk(value, text) {
    var raw = trimText(value || text).toLowerCase();

    if (!raw) return "unknown";
    if (raw.indexOf("baixo") >= 0 || raw.indexOf("low") >= 0 || raw.indexOf("seguro") >= 0 || raw.indexOf("safe") >= 0) return "low";
    if (raw.indexOf("médio") >= 0 || raw.indexOf("medio") >= 0 || raw.indexOf("medium") >= 0) return "medium";
    if (raw.indexOf("alto") >= 0 || raw.indexOf("high") >= 0 || raw.indexOf("crítico") >= 0 || raw.indexOf("critico") >= 0) return "high";
    return "unknown";
  }

  function extractCodeBlocks(text) {
    var src = String(text || "");
    var rg = /```([\w-]*)\n?([\s\S]*?)```/g;
    var out = [];
    var m;

    while ((m = rg.exec(src))) {
      out.push({
        lang: trimText(m[1] || ""),
        code: String(m[2] || "")
      });
    }

    return out;
  }

  function extractFiles(text) {
    var src = String(text || "");
    var out = [];
    var rg = /(\/(?:app|functions)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+)/g;
    var m;

    while ((m = rg.exec(src))) {
      out.push(String(m[1] || "").trim());
    }

    return unique(out);
  }

  function findSection(text, labels) {
    var lines = safeLines(text);
    var hits = [];
    var i;
    var lowerLabels = (Array.isArray(labels) ? labels : []).map(function (x) {
      return trimText(x).toLowerCase();
    });

    for (i = 0; i < lines.length; i++) {
      var line = trimText(lines[i]);
      var lower = line.toLowerCase();
      var isHit = false;

      for (var j = 0; j < lowerLabels.length; j++) {
        if (!lowerLabels[j]) continue;
        if (lower === lowerLabels[j] || lower.indexOf(lowerLabels[j] + ":") === 0) {
          isHit = true;
          break;
        }
      }

      if (isHit) hits.push(i);
    }

    if (!hits.length) return "";

    var start = hits[0] + 1;
    var end = lines.length;

    for (i = start; i < lines.length; i++) {
      var ln = trimText(lines[i]).toLowerCase();
      if (/^\d+\.\s+/.test(ln) || /^[-=]{2,}$/.test(ln) || /^objetivo:?$/.test(ln) || /^arquivo alvo:?$/.test(ln) || /^risco:?$/.test(ln) || /^código sugerido:?$/.test(ln) || /^codigo sugerido:?$/.test(ln) || /^patch mínimo sugerido:?$/.test(ln) || /^patch minimo sugerido:?$/.test(ln) || /^próximo passo mínimo recomendado:?$/.test(ln) || /^proximo passo minimo recomendado:?$/.test(ln) || /^arquivos mais prováveis de ajuste:?$/.test(ln) || /^arquivos mais provaveis de ajuste:?$/.test(ln)) {
        end = i;
        break;
      }
    }

    return trimText(lines.slice(start, end).join("\n"));
  }

  function extractFirstNonEmptyLine(text) {
    var lines = safeLines(text);
    for (var i = 0; i < lines.length; i++) {
      var line = trimText(lines[i]);
      if (line) return line;
    }
    return "";
  }

  function parseStructuredPlan(text, raw) {
    var src = normalizeSpace(text);
    var codeBlocks = extractCodeBlocks(src);
    var files = extractFiles(src);
    var riskLine = "";
    var lines = safeLines(src);

    for (var i = 0; i < lines.length; i++) {
      if (looksLikeRisk(lines[i])) {
        riskLine = trimText(lines[i]);
        break;
      }
    }

    var objective =
      findSection(src, ["1. objetivo", "objetivo"]) ||
      extractFirstNonEmptyLine(src);

    var targetFile =
      findSection(src, ["2. arquivo alvo", "arquivo alvo"]) ||
      (files.length ? files[0] : "");

    var riskText =
      findSection(src, ["3. risco", "risco"]) ||
      riskLine;

    var analysis =
      findSection(src, ["1. fatos confirmados", "fatos confirmados"]) ||
      findSection(src, ["análise", "analise"]) ||
      "";

    var nextStep =
      findSection(src, ["4. próximo passo mínimo recomendado", "proximo passo minimo recomendado", "próximo passo", "proximo passo"]) ||
      "";

    var suggestedFilesSection =
      findSection(src, ["5. arquivos mais prováveis de ajuste", "arquivos mais provaveis de ajuste", "arquivos mais úteis para próxima análise", "arquivos mais uteis para proxima analise"]) ||
      "";

    var suggestedFiles = unique(files.concat(extractFiles(suggestedFilesSection)));

    var patchSummary =
      findSection(src, ["6. patch mínimo sugerido", "patch minimo sugerido", "patch sugerido"]) ||
      "";

    var proposedCode = codeBlocks.length ? codeBlocks[0].code : "";
    var proposedLang = codeBlocks.length ? codeBlocks[0].lang : "";

    var wantsApproval = !!(proposedCode || patchSummary || targetFile);

    return {
      id: buildPlanId(),
      createdAt: nowISO(),
      source: "factory_ai_bridge",
      mode: proposedCode ? "code" : (patchSummary ? "patch" : "analysis"),
      objective: trimText(objective),
      targetFile: trimText(targetFile),
      risk: normalizeRisk(riskText, riskText),
      riskText: trimText(riskText),
      analysis: trimText(analysis),
      nextStep: trimText(nextStep),
      suggestedFiles: suggestedFiles,
      patchSummary: trimText(patchSummary),
      proposedCode: String(proposedCode || ""),
      proposedLang: trimText(proposedLang || ""),
      approvalRequired: wantsApproval,
      approvalStatus: "pending",
      rawText: src,
      raw: clone(raw || {})
    };
  }

  function summarizePlan(plan) {
    var p = plan || {};
    return {
      id: p.id || "",
      mode: p.mode || "analysis",
      targetFile: p.targetFile || "",
      risk: p.risk || "unknown",
      approvalRequired: !!p.approvalRequired,
      approvalStatus: p.approvalStatus || "pending",
      suggestedFiles: Array.isArray(p.suggestedFiles) ? p.suggestedFiles.slice(0, 12) : [],
      createdAt: p.createdAt || ""
    };
  }

  function rememberPlan(plan) {
    if (!plan || typeof plan !== "object") return false;

    state.lastPlan = clone(plan);
    state.lastResponseText = String(plan.rawText || "");
    state.lastInput = {
      targetFile: plan.targetFile || "",
      mode: plan.mode || "",
      risk: plan.risk || "unknown",
      createdAt: plan.createdAt || nowISO()
    };

    if (!Array.isArray(state.history)) state.history = [];
    state.history.push({
      id: plan.id,
      ts: plan.createdAt || nowISO(),
      mode: plan.mode || "analysis",
      targetFile: plan.targetFile || "",
      risk: plan.risk || "unknown",
      approvalRequired: !!plan.approvalRequired
    });

    if (state.history.length > 40) {
      state.history = state.history.slice(-40);
    }

    try {
      localStorage.setItem(LAST_PLAN_KEY, JSON.stringify(plan));
    } catch (_) {}

    persist();
    emit("RCF:FACTORY_AI_PLAN", { plan: clone(plan), summary: summarizePlan(plan) });
    return true;
  }

  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function syncFactoryState() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAIBridge");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAIBridge", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_FACTORY_STATE?.refreshRuntime) {
        global.RCF_FACTORY_STATE.refreshRuntime();
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAIBridge");
      } else if (global.RCF_MODULE_REGISTRY?.refresh) {
        global.RCF_MODULE_REGISTRY.refresh();
      }
    } catch (_) {}
  }

  function getState() {
    return clone(state);
  }

  function getLastPlan() {
    return clone(state.lastPlan || null);
  }

  function getLastSummary() {
    return summarizePlan(state.lastPlan || {});
  }

  function getLastApprovedPlanId() {
    return String(state.approvedPlanId || "");
  }

  function clearApproval() {
    state.approvedPlanId = "";
    if (state.lastPlan && typeof state.lastPlan === "object") {
      state.lastPlan.approvalStatus = "pending";
    }
    persist();
    emit("RCF:FACTORY_AI_APPROVAL_RESET", { ok: true });
    return true;
  }

  function approvePlan(planId) {
    var last = state.lastPlan;
    if (!last || typeof last !== "object") return { ok: false, msg: "sem plano pendente" };

    var want = trimText(planId || last.id);
    if (!want || want !== String(last.id || "")) {
      return { ok: false, msg: "planId não confere" };
    }

    state.approvedPlanId = want;
    last.approvalStatus = "approved";
    state.lastPlan = clone(last);
    persist();

    emit("RCF:FACTORY_AI_APPROVED", {
      planId: want,
      summary: summarizePlan(last)
    });

    return { ok: true, planId: want, summary: summarizePlan(last) };
  }

  function rejectPlan(planId, reason) {
    var last = state.lastPlan;
    if (!last || typeof last !== "object") return { ok: false, msg: "sem plano pendente" };

    var want = trimText(planId || last.id);
    if (!want || want !== String(last.id || "")) {
      return { ok: false, msg: "planId não confere" };
    }

    state.approvedPlanId = "";
    last.approvalStatus = "rejected";
    last.rejectionReason = trimText(reason || "");
    state.lastPlan = clone(last);
    persist();

    emit("RCF:FACTORY_AI_REJECTED", {
      planId: want,
      reason: last.rejectionReason || "",
      summary: summarizePlan(last)
    });

    return { ok: true, planId: want, summary: summarizePlan(last) };
  }

  function canApplyApprovedPlan(planId) {
    var want = trimText(planId || safe(function () { return state.lastPlan.id; }, ""));
    if (!want) return false;
    if (!state.lastPlan || state.lastPlan.id !== want) return false;
    return String(state.approvedPlanId || "") === want && state.lastPlan.approvalStatus === "approved";
  }

  function consumeApprovedPlan(planId) {
    var ok = canApplyApprovedPlan(planId);
    if (!ok) return { ok: false, msg: "plano não aprovado" };

    var plan = clone(state.lastPlan);
    state.approvedPlanId = "";
    if (state.lastPlan && typeof state.lastPlan === "object") {
      state.lastPlan.approvalStatus = "consumed";
    }
    persist();

    emit("RCF:FACTORY_AI_PLAN_CONSUMED", {
      planId: plan.id,
      summary: summarizePlan(plan)
    });

    return { ok: true, plan: plan };
  }

  function ingestResponse(input) {
    var payload = clone(input || {});
    var text =
      trimText(payload.analysis) ||
      trimText(payload.answer) ||
      trimText(payload.result) ||
      trimText(payload.text) ||
      "";

    var plan = parseStructuredPlan(text, payload);
    rememberPlan(plan);

    pushLog("OK", "response ingested ✅", {
      mode: plan.mode,
      targetFile: plan.targetFile,
      risk: plan.risk,
      approvalRequired: plan.approvalRequired
    });

    return clone(plan);
  }

  function fromApiResponse(responseObj) {
    return ingestResponse(responseObj || {});
  }

  function fromText(text, meta) {
    var raw = merge({
      analysis: String(text || "")
    }, clone(meta || {}));
    return ingestResponse(raw);
  }

  function proposeFromCurrentFactory() {
    var summary = safe(function () {
      return global.RCF_CONTEXT?.summary?.() || {};
    }, {});

    var txt = [
      "1. Objetivo",
      "Consolidar a próxima ação supervisionada da Factory AI.",
      "",
      "2. Arquivo alvo",
      "",
      "3. Risco",
      "low",
      "",
      "4. Próximo passo mínimo recomendado",
      "Usar o snapshot atual e escolher o próximo arquivo mais útil antes de qualquer apply.",
      "",
      "5. Arquivos mais prováveis de ajuste",
      stringifyLines(summary.candidateFiles || [])
    ].join("\n");

    return fromText(txt, {
      source: "factory_ai_bridge.local",
      snapshotSummary: clone(summary)
    });
  }

  function stringifyLines(arr) {
    return (Array.isArray(arr) ? arr : []).map(function (x) { return "- " + String(x || ""); }).join("\n");
  }

  function getPendingPlan() {
    var p = state.lastPlan;
    if (!p || typeof p !== "object") return null;
    if (p.approvalStatus === "approved" || p.approvalStatus === "consumed") return null;
    return clone(p);
  }

  function status() {
    var p = state.lastPlan || {};
    return {
      version: VERSION,
      ready: !!state.ready,
      lastUpdate: state.lastUpdate || null,
      hasPlan: !!state.lastPlan,
      lastPlanId: p.id || "",
      lastMode: p.mode || "",
      targetFile: p.targetFile || "",
      risk: p.risk || "unknown",
      approvalRequired: !!p.approvalRequired,
      approvalStatus: p.approvalStatus || "",
      approvedPlanId: state.approvedPlanId || "",
      historyCount: Array.isArray(state.history) ? state.history.length : 0
    };
  }

  function bindEvents() {
    try {
      global.addEventListener("RCF:FACTORY_AI_RESPONSE", function (ev) {
        try {
          var detail = ev && ev.detail ? ev.detail : {};
          ingestResponse(detail);
        } catch (e) {
          pushLog("ERR", "event ingest error", String(e && e.message || e));
        }
      }, { passive: true });
    } catch (_) {}
  }

  function init() {
    load();
    state.ready = true;
    state.version = VERSION;
    state.lastUpdate = nowISO();
    persist();
    syncFactoryState();
    bindEvents();
    pushLog("OK", "factory_ai_bridge ready ✅ " + VERSION);
    return status();
  }

  global.RCF_FACTORY_AI_BRIDGE = {
    __v100: true,
    version: VERSION,
    init: init,
    status: status,
    getState: getState,
    getLastPlan: getLastPlan,
    getLastSummary: getLastSummary,
    getPendingPlan: getPendingPlan,
    getLastApprovedPlanId: getLastApprovedPlanId,
    ingestResponse: ingestResponse,
    fromApiResponse: fromApiResponse,
    fromText: fromText,
    proposeFromCurrentFactory: proposeFromCurrentFactory,
    approvePlan: approvePlan,
    rejectPlan: rejectPlan,
    clearApproval: clearApproval,
    canApplyApprovedPlan: canApplyApprovedPlan,
    consumeApprovedPlan: consumeApprovedPlan
  };

  try { init(); } catch (_) {}

})(window);
