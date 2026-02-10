// NLP offline simples (sem LLM)
export function parseIntent(input, context = {}) {
  const text = input.trim();
  const lower = text.toLowerCase();

  // comandos diretos
  if (/^help$/.test(lower)) return { action: "help" };
  if (/^list$/.test(lower)) return { action: "list" };

  // create
  let m = lower.match(/^(create|criar|cria)\s+(.*)$/);
  if (m) {
    return { action: "create", name: m[2].trim() };
  }

  // texto solto → pode ser slug ou nome
  return { action: "guess", value: text };
}

// slugify simples e seguro
export function slugify(str) {
  return str
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
