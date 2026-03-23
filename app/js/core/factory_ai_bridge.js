/* FILE: /app/js/core/factory_ai_bridge.js
   RControl Factory — Factory AI Bridge
   v1.1.4 SUPERVISED ACTION BRIDGE + API RESPONSE/HINT HARDENED + CONNECTION META FULL

   Objetivo:
   - criar a ponte supervisionada entre resposta da Factory AI e ações futuras da Factory
   - receber resposta textual/técnica da IA e converter em plano operacional estruturado
   - separar análise, sugestão, patch proposto, arquivo alvo, risco e necessidade de aprovação
   - NÃO aplicar patch automaticamente
   - preparar base para patch_supervisor / factory_ai_actions
   - alinhar compatibilidade com approveLastPlan / rejectLastPlan
   - funcionar como script clássico

   PATCH v1.1.4:
   - KEEP: leitura forte de hints.targetFile / nextFileCandidate / risk
   - KEEP: plannerPlan/meta/planner_hint como fonte forte de targetFile
   - ADD: preserva endpoint/responseStatus/incomplete/incompleteReason da conexão
   - ADD: fromApiResponse lê melhor response/raw/payload/plannerPlan
   - ADD: status expõe metadados completos da última conexão
   - FIX: fallback de analysis/rawText mais estável para runtime/backend novos
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_BRIDGE && global.RCF_FACTORY_AI_BRIDGE.__v115) return;

  var VERSION = "v1.1.6";
  var STORAGE_KEY = "rcf:factory_ai_bridge";
  var LAST_PLAN_KEY = "rcf:factory_ai_bridge_last_plan";
  var MAX_HISTORY = 40;

  var state = {
    version: VERSION,
    ready: false,
    lastUpdate: null,
    lastInput: null,
    lastResponseText: "",
    lastPlan: null,
    approvedPlanId: "",
    lastConnection: null,
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

  function normalizeBridgeStatus(snapshot) {
    var out = clone(snapshot || {});
    try {
      if (!out.lastMode) out.lastMode = "supervised";
      if (!out.risk) out.risk = "low";
      if (!out.approvalStatus) out.approvalStatus = out.hasPlan ? "pending" : "idle";
      if (!out.connectionStatus) out.connectionStatus = safe(function () { return state.lastConnection.status; }, "") || "connected";
      if (!out.connectionProvider) out.connectionProvider = safe(function () { return state.lastConnection.provider; }, "") || "openai";
      if (!out.connectionModel) out.connectionModel = safe(function () { return state.lastConnection.model; }, "") || "gpt-4.1-mini";
    } catch (_) {}
    return out;
  }


  function lower(v) {
    return trimText(v).toLowerCase();
  }

  function normalizeSpace(v) {
    return trimText(v).replace(/\r/g, "");
  }

  function safeLines(text) {
    return normalizeSpace(text).split("\n");
  }

  function normalizeFilePath(path) {
    var p = trimText(path || "").replace(/\\/g, "/");
    if (!p) return "";
    if (p.charAt(0) !== "/") p = "/" + p;
    p = p.replace(/\/{2,}/g, "/");
    return p;
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

  function parseTime(value) {
    var raw = trimText(value || "");
    if (!raw) return 0;
    var ms = Date.parse(raw);
    return isFinite(ms) ? ms : 0;
  }

  function planStrength(plan) {
    if (!plan || typeof plan !== "object") return 0;

    var mode = trimText(plan.mode || "");
    var source = trimText(plan.source || "");
    var strength = 0;

    if (source.indexOf("planner") >= 0) strength += 50;
    if (source.indexOf("api_response") >= 0) strength += 20;
    if (source.indexOf("backend") >= 0) strength += 12;
    if (mode === "code") strength += 30;
    else if (mode === "patch") strength += 20;
    else if (mode === "analysis") strength += 8;

    if (trimText(plan.targetFile || plan.nextFile || "")) strength += 10;
    if (trimText(plan.nextStep || "")) strength += 4;
    if (Array.isArray(plan.suggestedFiles) && plan.suggestedFiles.length) strength += 4;
    if (trimText(plan.patchSummary || "")) strength += 3;
    if (trimText(plan.proposedCode || "")) strength += 6;
    if (trimText(plan.objective || "")) strength += 2;
    if (safe(function () { return plan.connection.status; }, "")) strength += 2;
    if (safe(function () { return plan.connection.endpoint; }, "")) strength += 1;
    if (safe(function () { return plan.connection.responseStatus; }, "")) strength += 1;

    return strength;
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
      state.version = VERSION;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (_) {
      return false;
    }
  }

  function tryLoadLastPlanFallback() {
    try {
      var raw = localStorage.getItem(LAST_PLAN_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      if (!trimText(parsed.id || "")) return null;
      return clone(parsed);
    } catch (_) {
      return null;
    }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        var onlyLast = tryLoadLastPlanFallback();
        if (onlyLast) {
          state.lastPlan = clone(onlyLast);
          state.lastResponseText = String(onlyLast.rawText || "");
          state.lastConnection = clone(onlyLast.connection || null);
        }
        return false;
      }

      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return false;
      state = merge(clone(state), parsed);
      state.version = VERSION;
      if (!Array.isArray(state.history)) state.history = [];

      if (!state.lastPlan || typeof state.lastPlan !== "object" || !trimText(state.lastPlan.id || "")) {
        var fallbackPlan = tryLoadLastPlanFallback();
        if (fallbackPlan) {
          state.lastPlan = clone(fallbackPlan);
          state.lastResponseText = String(fallbackPlan.rawText || state.lastResponseText || "");
          state.lastConnection = clone(fallbackPlan.connection || state.lastConnection || null);
        }
      }

      return true;
    } catch (_) {
      var fallback = tryLoadLastPlanFallback();
      if (fallback) {
        state.lastPlan = clone(fallback);
        state.lastResponseText = String(fallback.rawText || "");
        state.lastConnection = clone(fallback.connection || null);
      }
      return false;
    }
  }

  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
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
      s.indexOf("seguro") >= 0 ||
      s.indexOf("medium") >= 0 ||
      s.indexOf("high") >= 0 ||
      s.indexOf("low") >= 0
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
      out.push(normalizeFilePath(String(m[1] || "").trim()));
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
      var lowerLine = line.toLowerCase();
      var isHit = false;

      for (var j = 0; j < lowerLabels.length; j++) {
        if (!lowerLabels[j]) continue;
        if (lowerLine === lowerLabels[j] || lowerLine.indexOf(lowerLabels[j] + ":") === 0) {
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
      if (
        /^\d+\.\s+/.test(ln) ||
        /^[-=]{2,}$/.test(ln) ||
        /^objetivo:?$/.test(ln) ||
        /^arquivo alvo:?$/.test(ln) ||
        /^risco:?$/.test(ln) ||
        /^código sugerido:?$/.test(ln) ||
        /^codigo sugerido:?$/.test(ln) ||
        /^patch mínimo sugerido:?$/.test(ln) ||
        /^patch minimo sugerido:?$/.test(ln) ||
        /^próximo passo mínimo recomendado:?$/.test(ln) ||
        /^proximo passo minimo recomendado:?$/.test(ln) ||
        /^arquivos mais prováveis de ajuste:?$/.test(ln) ||
        /^arquivos mais provaveis de ajuste:?$/.test(ln)
      ) {
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

  function normalizeSuggestedFiles(list, fallbackText) {
    var fromList = Array.isArray(list) ? list : [];
    var fromText = extractFiles(String(fallbackText || ""));
    return unique(
      fromList
        .concat(fromText)
        .map(function (x) { return normalizeFilePath(x); })
        .filter(Boolean)
    );
  }

  function normalizeConnection(connection) {
    if (!connection || typeof connection !== "object") return null;

    return {
      provider: trimText(connection.provider || ""),
      configured: !!connection.configured,
      attempted: !!connection.attempted,
      status: trimText(connection.status || ""),
      model: trimText(connection.model || ""),
      upstreamStatus: Number(connection.upstreamStatus || 0) || 0,
      endpoint: trimText(connection.endpoint || ""),
      responseStatus: trimText(connection.responseStatus || ""),
      incomplete: !!connection.incomplete,
      incompleteReason: trimText(connection.incompleteReason || "")
    };
  }

  function extractPlannerHint(raw) {
    var plannerHint =
      safe(function () { return raw.payload.__planner_hint; }, null) ||
      safe(function () { return raw.raw.__planner_hint; }, null) ||
      safe(function () { return raw.response.payload.__planner_hint; }, null) ||
      safe(function () { return raw.response.raw.__planner_hint; }, null) ||
      safe(function () { return raw.__planner_hint; }, null);

    return plannerHint && typeof plannerHint === "object" ? clone(plannerHint) : null;
  }

  function extractHintTarget(raw) {
    return normalizeFilePath(
      safe(function () { return raw.hints.targetFile; }, "") ||
      safe(function () { return raw.hints.nextFileCandidate; }, "") ||
      safe(function () { return raw.hints.nextFile; }, "") ||
      safe(function () { return raw.response.hints.targetFile; }, "") ||
      safe(function () { return raw.response.hints.nextFileCandidate; }, "") ||
      safe(function () { return raw.response.hints.nextFile; }, "") ||
      safe(function () { return raw.connection.targetFile; }, "") ||
      safe(function () { return raw.response.connection.targetFile; }, "")
    );
  }

  function extractHintRisk(raw) {
    return normalizeRisk(
      safe(function () { return raw.hints.risk; }, "") ||
      safe(function () { return raw.response.hints.risk; }, "") ||
      safe(function () { return raw.connection.risk; }, "") ||
      safe(function () { return raw.response.connection.risk; }, ""),
      ""
    );
  }

  function extractAnalysisText(raw) {
    return trimText(
      safe(function () { return raw.analysis; }, "") ||
      safe(function () { return raw.answer; }, "") ||
      safe(function () { return raw.result; }, "") ||
      safe(function () { return raw.text; }, "") ||
      safe(function () { return raw.response.analysis; }, "") ||
      safe(function () { return raw.response.answer; }, "") ||
      safe(function () { return raw.response.result; }, "") ||
      safe(function () { return raw.response.text; }, "") ||
      safe(function () { return raw.raw.output_text; }, "") ||
      safe(function () { return raw.response.raw.output_text; }, "")
    );
  }

  function parseStructuredPlan(text, raw) {
    var src = normalizeSpace(text);
    var codeBlocks = extractCodeBlocks(src);
    var files = extractFiles(src);
    var riskLine = "";
    var lines = safeLines(src);
    var plannerHint = extractPlannerHint(raw || {});
    var hintedTarget = extractHintTarget(raw || {});
    var hintedRisk = extractHintRisk(raw || {});
    var connection =
      normalizeConnection(safe(function () { return raw.connection; }, null)) ||
      normalizeConnection(safe(function () { return raw.response.connection; }, null));

    for (var i = 0; i < lines.length; i++) {
      if (looksLikeRisk(lines[i])) {
        riskLine = trimText(lines[i]);
        break;
      }
    }

    var objective =
      findSection(src, ["1. objetivo", "objetivo"]) ||
      extractFirstNonEmptyLine(src) ||
      trimText(safe(function () { return raw.action; }, "")) ||
      trimText(safe(function () { return raw.response.action; }, "")) ||
      "Análise supervisionada da Factory AI";

    var targetFile =
      findSection(src, ["2. arquivo alvo", "arquivo alvo"]) ||
      hintedTarget ||
      normalizeFilePath(safe(function () { return plannerHint.nextFile; }, "")) ||
      (files.length ? files[0] : "");

    var riskText =
      findSection(src, ["3. risco", "risco"]) ||
      riskLine ||
      hintedRisk;

    var analysis =
      findSection(src, ["1. fatos confirmados", "fatos confirmados"]) ||
      findSection(src, ["análise", "analise"]) ||
      trimText(src);

    var nextStep =
      findSection(src, ["4. próximo passo mínimo recomendado", "proximo passo minimo recomendado", "próximo passo", "proximo passo"]) ||
      trimText(safe(function () { return plannerHint.executionLine[0]; }, "")) ||
      trimText(safe(function () { return raw.action; }, "")) ||
      trimText(safe(function () { return raw.response.action; }, ""));

    var suggestedFilesSection =
      findSection(src, ["5. arquivos mais prováveis de ajuste", "arquivos mais provaveis de ajuste", "arquivos mais úteis para próxima análise", "arquivos mais uteis para proxima analise"]) ||
      "";

    var patchSummary =
      findSection(src, ["6. patch mínimo sugerido", "patch minimo sugerido", "patch sugerido"]) ||
      "";

    var proposedCode = codeBlocks.length ? codeBlocks[0].code : "";
    var proposedLang = codeBlocks.length ? codeBlocks[0].lang : "";
    var normalizedTarget = normalizeFilePath(targetFile || "");
    var suggestedFiles = normalizeSuggestedFiles(
      []
        .concat(files)
        .concat(safe(function () { return plannerHint.executionLine; }, []))
        .concat(safe(function () { return plannerHint.ranking.map(function (x) { return x.file; }); }, [])),
      suggestedFilesSection
    );
    var wantsApproval = !!(proposedCode || patchSummary || normalizedTarget);

    return {
      id: buildPlanId(),
      createdAt: nowISO(),
      source: "factory_ai_bridge.api_response",
      action: trimText(safe(function () { return raw.action; }, "") || safe(function () { return raw.response.action; }, "")),
      mode: proposedCode ? "code" : (patchSummary ? "patch" : "analysis"),
      objective: trimText(objective),
      targetFile: normalizedTarget,
      nextFile: normalizedTarget,
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
      connection: connection,
      plannerHint: clone(plannerHint || null),
      rawText: src,
      raw: clone(raw || {})
    };
  }

  function normalizePlannerPlan(plan, rawText, raw) {
    if (!plan || typeof plan !== "object") return null;

    var targetFile = normalizeFilePath(plan.targetFile || plan.nextFile || "");
    var suggestedFiles = normalizeSuggestedFiles(
      Array.isArray(plan.suggestedFiles) ? plan.suggestedFiles :
      (Array.isArray(plan.executionLine) ? plan.executionLine : []),
      rawText || ""
    );

    return {
      id: trimText(plan.id || "") || buildPlanId(),
      createdAt: trimText(plan.createdAt || plan.ts || nowISO()),
      source: "planner.plan",
      action: trimText(safe(function () { return raw.action; }, "") || safe(function () { return raw.response.action; }, "")),
      mode: trimText(plan.mode || "patch") || "patch",
      objective: trimText(plan.objective || plan.reason || ""),
      targetFile: targetFile,
      nextFile: targetFile,
      risk: normalizeRisk(plan.risk || plan.priority || "", plan.risk || plan.priority || ""),
      riskText: trimText(plan.risk || plan.priority || ""),
      analysis: trimText(plan.analysis || ""),
      nextStep: trimText(plan.nextStep || plan.reason || ""),
      suggestedFiles: suggestedFiles,
      patchSummary: trimText(plan.patchSummary || ""),
      proposedCode: String(plan.proposedCode || ""),
      proposedLang: trimText(plan.proposedLang || ""),
      approvalRequired: !!plan.approvalRequired,
      approvalStatus: trimText(plan.approvalStatus || "pending") || "pending",
      connection:
        normalizeConnection(safe(function () { return raw.connection; }, null)) ||
        normalizeConnection(safe(function () { return raw.response.connection; }, null)),
      plannerHint: clone(extractPlannerHint(raw || {}) || null),
      rawText: String(rawText || ""),
      raw: clone(raw || {})
    };
  }

  function hasMeaningfulGain(currentPlan, nextPlan) {
    var currentTarget = trimText(currentPlan.targetFile || currentPlan.nextFile || "");
    var nextTarget = trimText(nextPlan.targetFile || nextPlan.nextFile || "");

    if (!currentTarget && nextTarget) return true;
    if (currentTarget !== nextTarget && nextTarget) return true;

    if (!trimText(currentPlan.nextStep || "") && trimText(nextPlan.nextStep || "")) return true;
    if (!trimText(currentPlan.patchSummary || "") && trimText(nextPlan.patchSummary || "")) return true;
    if (!trimText(currentPlan.proposedCode || "") && trimText(nextPlan.proposedCode || "")) return true;
    if (!safe(function () { return currentPlan.connection.status; }, "") && safe(function () { return nextPlan.connection.status; }, "")) return true;
    if (!safe(function () { return currentPlan.connection.responseStatus; }, "") && safe(function () { return nextPlan.connection.responseStatus; }, "")) return true;
    if (!safe(function () { return currentPlan.connection.endpoint; }, "") && safe(function () { return nextPlan.connection.endpoint; }, "")) return true;

    var currentFiles = Array.isArray(currentPlan.suggestedFiles) ? currentPlan.suggestedFiles.length : 0;
    var nextFiles = Array.isArray(nextPlan.suggestedFiles) ? nextPlan.suggestedFiles.length : 0;
    if (nextFiles > currentFiles) return true;

    return false;
  }

  function shouldReplacePlan(currentPlan, nextPlan) {
    if (!nextPlan || typeof nextPlan !== "object") return false;
    if (!currentPlan || typeof currentPlan !== "object") return true;

    var currentTs = parseTime(currentPlan.createdAt || currentPlan.ts || "");
    var nextTs = parseTime(nextPlan.createdAt || nextPlan.ts || "");
    var currentStrength = planStrength(currentPlan);
    var nextStrength = planStrength(nextPlan);

    if (nextTs && currentTs) {
      if (nextTs > currentTs) {
        if (nextStrength >= currentStrength) return true;
        return hasMeaningfulGain(currentPlan, nextPlan);
      }

      if (nextTs < currentTs) {
        return nextStrength > currentStrength + 20;
      }
    }

    if (nextStrength > currentStrength + 4) return true;
    if (nextStrength < currentStrength) return false;

    return hasMeaningfulGain(currentPlan, nextPlan);
  }

  function summarizePlan(plan) {
    var p = plan || {};
    return {
      id: p.id || "",
      mode: p.mode || "analysis",
      targetFile: p.targetFile || p.nextFile || "",
      risk: p.risk || "unknown",
      approvalRequired: !!p.approvalRequired,
      approvalStatus: p.approvalStatus || "pending",
      suggestedFiles: Array.isArray(p.suggestedFiles) ? p.suggestedFiles.slice(0, 12) : [],
      createdAt: p.createdAt || "",
      source: p.source || "",
      nextStep: p.nextStep || "",
      connectionStatus: safe(function () { return p.connection.status; }, ""),
      connectionModel: safe(function () { return p.connection.model; }, ""),
      connectionEndpoint: safe(function () { return p.connection.endpoint; }, ""),
      responseStatus: safe(function () { return p.connection.responseStatus; }, ""),
      incomplete: !!safe(function () { return p.connection.incomplete; }, false),
      action: p.action || ""
    };
  }

  function pushPlanHistory(type, plan) {
    var p = plan || {};
    if (!Array.isArray(state.history)) state.history = [];
    state.history.push({
      type: trimText(type || "plan"),
      id: p.id || "",
      ts: p.createdAt || nowISO(),
      mode: p.mode || "analysis",
      targetFile: p.targetFile || p.nextFile || "",
      risk: p.risk || "unknown",
      approvalRequired: !!p.approvalRequired,
      approvalStatus: p.approvalStatus || "",
      source: p.source || "",
      connectionStatus: safe(function () { return p.connection.status; }, ""),
      connectionEndpoint: safe(function () { return p.connection.endpoint; }, ""),
      responseStatus: safe(function () { return p.connection.responseStatus; }, ""),
      incomplete: !!safe(function () { return p.connection.incomplete; }, false)
    });

    if (state.history.length > MAX_HISTORY) {
      state.history = state.history.slice(-MAX_HISTORY);
    }
  }

  function rememberPlan(plan) {
    if (!plan || typeof plan !== "object") return false;

    if (!shouldReplacePlan(state.lastPlan, plan)) {
      pushLog("INFO", "plano ignorado por stale/força menor", {
        current: summarizePlan(state.lastPlan),
        incoming: summarizePlan(plan)
      });
      return false;
    }

    state.lastPlan = clone(plan);
    state.lastResponseText = String(plan.rawText || "");
    state.lastConnection = clone(plan.connection || null);
    state.lastInput = {
      targetFile: plan.targetFile || plan.nextFile || "",
      mode: plan.mode || "",
      risk: plan.risk || "unknown",
      createdAt: plan.createdAt || nowISO(),
      source: plan.source || "",
      connectionStatus: safe(function () { return plan.connection.status; }, ""),
      connectionEndpoint: safe(function () { return plan.connection.endpoint; }, ""),
      responseStatus: safe(function () { return plan.connection.responseStatus; }, ""),
      incomplete: !!safe(function () { return plan.connection.incomplete; }, false)
    };

    pushPlanHistory("plan", plan);

    try {
      localStorage.setItem(LAST_PLAN_KEY, JSON.stringify(plan));
    } catch (_) {}

    persist();
    emit("RCF:FACTORY_AI_PLAN", { plan: clone(plan), summary: summarizePlan(plan) });
    return true;
  }

  function syncFactoryState() {
    state.presenceSyncAttempts = Number(state.presenceSyncAttempts || 0) + 1;
    state.presenceSyncedAt = nowISO();

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

    try { persist(); } catch (_) {}
  }

  function schedulePresenceResync() {
    [120, 900, 2200].forEach(function (ms) {
      try {
        global.setTimeout(function () {
          try { syncFactoryState(); } catch (_) {}
        }, ms);
      } catch (_) {}
    });
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

  function getPendingPlan() {
    var p = state.lastPlan;
    if (!p || typeof p !== "object") return null;
    if (p.approvalStatus === "approved" || p.approvalStatus === "consumed" || p.approvalStatus === "rejected") return null;
    return clone(p);
  }

  function getLastApprovedPlanId() {
    return String(state.approvedPlanId || "");
  }

  function getLastConnection() {
    return clone(state.lastConnection || null);
  }

  function clearApproval() {
    state.approvedPlanId = "";
    if (state.lastPlan && typeof state.lastPlan === "object") {
      state.lastPlan.approvalStatus = "pending";
      pushPlanHistory("approval-reset", state.lastPlan);
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
    pushPlanHistory("approve", last);
    persist();

    emit("RCF:FACTORY_AI_APPROVED", {
      planId: want,
      summary: summarizePlan(last)
    });

    return { ok: true, planId: want, summary: summarizePlan(last) };
  }

  function approveLastPlan(meta) {
    var last = state.lastPlan;
    var planId = trimText(safe(function () { return meta && meta.planId; }, "") || safe(function () { return last.id; }, ""));
    return approvePlan(planId);
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
    pushPlanHistory("reject", last);
    persist();

    emit("RCF:FACTORY_AI_REJECTED", {
      planId: want,
      reason: last.rejectionReason || "",
      summary: summarizePlan(last)
    });

    return { ok: true, planId: want, summary: summarizePlan(last) };
  }

  function rejectLastPlan(meta) {
    var last = state.lastPlan;
    var planId = trimText(safe(function () { return meta && meta.planId; }, "") || safe(function () { return last.id; }, ""));
    var reason = trimText(safe(function () { return meta && meta.reason; }, ""));
    return rejectPlan(planId, reason);
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
      pushPlanHistory("consume", state.lastPlan);
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
    var text = extractAnalysisText(payload);
    var plan = null;

    if (payload && payload.plannerPlan && typeof payload.plannerPlan === "object") {
      plan = normalizePlannerPlan(payload.plannerPlan, text, payload);
    } else if (payload && payload.response && payload.response.plannerPlan && typeof payload.response.plannerPlan === "object") {
      plan = normalizePlannerPlan(payload.response.plannerPlan, text, payload);
    }

    if (!plan) {
      plan = parseStructuredPlan(text, payload);
    }

    var accepted = rememberPlan(plan);

    if (accepted) {
      pushLog("OK", "response ingested ✅", {
        mode: plan.mode,
        targetFile: plan.targetFile || plan.nextFile || "",
        risk: plan.risk,
        approvalRequired: plan.approvalRequired,
        source: plan.source || "",
        connectionStatus: safe(function () { return plan.connection.status; }, ""),
        responseStatus: safe(function () { return plan.connection.responseStatus; }, "")
      });
    } else {
      pushLog("INFO", "response parsed but plan ignored", {
        mode: plan.mode,
        targetFile: plan.targetFile || plan.nextFile || "",
        risk: plan.risk,
        approvalRequired: plan.approvalRequired,
        source: plan.source || "",
        connectionStatus: safe(function () { return plan.connection.status; }, ""),
        responseStatus: safe(function () { return plan.connection.responseStatus; }, "")
      });
    }

    return clone(accepted ? plan : (state.lastPlan || plan));
  }

  function fromApiResponse(responseObj) {
    var raw = clone(responseObj || {});
    return ingestResponse({
      action: trimText(raw.action || ""),
      analysis: extractAnalysisText(raw),
      hints: clone(raw.hints || safe(function () { return raw.response.hints; }, {}) || {}),
      connection: clone(raw.connection || safe(function () { return raw.response.connection; }, {}) || {}),
      raw: clone(raw.raw || safe(function () { return raw.response.raw; }, {}) || {}),
      payload: clone(raw.payload || safe(function () { return raw.response.payload; }, {}) || {}),
      plannerPlan: clone(raw.plannerPlan || safe(function () { return raw.response.plannerPlan; }, null)),
      response: clone(raw.response || null),
      source: trimText(raw.source || safe(function () { return raw.response.source; }, "") || "factory_ai_bridge.fromApiResponse")
    });
  }

  function fromText(text, meta) {
    var raw = merge({
      analysis: String(text || "")
    }, clone(meta || {}));
    return ingestResponse(raw);
  }

  function stringifyLines(arr) {
    return (Array.isArray(arr) ? arr : []).map(function (x) {
      return "- " + String(x || "");
    }).join("\n");
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

  function status() {
    var p = state.lastPlan || {};
    return normalizeBridgeStatus({
      version: VERSION,
      ready: !!state.ready,
      lastUpdate: state.lastUpdate || null,
      hasPlan: !!state.lastPlan,
      lastPlanId: p.id || "",
      lastMode: p.mode || "",
      targetFile: p.targetFile || p.nextFile || "",
      nextStep: p.nextStep || "",
      risk: p.risk || "unknown",
      approvalRequired: !!p.approvalRequired,
      approvalStatus: p.approvalStatus || "",
      approvedPlanId: state.approvedPlanId || "",
      source: p.source || "",
      action: p.action || "",
      createdAt: p.createdAt || "",
      connectionStatus: safe(function () { return state.lastConnection.status; }, ""),
      connectionModel: safe(function () { return state.lastConnection.model; }, ""),
      connectionProvider: safe(function () { return state.lastConnection.provider; }, ""),
      connectionConfigured: !!safe(function () { return state.lastConnection.configured; }, false),
      connectionAttempted: !!safe(function () { return state.lastConnection.attempted; }, false),
      connectionUpstreamStatus: Number(safe(function () { return state.lastConnection.upstreamStatus; }, 0) || 0),
      connectionEndpoint: safe(function () { return state.lastConnection.endpoint; }, ""),
      connectionResponseStatus: safe(function () { return state.lastConnection.responseStatus; }, ""),
      connectionIncomplete: !!safe(function () { return state.lastConnection.incomplete; }, false),
      connectionIncompleteReason: safe(function () { return state.lastConnection.incompleteReason; }, ""),
      historyCount: Array.isArray(state.history) ? state.history.length : 0,
      presenceSyncedAt: state.presenceSyncedAt || null,
      presenceSyncAttempts: Number(state.presenceSyncAttempts || 0)
    });
  }

  function bindEvents() {
    try {
      if (global.__RCF_FACTORY_AI_BRIDGE_EVENTS_V115) return;
      global.__RCF_FACTORY_AI_BRIDGE_EVENTS_V115 = true;

      global.addEventListener("RCF:FACTORY_AI_RESPONSE", function (ev) {
        try {
          var detail = ev && ev.detail ? ev.detail : {};
          ingestResponse(detail);
        } catch (e) {
          pushLog("ERR", "event ingest error", String(e && e.message || e));
        }
      }, { passive: true });

      global.addEventListener("RCF:UI_READY", function () {
        try { syncFactoryState(); } catch (_) {}
      }, { passive: true });

      global.addEventListener("pageshow", function () {
        try { syncFactoryState(); } catch (_) {}
      }, { passive: true });

      global.addEventListener("DOMContentLoaded", function () {
        try { syncFactoryState(); } catch (_) {}
      }, { passive: true });
    } catch (_) {}
  }

  function init() {
    load();
    state.ready = true;
    state.version = VERSION;
    state.lastUpdate = nowISO();
    persist();

    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAIBridge");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAIBridge", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAIBridge");
      } else if (global.RCF_MODULE_REGISTRY?.refresh) {
        global.RCF_MODULE_REGISTRY.refresh();
      }
    } catch (_) {}

    syncFactoryState();
    schedulePresenceResync();
    bindEvents();
    pushLog("OK", "factory_ai_bridge ready ✅ " + VERSION);
    return status();
  }

  global.RCF_FACTORY_AI_BRIDGE = {
    __v100: true,
    __v110: true,
    __v111: true,
    __v112: true,
    __v113: true,
    __v114: true,
    __v115: true,
    version: VERSION,
    init: init,
    status: status,
    getState: getState,
    getLastPlan: getLastPlan,
    getLastSummary: getLastSummary,
    getPendingPlan: getPendingPlan,
    getLastApprovedPlanId: getLastApprovedPlanId,
    getLastConnection: getLastConnection,
    ingestResponse: ingestResponse,
    fromApiResponse: fromApiResponse,
    fromText: fromText,
    proposeFromCurrentFactory: proposeFromCurrentFactory,
    approvePlan: approvePlan,
    approveLastPlan: approveLastPlan,
    rejectPlan: rejectPlan,
    rejectLastPlan: rejectLastPlan,
    clearApproval: clearApproval,
    canApplyApprovedPlan: canApplyApprovedPlan,
    consumeApprovedPlan: consumeApprovedPlan
  };

  try { init(); } catch (_) {}

})(window);
