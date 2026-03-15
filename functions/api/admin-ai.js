/* FILE: /functions/api/admin-ai.js
   RControl Factory — Factory AI API
   V3.0 CHAT-FIRST BACKEND + APPROVAL-READY

   - mantém CORS e POST atuais
   - continua usando OPENAI_API_KEY
   - mantém compatibilidade com actions antigas
   - adiciona actions novas para Factory AI orientada a aprovação
   - aceita histórico simples de conversa
   - aceita payload contextual expandido
   - aceita metadados de anexos/arquivos
   - mantém resposta aterrada no payload
   - não autoriza invenção de estados da Factory
   - prepara fluxo futuro de ZIP / PDF / imagem / vídeo / GitHub
   - NÃO executa alteração automática
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

    const action = normalizeAction(body.action);
    const payload = body.payload ?? null;
    const prompt = String(body.prompt || "").trim();
    const history = normalizeHistory(body.history);
    const source = String(body.source || "factory-ai").trim();
    const version = String(body.version || "").trim();

    const attachments = normalizeAttachments(
      body.attachments ??
      body.files ??
      payload?.attachments ??
      payload?.files
    );

    const approval = normalizeApproval(
      body.approval ??
      payload?.approval ??
      {}
    );

    const allowed = new Set([
      "factory_diagnosis",
      "analyze-architecture",
      "analyze-logs",
      "review-module",
      "suggest-improvement",
      "summarize-structure",
      "propose-patch",
      "generate-code",
      "zip-readiness",
      "chat",
      "plan-change",
      "approval-check",
      "ingest-context",
      "github-readiness"
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
      source,
      version,
      attachments,
      approval
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

    return json({
      ok: true,
      action,
      source,
      version,
      approval_required: shouldRequireApproval(action),
      approval_state: approval.state || "unknown",
      attachments_count: attachments.length,
      analysis: text || "(sem texto retornado)",
      raw: data
    });
  } catch (err) {
    return json({
      ok: false,
      error: String(err?.message || err || "Erro interno.")
    }, 500);
  }
}

function normalizeAction(value) {
  const raw = String(value || "").trim().toLowerCase();

  if (!raw) return "chat";

  const aliases = {
    "factory_diagnosis": "factory_diagnosis",
    "analyze-architecture": "analyze-architecture",
    "analyze-logs": "analyze-logs",
    "review-module": "review-module",
    "suggest-improvement": "suggest-improvement",
    "summarize-structure": "summarize-structure",
    "propose-patch": "propose-patch",
    "generate-code": "generate-code",
    "zip-readiness": "zip-readiness",
    "chat": "chat",
    "plan-change": "plan-change",
    "approval-check": "approval-check",
    "ingest-context": "ingest-context",
    "github-readiness": "github-readiness",

    // aliases úteis
    "diagnosis": "factory_diagnosis",
    "architecture": "analyze-architecture",
    "logs": "analyze-logs",
    "review": "review-module",
    "suggest": "suggest-improvement",
    "summary": "summarize-structure",
    "patch": "propose-patch",
    "code": "generate-code",
    "zip": "zip-readiness",
    "context": "ingest-context",
    "github": "github-readiness"
  };

  return aliases[raw] || raw;
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(-16)
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
    .slice(0, 20)
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;

      const name = String(item.name || item.filename || `file_${index + 1}`).trim();
      const kind = String(item.kind || item.type || item.mime || "unknown").trim();
      const mime = String(item.mime || item.contentType || "").trim();
      const size = Number(item.size || 0) || 0;
      const summary = String(item.summary || item.caption || item.note || "").trim();
      const extractedText = String(item.text || item.extractedText || "").trim();
      const url = String(item.url || "").trim();

      return {
        name,
        kind,
        mime,
        size,
        summary,
        extractedText,
        url
      };
    })
    .filter(Boolean);
}

function normalizeApproval(value) {
  const obj = value && typeof value === "object" ? value : {};

  const stateRaw = String(
    obj.state ||
    obj.status ||
    "unknown"
  ).trim().toLowerCase();

  let state = "unknown";
  if (stateRaw === "approved") state = "approved";
  else if (stateRaw === "pending") state = "pending";
  else if (stateRaw === "rejected") state = "rejected";
  else if (stateRaw === "not_requested") state = "not_requested";

  return {
    state,
    requestedBy: String(obj.requestedBy || obj.requested_by || "").trim(),
    approvedBy: String(obj.approvedBy || obj.approved_by || "").trim(),
    note: String(obj.note || "").trim()
  };
}

function shouldRequireApproval(action) {
  return new Set([
    "propose-patch",
    "generate-code",
    "plan-change",
    "github-readiness"
  ]).has(String(action || ""));
}

function buildGroundedPrompt({
  action,
  payload,
  prompt,
  history,
  source,
  version,
  attachments,
  approval
}) {
  const system = [
    "Você é a Factory AI da RControl Factory.",
    "Você opera como o chat oficial interno da Factory, usando OpenAI como motor.",
    "Seu foco principal atual é a ESTRUTURAÇÃO E EVOLUÇÃO DA PRÓPRIA FACTORY.",
    "Somente depois de consolidar a própria estrutura da Factory é que o Agent AI de criação de aplicativos será derivado.",
    "",
    "Seu trabalho nesta fase é:",
    "- conversar naturalmente com o usuário",
    "- entender pedidos sobre arquitetura, bugs, patch, código, layout, logs, doctor, ZIP, PDF, imagem, vídeo e contexto",
    "- organizar próximo passo seguro",
    "- propor mudanças sem inventar dados",
    "- pedir/apoiar aprovação humana antes de qualquer aplicação real",
    "",
    "Regras de verdade e segurança:",
    "- Use EXCLUSIVAMENTE o payload, o histórico enviado, os anexos/metadados enviados e o prompt atual.",
    "- NÃO invente estados, módulos, falhas, versões, arquivos, árvore, logs ou inconsistências que não estejam explícitos.",
    "- Se um dado estiver ausente, diga claramente: 'dado ausente'.",
    "- Se algo parecer contraditório, diga: 'possível inconsistência do snapshot'.",
    "- NÃO mande recriar a Factory do zero.",
    "- NÃO proponha reescrever toda a plataforma.",
    "- Priorize patch mínimo, estabilidade, segurança e evolução em camadas.",
    "- NÃO diga que algo está quebrado apenas porque não apareceu no payload.",
    "- Não trate ausência de dado como erro confirmado.",
    "",
    "Regra de aprovação:",
    "- Você NÃO aplica nada automaticamente.",
    "- Quando a ação envolver alteração estrutural, patch, geração de código ou futura integração GitHub, trabalhe no fluxo: analisar -> propor -> pedir aprovação -> só depois aplicar.",
    "- Se approval.state não for 'approved', não aja como se a alteração estivesse autorizada.",
    "- Quando faltar aprovação, diga isso explicitamente.",
    "",
    "Regra de resposta:",
    "- Responda sempre em português do Brasil.",
    "- Se o usuário estiver em modo conversa, responda de forma natural, objetiva e técnica.",
    "- Se o usuário pedir código, entregue resposta prática.",
    "- Se o usuário pedir arquivo completo, entregue arquivo completo quando houver base suficiente.",
    "- Se não houver base suficiente para código seguro, explique exatamente o que falta.",
    "",
    "Formato por ação:",
    "- Se action=factory_diagnosis, analyze-architecture, analyze-logs, summarize-structure ou suggest-improvement, use:",
    "  1. Fatos confirmados",
    "  2. Dados ausentes ou mal consolidados",
    "  3. Inferências prováveis",
    "  4. Próximo passo mínimo recomendado",
    "  5. Arquivos mais prováveis de ajuste",
    "",
    "- Se action=propose-patch, acrescente:",
    "  6. Patch mínimo sugerido",
    "  7. Aprovação necessária",
    "",
    "- Se action=generate-code, use:",
    "  1. Objetivo",
    "  2. Arquivo alvo",
    "  3. Risco",
    "  4. Código sugerido",
    "  5. Aprovação necessária",
    "",
    "- Se action=plan-change, use:",
    "  1. Objetivo da mudança",
    "  2. Impacto esperado",
    "  3. Arquivos mais prováveis",
    "  4. Ordem segura de execução",
    "  5. Aprovação necessária",
    "",
    "- Se action=approval-check, foque em dizer se já há base técnica e se há aprovação suficiente para seguir.",
    "",
    "- Se action=zip-readiness ou ingest-context, foque em como a Factory deve receber contexto via ZIP/PDF/imagem/vídeo/arquivo sem quebrar a arquitetura atual.",
    "",
    "- Se action=github-readiness, foque em como preparar integração segura com GitHub, mantendo aprovação humana obrigatória.",
    "",
    "- Se action=chat, responda como um chat técnico natural, mas ainda aterrado no contexto enviado."
  ].join("\n");

  const task = buildTaskText(action);

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
    "Aprovação atual:",
    stringify(approval),
    "",
    "Tarefa:",
    task,
    "",
    "Histórico recente:",
    historyToText(history),
    "",
    "Prompt atual do usuário:",
    prompt || "(nenhum)",
    "",
    "Metadados de anexos/contexto adicional:",
    attachmentsToText(attachments),
    "",
    "Payload recebido:",
    stringify(payload)
  ].join("\n");
}

function buildTaskText(action) {
  if (action === "factory_diagnosis") {
    return "Analise o snapshot/relatório da RControl Factory e aponte somente fatos confirmados, dados ausentes, inferências prováveis e próximo passo mínimo.";
  }

  if (action === "analyze-architecture") {
    return "Analise a arquitetura atual da RControl Factory usando somente o contexto enviado.";
  }

  if (action === "analyze-logs") {
    return "Analise logs recentes da RControl Factory em conjunto com o snapshot enviado.";
  }

  if (action === "review-module") {
    return "Revise o módulo informado usando somente os dados enviados.";
  }

  if (action === "suggest-improvement") {
    return "Sugira a próxima melhoria mais segura com base apenas no snapshot enviado.";
  }

  if (action === "summarize-structure") {
    return "Resuma a estrutura atual da RControl Factory com base apenas no snapshot enviado.";
  }

  if (action === "propose-patch") {
    return "Proponha um patch mínimo e seguro com base apenas no contexto enviado, sem tratar como aprovado automaticamente.";
  }

  if (action === "generate-code") {
    return "Gere código com patch mínimo, sem reescrever a Factory do zero, usando apenas o contexto enviado e deixando clara a necessidade de aprovação.";
  }

  if (action === "zip-readiness") {
    return "Explique como a Factory deve estruturar entrada futura de ZIP, PDF, imagem, vídeo e arquivos sem quebrar o fluxo atual.";
  }

  if (action === "chat") {
    return "Responda como o chat técnico oficial da Factory, de forma natural, útil, objetiva e aterrada no contexto enviado.";
  }

  if (action === "plan-change") {
    return "Monte um plano seguro de mudança para a própria Factory, com ordem de execução e aprovação humana.";
  }

  if (action === "approval-check") {
    return "Verifique se há base suficiente e se há aprovação suficiente para seguir com alteração estrutural.";
  }

  if (action === "ingest-context") {
    return "Explique como absorver o contexto enviado e como ele deve influenciar a próxima resposta ou ação técnica.";
  }

  if (action === "github-readiness") {
    return "Explique como preparar a Factory para integração segura com GitHub, mantendo aprovação humana antes de qualquer escrita.";
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

  return attachments.map((item, idx) => {
    return [
      `${idx + 1}. nome=${item.name || "(sem nome)"}`,
      `tipo=${item.kind || "(sem tipo)"}`,
      `mime=${item.mime || "(sem mime)"}`,
      `size=${item.size || 0}`,
      `summary=${item.summary || "(sem resumo)"}`,
      `text=${item.extractedText || "(sem texto extraído)"}`,
      `url=${item.url || "(sem url)"}`
    ].join(" | ");
  }).join("\n");
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
