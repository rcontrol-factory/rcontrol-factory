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

    const action = String(body.action || "").trim();
    const payload = body.payload ?? null;
    const prompt = String(body.prompt || "").trim();

    const allowed = new Set([
      "factory_diagnosis",
      "analyze-architecture",
      "analyze-logs",
      "review-module",
      "suggest-improvement",
      "summarize-structure",
      "propose-patch",
      "generate-code"
    ]);

    if (!allowed.has(action)) {
      return json({
        ok: false,
        error: "Ação não permitida nesta fase.",
        action
      }, 400);
    }

    const input = buildPlainTextPrompt({ action, payload, prompt });

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
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

function buildPlainTextPrompt({ action, payload, prompt }) {
  const header = [
    "Você é o Admin AI da RControl Factory.",
    "Sua função nesta fase é analisar, sugerir e estruturar a própria Factory.",
    "Não recrie a plataforma do zero.",
    "Preserve boot, MAE, Injector SAFE, Vault, Bridge e partes estáveis.",
    "Priorize patch mínimo, estabilidade, segurança e evolução em camadas.",
    "Responda sempre em português.",
    "",
    "Formato preferido:",
    "1. Diagnóstico",
    "2. Riscos",
    "3. Sugestão",
    "4. Próximo passo",
    ""
  ].join("\n");

  let task = "";

  if (action === "factory_diagnosis") {
    task = "Analise este relatório do Doctor da RControl Factory.";
  } else if (action === "analyze-architecture") {
    task = "Analise a arquitetura atual da RControl Factory.";
  } else if (action === "analyze-logs") {
    task = "Analise os logs da RControl Factory e identifique riscos estruturais, erros ou instabilidades.";
  } else if (action === "review-module") {
    task = "Revise este módulo da RControl Factory.";
  } else if (action === "suggest-improvement") {
    task = "Sugira a próxima melhoria mais segura para a RControl Factory.";
  } else if (action === "summarize-structure") {
    task = "Resuma a estrutura atual da RControl Factory e diga o próximo passo mais seguro.";
  } else if (action === "propose-patch") {
    task = "Proponha um patch mínimo e seguro para a RControl Factory.";
  } else if (action === "generate-code") {
    task = "Gere código com patch mínimo para a RControl Factory.";
  } else {
    task = "Analise a RControl Factory.";
  }

  return [
    header,
    "Ação:",
    action,
    "",
    "Tarefa:",
    task,
    "",
    "Prompt adicional:",
    prompt || "(nenhum)",
    "",
    "Contexto/Payload:",
    stringify(payload)
  ].join("\n");
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
