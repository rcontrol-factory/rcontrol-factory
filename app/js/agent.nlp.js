// NLP offline simples (sem LLM) — v1.1 (scanner intents)
// - Mantém: help, list, create, guess
// - Novo: find, findre, scan, where, open
export function parseIntent(input, context = {}) {
  const text = String(input || "").trim();
  const lower = text.toLowerCase();

  // comandos diretos
  if (/^help$/.test(lower)) return { action: "help" };
  if (/^list$/.test(lower)) return { action: "list" };

  // create
  let m = lower.match(/^(create|criar|cria)\s+(.*)$/);
  if (m) {
    return { action: "create", name: m[2].trim() };
  }

  // -----------------------------
  // Scanner / Search (novos)
  // -----------------------------

  // scan (varredura padrão)
  // ex: "scan" | "scan fast" | "scan deep"
  m = lower.match(/^scan(?:\s+(fast|deep))?$/);
  if (m) {
    return { action: "scan", mode: (m[1] || "fast") };
  }

  // find (busca texto)
  // ex: "find scan.tar" | "find 'bundle local vazio'"
  m = text.match(/^(find|buscar|procura|procurar)\s+(.+)$/i);
  if (m) {
    const q = (m[2] || "").trim();
    return { action: "find", query: q };
  }

  // findre (busca regex)
  // ex: "findre /scan\.tar/i"
  m = text.match(/^(findre|regex|re)\s+(.+)$/i);
  if (m) {
    const raw = (m[2] || "").trim();
    return { action: "findre", raw };
  }

  // where (atalho pra procurar por id/erro)
  // ex: "where scan.tar" | "where ERR: gh pull"
  m = text.match(/^(where|onde)\s+(.+)$/i);
  if (m) {
    const q = (m[2] || "").trim();
    return { action: "where", query: q };
  }

  // open resultado N (router resolve com base no último search result)
  // ex: "open 2"
  m = lower.match(/^open\s+(\d+)$/);
  if (m) {
    return { action: "open", index: Number(m[1]) };
  }

  // texto solto → pode ser slug ou nome
  return { action: "guess", value: text };
}

// slugify simples e seguro
export function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
