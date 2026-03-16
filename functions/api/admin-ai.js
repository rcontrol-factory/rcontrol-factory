/* FILE: /functions/api/admin-ai.js
   RControl Factory — Factory AI API
   V3.1 CHAT COPILOT BACKEND SAFE

   - mantém CORS e POST atuais
   - continua usando OPENAI_API_KEY
   - mantém compatibilidade com actions antigas
   - aceita histórico simples de conversa
   - aceita payload contextual expandido
   - aceita metadados de anexos
   - aceita alias de actions do front mais novo
   - melhora o modo chat como copiloto técnico da Factory
   - diferencia dado ausente de falha confirmada
   - orienta próximo arquivo quando faltar contexto
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

    const action = normalizeAction(body.action);
    const payload = body.payload ?? null;
    const prompt = String(body.prompt || "").trim();
    const history = normalizeHistory(body.history);
    const attachments = normalizeAttachments(body.attachments);
    const source = String(body.source || "factory-ai").trim();
    const version = String(body.version || "").trim();

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

    return json({
      ok: true,
      action,
      source,
      version,
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

  if (raw === "factory_diagnosis") return "factory_diagnosis";
  if (raw === "analyze-architecture") return "analyze-architecture";
  if (raw === "analyze-logs") return "analyze-logs";
  if (raw === "review-module") return "review-module";
  if (raw === "suggest-improvement") return "suggest-improvement";
  if (raw === "summarize-structure") return "summarize-structure";
  if (raw === "propose-patch") return "propose-patch";
  if (raw === "generate-code") return "generate-code";

  // compatibilidade entre versões do front
  if (raw === "ingest-context") return "ingest-context";
  if (raw === "zip-readiness") return "ingest-context";

  if (raw === "chat") return "chat";

  return raw;
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
    "Sobre anexos:",
    "- Trate anexos apenas como metadados/contexto descrito, não como conteúdo binário já lido.",
    "- Não finja que abriu ZIP, PDF, imagem, áudio ou vídeo se só houver descrição/metadados.",
    "",
    "Sobre a função atual da Factory AI:",
    "- A Factory AI deve primeiro ajudar a estruturar a própria Factory.",
    "- Depois ela poderá apoiar criação de módulos, agentes e fluxos de app building.",
    "- Sempre respeite fluxo supervisionado e seguro.",
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
    "- se o pedido exigir arquivo específico que não foi enviado, diga qual arquivo é o próximo mais útil.",
    "- se houver risco de inferência excessiva, explicite esse limite sem enrolar."
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

function buildTaskText(action) {
  if (action === "factory_diagnosis") {
    return "Analise o snapshot/relatório da RControl Factory e aponte somente fatos confirmados, dados ausentes, inferências prováveis e próximo passo mínimo.";
  }

  if (action === "analyze-architecture") {
    return "Analise a arquitetura atual da RControl Factory usando somente o contexto enviado, evitando confundir snapshot parcial com falha confirmada.";
  }

  if (action === "analyze-logs") {
    return "Analise logs recentes da RControl Factory em conjunto com o snapshot enviado, separando fato confirmado de hipótese.";
  }

  if (action === "review-module") {
    return "Revise o módulo informado usando somente os dados enviados e diga o próximo arquivo mais útil se o contexto ainda estiver incompleto.";
  }

  if (action === "suggest-improvement") {
    return "Sugira a próxima melhoria mais segura com base apenas no snapshot enviado, priorizando a evolução da própria Factory AI.";
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
    return "Responda como o chat técnico oficial da Factory, de forma natural, objetiva e útil, ajudando a estruturar a própria Factory primeiro.";
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
