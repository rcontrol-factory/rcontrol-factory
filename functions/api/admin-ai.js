/* FILE: /functions/api/admin-ai.js
   RControl Factory — Factory AI API
   v3.4.0 CHAT COPILOT BACKEND + PLANNER FLOW

   - mantém CORS e POST atuais
   - continua usando OPENAI_API_KEY
   - mantém compatibilidade com actions antigas
   - aceita histórico simples de conversa
   - aceita payload contextual expandido
   - aceita metadados de anexos
   - aceita aliases do fluxo novo da Factory AI
   - melhora modo chat como copiloto técnico real da Factory
   - diferencia dado ausente de falha confirmada
   - diferencia presença x prontidão x ativação
   - prioriza evolução da própria Factory AI
   - entende melhor planner / next file / autonomia / patch supervisionado
   - mantém resposta aterrada no payload
   - não autoriza invenção de estados da Factory
   - preparado para futuro suporte real a ZIP / PDF / imagem / vídeo / arquivos
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
    if (!env.OPENAI_API_KEY) {
      return json({
        ok: false,
        error: "OPENAI_API_KEY ausente no ambiente."
      }, 500);
    }

    const body = await safeJson(request);
    if (!body || typeof body !== "object") {
      return json({
        ok: false,
        error: "JSON inválido."
      }, 400);
    }

    const action = normalizeAction(body.action, body.prompt);
    const prompt = String(body.prompt || "").trim();
    const history = normalizeHistory(body.history);
    const attachments = normalizeAttachments(body.attachments);
    const source = String(body.source || "factory-ai").trim();
    const version = String(body.version || "").trim();
    const payload = preparePayloadForModel(body.payload ?? null);

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
        action
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

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-4.1-mini",
        input
      })
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return json({
        ok: false,
        error: "Falha ao chamar OpenAI.",
        status: upstream.status,
        details: data
      }, 502);
    }

    const text = extractText(data);
    const derived = deriveResponseHints(text, payload, action);

    return json({
      ok: true,
      action,
      source,
      version,
      analysis: text || "(sem texto retornado)",
      hints: derived,
      raw: data
    });
  } catch (err) {
    return json({
      ok: false,
      error: String(err?.message || err || "Erro interno.")
    }, 500);
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

function preparePayloadForModel(payload) {
  const base = cloneValue(payload);

  if (!base || typeof base !== "object") {
    return base;
  }

  const semantic = buildSnapshotSemanticSummary(base);
  const planner = buildPlannerContext(base);

  const out = cloneValue(base);
  if (semantic) out.__snapshot_semantics = semantic;
  if (planner) out.__planner_context = planner;

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

function buildPlannerContext(payload) {
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

function deriveResponseHints(text, payload, action) {
  const content = String(text || "");
  const targetFile = extractFirstFile(content) || extractPayloadNextFile(payload);
  const risk = extractRisk(content);
  const mode = action === "generate-code" ? "code" : (action === "propose-patch" ? "patch" : "analysis");

  return {
    mode,
    targetFile: targetFile || "",
    risk: risk || "unknown",
    hasCodeBlock: /```[\s\S]*?```/.test(content),
    mentionsPlannerFlow: /planner|plano|prioridade|próximo arquivo|proximo arquivo/i.test(content),
    nextFileCandidate: targetFile || ""
  };
}

function extractFirstFile(text) {
  const src = String(text || "");
  const m = src.match(/(\/(?:app|functions)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+)/);
  return m ? String(m[1] || "").trim() : "";
}

function extractPayloadNextFile(payload) {
  try {
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
