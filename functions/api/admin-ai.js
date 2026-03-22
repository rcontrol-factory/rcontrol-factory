// ---- RCF PATCH v1.0.2: recommendation anti-repeat + phase memory ----
function normalizeRecommendationState(raw) {
  var out = raw && typeof raw === "object" ? raw : {};
  if (!Array.isArray(out.recentlyTouchedFiles)) out.recentlyTouchedFiles = [];
  if (!Array.isArray(out.completedThisPhase)) out.completedThisPhase = [];
  if (!Array.isArray(out.blockedFiles)) out.blockedFiles = [];
  if (!out.recommendationCountByFile || typeof out.recommendationCountByFile !== "object") {
    out.recommendationCountByFile = {};
  }
  out.lastRecommendedFile = String(out.lastRecommendedFile || "");
  out.lastRecommendedAt = String(out.lastRecommendedAt || "");
  return out;
}

function readRecommendationState() {
  try {
    var raw = globalThis.RCF_RECOMMENDATION_STATE || {};
    return normalizeRecommendationState(raw);
  } catch (_) {
    return normalizeRecommendationState({});
  }
}

function writeRecommendationState(next) {
  try {
    globalThis.RCF_RECOMMENDATION_STATE = normalizeRecommendationState(next || {});
    return globalThis.RCF_RECOMMENDATION_STATE;
  } catch (_) {
    return normalizeRecommendationState({});
  }
}

function markRecommendation(file) {
  var state = readRecommendationState();
  var key = String(file || "").trim();
  if (!key) return state;
  state.lastRecommendedFile = key;
  state.lastRecommendedAt = new Date().toISOString();
  state.recommendationCountByFile[key] = Number(state.recommendationCountByFile[key] || 0) + 1;
  return writeRecommendationState(state);
}

function sanitizeRecommendedFile(file) {
  var candidate = String(file || "").trim();
  if (!candidate) return candidate;

  var state = readRecommendationState();
  var completed = new Set([].concat(state.recentlyTouchedFiles || [], state.completedThisPhase || [], state.blockedFiles || []).map(function (x) {
    return String(x || "").trim();
  }).filter(Boolean));

  var repeatedTooMuch = Number((state.recommendationCountByFile || {})[candidate] || 0) >= 2;
  var plannerLocked = /factory_ai_planner\.js$/i.test(candidate) && (completed.has(candidate) || repeatedTooMuch);

  if (plannerLocked) {
    var fallbackQueue = [
      "/app/js/core/factory_ai_bridge.js",
      "/app/js/core/factory_ai_actions.js",
      "/functions/api/admin-ai.js",
      "/app/js/core/patch_supervisor.js",
      "/app/js/core/factory_ai_runtime.js"
    ];
    for (var i = 0; i < fallbackQueue.length; i++) {
      var next = fallbackQueue[i];
      if (!completed.has(next)) {
        candidate = next;
        break;
      }
    }
  }

  markRecommendation(candidate);
  return candidate;
}

function patchRecommendedFileInObject(obj) {
  try {
    if (!obj || typeof obj !== "object") return obj;

    if (typeof obj.targetFile === "string" && obj.targetFile.trim()) {
      obj.targetFile = sanitizeRecommendedFile(obj.targetFile);
    }

    if (typeof obj.nextFile === "string" && obj.nextFile.trim()) {
      obj.nextFile = sanitizeRecommendedFile(obj.nextFile);
    }

    if (obj.summary && typeof obj.summary === "object") {
      if (typeof obj.summary.targetFile === "string" && obj.summary.targetFile.trim()) {
        obj.summary.targetFile = sanitizeRecommendedFile(obj.summary.targetFile);
      }
      if (typeof obj.summary.nextFile === "string" && obj.summary.nextFile.trim()) {
        obj.summary.nextFile = sanitizeRecommendedFile(obj.summary.nextFile);
      }
    }

    if (obj.plan && typeof obj.plan === "object") {
      if (typeof obj.plan.targetFile === "string" && obj.plan.targetFile.trim()) {
        obj.plan.targetFile = sanitizeRecommendedFile(obj.plan.targetFile);
      }
      if (typeof obj.plan.nextFile === "string" && obj.plan.nextFile.trim()) {
        obj.plan.nextFile = sanitizeRecommendedFile(obj.plan.nextFile);
      }
    }

    if (obj.bridge && typeof obj.bridge === "object" && typeof obj.bridge.targetFile === "string" && obj.bridge.targetFile.trim()) {
      obj.bridge.targetFile = sanitizeRecommendedFile(obj.bridge.targetFile);
    }

    if (obj.planner_hint && typeof obj.planner_hint === "object") {
      if (typeof obj.planner_hint.targetFile === "string" && obj.planner_hint.targetFile.trim()) {
        obj.planner_hint.targetFile = sanitizeRecommendedFile(obj.planner_hint.targetFile);
      }
      if (typeof obj.planner_hint.nextFile === "string" && obj.planner_hint.nextFile.trim()) {
        obj.planner_hint.nextFile = sanitizeRecommendedFile(obj.planner_hint.nextFile);
      }
    }

    obj.recommendationState = readRecommendationState();
    return obj;
  } catch (_) {
    return obj;
  }
}
// ---- END RCF PATCH v1.0.2 ----

/* FILE: /functions/api/admin-ai.js
   RControl Factory ÃÂ¢ÃÂÃÂ Factory AI API
   v3.6.4 CHAT COPILOT BACKEND + CONNECTIVITY HARDENED + TEXT FORMAT + INPUT COMPACT GUARD

   PATCH v3.5.6:
   - KEEP: openai_status como action permitida
   - KEEP: normalizeOpenAIUrl endurecido
   - KEEP: extractText ampliado
   - KEEP: max_output_tokens explÃÂÃÂ­cito
   - ADD: text.format.type="text" para favorecer output_text consolidado
   - ADD: compactaÃÂÃÂ§ÃÂÃÂ£o do input para reduzir corte por texto grande
   - ADD: truncation guard em prompt/history/attachments/payload
   - ADD: fallback mais robusto quando a Responses API vem sem texto final
   - FIX: mantÃÂÃÂ©m compatibilidade com runtime/admin atuais
   - FIX: nÃÂÃÂ£o altera a arquitetura central; apenas fortalece backend, conectividade e saÃÂÃÂ­da textual
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
    const model = String(env?.OPENAI_MODEL || "gpt-4.1-mini").trim() || "gpt-4.1-mini";
    const upstreamUrl = normalizeOpenAIUrl(env?.OPENAI_BASE_URL);
    const maxOutputTokens = normalizeMaxOutputTokens(env?.OPENAI_MAX_OUTPUT_TOKENS, 1400);

    if (!env || !env.OPENAI_API_KEY) {
      return json(__rcfNormalizeAdminAIResponse({
        ok: false,
        error: "OPENAI_API_KEY ausente no ambiente.",
        connection: buildConnectionMeta({
          provider: "openai",
          configured: false,
          attempted: false,
          status: "missing_api_key",
          model,
          upstreamStatus: 0,
          endpoint: upstreamUrl
        })
      }, 500);
    }

    const body = await safeJson(request);
    if (!body || typeof body !== "object") {
      return json(__rcfNormalizeAdminAIResponse({
        ok: false,
        error: "JSON invÃÂÃÂ¡lido.",
        connection: buildConnectionMeta({
          provider: "openai",
          configured: true,
          attempted: false,
          status: "invalid_json",
          model,
          upstreamStatus: 0,
          endpoint: upstreamUrl
        })
      }, 400);
    }

    const action = normalizeAction(body.action, body.prompt);
    const prompt = clampText(String(body.prompt || "").trim(), 6000);
    const history = normalizeHistory(body.history);
    const attachments = normalizeAttachments(body.attachments);
    const source = String(body.source || "factory-ai").trim();
    const version = String(body.version || "").trim();
    const payload = preparePayloadForModel(body.payload ?? null, prompt, action);
    const requestRouting = { action, structuredRuntimeFrontDiagnostic: isStructuredRuntimeFrontDiagnostic(prompt), source, version };

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
      "openai_status",
      "chat"
    ]);

    if (!allowed.has(action)) {
      return json(__rcfNormalizeAdminAIResponse({
        ok: false,
        error: "AÃÂÃÂ§ÃÂÃÂ£o nÃÂÃÂ£o permitida nesta fase.",
        action,
        connection: buildConnectionMeta({
          provider: "openai",
          configured: true,
          attempted: false,
          status: "blocked_action",
          model,
          upstreamStatus: 0,
          endpoint: upstreamUrl
        })
      }, 400);
    }

    if (action === "openai_status") {
      const probe = await probeOpenAI({
        url: upstreamUrl,
        apiKey: env.OPENAI_API_KEY,
        model,
        maxOutputTokens: 120
      }));

      return json(__rcfNormalizeAdminAIResponse({
        ok: !!probe.ok,
        action,
        source,
        version,
        analysis: probe.analysis,
        hints: {
          mode: "analysis",
          targetFile: "/functions/api/admin-ai.js",
          risk: probe.ok ? "low" : "medium",
          hasCodeBlock: false,
          mentionsPlannerFlow: false,
          mentionsOpenAIFlow: true,
          nextFileCandidate: probe.ok ? "/app/js/core/factory_ai_runtime.js" : "/functions/api/admin-ai.js",
          plannerHintUsed: false,
          promptClass: "openai-connectivity",
          responseStatus: String(probe.responseStatus || ""),
          incomplete: !!probe.incomplete
        },
        raw: probe.raw || {},
        connection: buildConnectionMeta({
          provider: "openai",
          configured: !!env.OPENAI_API_KEY,
          attempted: true,
          status: probe.connectionStatus,
          model,
          upstreamStatus: Number(probe.upstreamStatus || 0) || 0,
          endpoint: upstreamUrl
        })
      }, probe.ok ? 200 : 502);
    }

    const input = buildGroundedPrompt({
      action,
      payload,
      prompt,
      history,
      attachments,
      source,
      version
    }));

    const upstream = await postToOpenAI({
      url: upstreamUrl,
      apiKey: env.OPENAI_API_KEY,
      model,
      input,
      maxOutputTokens
    }));

    if (!upstream.ok) {
      const upstreamStatus = Number(upstream.status || 0) || 0;
      const failureStatus =
        upstreamStatus === 0
          ? "network_error"
          : upstreamStatus === 400
            ? "bad_request"
            : upstreamStatus === 401
              ? "invalid_api_key"
              : upstreamStatus === 403
                ? "forbidden"
                : upstreamStatus === 404
                  ? "invalid_endpoint"
                  : upstreamStatus === 408
                    ? "timeout"
                    : upstreamStatus === 429
                      ? "rate_limited"
                      : "upstream_error";

      return json(__rcfNormalizeAdminAIResponse({
        ok: false,
        error: "Falha ao chamar OpenAI.",
        status: upstreamStatus,
        details: upstream.data,
        connection: buildConnectionMeta({
          provider: "openai",
          configured: true,
          attempted: true,
          status: failureStatus,
          model,
          upstreamStatus,
          endpoint: upstreamUrl
        })
      }, 502);
    }

    const data = upstream.data || {};
    const responseMeta = extractResponseMeta(data);
    const text = extractText(data);
    const finalText = text || buildEmptyTextFallback({
      action,
      prompt,
      responseMeta,
      model,
      endpoint: upstreamUrl
    }));

    const derived = deriveResponseHints(finalText, payload, action, prompt);

    return json(__rcfNormalizeAdminAIResponse({
      ok: true,
      action,
      source,
      version,
      analysis: finalText,
      hints: {
        ...derived,
        responseStatus: responseMeta.status || "",
        incomplete: !!responseMeta.incomplete,
        incompleteReason: responseMeta.incompleteReason || ""
      },
      raw: data,
      connection: buildConnectionMeta({
        provider: "openai",
        configured: true,
        attempted: true,
        status: responseMeta.incomplete ? "partial" : "connected",
        model,
        upstreamStatus: Number(upstream.status || 200) || 200,
        endpoint: upstreamUrl
      })
    }));
  } catch (err) {
    return json(__rcfNormalizeAdminAIResponse({
      ok: false,
      error: String(err?.message || err || "Erro interno."),
      connection: buildConnectionMeta({
        provider: "openai",
        configured: true,
        attempted: true,
        status: "internal_error",
        model: "",
        upstreamStatus: 0,
        endpoint: ""
      })
    }, 500);
  }
}

async function postToOpenAI({ url, apiKey, model, input, maxOutputTokens }) {
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
        input,
        max_output_tokens: normalizeMaxOutputTokens(maxOutputTokens, 1400),
        text: {
          format: {
            type: "text"
          }
        }
      }),
      signal: controller.signal
    }));

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

async function probeOpenAI({ url, apiKey, model, maxOutputTokens = 120 }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    try { controller.abort(); } catch (_) {}
  }, 20000);

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: "Responda apenas com a palavra OK.",
        max_output_tokens: normalizeMaxOutputTokens(maxOutputTokens, 120),
        text: {
          format: {
            type: "text"
          }
        }
      }),
      signal: controller.signal
    }));

    const data = await upstream.json().catch(() => ({}));
    const text = extractText(data);
    const meta = extractResponseMeta(data);

    if (!upstream.ok) {
      return {
        ok: false,
        analysis: [
          "1. Fatos confirmados",
          `- Backend respondeu com status upstream ${Number(upstream.status || 0) || 0}`,
          `- Endpoint usado: ${url}`,
          `- Modelo: ${model}`,
          "",
          "2. Dados ausentes ou mal consolidados",
          "- O texto final da resposta nÃÂÃÂ£o pÃÂÃÂ´de ser confirmado como sucesso.",
          "",
          "3. InferÃÂÃÂªncias provÃÂÃÂ¡veis",
          "- A conexÃÂÃÂ£o com OpenAI nÃÂÃÂ£o estÃÂÃÂ¡ operacional nesta rodada.",
          "",
          "4. PrÃÂÃÂ³ximo passo mÃÂÃÂ­nimo recomendado",
          "- Revisar endpoint, chave e payload enviados ao backend.",
          "",
          "5. Arquivos mais provÃÂÃÂ¡veis de ajuste",
          "- /functions/api/admin-ai.js",
          "- /app/js/core/factory_ai_runtime.js"
        ].join("\n"),
        raw: data,
        upstreamStatus: Number(upstream.status || 0) || 0,
        connectionStatus:
          upstream.status === 401 ? "invalid_api_key"
          : upstream.status === 403 ? "forbidden"
          : upstream.status === 404 ? "invalid_endpoint"
          : upstream.status === 429 ? "rate_limited"
          : "upstream_error",
        responseStatus: meta.status || "",
        incomplete: !!meta.incomplete
      };
    }

    return {
      ok: true,
      analysis: [
        "1. Fatos confirmados",
        "- Probe real executado com sucesso.",
        `- Endpoint usado: ${url}`,
        `- Modelo: ${model}`,
        `- Texto retornado: ${text || "OK upstream sem texto legÃÂÃÂ­vel"}`,
        "",
        "2. Dados ausentes ou mal consolidados",
        meta.incomplete
          ? `- A resposta veio incompleta: ${meta.incompleteReason || "motivo nÃÂÃÂ£o informado"}.`
          : "- Nenhuma ausÃÂÃÂªncia crÃÂÃÂ­tica nesta rodada.",
        "",
        "3. InferÃÂÃÂªncias provÃÂÃÂ¡veis",
        meta.incomplete
          ? "- A conexÃÂÃÂ£o backend -> OpenAI estÃÂÃÂ¡ operacional, mas a saÃÂÃÂ­da pode estar sendo limitada."
          : "- A conexÃÂÃÂ£o backend -> OpenAI estÃÂÃÂ¡ operacional.",
        "",
        "4. PrÃÂÃÂ³ximo passo mÃÂÃÂ­nimo recomendado",
        meta.incomplete
          ? "- Validar limite de saÃÂÃÂ­da no backend/runtime e depois testar no front."
          : "- Validar consumo dessa conexÃÂÃÂ£o no runtime e no front.",
        "",
        "5. Arquivos mais provÃÂÃÂ¡veis de ajuste",
        "- /app/js/core/factory_ai_runtime.js",
        "- /app/js/admin.admin_ai.js"
      ].join("\n"),
      raw: data,
      upstreamStatus: Number(upstream.status || 200) || 200,
      connectionStatus: meta.incomplete ? "partial" : "connected",
      responseStatus: meta.status || "",
      incomplete: !!meta.incomplete,
      incompleteReason: meta.incompleteReason || ""
    };
  } catch (err) {
    return {
      ok: false,
      analysis: [
        "1. Fatos confirmados",
        "- O probe real falhou por exceÃÂÃÂ§ÃÂÃÂ£o de rede ou abort.",
        "",
        "2. Dados ausentes ou mal consolidados",
        `- detalhe: ${String(err?.message || err || "erro de rede")}`,
        "",
        "3. InferÃÂÃÂªncias provÃÂÃÂ¡veis",
        "- A chamada backend -> OpenAI nÃÂÃÂ£o foi concluÃÂÃÂ­da nesta rodada.",
        "",
        "4. PrÃÂÃÂ³ximo passo mÃÂÃÂ­nimo recomendado",
        "- Revisar rede, endpoint e chave no backend.",
        "",
        "5. Arquivos mais provÃÂÃÂ¡veis de ajuste",
        "- /functions/api/admin-ai.js",
        "- /app/js/core/factory_ai_runtime.js"
      ].join("\n"),
      raw: {
        error: String(err?.message || err || "erro de rede")
      },
      upstreamStatus: 0,
      connectionStatus: "network_error",
      responseStatus: "",
      incomplete: false,
      incompleteReason: ""
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeOpenAIUrl(value) {
  const raw = String(value || "").trim();
  const fallback = "https://api.openai.com/v1/responses";

  if (!raw) return fallback;

  let cleaned = raw.replace(/\/+$/, "");

  if (!/^https?:\/\//i.test(cleaned)) return fallback;

  if (/\/v1\/responses$/i.test(cleaned)) return cleaned;
  if (/\/v1$/i.test(cleaned)) return cleaned + "/responses";
  if (/^https?:\/\/api\.openai\.com$/i.test(cleaned)) return cleaned + "/v1/responses";
  if (/^https?:\/\/[^/]+$/i.test(cleaned)) return cleaned + "/v1/responses";

  if (/\/v1\/[^/]+$/i.test(cleaned)) {
    if (/\/v1\/responses$/i.test(cleaned)) return cleaned;
    return fallback;
  }

  if (/\/v1\/.+\/.+$/i.test(cleaned)) return fallback;
  if (/\/responses$/i.test(cleaned)) return cleaned;

  return fallback;
}

function normalizeMaxOutputTokens(value, fallback) {
  const n = Number(value || 0) || 0;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(64, Math.min(4000, Math.floor(n)));
}

function buildConnectionMeta(info) {
  const data = info && typeof info === "object" ? info : {};
  return {
    provider: String(data.provider || "openai").trim() || "openai",
    configured: !!data.configured,
    attempted: !!data.attempted,
    status: String(data.status || "unknown").trim() || "unknown",
    model: String(data.model || "").trim(),
    upstreamStatus: Number(data.upstreamStatus || 0) || 0,
    endpoint: String(data.endpoint || "").trim()
  };
}


function isStructuredRuntimeFrontDiagnostic(promptValue = "") {
  const prompt = String(promptValue || "").trim().toLowerCase();
  if (!prompt) return false;

  return (
    prompt.includes("nÃÂ£o faÃÂ§a probe") ||
    prompt.includes("nao faca probe") ||
    prompt.includes("nÃÂ£o responda sÃÂ³ com teste") ||
    prompt.includes("nao responda so com teste") ||
    prompt.includes("nÃÂ£o resuma a resposta") ||
    prompt.includes("nao resuma a resposta") ||
    prompt.includes("diagnÃÂ³stico tÃÂ©cnico") ||
    prompt.includes("diagnostico tecnico") ||
    prompt.includes("runtime/front") ||
    prompt.includes("consumo real no front") ||
    prompt.includes("responder obrigatoriamente com estes 10 campos") ||
    prompt.includes("front estÃÂ¡ ou nÃÂ£o estÃÂ¡ consumindo corretamente o backend") ||
    prompt.includes("front esta ou nao esta consumindo corretamente o backend") ||
    prompt.includes("fatos confirmados") ||
    prompt.includes("dados ausentes") ||
    prompt.includes("estado real dos mÃÂ³dulos") ||
    prompt.includes("estado real do runtime/front")
  );
}


function __rcfCompactStructuredText(text, limit = 2200) {
  const src = String(text || "");
  if (!src) return "";

  const sections = src.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
  if (!sections.length) return src.slice(0, limit);

  const kept = [];
  let size = 0;

  for (const sec of sections) {
    const clean = sec.length > 700 ? sec.slice(0, 700).trim() + "\n[trecho resumido]" : sec;
    if ((size + clean.length + 2) > limit) break;
    kept.push(clean);
    size += clean.length + 2;
  }

  return kept.length ? kept.join("\n\n") : src.slice(0, limit);
}

function __rcfNormalizeAdminAIResponse(payload) {
  try {
    if (!payload || typeof payload !== "object") payload = {};

    const responseStatus = String(payload.responseStatus || "").trim().toLowerCase();
    const connection = String(payload.connection || payload.connectionStatus || "").trim().toLowerCase();
    const hasUsefulText =
      !!String(payload.analysis || payload.answer || payload.result || "").trim();

    if (hasUsefulText) {
      payload.analysis = __rcfCompactStructuredText(
        payload.analysis || payload.answer || payload.result || "",
        2200
      );
      payload.answer = payload.analysis;
      payload.result = payload.analysis;
    }

    if ((responseStatus === "incomplete" || connection === "partial") && hasUsefulText) {
      payload.ok = true;
      payload.partial = true;
      payload.note = payload.note || "partial_response_normalized";
      payload.connection = "partial";
    }
  } catch {}

  return payload;
}


function normalizeAction(value, promptValue = "") {
  const raw = String(value || "").trim().toLowerCase();
  const prompt = String(promptValue || "").trim().toLowerCase();
  const structuredDiagnostic = isStructuredRuntimeFrontDiagnostic(promptValue);

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
    if (raw === "openai_status") return structuredDiagnostic ? "factory_diagnosis" : "openai_status";
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

    if (raw === "chat") return structuredDiagnostic ? "factory_diagnosis" : "chat";
    return raw;
  }

  if (structuredDiagnostic) return "factory_diagnosis";

  if (
    prompt.includes("status real") ||
    prompt.includes("teste real") ||
    prompt.includes("probe openai") ||
    prompt.includes("testar openai") ||
    prompt.includes("api key")
  ) {
    return "openai_status";
  }

  if (
    prompt.includes("relatÃÂ³rio") ||
    prompt.includes("relatorio") ||
    prompt.includes("diagnÃÂ³stico") ||
    prompt.includes("diagnostico") ||
    prompt.includes("runtime") ||
    prompt.includes("backend") ||
    prompt.includes("endpoint") ||
    prompt.includes("/api/admin-ai") ||
    prompt.includes("conexÃÂ£o") ||
    prompt.includes("conexao")
  ) {
    return "factory_diagnosis";
  }

  if (
    prompt.includes("arquitetura") ||
    prompt.includes("estrutura") ||
    prompt.includes("organizaÃÂ§ÃÂ£o") ||
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
    prompt.includes("cÃÂ³digo completo") ||
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
    prompt.includes("ajuste mÃÂ­nimo") ||
    prompt.includes("ajuste minimo")
  ) {
    return "propose-patch";
  }

  if (
    prompt.includes("zip") ||
    prompt.includes("pdf") ||
    prompt.includes("imagem") ||
    prompt.includes("ÃÂ¡udio") ||
    prompt.includes("audio")
  ) {
    return "ingest-context";
  }

  return "chat";
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(-8)
    .map((item) => {
      const role = String(item?.role || "user").trim().toLowerCase();
      const text = clampText(String(item?.text || item?.content || "").trim(), 1200);

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
    .slice(0, 8)
    .map((item) => {
      const name = clampText(String(item?.name || "").trim(), 180);
      const kind = clampText(String(item?.kind || "unknown").trim(), 40);
      const mime = clampText(String(item?.mime || "").trim(), 120);
      const summary = clampText(String(item?.summary || "").trim(), 260);
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

  return compactPayloadForModel(out);
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
        "- ready = API/componente disponÃÂÃÂ­vel para uso no runtime",
        "- active = componente marcado como ativo no status/registry/snapshot atual",
        "- activeList = lista explÃÂÃÂ­cita de mÃÂÃÂ³dulos ativos",
        "- presence, ready e active NÃÂÃÂO sÃÂÃÂ£o sinÃÂÃÂ´nimos",
        "- nÃÂÃÂ£o conclua 'mÃÂÃÂ³dulo desativado' sÃÂÃÂ³ porque active=false quando presence=true ou ready=true"
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
      "3) cite active apenas quando o status do mÃÂÃÂ³dulo ou activeList confirmar ativaÃÂÃÂ§ÃÂÃÂ£o",
      "4) se presence=true e active=false, descreva como 'presente, mas nÃÂÃÂ£o marcado como ativo no snapshot atual'",
      "5) se ready=true e active=false, descreva como 'disponÃÂÃÂ­vel/pronto, mas nÃÂÃÂ£o marcado como ativo no status atual'",
      "6) nÃÂÃÂ£o converta isso automaticamente em falha confirmada"
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
        "priorizar evoluÃÂÃÂ§ÃÂÃÂ£o da prÃÂÃÂ³pria Factory AI antes de outros fluxos",
        "evitar cair no ciclo genÃÂÃÂ©rico doctor/state/registry/tree sem avanÃÂÃÂ§o real",
        "quando possÃÂÃÂ­vel, indicar prÃÂÃÂ³ximo arquivo mais estratÃÂÃÂ©gico",
        "dar preferÃÂÃÂªncia a planner/bridge/actions/backend/chat supervisionado quando a meta for inteligÃÂÃÂªncia da Factory"
      ],
      action,
      prompt: clampText(String(prompt || ""), 1400),
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
    }));

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
        "Ele deve ter prioridade sobre heurÃÂÃÂ­sticas genÃÂÃÂ©ricas quando o usuÃÂÃÂ¡rio pedir evoluÃÂÃÂ§ÃÂÃÂ£o, autonomia, plano ou prÃÂÃÂ³ximo arquivo.",
        "Evite cair automaticamente em doctor/state/registry/tree se o contexto atual jÃÂÃÂ¡ aponta para evoluÃÂÃÂ§ÃÂÃÂ£o cognitiva da Factory AI."
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
  if (action === "openai_status") return "openai-connectivity";

  if (
    prompt.includes("openai") ||
    prompt.includes("conexÃÂÃÂ£o") ||
    prompt.includes("conexao") ||
    prompt.includes("api key") ||
    prompt.includes("endpoint") ||
    prompt.includes("runtime") ||
    prompt.includes("backend") ||
    prompt.includes("/api/admin-ai")
  ) {
    return "openai-connectivity";
  }

  if (
    prompt.includes("autonomia") ||
    prompt.includes("autÃÂÃÂ´nom") ||
    prompt.includes("autonom") ||
    prompt.includes("evoluir") ||
    prompt.includes("evoluÃÂÃÂ§ÃÂÃÂ£o") ||
    prompt.includes("evolucao") ||
    prompt.includes("factory ai") ||
    prompt.includes("prÃÂÃÂ³ximo arquivo") ||
    prompt.includes("proximo arquivo") ||
    prompt.includes("plano") ||
    prompt.includes("planejar") ||
    prompt.includes("prÃÂÃÂ³xima etapa") ||
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
    prompt.includes("diagnÃÂÃÂ³stico") ||
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
    "/app/js/core/factory_ai_runtime.js",
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

    if (goal === "openai-connectivity") {
      if (file === "/functions/api/admin-ai.js") {
        score += 120;
        reasons.push("backend real da conexÃÂÃÂ£o com OpenAI");
      }
      if (file === "/app/js/core/factory_ai_runtime.js") {
        score += 95;
        reasons.push("runtime lÃÂÃÂª e expÃÂÃÂµe status real da conexÃÂÃÂ£o");
      }
      if (file === "/app/js/admin.admin_ai.js") {
        score += 72;
        reasons.push("front exibe endpoint/status e envia prompt");
      }
      if (file === "/app/js/core/factory_ai_planner.js") {
        score -= 24;
        reasons.push("planner nÃÂÃÂ£o ÃÂÃÂ© o primeiro gargalo da conectividade");
      }
    }

    if (goal === "evolve-factory-ai") {
      if (file === "/app/js/core/factory_ai_planner.js") {
        score += 100;
        reasons.push("camada principal de priorizaÃÂÃÂ§ÃÂÃÂ£o e inteligÃÂÃÂªncia supervisionada");
      }
      if (file === "/app/js/core/factory_ai_actions.js") {
        score += 85;
        reasons.push("coordena execuÃÂÃÂ§ÃÂÃÂ£o supervisionada real da Factory AI");
      }
      if (file === "/app/js/core/factory_ai_bridge.js") {
        score += 72;
        reasons.push("faz a ponte entre resposta textual e plano operacional");
      }
      if (file === "/functions/api/admin-ai.js") {
        score += 66;
        reasons.push("backend do chat precisa obedecer melhor a lÃÂÃÂ³gica de prioridade");
      }
      if (file === "/app/js/admin.admin_ai.js") {
        score += 54;
        reasons.push("front do chat e integraÃÂÃÂ§ÃÂÃÂ£o da Factory AI");
      }
      if (file === "/app/js/core/patch_supervisor.js") {
        score += 45;
        reasons.push("fecha o fluxo supervisionado approve ÃÂ¢ÃÂÃÂ validate ÃÂ¢ÃÂÃÂ stage ÃÂ¢ÃÂÃÂ apply");
      }
      if (file === "/app/js/core/factory_tree.js") {
        score -= 22;
        reasons.push("tree nÃÂÃÂ£o deve voltar a sequestrar prioridade nesta fase");
      }
      if (file === "/app/js/core/factory_state.js") {
        score -= 14;
        reasons.push("state jÃÂÃÂ¡ nÃÂÃÂ£o deve ser prioridade padrÃÂÃÂ£o quando a meta ÃÂÃÂ© inteligÃÂÃÂªncia da Factory");
      }
      if (file === "/app/js/core/doctor_scan.js") {
        score -= 40;
        reasons.push("doctor nÃÂÃÂ£o deve assumir a prioridade se o foco for evoluÃÂÃÂ§ÃÂÃÂ£o cognitiva");
      }
    }

    if (goal === "supervised-patch-flow") {
      if (file === "/app/js/core/patch_supervisor.js") {
        score += 100;
        reasons.push("nÃÂÃÂºcleo do fluxo supervisionado de patch");
      }
      if (file === "/app/js/core/factory_ai_actions.js") {
        score += 82;
        reasons.push("aÃÂÃÂ§ÃÂÃÂµes coordenam approve, validate, stage e apply");
      }
      if (file === "/app/js/core/factory_ai_bridge.js") {
        score += 68;
        reasons.push("bridge mantÃÂÃÂ©m integridade do plano supervisionado");
      }
      if (file === "/functions/api/admin-ai.js") {
        score += 32;
        reasons.push("backend pode melhorar a proposta textual do patch");
      }
    }

    if (goal === "diagnostics") {
      if (file === "/app/js/core/doctor_scan.js") {
        score += 100;
        reasons.push("doctor ÃÂÃÂ© prioritÃÂÃÂ¡rio quando o foco real ÃÂÃÂ© diagnÃÂÃÂ³stico");
      }
      if (file === "/app/js/core/factory_state.js") {
        score += 55;
        reasons.push("estado ajuda a consolidar dados diagnÃÂÃÂ³sticos");
      }
      if (file === "/app/js/core/factory_tree.js") {
        score += 34;
        reasons.push("tree ajuda a visibilidade estrutural do runtime");
      }
    }

    if (goal === "generate-code") {
      if (file === "/functions/api/admin-ai.js") {
        score += 58;
        reasons.push("backend influencia a qualidade da geraÃÂÃÂ§ÃÂÃÂ£o");
      }
      if (file === "/app/js/core/factory_ai_actions.js") {
        score += 66;
        reasons.push("actions ajuda a transformar geraÃÂÃÂ§ÃÂÃÂ£o em fluxo operacional");
      }
      if (file === "/app/js/core/factory_ai_bridge.js") {
        score += 48;
        reasons.push("bridge melhora consolidaÃÂÃÂ§ÃÂÃÂ£o do cÃÂÃÂ³digo gerado");
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
        reasons.push("patch supervisor ÃÂÃÂ© a camada segura de aplicaÃÂÃÂ§ÃÂÃÂ£o");
      }
    }

    if (goal === "general-supervision") {
      if (file === "/app/js/core/factory_ai_planner.js") {
        score += 30;
        reasons.push("planner continua sendo prioridade estrutural");
      }
      if (file === "/app/js/core/factory_ai_actions.js") {
        score += 24;
        reasons.push("actions mantÃÂÃÂ©m avanÃÂÃÂ§o supervisionado real");
      }
      if (file === "/app/js/core/factory_ai_bridge.js") {
        score += 20;
        reasons.push("bridge continua chave na orquestraÃÂÃÂ§ÃÂÃÂ£o");
      }
      if (file === "/app/js/core/doctor_scan.js") {
        score -= 12;
        reasons.push("doctor nÃÂÃÂ£o deve assumir prioridade padrÃÂÃÂ£o sem pedido especÃÂÃÂ­fico");
      }
    }

    const hasContextEngine = activeModules.includes("contextEngine");
    const hasFactoryAI = activeModules.includes("factoryAI");

    if (hasContextEngine && hasFactoryAI) {
      if (
        file === "/app/js/core/factory_ai_planner.js" ||
        file === "/app/js/core/factory_ai_actions.js" ||
        file === "/app/js/core/factory_ai_bridge.js" ||
        file === "/functions/api/admin-ai.js" ||
        file === "/app/js/core/factory_ai_runtime.js"
      ) {
        score += 14;
        reasons.push("nÃÂÃÂºcleo ativo jÃÂÃÂ¡ permite subir para camada cognitiva mais forte");
      }
    }

    if (candidateFiles.includes(file)) {
      score += 8;
      reasons.push("arquivo jÃÂÃÂ¡ aparece entre candidatos do snapshot");
    }

    const hasTree = boolFrom(flagValue(flags, ["hasFactoryTree"]));
    if (!hasTree && file === "/app/js/core/factory_tree.js") {
      score += 12;
      reasons.push("tree ainda pode precisar consolidaÃÂÃÂ§ÃÂÃÂ£o se realmente estiver ausente");
    }

    const pathsCount = numberOrNull(snapshot?.tree?.pathsCount) || 0;
    if (pathsCount < 20 && file === "/app/js/core/factory_tree.js") {
      score += 16;
      reasons.push("ÃÂÃÂ¡rvore ainda estÃÂÃÂ¡ rasa");
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

  if (goal === "openai-connectivity") {
    line.push("/functions/api/admin-ai.js");
    line.push("/app/js/core/factory_ai_runtime.js");
    line.push("/app/js/admin.admin_ai.js");
  } else if (goal === "evolve-factory-ai") {
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
    interpretation = "presente e pronto, mas nÃÂÃÂ£o marcado como ativo no snapshot atual";
  } else if (presence && !ready && active) {
    interpretation = "presente e marcado como ativo, mas sem prontidÃÂÃÂ£o clara no snapshot";
  } else if (presence && !ready && !active) {
    interpretation = "presente, mas sem prontidÃÂÃÂ£o clara e sem ativaÃÂÃÂ§ÃÂÃÂ£o confirmada no snapshot";
  } else if (!presence && ready) {
    interpretation = "possÃÂÃÂ­vel inconsistÃÂÃÂªncia do snapshot: pronto sem presenÃÂÃÂ§a explÃÂÃÂ­cita";
  } else if (!presence && active) {
    interpretation = "possÃÂÃÂ­vel inconsistÃÂÃÂªncia do snapshot: ativo sem presenÃÂÃÂ§a explÃÂÃÂ­cita";
  } else if (!presence && !ready && !active) {
    interpretation = "sem evidÃÂÃÂªncia de presenÃÂÃÂ§a, prontidÃÂÃÂ£o ou ativaÃÂÃÂ§ÃÂÃÂ£o";
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
  const frontTelemetry = safeObj(payload).frontTelemetry || safeObj(safeObj(payload).snapshot).frontTelemetry || {};
  const structuredRuntimeFrontDiagnostic = isStructuredRuntimeFrontDiagnostic(prompt);
  const lowerPrompt = String(prompt || "").trim().toLowerCase();
  const asksOpenAI =
    lowerPrompt.includes("openai") ||
    lowerPrompt.includes("conexÃÂÃÂ£o") ||
    lowerPrompt.includes("conexao") ||
    lowerPrompt.includes("api key") ||
    lowerPrompt.includes("endpoint") ||
    lowerPrompt.includes("runtime") ||
    lowerPrompt.includes("backend");

  const system = [
    "VocÃÂÃÂª ÃÂÃÂ© a Factory AI da RControl Factory.",
    "VocÃÂÃÂª ÃÂÃÂ© o chat oficial interno da Factory.",
    "Sua prioridade atual ÃÂÃÂ© ajudar a estruturar, estabilizar, evoluir e supervisionar a prÃÂÃÂ³pria Factory antes de expandir para outros fluxos.",
    "VocÃÂÃÂª deve agir como copiloto tÃÂÃÂ©cnico da Factory, mas SEM inventar fatos.",
    "",
    "Regras centrais:",
    "1. Responda EXCLUSIVAMENTE com base no payload recebido, no histÃÂÃÂ³rico enviado, nos anexos descritos e no prompt atual.",
    "2. NÃÂÃÂO invente estados, mÃÂÃÂ³dulos, falhas, versÃÂÃÂµes, arquivos, ÃÂÃÂ¡rvores, logs, relatÃÂÃÂ³rios ou inconsistÃÂÃÂªncias que nÃÂÃÂ£o estejam explÃÂÃÂ­citos.",
    "3. Se um dado estiver ausente, diga exatamente: 'dado ausente'.",
    "4. Se algo parecer contraditÃÂÃÂ³rio, diga exatamente: 'possÃÂÃÂ­vel inconsistÃÂÃÂªncia do snapshot'.",
    "5. NÃÂÃÂO trate ausÃÂÃÂªncia de dado como erro confirmado.",
    "6. NÃÂÃÂO diga que um mÃÂÃÂ³dulo estÃÂÃÂ¡ quebrado sÃÂÃÂ³ porque ele nÃÂÃÂ£o apareceu no snapshot.",
    "7. Diferencie sempre:",
    "8. Quando o prompt pedir diagnÃÂÃÂ³stico estruturado de runtime/front, NÃÂÃÂO reduza a resposta a um probe simples de OpenAI.",
    "9. Em diagnÃÂÃÂ³stico estruturado de runtime/front, use explicitamente frontTelemetry, runtimeLayer, connection e request.routing se existirem no payload.",
    "10. SÃÂÃÂ³ use probe simples quando a tarefa for explicitamente openai_status/conectividade.",
    "   - fato confirmado",
    "   - dado ausente",
    "   - inferÃÂÃÂªncia provÃÂÃÂ¡vel",
    "   - hipÃÂÃÂ³tese que ainda depende de arquivo/contexto adicional.",
    "8. NÃÂÃÂO mande recriar a Factory do zero.",
    "9. NÃÂÃÂO proponha reescrever toda a plataforma.",
    "10. Priorize patch mÃÂÃÂ­nimo, estabilidade, seguranÃÂÃÂ§a e evoluÃÂÃÂ§ÃÂÃÂ£o em camadas.",
    "11. Se faltar contexto para gerar cÃÂÃÂ³digo seguro, explique o que falta e diga qual ÃÂÃÂ© o prÃÂÃÂ³ximo arquivo mais ÃÂÃÂºtil.",
    "12. Quando houver contexto suficiente e o usuÃÂÃÂ¡rio pedir arquivo completo, entregue o arquivo completo.",
    "13. Quando o usuÃÂÃÂ¡rio estiver sÃÂÃÂ³ conversando, responda como chat tÃÂÃÂ©cnico natural, ÃÂÃÂºtil e direto.",
    "14. Responda sempre em portuguÃÂÃÂªs do Brasil.",
    "",
    "Regra crÃÂÃÂ­tica de leitura do snapshot:",
    "- NÃÂÃÂO confunda presenÃÂÃÂ§a, prontidÃÂÃÂ£o e ativaÃÂÃÂ§ÃÂÃÂ£o.",
    "- presence/presente = componente detectado no ambiente ou nas flags.",
    "- ready/pronto = componente/API disponÃÂÃÂ­vel para uso no runtime atual.",
    "- active/ativo = mÃÂÃÂ³dulo marcado como ativo no status/registry/lista active.",
    "- Se presence=true e active=false, descreva como 'presente, mas nÃÂÃÂ£o marcado como ativo no snapshot atual'.",
    "- Se ready=true e active=false, descreva como 'pronto/disponÃÂÃÂ­vel, mas nÃÂÃÂ£o marcado como ativo no status atual'.",
    "- Isso NÃÂÃÂO ÃÂÃÂ© falha confirmada por si sÃÂÃÂ³.",
    "",
    "Sobre anexos:",
    "- Trate anexos apenas como metadados/contexto descrito, nÃÂÃÂ£o como conteÃÂÃÂºdo binÃÂÃÂ¡rio jÃÂÃÂ¡ lido.",
    "- NÃÂÃÂ£o finja que abriu ZIP, PDF, imagem, ÃÂÃÂ¡udio ou vÃÂÃÂ­deo se sÃÂÃÂ³ houver descriÃÂÃÂ§ÃÂÃÂ£o/metadados.",
    "",
    "Sobre a funÃÂÃÂ§ÃÂÃÂ£o atual da Factory AI:",
    "- A Factory AI deve primeiro ajudar a estruturar a prÃÂÃÂ³pria Factory.",
    "- O foco atual nÃÂÃÂ£o ÃÂÃÂ© voltar sempre para o mesmo ciclo genÃÂÃÂ©rico.",
    "- Priorize evoluÃÂÃÂ§ÃÂÃÂ£o cognitiva e orquestraÃÂÃÂ§ÃÂÃÂ£o supervisionada quando o contexto apontar para isso.",
    "- Depois ela poderÃÂÃÂ¡ apoiar criaÃÂÃÂ§ÃÂÃÂ£o de mÃÂÃÂ³dulos, agentes e fluxos de app building.",
    "- Sempre respeite fluxo supervisionado e seguro.",
    "",
    "Sobre o estilo das respostas:",
    "- Seja ÃÂÃÂºtil e prÃÂÃÂ¡tica.",
    "- Evite repetir listas genÃÂÃÂ©ricas sem avanÃÂÃÂ§o real.",
    "- Se o snapshot estiver raso, reconheÃÂÃÂ§a isso e foque no prÃÂÃÂ³ximo arquivo mais ÃÂÃÂºtil.",
    "- NÃÂÃÂ£o fique repetindo logger/doctor/version unknown como centro da resposta, a menos que isso seja realmente o ponto principal do pedido.",
    "- Se o objetivo do usuÃÂÃÂ¡rio for evoluir a Factory AI, dÃÂÃÂª prioridade a planner/bridge/actions/backend/chat supervisionado antes de cair automaticamente em doctor/state/registry/tree.",
    "- Se existir __planner_hint no payload, trate-o como guidance operacional forte.",
    "- NÃÂÃÂ£o ignore __planner_hint quando o usuÃÂÃÂ¡rio pedir prÃÂÃÂ³ximo arquivo, prioridade, autonomia, evoluÃÂÃÂ§ÃÂÃÂ£o ou plano.",
    "",
    "Regra especial para perguntas sobre OpenAI/conectividade/runtime/backend:",
    "- Se o pedido falar de OpenAI, conexÃÂÃÂ£o, endpoint, backend, runtime ou API key, priorize diagnosticar a trilha real backend -> runtime -> frontend.",
    "- Nessa situaÃÂÃÂ§ÃÂÃÂ£o, NÃÂÃÂO empurre automaticamente a resposta para factory_ai_planner.js se houver sinais mais fortes em /functions/api/admin-ai.js ou no runtime.",
    "- Diga claramente se a conexÃÂÃÂ£o estÃÂÃÂ¡ confirmada, ausente, falhando por chave, rede, upstream ou dado ausente.",
    "- Use o campo connection do backend como evidÃÂÃÂªncia principal quando existir.",
    "",
    "Formato de resposta por action:",
    "",
    "Se action=factory_diagnosis, analyze-architecture, analyze-logs, summarize-structure, suggest-improvement ou openai_status:",
    "1. Fatos confirmados",
    "2. Dados ausentes ou mal consolidados",
    "3. InferÃÂÃÂªncias provÃÂÃÂ¡veis",
    "4. PrÃÂÃÂ³ximo passo mÃÂÃÂ­nimo recomendado",
    "5. Arquivos mais provÃÂÃÂ¡veis de ajuste",
    "",
    "Se action=propose-patch, acrescente:",
    "6. Patch mÃÂÃÂ­nimo sugerido",
    "",
    "Se action=generate-code, use exatamente:",
    "1. Objetivo",
    "2. Arquivo alvo",
    "3. Risco",
    "4. CÃÂÃÂ³digo sugerido",
    "",
    "Se action=ingest-context:",
    "- explique como aproveitar os anexos/contexto enviado sem fingir leitura binÃÂÃÂ¡ria real.",
    "",
    "Se action=chat:",
    "- responda como chat tÃÂÃÂ©cnico natural, conversÃÂÃÂ¡vel, direto e ÃÂÃÂºtil.",
    "- se o pedido for claro e houver contexto suficiente, responda direto.",
    "- se o pedido pedir prÃÂÃÂ³ximo arquivo, prioridade ou autonomia, dÃÂÃÂª resposta objetiva e priorizada.",
    "- se existir planner_hint.nextFile, use esse alvo como base principal, salvo se o payload trouxer fato mais forte em sentido contrÃÂÃÂ¡rio.",
    "- se o pedido exigir arquivo especÃÂÃÂ­fico que nÃÂÃÂ£o foi enviado, diga qual arquivo ÃÂÃÂ© o prÃÂÃÂ³ximo mais ÃÂÃÂºtil.",
    "- se houver risco de inferÃÂÃÂªncia excessiva, explicite esse limite sem enrolar.",
    "- se o snapshot vier raso, nÃÂÃÂ£o transforme isso automaticamente em diagnÃÂÃÂ³stico de falha estrutural.",
    asksOpenAI
      ? "- como o pedido atual ÃÂÃÂ© sobre OpenAI/conexÃÂÃÂ£o/runtime/backend, priorize /functions/api/admin-ai.js e status connection antes de sugerir planner."
      : ""
  ].filter(Boolean).join("\n");

  const task = buildTaskText(action, prompt, payload);

  const payloadText = stringify(payload);
  const compactPayloadText = clampText(payloadText, 24000);
  const historyText = clampText(historyToText(history), 9000);
  const attachmentsText = clampText(attachmentsToText(attachments), 3000);

  return [
    system,
    "",
    "Fonte:",
    source || "factory-ai",
    "",
    "VersÃÂÃÂ£o do cliente:",
    version || "(nÃÂÃÂ£o informada)",
    "",
    "AÃÂÃÂ§ÃÂÃÂ£o:",
    action,
    "",
    "Tarefa:",
    task,
    "",
    "Planner hint determinÃÂÃÂ­stico:",
    stringify(plannerHint || "(ausente)"),
    "",
    "HistÃÂÃÂ³rico recente:",
    historyText,
    "",
    "Anexos recebidos (metadados):",
    attachmentsText,
    "",
    "Prompt atual do usuÃÂÃÂ¡rio:",
    prompt || "(nenhum)",
    "",
    "Payload recebido:",
    compactPayloadText
  ].join("\n");
}

function buildTaskText(action, prompt = "", payload = null) {
  const p = String(prompt || "").trim().toLowerCase();
  const hasPlannerContext = !!safeObj(payload).__planner_context;
  const plannerHint = safeObj(payload).__planner_hint;
  const hintedNextFile = String(plannerHint.nextFile || "").trim();

  const asksNextFile =
    p.includes("prÃÂÃÂ³ximo arquivo") ||
    p.includes("proximo arquivo") ||
    p.includes("qual arquivo") ||
    p.includes("prioridade");
  const asksAutonomy =
    p.includes("autonomia") ||
    p.includes("autÃÂÃÂ´nom") ||
    p.includes("autonom") ||
    p.includes("sozinha") ||
    p.includes("sozinho");
  const asksPlan =
    p.includes("planejar") ||
    p.includes("plano") ||
    p.includes("sequÃÂÃÂªncia") ||
    p.includes("sequencia");
  const asksOpenAI =
    p.includes("openai") ||
    p.includes("conexÃÂÃÂ£o") ||
    p.includes("conexao") ||
    p.includes("endpoint") ||
    p.includes("runtime") ||
    p.includes("backend") ||
    p.includes("api key");

  if (action === "factory_diagnosis") {
    return [
      "Analise o snapshot/relatÃÂÃÂ³rio da RControl Factory e aponte somente fatos confirmados, dados ausentes, inferÃÂÃÂªncias provÃÂÃÂ¡veis e prÃÂÃÂ³ximo passo mÃÂÃÂ­nimo.",
      "Ao descrever mÃÂÃÂ³dulos, separe explicitamente presenÃÂÃÂ§a, prontidÃÂÃÂ£o e ativaÃÂÃÂ§ÃÂÃÂ£o."
    ].join(" ");
  }

  if (action === "analyze-architecture") {
    return [
      "Analise a arquitetura atual da RControl Factory usando somente o contexto enviado, evitando confundir snapshot parcial com falha confirmada.",
      "Ao descrever mÃÂÃÂ³dulos, separe explicitamente presenÃÂÃÂ§a, prontidÃÂÃÂ£o e ativaÃÂÃÂ§ÃÂÃÂ£o."
    ].join(" ");
  }

  if (action === "analyze-logs") {
    return "Analise logs recentes da RControl Factory em conjunto com o snapshot enviado, separando fato confirmado de hipÃÂÃÂ³tese.";
  }

  if (action === "review-module") {
    return "Revise o mÃÂÃÂ³dulo informado usando somente os dados enviados e diga o prÃÂÃÂ³ximo arquivo mais ÃÂÃÂºtil se o contexto ainda estiver incompleto.";
  }

  if (action === "suggest-improvement") {
    return [
      "Sugira a prÃÂÃÂ³xima melhoria mais segura com base apenas no snapshot enviado, priorizando a evoluÃÂÃÂ§ÃÂÃÂ£o da prÃÂÃÂ³pria Factory AI.",
      "Se houver diferenÃÂÃÂ§a entre presence, ready e active, trate isso como nuance do snapshot, nÃÂÃÂ£o como falha automÃÂÃÂ¡tica."
    ].join(" ");
  }

  if (action === "summarize-structure") {
    return "Resuma a estrutura atual da RControl Factory com base apenas no contexto enviado, sem inventar partes ausentes.";
  }

  if (action === "propose-patch") {
    return "Proponha um patch mÃÂÃÂ­nimo e seguro com base apenas no contexto enviado, sem reescrever a Factory do zero.";
  }

  if (action === "generate-code") {
    return "Gere cÃÂÃÂ³digo com patch mÃÂÃÂ­nimo, sem reescrever a Factory do zero, usando apenas o contexto enviado. Se faltar contexto, explique exatamente o que falta.";
  }

  if (action === "ingest-context") {
    return "Explique como a Factory deve aproveitar os anexos descritos e o contexto recebido sem fingir leitura binÃÂÃÂ¡ria real dos arquivos.";
  }

  if (action === "openai_status") {
    return "Diagnostique especificamente a trilha backend -> OpenAI, mostrando se hÃÂÃÂ¡ conexÃÂÃÂ£o real, endpoint vÃÂÃÂ¡lido, chave configurada e qual ÃÂÃÂ© o prÃÂÃÂ³ximo arquivo mÃÂÃÂ­nimo da cadeia.";
  }

  if (action === "chat") {
    const lines = [
      "Responda como o chat tÃÂÃÂ©cnico oficial da Factory, de forma natural, objetiva e ÃÂÃÂºtil, ajudando a estruturar a prÃÂÃÂ³pria Factory primeiro.",
      "Quando o pedido estiver raso ou o snapshot vier incompleto, foque mais em qual ÃÂÃÂ© o prÃÂÃÂ³ximo arquivo certo do que em repetir diagnÃÂÃÂ³stico genÃÂÃÂ©rico.",
      "Se o payload trouxer nuances entre presence, ready e active, respeite essas diferenÃÂÃÂ§as explicitamente."
    ];

    if (asksOpenAI) {
      lines.push("O pedido atual ÃÂÃÂ© sobre OpenAI/conexÃÂÃÂ£o/runtime/backend. Priorize diagnosticar a trilha real /functions/api/admin-ai.js -> runtime -> front.");
      lines.push("SÃÂÃÂ³ indique planner como prÃÂÃÂ³ximo arquivo se o prÃÂÃÂ³prio payload trouxer fato forte de que ele ÃÂÃÂ© o gargalo principal.");
    }

    if (asksNextFile || asksPlan || asksAutonomy) {
      lines.push("O usuÃÂÃÂ¡rio estÃÂÃÂ¡ pedindo priorizaÃÂÃÂ§ÃÂÃÂ£o real. DÃÂÃÂª uma resposta objetiva indicando o prÃÂÃÂ³ximo arquivo mais estratÃÂÃÂ©gico e por quÃÂÃÂª.");
      lines.push("Evite cair automaticamente no ciclo genÃÂÃÂ©rico doctor/state/registry/tree se o contexto atual estiver voltado para evoluÃÂÃÂ§ÃÂÃÂ£o da Factory AI.");
      if (hintedNextFile) {
        lines.push("O backend jÃÂÃÂ¡ calculou planner_hint.nextFile='" + hintedNextFile + "'. Use isso como base principal, salvo se o prÃÂÃÂ³prio payload trouxer fato mais forte em sentido contrÃÂÃÂ¡rio.");
      }
    }

    if (hasPlannerContext) {
      lines.push("Use o contexto de planner/candidateFiles/pathGroups para priorizar melhor o prÃÂÃÂ³ximo arquivo.");
    }

    if (prompt) {
      lines.push("Pedido atual: " + clampText(prompt, 1200));
    }

    return lines.join(" ");
  }

  return "Analise a RControl Factory com base apenas no contexto enviado.";
}

function historyToText(history) {
  if (!Array.isArray(history) || !history.length) {
    return "(sem histÃÂÃÂ³rico)";
  }

  return history
    .map((item, idx) => `${idx + 1}. [${item.role}] ${clampText(item.text, 1200)}`)
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
        `name=${clampText(item.name || "(sem nome)", 180)}`,
        `kind=${clampText(item.kind || "unknown", 40)}`,
        `mime=${clampText(item.mime || "(sem mime)", 120)}`,
        `size=${item.size || 0}`,
        `summary=${clampText(item.summary || "(sem resumo)", 260)}`
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
    mentionsPlannerFlow: /planner|plano|prioridade|prÃÂÃÂ³ximo arquivo|proximo arquivo/i.test(content),
    mentionsOpenAIFlow: /openai|conexÃÂÃÂ£o|conexao|runtime|backend|endpoint|api key/i.test(content),
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
  if (raw.includes("mÃÂÃÂ©dio") || raw.includes("medio") || raw.includes("medium")) return "medium";
  if (raw.includes("alto") || raw.includes("high") || raw.includes("crÃÂÃÂ­tico") || raw.includes("critico")) return "high";
  return "unknown";
}

function extractResponseMeta(data) {
  const status = String(data?.status || "").trim();
  const incompleteReason =
    String(
      data?.incomplete_details?.reason ||
      data?.response?.incomplete_details?.reason ||
      ""
    ).trim();

  return {
    status,
    incomplete: status === "incomplete" || !!incompleteReason,
    incompleteReason
  };
}

function extractText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  try {
    const chunks = [];
    const output = Array.isArray(data?.output) ? data.output : [];

    for (const item of output) {
      if (typeof item?.text === "string" && item.text.trim()) {
        chunks.push(item.text.trim());
      }

      const content = Array.isArray(item?.content) ? item.content : [];

      for (const c of content) {
        if (c?.type === "output_text" && typeof c?.text === "string" && c.text.trim()) {
          chunks.push(c.text.trim());
          continue;
        }

        if (c?.type === "text" && typeof c?.text === "string" && c.text.trim()) {
          chunks.push(c.text.trim());
          continue;
        }

        if (c?.type === "text" && c?.text && typeof c.text?.value === "string" && c.text.value.trim()) {
          chunks.push(c.text.value.trim());
          continue;
        }

        if (typeof c?.text === "string" && c.text.trim()) {
          chunks.push(c.text.trim());
          continue;
        }

        if (typeof c?.value === "string" && c.value.trim()) {
          chunks.push(c.value.trim());
        }
      }
    }

    if (chunks.length) {
      return dedupeStrings(chunks).join("\n").trim();
    }
  } catch {}

  try {
    if (Array.isArray(data?.content)) {
      const parts = data.content
        .map((x) => {
          if (typeof x?.text === "string") return x.text.trim();
          if (typeof x?.value === "string") return x.value.trim();
          if (x?.text && typeof x.text?.value === "string") return x.text.value.trim();
          return "";
        })
        .filter(Boolean);

      if (parts.length) return dedupeStrings(parts).join("\n").trim();
    }
  } catch {}

  try {
    if (typeof data?.response?.output_text === "string" && data.response.output_text.trim()) {
      return data.response.output_text.trim();
    }
  } catch {}

  try {
    if (typeof data?.text === "string" && data.text.trim()) {
      return data.text.trim();
    }
  } catch {}

  return "";
}

function buildEmptyTextFallback({ action, prompt, responseMeta, model, endpoint }) {
  return [
    "1. Fatos confirmados",
    "- O backend recebeu resposta da OpenAI, mas sem texto consolidado legÃÂÃÂ­vel.",
    `- action: ${action || "dado ausente"}`,
    `- model: ${model || "dado ausente"}`,
    `- endpoint: ${endpoint || "dado ausente"}`,
    "",
    "2. Dados ausentes ou mal consolidados",
    `- response.status: ${responseMeta?.status || "dado ausente"}`,
    `- incomplete_reason: ${responseMeta?.incompleteReason || "dado ausente"}`,
    "",
    "3. InferÃÂÃÂªncias provÃÂÃÂ¡veis",
    responseMeta?.incomplete
      ? "- A resposta provavelmente foi limitada antes de consolidar todo o texto."
      : "- O formato retornado nÃÂÃÂ£o veio no padrÃÂÃÂ£o textual esperado pelo backend.",
    "",
    "4. PrÃÂÃÂ³ximo passo mÃÂÃÂ­nimo recomendado",
    "- Validar limite de saÃÂÃÂ­da, formato retornado e consumo no runtime/front.",
    "",
    "5. Arquivos mais provÃÂÃÂ¡veis de ajuste",
    "- /functions/api/admin-ai.js",
    "- /app/js/core/factory_ai_runtime.js",
    "- /app/js/admin.admin_ai.js",
    "",
    "Prompt atual:",
    clampText(prompt || "(nenhum)", 1000)
  ].join("\n");
}

function compactPayloadForModel(value, depth = 0) {
  if (depth > 6) return "[truncated:depth]";
  if (value == null) return value;

  if (typeof value === "string") {
    return clampText(value, 1800);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 24).map((item) => compactPayloadForModel(item, depth + 1));
  }

  if (typeof value === "object") {
    const out = {};
    const keys = Object.keys(value).slice(0, 40);

    for (const key of keys) {
      out[key] = compactPayloadForModel(value[key], depth + 1);
    }

    return out;
  }

  return String(value);
}

function clampText(value, max = 1000) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return text.slice(0, max) + ` ÃÂ¢ÃÂÃÂ¦[truncated ${text.length - max} chars]`;
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
