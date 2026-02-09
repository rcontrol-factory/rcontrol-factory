// app/js/ai.js
export async function callOpenAI({ apiKey, model, prompt }) {
  if (!apiKey) throw new Error("API Key vazia");
  if (!model) throw new Error("Model vazio");
  if (!prompt) throw new Error("Prompt vazio");

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: prompt,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || JSON.stringify(data);
    throw new Error(msg);
  }

  // Resposta em texto (tenta pegar do jeito mais compatível)
  // Muitos responses vêm com output_text pronto
  if (data.output_text) return data.output_text;

  // fallback: tenta achar texto dentro do output
  try {
    const out = data.output?.[0]?.content?.[0]?.text;
    if (out) return out;
  } catch (e) {}

  return JSON.stringify(data, null, 2);
}
