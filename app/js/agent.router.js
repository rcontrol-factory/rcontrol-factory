import { parseIntent, slugify } from "./agent.nlp.js";
import * as Commands from "../../core/commands.js";

export async function routeAgentCommand(input, state) {
  if (!input || !input.trim()) {
    return { error: "Digite um comando." };
  }

  const intent = parseIntent(input, state);

  switch (intent.action) {
    case "help":
      return Commands.help();

    case "list":
      return Commands.list();

    case "create": {
      const name = intent.name;
      const slug = slugify(name);

      if (!slug) {
        return { error: "Nome inválido para criar app." };
      }

      return Commands.create(name, slug);
    }

    case "guess": {
      const value = intent.value;
      const slug = slugify(value);

      // se slug existir → auto-select
      if (state.apps && state.apps.includes(slug)) {
        return Commands.select(slug);
      }

      // se parece nome → sugerir create
      return {
        info: `Entendi "${value}". Quer criar um app com esse nome?`,
        suggestion: `create ${value}`
      };
    }

    default:
      return { error: "Comando não reconhecido." };
  }
}
