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

    const input = buildGroundedPrompt({ action, payload, prompt });

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

function buildGroundedPrompt({ action, payload, prompt }) {
  const system = [
    "Você é o Admin AI da RControl Factory.",
    "Sua função é analisar a própria Factory com base EXCLUSIVAMENTE no payload recebido.",
    "NÃO invente estados, módulos, falhas, versões ou inconsistências que não estejam explícitas no payload.",
    "Se um dado estiver ausente, diga 'dado ausente' em vez de supor um valor.",
    "Se algo parecer contraditório, descreva como 'possível inconsistência do snapshot', não como fato confirmado.",
    "NÃO peça para recriar a Factory do zero.",
    "NÃO sugira mexer em boot, MAE, Injector SAFE, Vault ou Bridge sem evidência clara no payload.",
    "NÃO trate módulo como inativo se o payload só estiver incompleto.",
    "Priorize patch mínimo, estabilidade, segurança e evolução em camadas.",
    "Responda sempre em português.",
    "",
    "Formato obrigatório da resposta:",
    "1. Fatos confirmados pelo snapshot",
    "2. Dados ausentes ou mal consolidados",
    "3. Inferências prováveis (deixe claro que são inferências)",
    "4. Próximo passo mínimo recomendado",
    "5. Arquivos mais prováveis de ajuste",
    "",
    "Se action=propose-patch, acrescente:",
    "6. Patch mínimo sugerido",
    "",
    "Se action=generate-code, acrescente:",
    "6. Arquivo alvo",
    "7. Código sugerido",
    "",
    "Nunca afirme como fato algo que não esteja no payload."
  ].join("\n");

  const task = buildTaskText(action);

  return [
    system,
    "",
    "Ação:",
    action,
    "",
    "Tarefa:",
    task,
    "",
    "Prompt adicional do usuário:",
    prompt || "(nenhum)",
    "",
    "Payload recebido:",
    stringify(payload)
  ].join("\n");
}

function buildTaskText(action) {
  if (action === "factory_diagnosis") {
    return "Analise este snapshot/relatório da RControl Factory e aponte somente fatos confirmados, dados ausentes e próximo passo mínimo.";
  }
  if (action === "analyze-architecture") {
    return "Analise a arquitetura atual da RControl Factory usando somente o snapshot enviado.";
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
    return "Proponha um patch mínimo e seguro com base apenas no snapshot enviado.";
  }
  if (action === "generate-code") {
    return "Gere código com patch mínimo com base apenas no snapshot enviado.";
  }
  return "Analise a RControl Factory com base apenas no snapshot enviado.";
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
