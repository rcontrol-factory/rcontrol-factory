/* FILE: /app/js/core/factory_ai_proposal_ui.js
   RControl Factory — Factory AI Proposal UI
   v1.0.0 SUPERVISED PROPOSAL PANEL

   Objetivo:
   - exibir proposta supervisionada da Factory AI
   - mostrar alvo, risco, bloqueios, próximo passo e contexto operacional
   - permitir aprovação humana antes de qualquer stage/apply
   - integrar autoheal + bridge + execution gate + patch supervisor
   - atualizar UI após proposal / approval / stage / apply
   - NÃO aplicar patch automaticamente
   - funcionar como script clássico
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_PROPOSAL_UI && global.RCF_FACTORY_AI_PROPOSAL_UI.__v100) return;

  var VERSION = "v1.0.0";
  var STORAGE_KEY = "rcf:factory_ai_proposal_ui";
  var BOX_ID = "rcfFactoryAIProposalBox";
  var STYLE_ID = "rcfFactoryAIProposalStyleV100";
  var MAX_HISTORY = 80;

  var state = {
    version: VERSION,
    ready: false,
    mounted: false,
    mountedIn: "",
    lastUpdate: null,
    lastRenderAt: null,
    lastAction: "",
    lastProposalId: "",
    lastStatusText: "aguardando proposta",
    lastResultText: "",
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

  function normalizePath(path) {
    var p = trimText(path || "").replace(/\\/g, "/");
    if (!p) return "";
    if (p.charAt(0) !== "/") p = "/" + p;
    p = p.replace(/\/{2,}/g, "/");
    return p;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;"
      })[c];
    });
  }

  function pretty(obj) {
    try { return JSON.stringify(obj, null, 2); }
    catch (_) { return String(obj || ""); }
  }

  function normalizeRisk(risk) {
    var r = lower(risk || "");
    if (!r) return "unknown";
    if (r.indexOf("low") >= 0 || r.indexOf("baixo") >= 0 || r.indexOf("safe") >= 0 || r.indexOf("seguro") >= 0) return "low";
    if (r.indexOf("medium") >= 0 || r.indexOf("médio") >= 0 || r.indexOf("medio") >= 0) return "medium";
    if (r.indexOf("high") >= 0 || r.indexOf("alto") >= 0 || r.indexOf("crit") >= 0) return "high";
    return "unknown";
  }

  function pushLog(level, msg, extra) {
    try {
      if (extra !== undefined) {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_PROPOSAL_UI] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_PROPOSAL_UI] " + msg);
      }
    } catch (_) {}

    try { console.log("[FACTORY_AI_PROPOSAL_UI]", level, msg, extra || ""); } catch (_) {}
  }

  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function persist() {
    try {
      state.lastUpdate = nowISO();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: state.version,
        ready: !!state.ready,
        mounted: !!state.mounted,
        mountedIn: state.mountedIn || "",
        lastUpdate: state.lastUpdate,
        lastRenderAt: state.lastRenderAt,
        lastAction: state.lastAction || "",
        lastProposalId: state.lastProposalId || "",
        lastStatusText: state.lastStatusText || "",
        lastResultText: state.lastResultText || "",
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
      state.mounted = !!parsed.mounted;
      state.mountedIn = parsed.mountedIn || "";
      state.lastUpdate = parsed.lastUpdate || null;
      state.lastRenderAt = parsed.lastRenderAt || null;
      state.lastAction = parsed.lastAction || "";
      state.lastProposalId = parsed.lastProposalId || "";
      state.lastStatusText = parsed.lastStatusText || "aguardando proposta";
      state.lastResultText = parsed.lastResultText || "";
      state.history = Array.isArray(parsed.history) ? parsed.history.slice(-MAX_HISTORY) : [];
      return true;
    } catch (_) {
      return false;
    }
  }

  function pushHistory(entry) {
    if (!Array.isArray(state.history)) state.history = [];
    state.history.push(clone(entry || {}));
    if (state.history.length > MAX_HISTORY) {
      state.history = state.history.slice(-MAX_HISTORY);
    }
    persist();
  }

  function setStatus(text) {
    state.lastStatusText = trimText(text || "") || "aguardando";
    persist();

    var el = global.document && document.getElementById("rcfFactoryAIProposalStatus");
    if (el) el.textContent = state.lastStatusText;
  }

  function setResult(text) {
    state.lastResultText = trimText(text || "");
    persist();

    var el = global.document && document.getElementById("rcfFactoryAIProposalResult");
    if (el) el.textContent = state.lastResultText || "Pronto.";
  }

  function getFactoryAIView() {
    return (
      document.getElementById("view-factory-ai") ||
      document.querySelector('[data-rcf-view="factory-ai"]') ||
      document.querySelector("#rcfFactoryAIView") ||
      document.querySelector("[data-rcf-factory-ai-view]")
    );
  }

  function getAdminView() {
    return (
      document.getElementById("view-admin") ||
      document.querySelector('[data-rcf-view="admin"]')
    );
  }

  function getPreferredSlots() {
    var out = {
      primary: null,
      fallback: null
    };

    try {
      var ui = global.RCF_UI;
      if (ui && typeof ui.getSlot === "function") {
        out.primary =
          ui.getSlot("factoryai.tools") ||
          ui.getSlot("factoryai.proposal") ||
          null;

        out.fallback =
          ui.getSlot("admin.integrations") ||
          ui.getSlot("admin.top") ||
          null;
      }
    } catch (_) {}

    if (!out.primary) {
      out.primary =
        document.getElementById("rcfFactoryAISlotTools") ||
        document.querySelector('[data-rcf-slot="factoryai.tools"]') ||
        document.querySelector('[data-rcf-slot="factoryai.proposal"]') ||
        (getFactoryAIView() ? getFactoryAIView() : null) ||
        null;
    }

    if (!out.fallback) {
      out.fallback =
        document.getElementById("rcfAdminSlotIntegrations") ||
        document.querySelector('[data-rcf-slot="admin.integrations"]') ||
        getAdminView() ||
        null;
    }

    return out;
  }

  function getAutoHeal() {
    return safe(function () { return global.RCF_FACTORY_AI_AUTOHEAL || null; }, null);
  }

  function getDiagnostics() {
    return safe(function () { return global.RCF_FACTORY_AI_DIAGNOSTICS || null; }, null);
  }

  function getBridge() {
    return safe(function () { return global.RCF_FACTORY_AI_BRIDGE || null; }, null);
  }

  function getExecutionGate() {
    return safe(function () { return global.RCF_FACTORY_AI_EXECUTION_GATE || null; }, null);
  }

  function getPatchSupervisor() {
    return safe(function () { return global.RCF_PATCH_SUPERVISOR || null; }, null);
  }

  function getRuntime() {
    return safe(function () { return global.RCF_FACTORY_AI_RUNTIME || null; }, null);
  }

  function getPhaseContext() {
    return safe(function () {
      if (global.RCF_FACTORY_PHASE_ENGINE?.buildPhaseContext) {
        return global.RCF_FACTORY_PHASE_ENGINE.buildPhaseContext();
      }
      return {};
    }, {});
  }

  function getAutoHealProposal() {
    var api = getAutoHeal();
    if (!api || typeof api.getLastProposal !== "function") return null;
    return clone(api.getLastProposal() || null);
  }

  function getBridgePlan() {
    var api = getBridge();
    if (!api || typeof api.getLastPlan !== "function") return null;
    return clone(api.getLastPlan() || null);
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

    return null;
  }

  function getPatchStatus() {
    var api = getPatchSupervisor();
    if (!api || typeof api.status !== "function") return {};
    return clone(api.status() || {});
  }

  function getDisplayModel() {
    var proposal = getAutoHealProposal();
    var plan = getBridgePlan();
    var diag = getDiagnosticsReport();
    var phaseCtx = getPhaseContext();
    var patchStatus = getPatchStatus();

    var targetFile =
      normalizePath(safe(function () { return proposal.targetFile; }, "")) ||
      normalizePath(safe(function () { return plan.targetFile; }, "")) ||
      normalizePath(safe(function () { return plan.nextFile; }, "")) ||
      normalizePath(safe(function () { return diag.nextFocus.targetFile; }, ""));

    var risk =
      normalizeRisk(safe(function () { return proposal.risk; }, "")) ||
      normalizeRisk(safe(function () { return plan.risk; }, ""));

    var approvalStatus =
      trimText(safe(function () { return plan.approvalStatus; }, "")) ||
      trimText(safe(function () { return proposal.approvalStatus; }, "")) ||
      "";

    var proposalId =
      trimText(safe(function () { return proposal.id; }, "")) ||
      trimText(safe(function () { return plan.id; }, ""));

    var blocked = !!safe(function () { return proposal.blocked; }, false);
    var blockedReason = trimText(safe(function () { return proposal.blockedReason; }, ""));
    var objective =
      trimText(safe(function () { return proposal.objective; }, "")) ||
      trimText(safe(function () { return plan.objective; }, "")) ||
      "Proposta supervisionada da Factory AI";
    var reason =
      trimText(safe(function () { return proposal.reason; }, "")) ||
      trimText(safe(function () { return diag.nextFocus.reason; }, "")) ||
      "";
    var nextStep =
      trimText(safe(function () { return proposal.nextStep; }, "")) ||
      trimText(safe(function () { return plan.nextStep; }, "")) ||
      "";
    var patchSummary =
      trimText(safe(function () { return proposal.patchSummary; }, "")) ||
      trimText(safe(function () { return plan.patchSummary; }, "")) ||
      "";
    var recommendations = asArray(safe(function () { return diag.recommendations; }, []));
    var phaseTitle =
      trimText(safe(function () { return phaseCtx.activePhase.title; }, "")) ||
      trimText(safe(function () { return phaseCtx.activePhaseTitle; }, ""));
    var phaseId =
      trimText(safe(function () { return phaseCtx.activePhase.id; }, "")) ||
      trimText(safe(function () { return phaseCtx.activePhaseId; }, ""));

    return {
      proposalId: proposalId,
      objective: objective,
      targetFile: targetFile,
      risk: risk || "unknown",
      approvalStatus: approvalStatus || "pending",
      blocked: blocked,
      blockedReason: blockedReason,
      reason: reason,
      nextStep: nextStep,
      patchSummary: patchSummary,
      phaseTitle: phaseTitle,
      phaseId: phaseId,
      recommendations: clone(recommendations.slice(0, 8)),
      hasStagedPatch: !!patchStatus.hasStagedPatch,
      stagedTargetFile: trimText(patchStatus.stagedTargetFile || ""),
      lastApplyOk: !!patchStatus.lastApplyOk,
      rawProposal: clone(proposal || null),
      rawPlan: clone(plan || null),
      rawDiagnostics: clone(diag || null)
    };
  }

  function riskLabel(risk) {
    var r = normalizeRisk(risk);
    if (r === "low") return "baixo";
    if (r === "medium") return "médio";
    if (r === "high") return "alto";
    return "unknown";
  }

  function buildBoxHtml(model) {
    var hasProposal = !!trimText(model.proposalId || "") || !!trimText(model.targetFile || "");
    var blockedText = model.blocked
      ? ("Bloqueado: " + esc(model.blockedReason || "há uma etapa humana pendente."))
      : "Pronto para seguir com aprovação humana supervisionada.";
    var phaseLabel = model.phaseTitle ? esc(model.phaseTitle) : "fase não consolidada";
    var recs = asArray(model.recommendations);

    return [
      '<div class="rcfProposalShell">',
        '<div class="rcfProposalHead">',
          '<div class="rcfProposalHeadText">',
            '<div class="rcfProposalKicker">Factory AI Proposal</div>',
            '<h3 class="rcfProposalTitle">Proposta supervisionada</h3>',
            '<div class="rcfProposalSub">Painel operacional para aprovar, validar, stagear e aplicar com supervisão humana.</div>',
          '</div>',
          '<div class="rcfProposalPills">',
            '<span class="rcfProposalPill">fase: ' + phaseLabel + '</span>',
            '<span class="rcfProposalPill">risco: ' + esc(riskLabel(model.risk)) + '</span>',
          '</div>',
        '</div>',

        '<div class="rcfProposalGrid">',
          '<div class="rcfProposalCard">',
            '<div class="rcfProposalCardLabel">Objetivo</div>',
            '<div class="rcfProposalCardValue">' + esc(model.objective || "dado ausente") + '</div>',
          '</div>',

          '<div class="rcfProposalCard">',
            '<div class="rcfProposalCardLabel">Arquivo alvo</div>',
            '<div class="rcfProposalCardValue mono">' + esc(model.targetFile || "dado ausente") + '</div>',
          '</div>',

          '<div class="rcfProposalCard">',
            '<div class="rcfProposalCardLabel">Proposal ID</div>',
            '<div class="rcfProposalCardValue mono">' + esc(model.proposalId || "dado ausente") + '</div>',
          '</div>',

          '<div class="rcfProposalCard">',
            '<div class="rcfProposalCardLabel">Approval status</div>',
            '<div class="rcfProposalCardValue">' + esc(model.approvalStatus || "pending") + '</div>',
          '</div>',
        '</div>',

        '<div class="rcfProposalBlock">',
          '<div class="rcfProposalBlockTitle">Resumo</div>',
          '<div class="rcfProposalText">' + esc(model.patchSummary || model.reason || "Ainda sem resumo consolidado.") + '</div>',
        '</div>',

        '<div class="rcfProposalBlock">',
          '<div class="rcfProposalBlockTitle">Próximo passo</div>',
          '<div class="rcfProposalText">' + esc(model.nextStep || "Gerar ou consolidar uma proposta supervisionada antes de seguir.") + '</div>',
        '</div>',

        '<div class="rcfProposalBanner ' + (model.blocked ? "isBlocked" : "isReady") + '">',
          esc(blockedText),
        '</div>',

        '<div class="rcfProposalActions">',
          '<button type="button" class="rcfProposalBtn" id="rcfFactoryAIProposalRefresh">Atualizar proposta</button>',
          '<button type="button" class="rcfProposalBtn primary" id="rcfFactoryAIProposalApprove" ' + (!hasProposal ? 'disabled="disabled"' : '') + '>Aprovar</button>',
          '<button type="button" class="rcfProposalBtn" id="rcfFactoryAIProposalValidate" ' + (!hasProposal ? 'disabled="disabled"' : '') + '>Validar</button>',
          '<button type="button" class="rcfProposalBtn" id="rcfFactoryAIProposalStage" ' + (!hasProposal ? 'disabled="disabled"' : '') + '>Stage</button>',
          '<button type="button" class="rcfProposalBtn" id="rcfFactoryAIProposalApply" ' + (!hasProposal ? 'disabled="disabled"' : '') + '>Apply</button>',
          '<button type="button" class="rcfProposalBtn danger" id="rcfFactoryAIProposalReject" ' + (!hasProposal ? 'disabled="disabled"' : '') + '>Rejeitar</button>',
        '</div>',

        '<div class="rcfProposalBottom">',
          '<div id="rcfFactoryAIProposalStatus" class="rcfProposalStatus">' + esc(state.lastStatusText || "aguardando proposta") + '</div>',
        '</div>',

        '<details class="rcfProposalDetails">',
          '<summary>Contexto técnico</summary>',
          '<div class="rcfProposalDetailsGrid">',
            '<div>',
              '<div class="rcfProposalCardLabel">Recomendações</div>',
              '<pre class="rcfProposalPre">' + esc(recs.length ? recs.join("\n") : "sem recomendações no diagnóstico atual") + '</pre>',
            '</div>',
            '<div>',
              '<div class="rcfProposalCardLabel">Último resultado</div>',
              '<pre id="rcfFactoryAIProposalResult" class="rcfProposalPre">' + esc(state.lastResultText || "Pronto.") + '</pre>',
            '</div>',
          '</div>',
        '</details>',
      '</div>'
    ].join("");
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    var st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = [
      "#" + BOX_ID + "{margin-top:12px;border:1px solid rgba(31,41,55,.08);border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(247,249,255,.92));box-shadow:0 8px 24px rgba(15,23,42,.05);overflow:hidden;}",
      "#" + BOX_ID + ".card{padding:0;}",
      "#" + BOX_ID + " .rcfProposalShell{padding:16px;display:grid;gap:12px;}",
      "#" + BOX_ID + " .rcfProposalHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;}",
      "#" + BOX_ID + " .rcfProposalKicker{font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:rgba(32,45,77,.58);}",
      "#" + BOX_ID + " .rcfProposalTitle{margin:2px 0 0;font-size:20px;line-height:1.1;color:#202d4d;}",
      "#" + BOX_ID + " .rcfProposalSub{margin-top:4px;font-size:13px;line-height:1.45;color:rgba(32,45,77,.72);max-width:780px;}",
      "#" + BOX_ID + " .rcfProposalPills{display:flex;gap:8px;flex-wrap:wrap;}",
      "#" + BOX_ID + " .rcfProposalPill{display:inline-flex;align-items:center;min-height:30px;padding:0 10px;border-radius:999px;border:1px solid rgba(31,41,55,.08);background:#fff;font-size:12px;font-weight:800;color:#4c5e8e;}",
      "#" + BOX_ID + " .rcfProposalGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}",
      "#" + BOX_ID + " .rcfProposalCard{border:1px solid rgba(31,41,55,.08);border-radius:18px;background:rgba(255,255,255,.88);padding:12px;}",
      "#" + BOX_ID + " .rcfProposalCardLabel{font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:rgba(32,45,77,.56);margin-bottom:6px;}",
      "#" + BOX_ID + " .rcfProposalCardValue{font-size:14px;line-height:1.45;color:#202d4d;word-break:break-word;}",
      "#" + BOX_ID + " .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}",
      "#" + BOX_ID + " .rcfProposalBlock{border:1px solid rgba(31,41,55,.08);border-radius:18px;background:rgba(255,255,255,.84);padding:12px;}",
      "#" + BOX_ID + " .rcfProposalBlockTitle{font-size:12px;font-weight:900;color:#202d4d;margin-bottom:6px;}",
      "#" + BOX_ID + " .rcfProposalText{font-size:14px;line-height:1.5;color:#273657;white-space:pre-wrap;word-break:break-word;}",
      "#" + BOX_ID + " .rcfProposalBanner{padding:12px 14px;border-radius:16px;font-size:13px;font-weight:800;line-height:1.45;border:1px solid rgba(31,41,55,.08);}",
      "#" + BOX_ID + " .rcfProposalBanner.isReady{background:rgba(232,247,237,.95);color:#1f5b38;border-color:rgba(31,91,56,.14);}",
      "#" + BOX_ID + " .rcfProposalBanner.isBlocked{background:rgba(255,243,228,.96);color:#8a4c10;border-color:rgba(138,76,16,.14);}",
      "#" + BOX_ID + " .rcfProposalActions{display:flex;gap:8px;flex-wrap:wrap;}",
      "#" + BOX_ID + " .rcfProposalBtn{min-height:36px;padding:0 14px;border-radius:12px;border:1px solid rgba(31,41,55,.08);background:#fff;color:#42527f;font-size:13px;font-weight:900;cursor:pointer;}",
      "#" + BOX_ID + " .rcfProposalBtn.primary{background:linear-gradient(180deg,rgba(223,232,255,.98),rgba(210,223,255,.92));border-color:rgba(112,152,255,.20);color:#26407a;}",
      "#" + BOX_ID + " .rcfProposalBtn.danger{background:rgba(255,245,245,.96);color:#9a2d2d;}",
      "#" + BOX_ID + " .rcfProposalBtn[disabled]{opacity:.45;cursor:not-allowed;}",
      "#" + BOX_ID + " .rcfProposalBottom{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;}",
      "#" + BOX_ID + " .rcfProposalStatus{font-size:13px;font-weight:800;color:rgba(32,45,77,.80);}",
      "#" + BOX_ID + " .rcfProposalDetails{border:1px solid rgba(31,41,55,.08);border-radius:18px;background:rgba(255,255,255,.75);padding:10px 12px;}",
      "#" + BOX_ID + " .rcfProposalDetails summary{cursor:pointer;font-weight:900;color:#202d4d;}",
      "#" + BOX_ID + " .rcfProposalDetailsGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;}",
      "#" + BOX_ID + " .rcfProposalPre{margin:0;white-space:pre-wrap;word-break:break-word;max-height:24vh;overflow:auto;font-size:12px;line-height:1.45;color:#203050;}",
      "@media (max-width: 720px){",
      "#" + BOX_ID + " .rcfProposalGrid{grid-template-columns:1fr;}",
      "#" + BOX_ID + " .rcfProposalDetailsGrid{grid-template-columns:1fr;}",
      "#" + BOX_ID + " .rcfProposalTitle{font-size:18px;}",
      "}"
    ].join("");
    document.head.appendChild(st);
  }

  function ensureBox(slot) {
    if (!slot) return null;

    ensureStyle();

    var box = document.getElementById(BOX_ID);
    if (!box) {
      box = document.createElement("div");
      box.id = BOX_ID;
      box.className = "card";
      box.setAttribute("data-rcf-factory-ai-proposal", "1");
      box.setAttribute("data-rcf-build", VERSION);
      slot.appendChild(box);
    } else if (box.parentNode !== slot) {
      slot.appendChild(box);
    }

    return box;
  }

  function render() {
    var slots = getPreferredSlots();
    var slot = slots.primary || slots.fallback || null;
    if (!slot) return false;

    var box = ensureBox(slot);
    if (!box) return false;

    var model = getDisplayModel();
    state.lastProposalId = trimText(model.proposalId || "");
    state.lastRenderAt = nowISO();
    state.mounted = true;
    state.mountedIn = slot.id || slot.getAttribute("data-rcf-slot") || slot.className || "unknown";

    box.innerHTML = buildBoxHtml(model);
    bindButtons(model);
    persist();
    return true;
  }

  function mountLoop() {
    if (render()) return true;
    setTimeout(function () { try { render(); } catch (_) {} }, 700);
    setTimeout(function () { try { render(); } catch (_) {} }, 1500);
    setTimeout(function () { try { render(); } catch (_) {} }, 2600);
    return false;
  }

  function toResultText(result) {
    if (!result) return "sem resultado";
    if (typeof result === "string") return result;

    if (result.error) return trimText(result.error);
    if (result.msg) return trimText(result.msg);
    if (result.analysis) return trimText(result.analysis);

    return pretty(result);
  }

  async function callExecutionGate(action, proposalId) {
    var gate = getExecutionGate();
    var runtime = getRuntime();
    var bridge = getBridge();
    var patch = getPatchSupervisor();

    var pid = trimText(proposalId || state.lastProposalId || "");

    if (action === "approve") {
      if (gate) {
        if (typeof gate.approve === "function") return gate.approve(pid);
        if (typeof gate.approvePlan === "function") return gate.approvePlan(pid);
      }
      if (runtime && typeof runtime.approvePlan === "function") return runtime.approvePlan(pid);
      if (bridge && typeof bridge.approvePlan === "function") return bridge.approvePlan(pid);
      return { ok: false, msg: "execution gate/runtime/bridge indisponível para aprovação." };
    }

    if (action === "validate") {
      if (gate) {
        if (typeof gate.validate === "function") return gate.validate(pid);
        if (typeof gate.validateApprovedPlan === "function") return gate.validateApprovedPlan(pid);
      }
      if (runtime && typeof runtime.validateApprovedPlan === "function") return runtime.validateApprovedPlan(pid);
      if (patch && typeof patch.validateApprovedPlan === "function") return patch.validateApprovedPlan(pid);
      return { ok: false, msg: "execution gate/runtime/patch supervisor indisponível para validação." };
    }

    if (action === "stage") {
      if (gate) {
        if (typeof gate.stage === "function") return gate.stage(pid);
        if (typeof gate.stageApprovedPlan === "function") return gate.stageApprovedPlan(pid);
      }
      if (runtime && typeof runtime.stageApprovedPlan === "function") return runtime.stageApprovedPlan(pid);
      if (patch && typeof patch.stageApprovedPlan === "function") return patch.stageApprovedPlan(pid);
      return { ok: false, msg: "execution gate/runtime/patch supervisor indisponível para stage." };
    }

    if (action === "apply") {
      if (gate) {
        if (typeof gate.apply === "function") return gate.apply(pid);
        if (typeof gate.applyApprovedPlan === "function") return gate.applyApprovedPlan(pid);
      }
      if (runtime && typeof runtime.applyApprovedPlan === "function") return runtime.applyApprovedPlan(pid);
      if (patch && typeof patch.applyApprovedPlan === "function") return patch.applyApprovedPlan(pid);
      return { ok: false, msg: "execution gate/runtime/patch supervisor indisponível para apply." };
    }

    if (action === "reject") {
      if (gate) {
        if (typeof gate.reject === "function") return gate.reject(pid);
        if (typeof gate.rejectPlan === "function") return gate.rejectPlan(pid);
      }
      if (bridge) {
        if (typeof bridge.rejectPlan === "function") return bridge.rejectPlan(pid, "rejeitado pelo proposal ui");
        if (typeof bridge.rejectLastPlan === "function") return bridge.rejectLastPlan({ planId: pid, reason: "rejeitado pelo proposal ui" });
      }
      return { ok: false, msg: "execution gate/bridge indisponível para rejeição." };
    }

    return { ok: false, msg: "ação desconhecida na proposal ui" };
  }

  async function refreshProposal() {
    state.lastAction = "refresh";
    setStatus("atualizando proposta...");

    var autoheal = getAutoHeal();
    var diagnostics = getDiagnostics();
    var result = null;

    try {
      if (diagnostics && typeof diagnostics.scan === "function") {
        diagnostics.scan();
      }

      if (autoheal && typeof autoheal.scan === "function") {
        result = autoheal.scan();
      } else {
        result = { ok: false, msg: "autoheal indisponível no runtime atual." };
      }

      setResult(toResultText(result));
      pushHistory({
        type: "refresh",
        ts: nowISO(),
        ok: !!safe(function () { return result.ok; }, false),
        proposalId: trimText(safe(function () { return result.proposal.id; }, ""))
      });

      setStatus(result && result.ok ? "proposta atualizada" : "falha ao atualizar proposta");
      render();

      emit("RCF:FACTORY_AI_PROPOSAL_REFRESH", {
        result: clone(result || {})
      });

      return result;
    } catch (e) {
      var fail = { ok: false, msg: String(e && e.message || e || "falha ao atualizar proposta") };
      setResult(toResultText(fail));
      setStatus("erro ao atualizar proposta");
      return fail;
    }
  }

  async function runAction(action, proposalId) {
    state.lastAction = trimText(action || "");
    setStatus("executando " + action + "...");
    var result = await callExecutionGate(action, proposalId);

    setResult(toResultText(result));
    setStatus(result && result.ok ? (action + " concluído") : (action + " falhou"));

    pushHistory({
      type: action,
      ts: nowISO(),
      ok: !!safe(function () { return result.ok; }, false),
      proposalId: trimText(proposalId || state.lastProposalId || "")
    });

    render();

    emit("RCF:FACTORY_AI_PROPOSAL_ACTION", {
      action: action,
      proposalId: trimText(proposalId || state.lastProposalId || ""),
      result: clone(result || {})
    });

    return result;
  }

  function bindButtons(model) {
    var refreshBtn = document.getElementById("rcfFactoryAIProposalRefresh");
    var approveBtn = document.getElementById("rcfFactoryAIProposalApprove");
    var validateBtn = document.getElementById("rcfFactoryAIProposalValidate");
    var stageBtn = document.getElementById("rcfFactoryAIProposalStage");
    var applyBtn = document.getElementById("rcfFactoryAIProposalApply");
    var rejectBtn = document.getElementById("rcfFactoryAIProposalReject");

    if (refreshBtn && !refreshBtn.__boundV100) {
      refreshBtn.__boundV100 = true;
      refreshBtn.addEventListener("click", function () {
        refreshProposal();
      }, { passive: true });
    }

    if (approveBtn && !approveBtn.__boundV100) {
      approveBtn.__boundV100 = true;
      approveBtn.addEventListener("click", function () {
        runAction("approve", model.proposalId);
      }, { passive: true });
    }

    if (validateBtn && !validateBtn.__boundV100) {
      validateBtn.__boundV100 = true;
      validateBtn.addEventListener("click", function () {
        runAction("validate", model.proposalId);
      }, { passive: true });
    }

    if (stageBtn && !stageBtn.__boundV100) {
      stageBtn.__boundV100 = true;
      stageBtn.addEventListener("click", function () {
        runAction("stage", model.proposalId);
      }, { passive: true });
    }

    if (applyBtn && !applyBtn.__boundV100) {
      applyBtn.__boundV100 = true;
      applyBtn.addEventListener("click", function () {
        runAction("apply", model.proposalId);
      }, { passive: true });
    }

    if (rejectBtn && !rejectBtn.__boundV100) {
      rejectBtn.__boundV100 = true;
      rejectBtn.addEventListener("click", function () {
        runAction("reject", model.proposalId);
      }, { passive: true });
    }
  }

  function syncPresence() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAIProposalUI");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAIProposalUI", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAIProposalUI");
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
        try { mountLoop(); } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      global.addEventListener("RCF:FACTORY_AI_AUTOHEAL_PROPOSAL", function () {
        try {
          setStatus("nova proposta supervisionada disponível");
          render();
        } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      global.addEventListener("RCF:FACTORY_AI_APPROVED", function () {
        try {
          setStatus("proposta aprovada");
          render();
        } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      global.addEventListener("RCF:FACTORY_AI_REJECTED", function () {
        try {
          setStatus("proposta rejeitada");
          render();
        } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      global.addEventListener("RCF:PATCH_STAGED", function () {
        try {
          setStatus("patch staged");
          render();
        } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      global.addEventListener("RCF:PATCH_APPLIED", function () {
        try {
          setStatus("patch aplicado");
          render();
        } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      global.addEventListener("RCF:PATCH_APPLY_FAILED", function () {
        try {
          setStatus("falha no apply");
          render();
        } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      global.addEventListener("visibilitychange", function () {
        try {
          if (document.visibilityState === "visible") render();
        } catch (_) {}
      }, { passive: true });
    } catch (_) {}

    try {
      global.addEventListener("pageshow", function () {
        try { render(); } catch (_) {}
      }, { passive: true });
    } catch (_) {}
  }

  function status() {
    return {
      version: VERSION,
      ready: !!state.ready,
      mounted: !!state.mounted,
      mountedIn: state.mountedIn || "",
      lastUpdate: state.lastUpdate || null,
      lastRenderAt: state.lastRenderAt || null,
      lastAction: state.lastAction || "",
      lastProposalId: state.lastProposalId || "",
      lastStatusText: state.lastStatusText || "",
      historyCount: Array.isArray(state.history) ? state.history.length : 0
    };
  }

  function init() {
    load();
    state.ready = true;
    state.version = VERSION;
    persist();
    syncPresence();
    bindEvents();
    mountLoop();
    pushLog("OK", "factory_ai_proposal_ui ready ✅ " + VERSION);
    return status();
  }

  global.RCF_FACTORY_AI_PROPOSAL_UI = {
    __v100: true,
    version: VERSION,
    init: init,
    status: status,
    render: render,
    refreshProposal: refreshProposal,
    approve: function () { return runAction("approve", state.lastProposalId); },
    validate: function () { return runAction("validate", state.lastProposalId); },
    stage: function () { return runAction("stage", state.lastProposalId); },
    apply: function () { return runAction("apply", state.lastProposalId); },
    reject: function () { return runAction("reject", state.lastProposalId); },
    getDisplayModel: getDisplayModel,
    getState: function () { return clone(state); }
  };

  try { init(); } catch (_) {}

})(window);
