/* /app/js/agent.router.js
 * RControl Factory — Agent Router (offline, sem LLM)
 * WRITE MODE:
 *  - comando: write            -> entra em captura
 *  - comando: write <path>      -> captura e já define arquivo alvo
 *  - termina com: /end          -> gera FILE_WRITE (patch) ou aplica se AUTO on e SAFE off
 *  - /cancel                    -> cancela captura
 *
 * Pensado para iPhone Safari:
 *  - não truncar texto
 *  - persistir rascunho no localStorage
 */

(function () {
  const DRAFT_KEY = "RCF_AGENT_WRITE_DRAFT_V1";

  function nowISO() {
    try { return new Date().toISOString(); } catch { return "" + Date.now(); }
  }

  function ok(result, extra) {
    return Object.assign({ ok: true, result: result || "" }, extra || {});
  }
  function fail(error, extra) {
    return Object.assign({ ok: false, error: error || "Erro." }, extra || {});
  }

  function safeTrim(s) {
    return String(s ?? "").replace(/\r\n/g, "\n").trim();
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      return obj;
    } catch {
      return null;
    }
  }

  function saveDraft(obj) {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(obj));
      return true;
    } catch {
      return false;
    }
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  }

  // Patch op padrão que a Factory pode entender (mesmo que você adapte depois)
  function makeFileWritePatch(path, content, mode) {
    return {
      type: "FILE_WRITE",
      path,
      mode: mode || "replace", // replace | append
      content,
      bytes: (content || "").length,
      ts: nowISO(),
    };
  }

  /**
   * ctx esperado (simples):
   * {
   *   getCurrentFilePath(): string   // ex: "app.js" ou "/app/js/..."
   *   getFlags(): { auto:boolean, safe:boolean } // auto=aplica direto, safe=sempre pede
   *   queuePatch(patch): void        // coloca patch pendente
   *   applyPatch(patch): Promise|void // aplica de fato (se existir)
   *   log(msg): void
   * }
   */

  function createRouter(ctx) {
    const state = {
      mode: "NORMAL", // NORMAL | WRITE
      write: {
        targetPath: "",
        buffer: [],     // array de strings
        bytes: 0,
        startedAt: "",
      },
    };

    // restaura draft se existir
    const draft = loadDraft();
    if (draft && draft.mode === "WRITE" && draft.write && Array.isArray(draft.write.buffer)) {
      state.mode = "WRITE";
      state.write.targetPath = draft.write.targetPath || "";
      state.write.buffer = draft.write.buffer || [];
      state.write.bytes = draft.write.bytes || 0;
      state.write.startedAt = draft.write.startedAt || nowISO();
    }

    function persist() {
      saveDraft({
        mode: state.mode,
        write: {
          targetPath: state.write.targetPath,
          buffer: state.write.buffer,
          bytes: state.write.bytes,
          startedAt: state.write.startedAt,
        }
      });
    }

    function enterWriteMode(targetPath) {
      state.mode = "WRITE";
      state.write.targetPath = targetPath || "";
      state.write.buffer = [];
      state.write.bytes = 0;
      state.write.startedAt = nowISO();
      persist();

      const tip =
        "WRITE MODE ATIVO ✅\n" +
        "Cole seu texto/código (pode ser grande).\n" +
        "Finalize com: /end\n" +
        "Cancelar: /cancel\n" +
        (state.write.targetPath ? `Arquivo alvo: ${state.write.targetPath}` : "Arquivo alvo: (não definido ainda)");
      return ok(tip, { mode: "WRITE", targetPath: state.write.targetPath });
    }

    function cancelWriteMode() {
      state.mode = "NORMAL";
      state.write.targetPath = "";
      state.write.buffer = [];
      state.write.bytes = 0;
      state.write.startedAt = "";
      clearDraft();
      return ok("WRITE MODE cancelado.");
    }

    function ensureTargetPath() {
      let p = state.write.targetPath;
      if (!p) {
        if (ctx && typeof ctx.getCurrentFilePath === "function") {
          p = ctx.getCurrentFilePath() || "";
        }
      }
      return p;
    }

    function appendToBuffer(text) {
      // IMPORTANT: não truncar, não fazer split esquisito; só normalizar \r\n
      const chunk = String(text ?? "").replace(/\r\n/g, "\n");
      state.write.buffer.push(chunk);
      state.write.bytes += chunk.length;
      persist();
      return ok(`Capturando... (${state.write.bytes} chars) /end para finalizar.`, {
        mode: "WRITE",
        bytes: state.write.bytes
      });
    }

    async function endWriteMode() {
      const targetPath = ensureTargetPath();
      if (!targetPath) {
        return fail("Sem arquivo alvo. Use: write <caminho>  (ex: write app.js) ou selecione um arquivo no Editor antes.");
      }

      const content = state.write.buffer.join("\n");
      const patch = makeFileWritePatch(targetPath, content, "replace");

      // limpa estado antes de aplicar/queue, pra não perder se der refresh
      cancelWriteMode();

      const flags = (ctx && typeof ctx.getFlags === "function") ? (ctx.getFlags() || {}) : {};
      const auto = !!flags.auto;
      const safe = !!flags.safe;

      // SAFE = sempre pede patch pendente
      if (safe || !auto) {
        if (ctx && typeof ctx.queuePatch === "function") ctx.queuePatch(patch);
        if (ctx && typeof ctx.log === "function") ctx.log(`PATCH pendente: FILE_WRITE ${targetPath} (${patch.bytes} chars)`);
        return ok(`Patch pendente criado ✅\nFILE_WRITE → ${targetPath}\nTamanho: ${patch.bytes} chars\nAgora clique em "Aplicar/Approve".`, {
          patchPending: true,
          patch
        });
      }

      // AUTO ligado e SAFE desligado → tenta aplicar direto
      if (ctx && typeof ctx.applyPatch === "function") {
        try {
          const out = await ctx.applyPatch(patch);
          if (ctx && typeof ctx.log === "function") ctx.log(`PATCH aplicado (AUTO): FILE_WRITE ${targetPath}`);
          return ok(`Aplicado automaticamente ✅\nFILE_WRITE → ${targetPath}\nTamanho: ${patch.bytes} chars`, { patchApplied: true, patch, out });
        } catch (e) {
          // se falhar aplicar, cai para pendente
          if (ctx && typeof ctx.queuePatch === "function") ctx.queuePatch(patch);
          return ok(`AUTO falhou ao aplicar, deixei como pendente ✅\nFILE_WRITE → ${targetPath}\nErro: ${String(e?.message || e)}`, {
            patchPending: true,
            patch
          });
        }
      }

      // sem applyPatch disponível → pendente
      if (ctx && typeof ctx.queuePatch === "function") ctx.queuePatch(patch);
      return ok(`Não achei applyPatch no runtime, deixei pendente ✅\nFILE_WRITE → ${targetPath}`, {
        patchPending: true,
        patch
      });
    }

    // Entrada principal
    async function handleInput(rawInput) {
      const input = String(rawInput ?? "");
      const trimmed = safeTrim(input);

      // WRITE MODE: tudo vira texto, exceto /end e /cancel
      if (state.mode === "WRITE") {
        if (trimmed === "/cancel") return cancelWriteMode();
        if (trimmed === "/end") return await endWriteMode();

        // Permite trocar alvo no meio: "/file app.js"
        if (trimmed.startsWith("/file ")) {
          const newPath = safeTrim(trimmed.slice(6));
          if (!newPath) return fail("Use: /file <caminho>");
          state.write.targetPath = newPath;
          persist();
          return ok(`Arquivo alvo atualizado ✅ ${newPath}`, { mode: "WRITE", targetPath: newPath });
        }

        // Caso colou grande: só adiciona como chunk
        return appendToBuffer(input);
      }

      // NORMAL MODE
      if (!trimmed) return fail("Digite um comando.");

      // write [path]
      if (trimmed === "write" || trimmed.startsWith("write ")) {
        const maybePath = safeTrim(trimmed.slice(5));
        return enterWriteMode(maybePath);
      }

      // comando rápido para inserir texto via UI (botão)
      // Ex: router.pasteIntoCurrentFile("...texto...")
      return ok("Comando não reconhecido. Dica: use write para colar texto grande ou /end para finalizar.");
    }

    // API extra para botão (sem depender de comando digitado)
    async function pasteIntoCurrentFile(text) {
      // entra write mode usando current file e já cola e encerra com patch pendente/auto
      const p = (ctx && typeof ctx.getCurrentFilePath === "function") ? (ctx.getCurrentFilePath() || "") : "";
      enterWriteMode(p);
      appendToBuffer(text);
      return await endWriteMode();
    }

    function getState() {
      return JSON.parse(JSON.stringify({
        mode: state.mode,
        write: {
          targetPath: state.write.targetPath,
          bytes: state.write.bytes,
          startedAt: state.write.startedAt
        }
      }));
    }

    return { handleInput, pasteIntoCurrentFile, getState };
  }

  // export global
  try {
    if (typeof window !== "undefined") {
      window.RCF_AgentRouter = { createRouter };
    }
  } catch {}
})();
