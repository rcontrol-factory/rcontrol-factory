/* FILE: /app/js/core/factory_ai_memory.js
   RControl Factory — Factory AI Memory
   v1.0.0 SUPERVISED MEMORY ENGINE

   Objetivo:
   - dar memória operacional à Factory AI
   - registrar decisões, planos, patches, aprovações e aprendizados
   - manter histórico útil sem depender do chat visível
   - permitir busca simples por arquivo, tag, tipo e texto
   - preparar base para autonomia supervisionada
   - NÃO aplicar patch automaticamente
   - funcionar como script clássico
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_MEMORY && global.RCF_FACTORY_AI_MEMORY.__v100) return;

  var VERSION = "v1.0.0";
  var STORAGE_KEY = "rcf:factory_ai_memory";
  var MAX_ITEMS = 240;

  var state = {
    version: VERSION,
    ready: false,
    lastUpdate: null,
    counters: {
      total: 0,
      decisions: 0,
      plans: 0,
      patches: 0,
      approvals: 0,
      learnings: 0,
      errors: 0,
      notes: 0
    },
    items: []
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

  function normalizeType(type) {
    var t = trimText(type || "").toLowerCase();
    var allowed = {
      decision: true,
      plan: true,
      patch: true,
      approval: true,
      learning: true,
      error: true,
      note: true
    };
    return allowed[t] ? t : "note";
  }

  function normalizeRisk(risk) {
    var r = trimText(risk || "").toLowerCase();
    if (!r) return "unknown";
    if (r.indexOf("low") >= 0 || r.indexOf("baixo") >= 0 || r.indexOf("safe") >= 0) return "low";
    if (r.indexOf("medium") >= 0 || r.indexOf("médio") >= 0 || r.indexOf("medio") >= 0) return "medium";
    if (r.indexOf("high") >= 0 || r.indexOf("alto") >= 0 || r.indexOf("crit") >= 0) return "high";
    return "unknown";
  }

  function buildId(prefix) {
    return String(prefix || "mem") + "_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now();
  }

  function pushLog(level, msg, extra) {
    try {
      if (extra !== undefined) {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_MEMORY] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_MEMORY] " + msg);
      }
    } catch (_) {}

    try { console.log("[FACTORY_AI_MEMORY]", level, msg, extra || ""); } catch (_) {}
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

      state.version = VERSION;
      state.ready = !!parsed.ready;
      state.lastUpdate = parsed.lastUpdate || null;
      state.counters = clone(parsed.counters || state.counters);
      state.items = asArray(parsed.items).map(function (item) {
        return normalizeItem(item);
      }).filter(Boolean);

      recalcCounters();
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

  function recalcCounters() {
    var counters = {
      total: 0,
      decisions: 0,
      plans: 0,
      patches: 0,
      approvals: 0,
      learnings: 0,
      errors: 0,
      notes: 0
    };

    asArray(state.items).forEach(function (item) {
      counters.total += 1;
      if (item.type === "decision") counters.decisions += 1;
      else if (item.type === "plan") counters.plans += 1;
      else if (item.type === "patch") counters.patches += 1;
      else if (item.type === "approval") counters.approvals += 1;
      else if (item.type === "learning") counters.learnings += 1;
      else if (item.type === "error") counters.errors += 1;
      else counters.notes += 1;
    });

    state.counters = counters;
    return counters;
  }

  function normalizeTags(tags) {
    return uniq(asArray(tags).map(function (tag) {
      return trimText(tag || "").toLowerCase();
    }).filter(Boolean)).slice(0, 20);
  }

  function normalizeItem(input) {
    if (!input || typeof input !== "object") return null;

    var type = normalizeType(input.type);
    var title = trimText(input.title || "");
    var summary = trimText(input.summary || input.text || "");
    var targetFile = normalizePath(input.targetFile || input.file || "");
    var risk = normalizeRisk(input.risk || "");
    var tags = normalizeTags(input.tags || []);
    var meta = clone(input.meta || {});
    var patch = clone(input.patch || null);
    var planId = trimText(input.planId || "");
    var source = trimText(input.source || "factory_ai_memory");
    var approvalStatus = trimText(input.approvalStatus || "");
    var createdAt = trimText(input.createdAt || nowISO());
    var id = trimText(input.id || buildId(type));

    if (!summary && !title && !targetFile) return null;

    return {
      id: id,
      type: type,
      title: title || fallbackTitle(type, targetFile),
      summary: summary || title || targetFile || "(sem resumo)",
      targetFile: targetFile,
      risk: risk,
      tags: tags,
      source: source,
      planId: planId,
      approvalStatus: approvalStatus,
      patch: patch,
      meta: meta,
      createdAt: createdAt,
      updatedAt: trimText(input.updatedAt || createdAt)
    };
  }

  function fallbackTitle(type, file) {
    var t = normalizeType(type);
    if (file) return t + ": " + file;
    return t + " registrado";
  }

  function compactIfNeeded() {
    if (state.items.length <= MAX_ITEMS) return false;
    state.items = state.items.slice(-MAX_ITEMS);
    recalcCounters();
    return true;
  }

  function addItem(input) {
    var item = normalizeItem(input);
    if (!item) return { ok: false, msg: "item inválido" };

    state.items.push(item);
    compactIfNeeded();
    recalcCounters();
    persist();

    pushLog("OK", "memory item added ✅", {
      id: item.id,
      type: item.type,
      targetFile: item.targetFile,
      risk: item.risk
    });

    emit("RCF:FACTORY_AI_MEMORY_ADD", {
      item: clone(item),
      counters: clone(state.counters)
    });

    return { ok: true, item: clone(item), counters: clone(state.counters) };
  }

  function updateItem(id, patch) {
    var want = trimText(id || "");
    if (!want) return { ok: false, msg: "id ausente" };

    var idx = -1;
    for (var i = 0; i < state.items.length; i++) {
      if (String(state.items[i].id || "") === want) {
        idx = i;
        break;
      }
    }

    if (idx < 0) return { ok: false, msg: "item não encontrado" };

    var current = clone(state.items[idx]);
    var merged = clone(current);

    Object.keys(patch || {}).forEach(function (key) {
      merged[key] = clone(patch[key]);
    });

    merged.updatedAt = nowISO();

    var normalized = normalizeItem(merged);
    if (!normalized) return { ok: false, msg: "patch inválido" };

    state.items[idx] = normalized;
    recalcCounters();
    persist();

    pushLog("OK", "memory item updated ✅", { id: want });
    emit("RCF:FACTORY_AI_MEMORY_UPDATE", { item: clone(normalized) });

    return { ok: true, item: clone(normalized), counters: clone(state.counters) };
  }

  function removeItem(id) {
    var want = trimText(id || "");
    if (!want) return { ok: false, msg: "id ausente" };

    var before = state.items.length;
    state.items = state.items.filter(function (item) {
      return String(item.id || "") !== want;
    });

    if (state.items.length === before) {
      return { ok: false, msg: "item não encontrado" };
    }

    recalcCounters();
    persist();

    pushLog("OK", "memory item removed ✅", { id: want });
    emit("RCF:FACTORY_AI_MEMORY_REMOVE", { id: want });

    return { ok: true, id: want, counters: clone(state.counters) };
  }

  function clearAll() {
    state.items = [];
    recalcCounters();
    persist();

    pushLog("WARN", "memory cleared");
    emit("RCF:FACTORY_AI_MEMORY_CLEAR", { ok: true });

    return { ok: true, counters: clone(state.counters) };
  }

  function textMatch(item, query) {
    if (!query) return true;
    var hay = [
      item.id,
      item.type,
      item.title,
      item.summary,
      item.targetFile,
      item.risk,
      item.source,
      item.planId,
      (item.tags || []).join(" "),
      safe(function () { return JSON.stringify(item.meta || {}); }, ""),
      safe(function () { return JSON.stringify(item.patch || {}); }, "")
    ].join(" ").toLowerCase();

    return hay.indexOf(query) >= 0;
  }

  function list(filters) {
    var f = filters && typeof filters === "object" ? filters : {};
    var query = trimText(f.query || "").toLowerCase();
    var type = normalizeType(f.type || "");
    var targetFile = normalizePath(f.targetFile || "");
    var tag = trimText(f.tag || "").toLowerCase();
    var risk = normalizeRisk(f.risk || "");
    var approvalStatus = trimText(f.approvalStatus || "").toLowerCase();
    var limit = Math.max(1, Number(f.limit || 50));

    var useType = trimText(f.type || "") !== "";
    var useRisk = trimText(f.risk || "") !== "";
    var useApproval = approvalStatus !== "";

    var items = state.items.filter(function (item) {
      if (useType && item.type !== type) return false;
      if (targetFile && item.targetFile !== targetFile) return false;
      if (tag && asArray(item.tags).indexOf(tag) < 0) return false;
      if (useRisk && item.risk !== risk) return false;
      if (useApproval && String(item.approvalStatus || "").toLowerCase() !== approvalStatus) return false;
      if (!textMatch(item, query)) return false;
      return true;
    });

    items = items.slice(-limit).reverse();

    return {
      ok: true,
      count: items.length,
      items: clone(items)
    };
  }

  function latestByFile(path, limit) {
    var p = normalizePath(path || "");
    if (!p) return { ok: false, msg: "targetFile ausente" };
    return list({ targetFile: p, limit: limit || 20 });
  }

  function latestByType(type, limit) {
    return list({ type: type, limit: limit || 20 });
  }

  function latest(limit) {
    return list({ limit: limit || 20 });
  }

  function rememberDecision(input) {
    var payload = clone(input || {});
    payload.type = "decision";
    return addItem(payload);
  }

  function rememberLearning(input) {
    var payload = clone(input || {});
    payload.type = "learning";
    return addItem(payload);
  }

  function rememberError(input) {
    var payload = clone(input || {});
    payload.type = "error";
    return addItem(payload);
  }

  function rememberNote(input) {
    var payload = clone(input || {});
    payload.type = "note";
    return addItem(payload);
  }

  function rememberPlan(plan, meta) {
    var p = clone(plan || {});
    var payload = {
      type: "plan",
      title: trimText(p.objective || p.title || "Plano supervisionado"),
      summary: trimText(p.analysis || p.nextStep || p.patchSummary || p.rawText || "Plano registrado"),
      targetFile: normalizePath(p.targetFile || ""),
      risk: normalizeRisk(p.risk || ""),
      tags: uniq([
        "plan",
        p.mode || "",
        p.approvalRequired ? "approval-required" : "no-approval"
      ]),
      source: trimText(p.source || "factory_ai_bridge"),
      planId: trimText(p.id || ""),
      approvalStatus: trimText(p.approvalStatus || "pending"),
      patch: p.proposedCode ? {
        lang: trimText(p.proposedLang || ""),
        code: String(p.proposedCode || "")
      } : null,
      meta: clone(meta || {
        suggestedFiles: clone(p.suggestedFiles || []),
        patchSummary: trimText(p.patchSummary || ""),
        nextStep: trimText(p.nextStep || ""),
        mode: trimText(p.mode || "")
      })
    };

    return addItem(payload);
  }

  function rememberApproval(data) {
    var d = clone(data || {});
    d.type = "approval";
    d.tags = uniq((d.tags || []).concat(["approval"]));
    return addItem(d);
  }

  function rememberPatch(data) {
    var d = clone(data || {});
    d.type = "patch";
    d.tags = uniq((d.tags || []).concat(["patch"]));
    return addItem(d);
  }

  function importFromBridgeLastPlan() {
    var bridge = safe(function () { return global.RCF_FACTORY_AI_BRIDGE || null; }, null);
    if (!bridge || typeof bridge.getLastPlan !== "function") {
      return { ok: false, msg: "Factory AI Bridge indisponível" };
    }

    var plan = bridge.getLastPlan();
    if (!plan || !plan.id) {
      return { ok: false, msg: "sem plano atual no bridge" };
    }

    return rememberPlan(plan, {
      importedFrom: "RCF_FACTORY_AI_BRIDGE.getLastPlan"
    });
  }

  function importFromPatchSupervisorStatus() {
    var sup = safe(function () { return global.RCF_PATCH_SUPERVISOR || null; }, null);
    if (!sup || typeof sup.status !== "function") {
      return { ok: false, msg: "Patch Supervisor indisponível" };
    }

    var st = sup.status() || {};
    return rememberNote({
      title: "Status do Patch Supervisor",
      summary: "Snapshot operacional do supervisor de patch registrado na memória.",
      tags: ["patch-supervisor", "status"],
      source: "patch_supervisor",
      meta: clone(st)
    });
  }

  function buildMemoryContext(limit) {
    var data = latest(limit || 20);
    if (!data.ok) return { ok: false, msg: "falha ao montar contexto" };

    return {
      ok: true,
      version: VERSION,
      counters: clone(state.counters),
      items: clone(data.items)
    };
  }

  function status() {
    return {
      version: VERSION,
      ready: !!state.ready,
      lastUpdate: state.lastUpdate || null,
      counters: clone(state.counters),
      historyCount: asArray(state.items).length
    };
  }

  function syncPresence() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAIMemory");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAIMemory", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAIMemory");
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
      global.addEventListener("RCF:FACTORY_AI_PLAN", function (ev) {
        try {
          var plan = ev && ev.detail ? ev.detail.plan : null;
          if (!plan) return;
          rememberPlan(plan, {
            importedFromEvent: "RCF:FACTORY_AI_PLAN"
          });
        } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      global.addEventListener("RCF:FACTORY_AI_APPROVED", function (ev) {
        try {
          var detail = ev && ev.detail ? ev.detail : {};
          rememberApproval({
            title: "Plano aprovado",
            summary: "Plano supervisionado aprovado para seguir no fluxo.",
            planId: trimText(detail.planId || ""),
            approvalStatus: "approved",
            tags: ["approval", "approved"],
            source: "factory_ai_bridge",
            meta: clone(detail)
          });
        } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      global.addEventListener("RCF:PATCH_SUPERVISOR_STAGE_OK", function (ev) {
        try {
          var detail = ev && ev.detail ? ev.detail : {};
          rememberPatch({
            title: "Patch staged",
            summary: "Patch preparado com sucesso no supervisor.",
            targetFile: normalizePath(detail.targetFile || ""),
            risk: normalizeRisk(detail.risk || ""),
            tags: ["patch", "staged"],
            source: "patch_supervisor",
            planId: trimText(detail.planId || ""),
            approvalStatus: "approved",
            meta: clone(detail)
          });
        } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      global.addEventListener("RCF:PATCH_SUPERVISOR_APPLY_OK", function (ev) {
        try {
          var detail = ev && ev.detail ? ev.detail : {};
          rememberPatch({
            title: "Patch aplicado",
            summary: "Patch aplicado com sucesso via supervisor.",
            targetFile: normalizePath(detail.targetFile || ""),
            risk: normalizeRisk(detail.risk || ""),
            tags: ["patch", "applied"],
            source: "patch_supervisor",
            planId: trimText(detail.planId || ""),
            approvalStatus: "approved",
            meta: clone(detail)
          });
        } catch (_) {}
      }, { passive: true });
    } catch (_) {}
  }

  function init() {
    load();
    state.ready = true;
    state.version = VERSION;
    recalcCounters();
    persist();
    syncPresence();
    bindEvents();

    pushLog("OK", "factory_ai_memory ready ✅ " + VERSION);
    return status();
  }

  global.RCF_FACTORY_AI_MEMORY = {
    __v100: true,
    version: VERSION,
    init: init,
    status: status,
    getState: function () { return clone(state); },
    addItem: addItem,
    updateItem: updateItem,
    removeItem: removeItem,
    clearAll: clearAll,
    list: list,
    latest: latest,
    latestByFile: latestByFile,
    latestByType: latestByType,
    rememberDecision: rememberDecision,
    rememberPlan: rememberPlan,
    rememberPatch: rememberPatch,
    rememberApproval: rememberApproval,
    rememberLearning: rememberLearning,
    rememberError: rememberError,
    rememberNote: rememberNote,
    importFromBridgeLastPlan: importFromBridgeLastPlan,
    importFromPatchSupervisorStatus: importFromPatchSupervisorStatus,
    buildMemoryContext: buildMemoryContext
  };

  try { init(); } catch (_) {}

})(window);
