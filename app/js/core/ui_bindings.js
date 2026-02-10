async function onAgentExecute() {
  const inputEl = document.querySelector("#agentInput"); // ajuste o seletor se for outro
  const outEl   = document.querySelector("#agentOut");   // ajuste o seletor se for outro
  const text = (inputEl?.value || "").trim();

  try {
    // ✅ NOVO: usa core/commands.js novo se existir
    if (window.RCF_COMMANDS && typeof window.RCF_COMMANDS.run === "function") {
      const res = await window.RCF_COMMANDS.run(text, window.RCF_CTX || {});
      if (outEl) outEl.textContent = res?.message || JSON.stringify(res, null, 2);
      return;
    }

    // fallback: mantém o antigo
    if (typeof window.runAgentCommand === "function") {
      const resOld = await window.runAgentCommand(text);
      if (outEl) outEl.textContent = String(resOld || "");
      return;
    }

    if (outEl) outEl.textContent = "Nenhum runner disponível (RCF_COMMANDS/runAgentCommand).";
  } catch (e) {
    if (outEl) outEl.textContent = "Erro: " + (e?.message || String(e));
  }
}
