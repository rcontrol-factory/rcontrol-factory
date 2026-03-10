export async function onRequestPost(context) {

  const { request, env } = context;

  const body = await request.json();
  const { action, payload } = body;

  if (!env.OPENAI_API_KEY) {
    return new Response(JSON.stringify({
      error: "OpenAI key not configured"
    }), { status: 500 });
  }

  const prompt = `
You are Admin AI of RControl Factory.

Action: ${action}

Payload:
${JSON.stringify(payload)}

Analyze the RControl Factory structure and return suggestions only.
Do not execute changes.
`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are Admin AI for RControl Factory." },
        { role: "user", content: prompt }
      ]
    })
  });

  const data = await response.json();

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" }
  });

}
