// IA Builder (fora do Admin) — cria apps e estrutura projetos
// Ela NÃO mexe no core. Só gera sugestões e aplica quando você clicar.

(function () {
  "use strict";

  function sanitizeId(raw) {
    return (raw || "")
      .trim().toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/--+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function suggest(inputRaw, ctx) {
    const input = String(inputRaw || "").trim();
    const low = input.toLowerCase();

    if (!input) {
      return { text: "Digite um comando. Ex: criar app RQuotas | listar apps | selecionar rquotas", suggestion: null };
    }

    if (low === "help") {
      return {
        text:
`Agente (Criador de Apps) — comandos:
- help
- listar apps
- criar app <Nome>
- selecionar <id>

Obs: o Agente cria apps e estrutura projetos. Admin AI cuida do core.`,
        suggestion: null
      };
    }

    if (low === "listar apps") {
      const list = (ctx.apps || []).map(a => `- ${a.name} (${a.id})`).join("\n") || "(vazio)";
      return { text: list, suggestion: null };
    }

    if (low.startsWith("criar app ")) {
      const name = input.slice("criar app ".length).trim();
      const id = sanitizeId(name);
      if (!name || !id) return { text: "Nome inválido. Ex: criar app RQuotas", suggestion: null };
      if ((ctx.apps || []).some(a => a.id === id)) return { text: `Já existe app com id ${id}.`, suggestion: null };

      return {
        text: `Sugestão pronta: criar app "${name}" (id: "${id}") com template PWA base.\nToque em "Aplicar sugestão".`,
        suggestion: { type: "createApp", payload: { name, id, type: "pwa", templateId: "pwa-base" } }
      };
    }

    if (low.startsWith("selecionar ")) {
      const id = sanitizeId(input.slice("selecionar ".length));
      if (!id) return { text: "Faltou o id. Ex: selecionar rquotas", suggestion: null };
      if (!(ctx.apps || []).some(a => a.id === id)) return { text: `Não achei esse id: ${id}`, suggestion: null };

      return {
        text: `Sugestão pronta: selecionar app ativo "${id}".\nToque em "Aplicar sugestão".`,
        suggestion: { type: "selectApp", payload: { id } }
      };
    }

    return { text: "Não entendi. Digite: help", suggestion: null };
  }

  window.RCF = window.RCF || {};
  window.RCF.builderAI = { suggest };
})();
