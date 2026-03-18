/* FILE: /functions/api/admin-ai.js
   RControl Factory — Factory AI API
   v3.5.1 CHAT COPILOT BACKEND + DETERMINISTIC PLANNER HINT + OPENAI STATUS FIX

   PATCH v3.5.1:
   - FIX: retorna status explícito da conexão OpenAI no backend
   - FIX: melhora diagnóstico quando OPENAI_API_KEY estiver ausente
   - FIX: adiciona timeout seguro na chamada upstream
   - FIX: expõe model/provider/upstream status no retorno
   - FIX: mantém compatibilidade total com o fluxo atual
   - FIX: não muda arquitetura central, apenas fortalece diagnóstico e resposta
*/

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env || !env.OPENAI_API_KEY) {
      return json({
        ok: false,
        error: "OPENAI_API_KEY ausente no ambiente.",
        connection: {
          provider: "openai",
          configured: false,
          attempted: false,
          status: "missing_api_key"
        }
      }, 500);
    }

    const body = await safeJson(request);
    if (!body || typeof body !== "object") {
      return json({
        ok: false,
        error: "JSON inválido.",
        connection: {
          provider: "openai",
          configured: true,
          attempted: false,
          status: "invalid_json"
        }
      }, 400);
    }

    const action = normalizeAction(body.action, body.prompt);
    const prompt = String(body.prompt || "").trim();
    const history = normalizeHistory(body.history);
    const attachments = normalizeAttachments(body.attachments);
    const source = String(body.source || "factory-ai").trim();
    const version = String(body.version || "").trim();
    const payload = preparePayloadForModel(body.payload ?? null, prompt, action);

    const allowed = new Set([
      "factory_diagnosis",
      "analyze-architecture",
      "analyze-logs",
      "review-module",
      "suggest-improvement",
      "summarize-structure",
      "propose-patch",
      "generate-code",
      "ingest-context",
      "chat"
    ]);

    if (!allowed.has(action)) {
      return json({
        ok: false,
        error: "Ação não permitida nesta fase.",
        action,
        connection: {
          provider: "openai",
          configured: true,
          attempted: false,
          status: "blocked_action"
        }
      }, 400);
    }

    const input = buildGroundedPrompt({
      action,
      payload,
      prompt,
      history,
      attachments,
      source,
      version
    });

    const model = String(env.OPENAI_MODEL || "gpt-4.1-mini").trim() || "gpt-4.1-mini";
    const upstreamUrl = String(env.OPENAI_BASE_URL || "https://api.openai.com/v1/responses").trim();

    const upstream = await postToOpenAI({
      url: upstreamUrl,
      apiKey: env.OPENAI_API_KEY,
      model,
      input
    });

    if (!upstream.ok) {
      return json({
        ok: false,
        error: "Falha ao chamar OpenAI.",
        status: upstream.status,
        details: upstream.data,
        connection: {
          provider: "openai",
          configured: true,
          attempted: true,
          status: upstream.status === 0 ? "network_error" : "upstream_error",
          model,
          upstreamStatus: upstream.status
        }
      }, 502);
    }

    const data = upstream.data || {};
    const text = extractText(data);
    const derived = deriveResponseHints(text, payload, action, prompt);

    return json({
      ok: true,
      action,
      source,
      version,
      analysis: text || "(sem texto retornado)",
      hints: derived,
      raw: data,
      connection: {
        provider: "openai",
        configured: true,
        attempted: true,
        status: "connected",
        model,
        upstreamStatus: upstream.status
      }
    });
  } catch (err) {
    return json({
      ok: false,
      error: String(err?.message || err || "Erro interno."),
      connection: {
        provider: "openai",
        configured: true,
        attempted: true,
        status: "internal_error"
      }
    }, 500);
  }
}

async function postToOpenAI({ url, apiKey, model, input }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    try { controller.abort(); } catch (_) {}
  }, 45000);

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input
      }),
      signal: controller.signal
    });

    const data = await upstream.json().catch(() => ({}));

    return {
      ok: upstream.ok,
      status: upstream.status,
      data
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: {
        error: String(err?.message || err || "Falha de rede para OpenAI.")
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeAction(value, promptValue = "") {
  const raw = String(value || "").trim().toLowerCase();
  const prompt = String(promptValue || "").trim().toLowerCase();

  if (raw) {
    if (raw === "factory_diagnosis") return "factory_diagnosis";
    if (raw === "analyze-architecture") return "analyze-architecture";
    if (raw === "analyze-logs") return "analyze-logs";
    if (raw === "review-module") return "review-module";
    if (raw === "suggest-improvement") return "suggest-improvement";
    if (raw === "summarize-structure") return "summarize-structure";
    if (raw === "propose-patch") return "propose-patch";
    if (raw === "generate-code") return "generate-code";
    if (raw === "ingest-context") return "ingest-context";
    if (raw === "zip-readiness") return "ingest-context";

    if (
      raw === "plan" ||
      raw === "plan-runtime" ||
      raw === "planner" ||
      raw === "next-file" ||
      raw === "next_file" ||
      raw === "autonomy" ||
      raw === "snapshot" ||
      raw === "validate-patch" ||
      raw === "validate_patch" ||
      raw === "approve-patch" ||
      raw === "approve_patch" ||
      raw === "stage-patch" ||
      raw === "stage_patch" ||
      raw === "apply-patch" ||
      raw === "apply_patch"
    ) {
      return "chat";
    }

    if (raw === "chat") return "chat";
    return raw;
  }

  if (
    prompt.includes("relatório") ||
    prompt.includes("relatorio") ||
    prompt.includes("diagnóstico") ||
    prompt.includes("diagnostico")
  ) {
    return "factory_diagnosis";
  }

  if (
    prompt.includes("arquitetura") ||
    prompt.includes("estrutura") ||
    prompt.includes("organização") ||
    prompt.includes("organizacao")
  ) {
    return "analyze-architecture";
  }

  if (
    prompt.includes("log") ||
    prompt.includes("erro") ||
    prompt.includes("falha") ||
    prompt.includes("crash")
  ) {
    return "analyze-logs";
  }

  if (
    prompt.includes("arquivo completo") ||
    prompt.includes("código completo") ||
    prompt.includes("codigo completo") ||
    prompt.includes("gere o arquivo") ||
    prompt.includes("gera o arquivo")
  ) {
    return "generate-code";
  }

  if (
    prompt.includes("patch") ||
    prompt.includes("corrige") ||
    prompt.includes("corrigir") ||
    prompt.includes("ajuste mínimo") ||
    prompt.includes("ajuste minimo")
  ) {
    return "propose-patch";
  }

  if (
    prompt.includes("zip") ||
    prompt.includes("pdf") ||
    prompt.includes("imagem") ||
    prompt.includes("vídeo") ||
    prompt.includes("video") ||
    prompt.includes("áudio") ||
    prompt.includes("audio") ||
    prompt.includes("anexo")
  ) {
    return "ingest-context";
  }

  return "chat";
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(-12)
    .map((item) => {
      const role = String(item?.role || "user").trim().toLowerCase();
      const text = String(item?.text || item?.content || "").trim();

      if (!text) return null;

      return {
        role: role === "assistant" ? "assistant" : "user",
        text
      };
    })
    .filter(Boolean);
}

function normalizeAttachments(value) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 12)
    .map((item) => {
      const name = String(item?.name || "").trim();
      const kind = String(item?.kind || "unknown").trim();
      const mime = String(item?.mime || "").trim();
      const summary = String(item?.summary || "").trim();
      const size = Number(item?.size || 0) || 0;

      if (!name && !summary) return null;

      return {
        name,
        kind,
        mime,
        size,
        summary
      };
    })
    .filter(Boolean);
}

function preparePayloadForModel(payload, prompt = "", action = "chat") {
  const base = cloneValue(payload);

  if (!base || typeof base !== "object") {
    return base;
  }

  const semantic = buildSnapshotSemanticSummary(base);
  const planner = buildPlannerContext(base, prompt, action);
  const deterministic = buildDeterministicPlannerHint(base, prompt, action);

  const out = cloneValue(base);
  if (semantic) out.__snapshot_semantics = semantic;
  if (planner) out.__planner_context = planner;
  if (deterministic) out.__planner_hint = deterministic;

  return out;
}

function buildSnapshotSemanticSummary(payload) {
  try {
    if (!payload || typeof payload !== "object") return null;

    const snapshot =
      payload.snapshot && typeof payload.snapshot === "object"
        ? payload.snapshot
        : payload;

    if (!snapshot || typeof snapshot !== "object") return null;

    const factory = safeObj(snapshot.factory);
    const modules = safeObj(snapshot.modules);
    const flags = safeObj(snapshot.flags || factory.flags);
    const logger = safeObj(snapshot.logger);
    const doctor = safeObj(snapshot.doctor);
    const github = safeObj(snapshot.github);
    const factoryAI = safeObj(snapshot.factoryAI);
    const admin = safeObj(snapshot.admin);
    const injector = safeObj(snapshot.injector);

    const activeList = Array.isArray(modules.active) ? modules.active.map(String) : [];
    const moduleStatus = safeObj(modules.status || modules.modules || modules);

    const semantics = {
      note: [
        "IMPORTANTE:",
        "- presence = componente detectado no ambiente/flags",
        "- ready = API/componente disponível para uso no runtime",
        "- active = componente marcado como ativo no status/registry/snapshot atual",
        "- activeList = lista explícita de módulos ativos",
        "- presence, ready e active NÃO são sinônimos",
        "- não conclua 'módulo desativado' só porque active=false quando presence=true ou ready=true"
      ].join(" "),
      activeList,
      modules: {
        logger: buildModuleSemantic("logger", {
          presence: boolFrom(flagValue(flags, ["hasLogger"])),
          ready: boolFrom(firstDefined(
            factory.loggerReady,
            logger.ready,
            moduleStatus.loggerReady
          )),
          active: boolFrom(moduleStatus.logger),
          extra: {
            loggerItemsCount: numberOrNull(logger.itemsCount)
          }
        }),
        doctor: buildModuleSemantic("doctor", {
          presence: boolFrom(flagValue(flags, ["hasDoctor"])),
          ready: boolFrom(firstDefined(
            factory.doctorReady,
            doctor.ready,
            moduleStatus.doctorReady
          )),
          active: boolFrom(moduleStatus.doctor),
          extra: {
            lastRun: doctor.lastRun ?? null
          }
        }),
        github: buildModuleSemantic("github", {
          presence: boolFrom(flagValue(flags, ["hasGitHub"])),
          ready: boolFrom(firstDefined(
            github.ready,
            moduleStatus.githubReady
          )),
          active: boolFrom(moduleStatus.github)
        }),
        vault: buildModuleSemantic("vault", {
          presence: boolFrom(flagValue(flags, ["hasVault"])),
          ready: boolFrom(firstDefined(
            moduleStatus.vaultReady
          )),
          active: boolFrom(moduleStatus.vault)
        }),
        bridge: buildModuleSemantic("bridge", {
          presence: boolFrom(flagValue(flags, ["hasBridge"])),
          ready: boolFrom(firstDefined(
            moduleStatus.bridgeReady
          )),
          active: boolFrom(moduleStatus.bridge)
        }),
        adminAI: buildModuleSemantic("adminAI", {
          presence: boolFrom(flagValue(flags, ["hasAdminAI"])),
          ready: boolFrom(firstDefined(
            admin.ready,
            admin.mounted
          )),
          active: boolFrom(moduleStatus.adminAI)
        }),
        factoryAI: buildModuleSemantic("factoryAI", {
          presence: boolFrom(firstDefined(
            flagValue(flags, ["hasFactoryAI"]),
            true
          )),
          ready: boolFrom(firstDefined(
            factoryAI.ready,
            factory.mountedAs === "Factory AI"
          )),
          active: boolFrom(firstDefined(
            moduleStatus.factoryAI,
            true
          )),
          extra: {
            historyCount: numberOrNull(factoryAI.historyCount),
            lastEndpoint: stringOrEmpty(factoryAI.lastEndpoint)
          }
        }),
        factoryState: buildModuleSemantic("factoryState", {
          presence: boolFrom(flagValue(flags, ["hasFactoryState"])),
          ready: boolFrom(firstDefined(
            moduleStatus.factoryStateReady
          )),
          active: boolFrom(moduleStatus.factoryState)
        }),
        moduleRegistry: buildModuleSemantic("moduleRegistry", {
          presence: boolFrom(flagValue(flags, ["hasModuleRegistry"])),
          ready: boolFrom(firstDefined(
            moduleStatus.moduleRegistryReady
          )),
          active: boolFrom(moduleStatus.moduleRegistry)
        }),
        contextEngine: buildModuleSemantic("contextEngine", {
          presence: boolFrom(flagValue(flags, ["hasContextEngine"])),
          ready: boolFrom(firstDefined(
            snapshot.contextEngineReady,
            factoryAI.ready,
            true
          )),
          active: boolFrom(moduleStatus.contextEngine)
        }),
        factoryTree: buildModuleSemantic("factoryTree", {
          presence: boolFrom(flagValue(flags, ["hasFactoryTree"])),
          ready: boolFrom(firstDefined(
            snapshot.tree && typeof snapshot.tree.pathsCount === "number"
              ? snapshot.tree.pathsCount >= 0
              : undefined
          )),
          active: boolFrom(firstDefined(
            moduleStatus.factoryTree,
            moduleStatus.tree
          )),
          extra: {
            pathsCount: numberOrNull(snapshot.tree && snapshot.tree.pathsCount)
          }
        }),
        diagnostics: buildModuleSemantic("diagnostics", {
          presence: boolFrom(flagValue(flags, ["hasDiagnostics"])),
          ready: boolFrom(firstDefined(
            moduleStatus.diagnosticsReady
          )),
          active: boolFrom(moduleStatus.diagnostics)
        }),
        injector: buildModuleSemantic("injector", {
          presence: boolFrom(flagValue(flags, ["hasInjectorSafe"])),
          ready: boolFrom(firstDefined(
            injector.ready
          )),
          active: boolFrom(firstDefined(
            moduleStatus.injector,
            injector.ready
          ))
        })
      }
    };

    semantics.interpretationGuide = [
      "Use esta prioridade ao descrever o snapshot:",
      "1) cite presence quando a flag/hasX confirmar que o componente existe no ambiente",
      "2) cite ready quando um boolean/API do runtime confirmar disponibilidade agora",
      "3) cite active apenas quando o status do módulo ou activeList confirmar ativação",
      "4) se presence=true e active=false, descreva como 'presente, mas não marcado como ativo no snapshot atual'",
      "5) se ready=true e active=false, descreva como 'disponível/pronto, mas não marcado como ativo no status atual'",
      "6) não converta isso automaticamente em falha confirmada"
    ];

    return semantics;
  } catch {
    return null;
  }
}

function buildPlannerContext(payload, prompt = "", action = "chat") {
  try {
    if (!payload || typeof payload !== "object") return null;

    const snapshot = safeObj(payload.snapshot || payload);
    const candidateFiles = Array.isArray(snapshot.candidateFiles) ? snapshot.candidateFiles.slice(0, 24) : [];
    const tree = safeObj(snapshot.tree);
    const pathGroups = safeObj(tree.pathGroups || tree.grouped);
    const activeModules = Array.isArray(snapshot.modules?.active)
      ? snapshot.modules.active.slice(0, 24)
      : [];

    return {
      goalBias: [
        "priorizar evolução da própria Factory AI antes de outros fluxos",
        "evitar cair no ciclo genérico doctor/state/registry/tree sem avanço real",
        "quando possível, indicar próximo arquivo mais estratégico",
        "dar preferência a planner/bridge/actions/backend/chat supervisionado quando a meta for inteligência da Factory"
      ],
      action,
      prompt: String(prompt || ""),
      activeModules,
      candidateFiles,
      pathGroups: {
        core: Array.isArray(pathGroups.core) ? pathGroups.core.slice(0, 12) : [],
        ui: Array.isArray(pathGroups.ui) ? pathGroups.ui.slice(0, 12) : [],
        admin: Array.isArray(pathGroups.admin) ? pathGroups.admin.slice(0, 12) : [],
        engine: Array.isArray(pathGroups.engine) ? pathGroups.engine.slice(0, 12) : [],
        functions: Array.isArray(pathGroups.functions) ? pathGroups.functions.slice(0, 12) : []
      }
    };
  } catch {
    return null;
  }
}

function buildDeterministicPlannerHint(payload, prompt = "", action = "chat") {
  try {
    if (!payload || typeof payload !== "object") return null;

    const snapshot = safeObj(payload.snapshot || payload);
    const tree = safeObj(snapshot.tree);
    const pathGroups = safeObj(tree.pathGroups || tree.grouped);
    const modules = safeObj(snapshot.modules);
    const flags = safeObj(snapshot.flags || snapshot.factory?.flags);

    const activeModules = Array.isArray(modules.active) ? modules.active.slice() : [];
    const candidateFiles = collectCandidateFiles(snapshot, pathGroups);
    const normalizedPrompt = String(prompt || "").trim().toLowerCase();

    const goal = detectBackendGoal(normalizedPrompt, action);
    const ranking = rankStrategicFiles({
      goal,
      activeModules,
      candidateFiles,
      flags,
      snapshot
    });

    const top = ranking[0] || {
      file: "",
      score: 0,
      reasons: ["dado ausente"]
    };

    return {
      goal,
      nextFile: top.file || "",
      score: Number(top.score || 0),
      reasons: Array.isArray(top.reasons) ? top.reasons.slice(0, 6) : [],
      ranking: ranking.slice(0, 8),
      executionLine: buildExecutionLineForGoal(goal, top.file),
      note: [
        "Este planner_hint foi calculado deterministicamente no backend.",
        "Ele deve ter prioridade sobre heurísticas genéricas quando o usuário pedir evolução, autonomia, plano ou próximo arquivo.",
        "Evite cair automaticamente em doctor/state/registry/tree se o contexto atual já aponta para evolução cognitiva da Factory AI."
      ].join(" ")
    };
  } catch {
    return null;
  }
}

function collectCandidateFiles(snapshot, pathGroups) {
  const out = [];

  const directCandidates = Array.isArray(snapshot.candidateFiles) ? snapshot.candidateFiles : [];
  const directSamples = Array.isArray(snapshot.tree?.samples) ? snapshot.tree.samples : [];
  const groupedValues = [
    ...(Array.isArray(pathGroups.core) ? pathGroups.core : []),
    ...(Array.isArray(pathGroups.ui) ? pathGroups.ui : []),
    ...(Array.isArray(pathGroups.admin) ? pathGroups.admin : []),
    ...(Array.isArray(pathGroups.engine) ? pathGroups.engine : []),
    ...(Array.isArray(pathGroups.functions) ? pathGroups.functions : [])
  ];

  for (const item of [...directCandidates, ...directSamples, ...groupedValues]) {
    const normalized = normalizePathLoose(item);
    if (normalized && !out.includes(normalized)) out.push(normalized);
  }

  return out.slice(0, 64);
}

function detectBackendGoal(prompt, action) {
  if (action === "generate-code") return "generate-code";
  if (action === "propose-patch") return "propose-patch";
  if (action === "factory_diagnosis") return "diagnostics";

  if (
    prompt.includes("autonomia") ||
    prompt.includes("autônom") ||
    prompt.includes("autonom") ||
    prompt.includes("evoluir") ||
    prompt.includes("evolução") ||
    prompt.includes("evolucao") ||
    prompt.includes("factory ai") ||
    prompt.includes("próximo arquivo") ||
    prompt.includes("proximo arquivo") ||
    prompt.includes("plano") ||
    prompt.includes("planejar") ||
    prompt.includes("próxima etapa") ||
    prompt.includes("proxima etapa")
  ) {
    return "evolve-factory-ai";
  }

  if (
    prompt.includes("patch") ||
    prompt.includes("aprovar") ||
    prompt.includes("validar") ||
    prompt.includes("stage") ||
    prompt.includes("apply")
  ) {
    return "supervised-patch-flow";
  }

  if (
    prompt.includes("doctor") ||
    prompt.includes("diagnóstico") ||
    prompt.includes("diagnostico") ||
    prompt.includes("logs") ||
    prompt.includes("erro") ||
    prompt.includes("falha")
  ) {
    return "diagnostics";
  }

  return "general-supervision";
}

function rankStrategicFiles({ goal, activeModules, candidateFiles, flags, snapshot }) {
  const files = [
    "/app/js/core/factory_ai_planner.js",
    "/app/js/core/factory_ai_actions.js",
    "/app/js/core/factory_ai_bridge.js",
    "/app/js/core/patch_supervisor.js",
    "/functions/api/admin-ai.js",
    "/app/js/admin.admin_ai.js",
    "/app/js/core/context_engine.js",
    "/app/js/core/factory_state.js",
    "/app/js/core/module_registry.js",
    "/app/js/core/factory_tree.js",
    "/app/js/core/doctor_scan.js",
    "/app/app.js"
  ];

  const ranking = files.map((file) => {
    const reasons = [];
    let score = 0;

    if (goal === "evolve-factory-ai") {
      if (file === "/app/js/core/factory_ai_planner.js") {
        score += 100;
        reasons.push("camada principal de priorização e inteligência supervisionada");
      }
      if (file === "/app/js/core/factory_ai_actions.js") {
        score += 85;
        reasons.push("coordena execução supervisionada real da Factory AI");
      }
      if (file === "/app/js/core/factory_ai_bridge.js") {
        score += 72;
        reasons.push("faz a ponte entre resposta textual e plano operacional");
      }
      if (file === "/functions/api/admin-ai.js") {
        score += 66;
        reasons.push("backend do chat precisa obedecer melhor a lógica de prioridade");
      }
      if (file === "/app/js/admin.admin_ai.js") {
        score += 54;
        reasons.push("front do chat e integração da Factory AI");
      }
      if (file === "/app/js/core/patch_supervisor.js") {
        score += 45;
        reasons.push("fecha o fluxo supervisionado approve → validate → stage → apply");
      }
      if (file === "/app/js/core/factory_tree.js") {
        score -= 22;
        reasons.push("tree não deve voltar a sequestrar prioridade nesta fase");
      }
      if (file === "/app/js/core/factory_state.js") {
        score -= 14;
        reasons.push("state já não deve ser prioridade padrão quando a meta é inteligência da Factory");
      }
      if (file === "/app/js/core/doctor_scan.js") {
        score -= 40;
        reasons.push("doctor não deve assumir a prioridade se o foco for evolução cognitiva");
      }
    }

    if (goal === "supervised-patch-flow") {
      if (file === "/app/js/core/patch_supervisor.js") {
        score += 100;
        reasons.push("núcleo do fluxo supervisionado de patch");
      }
      if (file === "/app/js/core/factory_ai_actions.js") {
        score += 82;
        reasons.push("ações coordenam approve, validate, stage e apply");
      }
      if (file === "/app/js/core/factory_ai_bridge.js") {
        score += 68;
        reasons.push("bridge mantém integridade do plano supervisionado");
      }
      if (file === "/functions/api/admin-ai.js") {
        score += 32;
        reasons.push("backend pode melhorar a proposta textual do patch");
      }
    }

    if (goal === "diagnostics") {
      if (file === "/app/js/core/doctor_scan.js") {
        score += 100;
        reasons.push("doctor é prioritário quando o foco real é diagnóstico");
      }
      if (file === "/app/js/core/factory_state.js") {
        score += 55;
        reasons.push("estado ajuda a consolidar dados diagnósticos");
      }
      if (file === "/app/js/core/factory_tree.js") {
        score += 34;
        reasons.push("tree ajuda a visibilidade estrutural do runtime");
      }
    }

    if (goal === "generate-code") {
      if (file === "/functions/api/admin-ai.js") {
        score += 58;
        reasons.push("backend influencia a qualidade da geração");
      }
      if (file === "/app/js/core/factory_ai_actions.js") {
        score += 66;
        reasons.push("actions ajuda a transformar geração em fluxo operacional");
      }
      if (file === "/app/js/core/factory_ai_bridge.js") {
        score += 48;
        reasons.push("bridge melhora consolidação do código gerado");
      }
    }

    if (goal === "propose-patch") {
      if (file === "/app/js/core/factory_ai_bridge.js") {
        score += 76;
        reasons.push("bridge interpreta resposta e consolida plano de patch");
      }
      if (file === "/app/js/core/factory_ai_actions.js") {
        score += 74;
        reasons.push("actions coordena proposta e fluxo local");
      }
      if (file === "/app/js/core/patch_supervisor.js") {
        score += 70;
        reasons.push("patch supervisor é a camada segura de aplicação");
      }
    }

    if (goal === "general-supervision") {
      if (file === "/app/js/core/factory_ai_planner.js") {
        score += 30;
        reasons.push("planner continua sendo prioridade estrutural");
      }
      if (file === "/app/js/core/factory_ai_actions.js") {
        score += 24;
        reasons.push("actions mantém avanço supervisionado real");
      }
      if (file === "/app/js/core/factory_ai_bridge.js") {
        score += 20;
        reasons.push("bridge continua chave na orquestração");
      }
      if (file === "/app/js/core/doctor_scan.js") {
        score -= 12;
        reasons.push("doctor não deve assumir prioridade padrão sem pedido específico");
      }
    }

    const hasContextEngine = activeModules.includes("contextEngine");
    const hasFactoryAI = activeModules.includes("factoryAI");

    if (hasContextEngine && hasFactoryAI) {
      if (
        file === "/app/js/core/factory_ai_planner.js" ||
        file === "/app/js/core/factory_ai_actions.js" ||
        file === "/app/js/core/factory_ai_bridge.js" ||
        file === "/functions/api/admin-ai.js"
      ) {
        score += 14;
        reasons.push("núcleo ativo já permite subir para camada cognitiva mais forte");
      }
    }

    if (candidateFiles.includes(file)) {
      score += 8;
      reasons.push("arquivo já aparece entre candidatos do snapshot");
    }

    const hasTree = boolFrom(flagValue(flags, ["hasFactoryTree"]));
    if (!hasTree && file === "/app/js/core/factory_tree.js") {
      score += 12;
      reasons.push("tree ainda pode precisar consolidação se realmente estiver ausente");
    }

    const pathsCount = numberOrNull(snapshot?.tree?.pathsCount) || 0;
    if (pathsCount < 20 && file === "/app/js/core/factory_tree.js") {
      score += 16;
      reasons.push("árvore ainda está rasa");
    }

    return {
      file,
      score,
      reasons: dedupeStrings(reasons).slice(0, 8)
    };
  });

  ranking.sort((a, b) => b.score - a.score);
  return ranking;
}

function buildExecutionLineForGoal(goal, nextFile) {
  const line = [];

  if (nextFile) line.push(nextFile);

  if (goal === "evolve-factory-ai") {
    line.push("/app/js/core/factory_ai_planner.js");
    line.push("/app/js/core/factory_ai_actions.js");
    line.push("/functions/api/admin-ai.js");
    line.push("/app/js/admin.admin_ai.js");
    line.push("/app/js/core/patch_supervisor.js");
  } else if (goal === "supervised-patch-flow") {
    line.push("/app/js/core/patch_supervisor.js");
    line.push("/app/js/core/factory_ai_actions.js");
    line.push("/app/js/core/factory_ai_bridge.js");
    line.push("/functions/api/admin-ai.js");
  } else if (goal === "diagnostics") {
    line.push("/app/js/core/doctor_scan.js");
    line.push("/app/js/core/factory_state.js");
    line.push("/app/js/core/module_registry.js");
    line.push("/app/js/core/factory_tree.js");
  } else {
    line.push("/app/js/core/factory_ai_actions.js");
    line.push("/app/js/core/factory_ai_bridge.js");
    line.push("/functions/api/admin-ai.js");
  }

  return dedupeStrings(line.filter(Boolean)).slice(0, 8);
}

function buildModuleSemantic(name, info) {
  const presence = info && typeof info.presence === "boolean" ? info.presence : false;
  const ready = info && typeof info.ready === "boolean" ? info.ready : false;
  const active = info && typeof info.active === "boolean" ? info.active : false;
  const extra = info && info.extra && typeof info.extra === "object" ? info.extra : {};

  let interpretation = "dado ausente";
  if (presence && ready && active) {
    interpretation = "presente, pronto e ativo";
  } else if (presence && ready && !active) {
    interpretation = "presente e pronto, mas não marcado como ativo no snapshot atual";
  } else if (presence && !ready && active) {
    interpretation = "presente e marcado como ativo, mas sem prontidão clara no snapshot";
  } else if (presence && !ready && !active) {
    interpretation = "presente, mas sem prontidão clara e sem ativação confirmada no snapshot";
  } else if (!presence && ready) {
    interpretation = "possível inconsistência do snapshot: pronto sem presença explícita";
  } else if (!presence && active) {
    interpretation = "possível inconsistência do snapshot: ativo sem presença explícita";
  } else if (!presence && !ready && !active) {
    interpretation = "sem evidência de presença, prontidão ou ativação";
  }

  return {
    name,
    presence,
    ready,
    active,
    interpretation,
    ...extra
  };
}

function flagValue(flags, keys) {
  const obj = safeObj(flags);
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return obj[key];
    }
  }
  return undefined;
}

function safeObj(value) {
  return value && typeof value === "object" ? value : {};
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function boolFrom(value) {
  return typeof value === "boolean" ? value : false;
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrEmpty(value) {
  return typeof value === "string" ? value : "";
}

function cloneValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function buildGroundedPrompt({ action, payload, prompt, history, attachments, source, version }) {
  const plannerHint = safeObj(payload).__planner_hint;
  const system = [
    "Você é a Factory AI da RControl Factory.",
    "Você é o chat oficial interno da Factory.",
    "Sua prioridade atual é ajudar a estruturar, estabilizar, evoluir e supervisionar a própria Factory antes de expandir para outros fluxos.",
    "Você deve agir como copiloto técnico da Factory, mas SEM inventar fatos.",
    "",
    "Regras centrais:",
    "1. Responda EXCLUSIVAMENTE com base no payload recebido, no histórico enviado, nos anexos descritos e no prompt atual.",
    "2. NÃO invente estados, módulos, falhas, versões, arquivos, árvores, logs, relatórios ou inconsistências que não estejam explícitos.",
    "3. Se um dado estiver ausente, diga exatamente: 'dado ausente'.",
    "4. Se algo parecer contraditório, diga exatamente: 'possível inconsistência do snapshot'.",
    "5. NÃO trate ausência de dado como erro confirmado.",
    "6. NÃO diga que um módulo está quebrado só porque ele não apareceu no snapshot.",
    "7. Diferencie sempre:",
    "   - fato confirmado",
    "   - dado ausente",
    "   - inferência provável",
    "   - hipótese que ainda depende de arquivo/contexto adicional.",
    "8. NÃO mande recriar a Factory do zero.",
    "9. NÃO proponha reescrever toda a plataforma.",
    "10. Priorize patch mínimo, estabilidade, segurança e evolução em camadas.",
    "11. Se faltar contexto para gerar código seguro, explique o que falta e diga qual é o próximo arquivo mais útil.",
    "12. Quando houver contexto suficiente e o usuário pedir arquivo completo, entregue o arquivo completo.",
    "13. Quando o usuário estiver só conversando, responda como chat técnico natural, útil e direto.",
    "14. Responda sempre em português do Brasil.",
    "",
    "Regra crítica de leitura do snapshot:",
    "- NÃO confunda presença, prontidão e ativação.",
    "- presence/presente = componente detectado no ambiente ou nas flags.",
    "- ready/pronto = componente/API disponível para uso no runtime atual.",
    "- active/ativo = módulo marcado como ativo no status/registry/lista active.",
    "- Se presence=true e active=false, descreva como 'presente, mas não marcado como ativo no snapshot atual'.",
    "- Se ready=true e active=false, descreva como 'pronto/disponível, mas não marcado como ativo no status atual'.",
    "- Isso NÃO é falha confirmada por si só.",
    "",
    "Sobre anexos:",
    "- Trate anexos apenas como metadados/contexto descrito, não como conteúdo binário já lido.",
    "- Não finja que abriu ZIP, PDF, imagem, áudio ou vídeo se só houver descrição/metadados.",
    "",
    "Sobre a função atual da Factory AI:",
    "- A Factory AI deve primeiro ajudar a estruturar a própria Factory.",
    "- O foco atual não é voltar sempre para o mesmo ciclo genérico.",
    "- Priorize evolução cognitiva e orquestração supervisionada quando o contexto apontar para isso.",
    "- Depois ela poderá apoiar criação de módulos, agentes e fluxos de app building.",
    "- Sempre respeite fluxo supervisionado e seguro.",
    "",
    "Sobre o estilo das respostas:",
    "- Seja útil e prática.",
    "- Evite repetir listas genéricas sem avanço real.",
    "- Se o snapshot estiver raso, reconheça isso e foque no próximo arquivo mais útil.",
    "- Não fique repetindo logger/doctor/version unknown como centro da resposta, a menos que isso seja realmente o ponto principal do pedido.",
    "- Se o objetivo do usuário for evoluir a Factory AI, dê prioridade a planner/bridge/actions/backend/chat supervisionado antes de cair automaticamente em doctor/state/registry/tree.",
    "- Se existir __planner_hint no payload, trate-o como guidance operacional forte.",
    "- Não ignore __planner_hint quando o usuário pedir próximo arquivo, prioridade, autonomia, evolução ou plano.",
    "",
    "Formato de resposta por action:",
    "",
    "Se action=factory_diagnosis, analyze-architecture, analyze-logs, summarize-structure ou suggest-improvement:",
    "1. Fatos confirmados",
    "2. Dados ausentes ou mal consolidados",
    "3. Inferências prováveis",
    "4. Próximo passo mínimo recomendado",
    "5. Arquivos mais prováveis de ajuste",
    "",
    "Se action=propose-patch, acrescente:",
    "6. Patch mínimo sugerido",
    "",
    "Se action=generate-code, use exatamente:",
    "1. Objetivo",
    "2. Arquivo alvo",
    "3. Risco",
    "4. Código sugerido",
    "",
    "Se action=ingest-context:",
    "- explique como aproveitar os anexos/contexto enviado sem fingir leitura binária real.",
    "",
    "Se action=chat:",
    "- responda como chat técnico natural, conversável, direto e útil.",
    "- se o pedido for claro e houver contexto suficiente, responda direto.",
    "- se o pedido pedir próximo arquivo, prioridade ou autonomia, dê resposta objetiva e priorizada.",
    "- se existir planner_hint.nextFile, use esse alvo como base principal, salvo se o payload trouxer fato mais forte em sentido contrário.",
    "- se o pedido exigir arquivo específico que não foi enviado, diga qual arquivo é o próximo mais útil.",
    "- se houver risco de inferência excessiva, explicite esse limite sem enrolar.",
    "- se o snapshot vier raso, não transforme isso automaticamente em diagnóstico de falha estrutural."
  ].join("\n");

  const task = buildTaskText(action, prompt, payload);

  return [
    system,
    "",
    "Fonte:",
    source || "factory-ai",
    "",
    "Versão do cliente:",
    version || "(não informada)",
    "",
    "Ação:",
    action,
    "",
    "Tarefa:",
    task,
    "",
    "Planner hint determinístico:",
    stringify(plannerHint || "(ausente)"),
    "",
    "Histórico recente:",
    historyToText(history),
    "",
    "Anexos recebidos (metadados):",
    attachmentsToText(attachments),
    "",
    "Prompt atual do usuário:",
    prompt || "(nenhum)",
    "",
    "Payload recebido:",
    stringify(payload)
  ].join("\n");
}

function buildTaskText(action, prompt = "", payload = null) {
  const p = String(prompt || "").trim().toLowerCase();
  const hasPlannerContext = !!safeObj(payload).__planner_context;
  const plannerHint = safeObj(payload).__planner_hint;
  const hintedNextFile = String(plannerHint.nextFile || "").trim();

  const asksNextFile =
    p.includes("próximo arquivo") ||
    p.includes("proximo arquivo") ||
    p.includes("qual arquivo") ||
    p.includes("prioridade");
  const asksAutonomy =
    p.includes("autonomia") ||
    p.includes("autônom") ||
    p.includes("autonom") ||
    p.includes("sozinha") ||
    p.includes("sozinho");
  const asksPlan =
    p.includes("planejar") ||
    p.includes("plano") ||
    p.includes("sequência") ||
    p.includes("sequencia");

  if (action === "factory_diagnosis") {
    return [
      "Analise o snapshot/relatório da RControl Factory e aponte somente fatos confirmados, dados ausentes, inferências prováveis e próximo passo mínimo.",
      "Ao descrever módulos, separe explicitamente presença, prontidão e ativação."
    ].join(" ");
  }

  if (action === "analyze-architecture") {
    return [
      "Analise a arquitetura atual da RControl Factory usando somente o contexto enviado, evitando confundir snapshot parcial com falha confirmada.",
      "Ao descrever módulos, separe explicitamente presença, prontidão e ativação."
    ].join(" ");
  }

  if (action === "analyze-logs") {
    return "Analise logs recentes da RControl Factory em conjunto com o snapshot enviado, separando fato confirmado de hipótese.";
  }

  if (action === "review-module") {
    return "Revise o módulo informado usando somente os dados enviados e diga o próximo arquivo mais útil se o contexto ainda estiver incompleto.";
  }

  if (action === "suggest-improvement") {
    return [
      "Sugira a próxima melhoria mais segura com base apenas no snapshot enviado, priorizando a evolução da própria Factory AI.",
      "Se houver diferença entre presence, ready e active, trate isso como nuance do snapshot, não como falha automática."
    ].join(" ");
  }

  if (action === "summarize-structure") {
    return "Resuma a estrutura atual da RControl Factory com base apenas no contexto enviado, sem inventar partes ausentes.";
  }

  if (action === "propose-patch") {
    return "Proponha um patch mínimo e seguro com base apenas no contexto enviado, sem reescrever a Factory do zero.";
  }

  if (action === "generate-code") {
    return "Gere código com patch mínimo, sem reescrever a Factory do zero, usando apenas o contexto enviado. Se faltar contexto, explique exatamente o que falta.";
  }

  if (action === "ingest-context") {
    return "Explique como a Factory deve aproveitar os anexos descritos e o contexto recebido sem fingir leitura binária real dos arquivos.";
  }

  if (action === "chat") {
    const lines = [
      "Responda como o chat técnico oficial da Factory, de forma natural, objetiva e útil, ajudando a estruturar a própria Factory primeiro.",
      "Quando o pedido estiver raso ou o snapshot vier incompleto, foque mais em qual é o próximo arquivo certo do que em repetir diagnóstico genérico.",
      "Se o payload trouxer nuances entre presence, ready e active, respeite essas diferenças explicitamente."
    ];

    if (asksNextFile || asksPlan || asksAutonomy) {
      lines.push("O usuário está pedindo priorização real. Dê uma resposta objetiva indicando o próximo arquivo mais estratégico e por quê.");
      lines.push("Evite cair automaticamente no ciclo genérico doctor/state/registry/tree se o contexto atual estiver voltado para evolução da Factory AI.");
      if (hintedNextFile) {
        lines.push("O backend já calculou planner_hint.nextFile='" + hintedNextFile + "'. Use isso como base principal, salvo se o próprio payload trouxer fato mais forte em sentido contrário.");
      }
    }

    if (hasPlannerContext) {
      lines.push("Use o contexto de planner/candidateFiles/pathGroups para priorizar melhor o próximo arquivo.");
    }

    if (prompt) {
      lines.push("Pedido atual: " + prompt);
    }

    return lines.join(" ");
  }

  return "Analise a RControl Factory com base apenas no contexto enviado.";
}

function historyToText(history) {
  if (!Array.isArray(history) || !history.length) {
    return "(sem histórico)";
  }

  return history
    .map((item, idx) => `${idx + 1}. [${item.role}] ${item.text}`)
    .join("\n");
}

function attachmentsToText(attachments) {
  if (!Array.isArray(attachments) || !attachments.length) {
    return "(sem anexos)";
  }

  return attachments
    .map((item, idx) => {
      return [
        `${idx + 1}.`,
        `name=${item.name || "(sem nome)"}`,
        `kind=${item.kind || "unknown"}`,
        `mime=${item.mime || "(sem mime)"}`,
        `size=${item.size || 0}`,
        `summary=${item.summary || "(sem resumo)"}`
      ].join(" ");
    })
    .join("\n");
}

function deriveResponseHints(text, payload, action, prompt = "") {
  const content = String(text || "");
  const plannerHint = safeObj(payload).__planner_hint;
  const plannerHintFile = String(plannerHint.nextFile || "").trim();
  const targetFile =
    extractFirstFile(content) ||
    plannerHintFile ||
    extractPayloadNextFile(payload);

  const risk = extractRisk(content);
  const mode = action === "generate-code" ? "code" : (action === "propose-patch" ? "patch" : "analysis");

  return {
    mode,
    targetFile: targetFile || "",
    risk: risk || "unknown",
    hasCodeBlock: /```[\s\S]*?```/.test(content),
    mentionsPlannerFlow: /planner|plano|prioridade|próximo arquivo|proximo arquivo/i.test(content),
    nextFileCandidate: targetFile || "",
    plannerHintUsed: !!plannerHintFile,
    promptClass: detectBackendGoal(String(prompt || "").toLowerCase(), action)
  };
}

function extractFirstFile(text) {
  const src = String(text || "");
  const m = src.match(/(\/(?:app|functions)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+)/);
  return m ? String(m[1] || "").trim() : "";
}

function extractPayloadNextFile(payload) {
  try {
    const plannerHint = safeObj(payload).__planner_hint;
    if (typeof plannerHint.nextFile === "string" && plannerHint.nextFile.trim()) {
      return plannerHint.nextFile.trim();
    }

    const planner = safeObj(payload).__planner_context;
    const files = Array.isArray(planner.candidateFiles) ? planner.candidateFiles : [];
    return files.length ? String(files[0] || "") : "";
  } catch {
    return "";
  }
}

function extractRisk(text) {
  const raw = String(text || "").toLowerCase();
  if (!raw) return "unknown";
  if (raw.includes("baixo") || raw.includes("low") || raw.includes("seguro") || raw.includes("safe")) return "low";
  if (raw.includes("médio") || raw.includes("medio") || raw.includes("medium")) return "medium";
  if (raw.includes("alto") || raw.includes("high") || raw.includes("crítico") || raw.includes("critico")) return "high";
  return "unknown";
}

function extractText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  try {
    const chunks = [];
    const output = Array.isArray(data?.output) ? data.output : [];

    for (const item of output) {
      const content = Array.isArray(item?.content) ? item.content : [];
      for (const c of content) {
        if (c?.type === "output_text" && typeof c?.text === "string") {
          chunks.push(c.text);
        }
      }
    }

    return chunks.join("\n").trim();
  } catch {
    return "";
  }
}

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function stringify(value) {
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders()
    }
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function normalizePathLoose(path) {
  const raw = String(path || "").trim().replace(/\\/g, "/");
  if (!raw) return "";
  const out = raw.startsWith("/") ? raw : "/" + raw;
  return out.replace(/\/{2,}/g, "/");
}

function dedupeStrings(arr) {
  const out = [];
  const seen = new Set();

  for (const item of Array.isArray(arr) ? arr : []) {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }

  return out;
}
