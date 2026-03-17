/* FILE: /app/js/core/factory_ai_policy.js
   RControl Factory — Factory AI Policy
   v1.0.0 CENTRAL POLICY ENGINE

   Objetivo:
   - centralizar regras operacionais da Factory AI e do ecossistema de IAs da Factory
   - separar claramente função de Factory AI, Agent AI, Opportunity Scan, Test AI e Validation AI
   - impedir mistura de papéis entre as IAs
   - servir como base para orchestrator, runtime, backend e camadas futuras
   - manter evolução supervisionada e segura
   - não aplicar patch automaticamente
   - funcionar como script clássico
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_POLICY && global.RCF_FACTORY_AI_POLICY.__v100) return;

  var VERSION = "v1.0.0";

  var POLICY = {
    system: {
      id: "rcontrol-factory-policy",
      version: VERSION,
      objective: "Estruturar e governar a evolução supervisionada do ecossistema de IAs da RControl Factory.",
      principles: [
        "segurança antes de velocidade bruta",
        "evolução em camadas",
        "patch mínimo antes de reescrita",
        "aprovação humana antes de apply",
        "separação clara entre inteligência de núcleo e inteligência de produção",
        "não inventar estado do runtime",
        "não executar ações irreversíveis sem validação"
      ]
    },

    agents: {
      factoryAI: {
        id: "factoryAI",
        title: "Factory AI",
        role: "IA central do núcleo da Factory",
        primaryMission: "Estruturar, melhorar, organizar e evoluir a própria Factory e seus módulos internos.",
        allowed: {
          analyzeFactory: true,
          planEvolution: true,
          proposePatch: true,
          proposeNewModule: true,
          updateInternalStructure: true,
          coordinateOtherAgents: true,
          createAppsDirectly: false,
          publishApps: false,
          autonomousApply: false,
          autonomousDestroy: false
        },
        scope: [
          "/app/js/core/",
          "/app/js/admin.admin_ai.js",
          "/functions/api/admin-ai.js",
          "/app/app.js"
        ],
        notes: [
          "Factory AI não é o agente final de produção de apps.",
          "Factory AI pode desenhar módulos e fluxos para outras IAs.",
          "Factory AI pode preparar evolução do núcleo, mas não deve aplicar automaticamente sem aprovação."
        ]
      },

      agentAI: {
        id: "agentAI",
        title: "Agent AI",
        role: "IA de produção de aplicativos",
        primaryMission: "Criar aplicativos, módulos de app, fluxos de app e ativos operacionais fora do núcleo principal.",
        allowed: {
          analyzeFactory: true,
          planEvolution: false,
          proposePatch: true,
          proposeNewModule: true,
          updateInternalStructure: false,
          createAppsDirectly: true,
          publishApps: false,
          autonomousApply: false,
          autonomousDestroy: false
        },
        scope: [
          "/app/apps/",
          "/app/modules/",
          "/app/generated/",
          "/app/preview/"
        ],
        notes: [
          "Agent AI deve focar em produção de apps e não em governança do núcleo da Factory.",
          "Quando precisar alterar o núcleo, deve devolver para Factory AI ou fluxo supervisionado."
        ]
      },

      opportunityScan: {
        id: "opportunityScan",
        title: "Opportunity Scan",
        role: "IA de varredura de oportunidades",
        primaryMission: "Detectar ideias e oportunidades de apps rentáveis e organizá-las para aprovação.",
        allowed: {
          analyzeFactory: false,
          planEvolution: false,
          proposePatch: false,
          proposeNewModule: false,
          updateInternalStructure: false,
          createAppsDirectly: false,
          publishApps: false,
          autonomousApply: false,
          autonomousDestroy: false
        },
        scope: [
          "opportunity:intelligence",
          "opportunity:market-scan",
          "opportunity:idea-queue"
        ],
        notes: [
          "Opportunity Scan não mexe no núcleo.",
          "Opportunity Scan não aplica patch.",
          "Opportunity Scan apenas sugere e organiza oportunidades supervisionadas."
        ]
      },

      testAI: {
        id: "testAI",
        title: "Test AI",
        role: "IA de testes automáticos no Preview",
        primaryMission: "Executar testes funcionais, visuais e comportamentais antes e depois do teste manual.",
        allowed: {
          analyzeFactory: true,
          planEvolution: false,
          proposePatch: true,
          proposeNewModule: false,
          updateInternalStructure: false,
          createAppsDirectly: false,
          publishApps: false,
          autonomousApply: false,
          autonomousDestroy: false
        },
        scope: [
          "/app/preview/",
          "/app/test/",
          "preview-runtime",
          "preview-session"
        ],
        notes: [
          "Test AI não deve validar sozinha publicação final.",
          "Test AI produz relatório e evidência para o fluxo de revisão."
        ]
      },

      validationAI: {
        id: "validationAI",
        title: "Validation AI",
        role: "IA de validação rígida",
        primaryMission: "Executar validação forte depois do teste manual e do teste automático, detectando inconsistências finas.",
        allowed: {
          analyzeFactory: true,
          planEvolution: false,
          proposePatch: true,
          proposeNewModule: false,
          updateInternalStructure: false,
          createAppsDirectly: false,
          publishApps: false,
          autonomousApply: false,
          autonomousDestroy: false
        },
        scope: [
          "/app/preview/",
          "/app/validation/",
          "validation-report",
          "quality-gate"
        ],
        notes: [
          "Validation AI funciona como gate de qualidade mais rígido.",
          "Validation AI não deve aplicar patch automaticamente."
        ]
      }
    },

    flows: {
      supervisedPatchFlow: {
        id: "supervised-patch-flow",
        steps: [
          "analyze",
          "plan",
          "approve",
          "validate",
          "stage",
          "apply"
        ],
        rules: [
          "nunca pular approval humano",
          "não fazer apply automático",
          "não fazer stage sem plano validado",
          "não consumir plano antes da hora"
        ]
      },

      appCreationFlow: {
        id: "app-creation-flow",
        steps: [
          "idea",
          "approval",
          "agent-build",
          "preview",
          "test-ai",
          "manual-test",
          "validation-ai",
          "release-decision",
          "pwa-export"
        ],
        rules: [
          "Factory AI pode estruturar o fluxo, mas Agent AI produz o app",
          "Preview deve existir antes da decisão final",
          "test-ai vem antes da validação final",
          "validation-ai age como camada rígida antes de release"
        ]
      },

      selfEvolutionFlow: {
        id: "self-evolution-flow",
        steps: [
          "snapshot",
          "phase-check",
          "memory-check",
          "plan",
          "approval",
          "validate",
          "stage",
          "apply"
        ],
        rules: [
          "autoloop só roda quando a fase permitir",
          "não sobrescrever proposta pendente",
          "não repetir alvo burro sem considerar memória",
          "toda autoevolução deve continuar supervisionada"
        ]
      }
    },

    routing: {
      defaultIntentOwner: {
        "factory-structure": "factoryAI",
        "factory-evolution": "factoryAI",
        "internal-module-design": "factoryAI",
        "app-building": "agentAI",
        "market-opportunity": "opportunityScan",
        "preview-testing": "testAI",
        "quality-validation": "validationAI"
      },

      keywords: {
        factoryAI: [
          "factory ai",
          "núcleo",
          "core",
          "estrutura",
          "arquitetura",
          "planner",
          "bridge",
          "actions",
          "patch supervisor",
          "autoevolução",
          "self evolution",
          "runtime",
          "orchestrator"
        ],
        agentAI: [
          "agent ai",
          "criar app",
          "gerar aplicativo",
          "app",
          "módulo de app",
          "app builder",
          "produção de app"
        ],
        opportunityScan: [
          "opportunity",
          "oportunidade",
          "nicho",
          "mercado",
          "ideia de app",
          "app rentável",
          "varredura"
        ],
        testAI: [
          "teste",
          "test ai",
          "preview test",
          "qa",
          "funcional",
          "visual"
        ],
        validationAI: [
          "validation",
          "validação",
          "gate",
          "qualidade",
          "verificação rígida",
          "rigor"
        ]
      }
    },

    preview: {
      renameGeneratorToPreview: true,
      previewPurpose: "Mostrar amostra funcional do app antes de exportação final.",
      previewMustSupport: {
        openAppPreview: true,
        inspectVisualResult: true,
        inspectRuntimeResult: true,
        futureTestAI: true,
        futureValidationAI: true,
        futurePWAExport: true
      },
      notes: [
        "Generator deve evoluir para Preview.",
        "Preview é área de visualização e validação antes da exportação final.",
        "PWA final vem depois da aprovação do fluxo."
      ]
    },

    safety: {
      neverDo: [
        "apply automático sem aprovação humana",
        "reescrever toda a Factory sem necessidade",
        "misturar Factory AI com Agent AI como se fossem a mesma função",
        "tratar snapshot parcial como falha confirmada",
        "executar destroy/reset irreversível sem confirmação explícita"
      ],
      alwaysDo: [
        "usar patch mínimo",
        "explicar o próximo passo supervisionado",
        "respeitar fase ativa da Factory",
        "registrar memória quando houver evento relevante",
        "manter separação entre planejamento, teste, validação e produção"
      ]
    }
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

  function lower(v) {
    return trimText(v).toLowerCase();
  }

  function safe(fn, fallback) {
    try {
      var v = fn();
      return v === undefined ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  function pushLog(level, msg, extra) {
    try {
      if (extra !== undefined) {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_POLICY] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_POLICY] " + msg);
      }
    } catch (_) {}

    try { console.log("[FACTORY_AI_POLICY]", level, msg, extra || ""); } catch (_) {}
  }

  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function getAgent(agentId) {
    var id = trimText(agentId || "");
    return clone(safe(function () { return POLICY.agents[id]; }, null));
  }

  function listAgents() {
    return clone(POLICY.agents || {});
  }

  function getFlow(flowId) {
    var id = trimText(flowId || "");
    return clone(safe(function () { return POLICY.flows[id]; }, null));
  }

  function listFlows() {
    return clone(POLICY.flows || {});
  }

  function getPreviewPolicy() {
    return clone(POLICY.preview || {});
  }

  function getSafetyPolicy() {
    return clone(POLICY.safety || {});
  }

  function getSystemPolicy() {
    return clone(POLICY.system || {});
  }

  function getDefaultOwnerByIntent(intentKey) {
    var key = trimText(intentKey || "");
    return trimText(safe(function () { return POLICY.routing.defaultIntentOwner[key]; }, "")) || "";
  }

  function detectOwnerFromPrompt(prompt) {
    var text = lower(prompt || "");
    var routing = POLICY.routing || {};
    var keywords = routing.keywords || {};
    var scores = {
      factoryAI: 0,
      agentAI: 0,
      opportunityScan: 0,
      testAI: 0,
      validationAI: 0
    };

    Object.keys(scores).forEach(function (agentId) {
      var list = Array.isArray(keywords[agentId]) ? keywords[agentId] : [];
      list.forEach(function (word) {
        if (text.indexOf(lower(word)) >= 0) {
          scores[agentId] += 1;
        }
      });
    });

    var best = "";
    var bestScore = 0;

    Object.keys(scores).forEach(function (agentId) {
      if (scores[agentId] > bestScore) {
        best = agentId;
        bestScore = scores[agentId];
      }
    });

    return {
      owner: best || "factoryAI",
      score: bestScore,
      scores: clone(scores)
    };
  }

  function canAgentDo(agentId, actionName) {
    var agent = getAgent(agentId);
    var action = trimText(actionName || "");
    if (!agent || !agent.allowed) return false;
    return !!agent.allowed[action];
  }

  function explainAgent(agentId) {
    var agent = getAgent(agentId);
    if (!agent) {
      return {
        ok: false,
        msg: "agent não encontrado"
      };
    }

    return {
      ok: true,
      agent: clone(agent),
      text: [
        "Agente: " + trimText(agent.title || agent.id || ""),
        "Função: " + trimText(agent.role || ""),
        "Missão: " + trimText(agent.primaryMission || ""),
        "Pode criar apps diretamente: " + (!!safe(function () { return agent.allowed.createAppsDirectly; }, false)),
        "Pode aplicar patch automaticamente: " + (!!safe(function () { return agent.allowed.autonomousApply; }, false)),
        "Escopo: " + (Array.isArray(agent.scope) ? agent.scope.join(", ") : "")
      ].join("\n")
    };
  }

  function buildPolicyContext() {
    var phase = safe(function () { return global.RCF_FACTORY_PHASE_ENGINE?.buildPhaseContext?.(); }, {}) || {};

    return {
      ok: true,
      version: VERSION,
      system: getSystemPolicy(),
      activePhaseId: trimText(safe(function () { return phase.activePhase.id; }, "")),
      activePhaseTitle: trimText(safe(function () { return phase.activePhase.title; }, "")),
      agents: listAgents(),
      flows: listFlows(),
      preview: getPreviewPolicy(),
      safety: getSafetyPolicy()
    };
  }

  function routePrompt(prompt) {
    var detected = detectOwnerFromPrompt(prompt);
    var owner = detected.owner || "factoryAI";
    var agent = getAgent(owner);

    return {
      ok: true,
      prompt: trimText(prompt || ""),
      owner: owner,
      agent: clone(agent),
      scores: clone(detected.scores),
      score: detected.score
    };
  }

  function status() {
    return {
      version: VERSION,
      ready: true,
      systemId: trimText(safe(function () { return POLICY.system.id; }, "")),
      agentsCount: Object.keys(POLICY.agents || {}).length,
      flowsCount: Object.keys(POLICY.flows || {}).length,
      lastUpdate: nowISO()
    };
  }

  function syncPresence() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAIPolicy");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAIPolicy", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAIPolicy");
      }
    } catch (_) {}
  }

  function init() {
    syncPresence();
    pushLog("OK", "factory_ai_policy ready ✅ " + VERSION, {
      agents: Object.keys(POLICY.agents || {}).length,
      flows: Object.keys(POLICY.flows || {}).length
    });

    emit("RCF:FACTORY_AI_POLICY_READY", {
      version: VERSION
    });

    return status();
  }

  global.RCF_FACTORY_AI_POLICY = {
    __v100: true,
    version: VERSION,
    init: init,
    status: status,
    getSystemPolicy: getSystemPolicy,
    getSafetyPolicy: getSafetyPolicy,
    getPreviewPolicy: getPreviewPolicy,
    getAgent: getAgent,
    listAgents: listAgents,
    explainAgent: explainAgent,
    getFlow: getFlow,
    listFlows: listFlows,
    getDefaultOwnerByIntent: getDefaultOwnerByIntent,
    detectOwnerFromPrompt: detectOwnerFromPrompt,
    canAgentDo: canAgentDo,
    buildPolicyContext: buildPolicyContext,
    routePrompt: routePrompt
  };

  try { init(); } catch (_) {}

})(window);
