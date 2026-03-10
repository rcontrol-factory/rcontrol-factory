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
      return json(
        {
          ok: false,
          error: "OPENAI_API_KEY ausente no ambiente."
        },
        500
      );
    }

    const body = await safeJson(request);
    if (!body || typeof body !== "object") {
      return json(
        {
          ok: false,
          error: "JSON inválido."
        },
        400
      );
    }

    const action = String(body.action || "").trim();
    const payload = body.payload ?? null;
    const prompt = String(body.prompt || "").trim();

    const allowed = new Set([
      "factory_diagnosis",
      "analyze-architecture",
      "review-module",
      "suggest-improvement",
      "summarize-structure",
      "analyze-logs"
    ]);

    if (!allowed.has(action)) {
      return json(
        {
          ok: false,
          error: "Ação não permitida nesta fase.",
          action
        },
        400
      );
    }

    const model = "gpt-4.1-mini";
    const input = buildInput({ action, payload, prompt });

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        input
      })
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return json(
        {
          ok: false,
          error: "Falha ao chamar OpenAI.",
          status: upstream.status,
          details: data
        },
        502
      );
    }

    const text = extractText(data);

    return json({
      ok: true,
      action,
      analysis: text,
      raw: data
    });
  } catch (err) {
    return json(
      {
        ok: false,
        error: String(err?.message || err || "Erro interno.")
      },
      500
    );
  }
}

function buildInput({ action, payload, prompt }) {
  const system = [
    "Você é o Admin AI da RControl Factory.",
    "Sua função nesta fase é analisar e sugerir melhorias para a própria Factory.",
    "Não execute mudanças. Não aplique patch. Apenas analise, sugira e organize.",
    "Priorize estabilidade, patch mínimo, segurança e preservação do boot atual.",
    "Responda de forma objetiva em português.",
    "Formato desejado:",
    "1. Diagnóstico",
    "2. Riscos",
    "3. Sugestão",
    "4. Próximo passo"
  ].join("\n");

  let user = "";

  if (action === "factory_diagnosis") {
    user = [
      "Ação: factory_diagnosis",
      "Analise este relatório do Doctor da RControl Factory e sugira melhorias estruturais.",
      "",
      "Doctor Report:",
      stringify(payload)
    ].join("\n");
  } else if (action === "analyze-architecture") {
    user = [
      "Ação: analyze-architecture",
      "Analise a arquitetura atual da RControl Factory.",
      "",
      "Contexto:",
      stringify(payload || prompt)
    ].join("\n");
  } else if (action === "review-module") {
    user = [
      "Ação: review-module",
      "Revise este módulo da RControl Factory.",
      "",
      "Conteúdo:",
      stringify(payload || prompt)
    ].join("\n");
  } else if (action === "suggest-improvement") {
    user = [
      "Ação: suggest-improvement",
      "Sugira a próxima melhoria mais segura e útil para a RControl Factory.",
      "",
      "Contexto:",
      stringify(payload || prompt)
    ].join("\n");
  } else if (action === "summarize-structure") {
    user = [
      "Ação: summarize-structure",
      "Resuma a estrutura atual da RControl Factory.",
      "",
      "Contexto:",
      stringify(payload || prompt)
    ].join("\n");
  } else if (action === "analyze-logs") {
    user = [
      "Ação: analyze-logs",
      "Analise estes logs da RControl Factory.",
      "",
      "Logs:",
      stringify(payload || prompt)
    ].join("\n");
  }

  return [
    {
      role: "system",
      content: system
    },
    {
      role: "user",
      content: user
    }
  ];
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
