/* core/ui_bindings.js
   RControl Factory - UI bindings (iOS Safari first)
   Objetivo: garantir que os botões realmente chamem o runner novo (RCF_COMMANDS.run)
   e manter fallback no runner antigo se existir.
*/
(function () {
  "use strict";

  // ---------- helpers ----------
  function $(sel) {
    try { return document.querySelector(sel); } catch { return null; }
  }

  function byIdAny(ids) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  }

  function setText(el, text) {
    if (!el) return;
    el.textContent = String(text ?? "");
  }

  function safeJson(x) {
    try { return JSON.stringify(x, null, 2); } catch { return String(x); }
  }

  // iOS Safari: às vezes click falha se tiver overlay / scroll; adicionamos touchend também
  function bindTap(el, fn) {
    if (!el || typeof fn !== "function") return;
    el.addEventListener("click", fn, { passive: true });
    el.addEventListener("touchend", function (e) {
      // evita duplo disparo (touch + click) quando necessário
      // não vamos bloquear geral; só se o elemento estiver "tocável"
      try { e.preventDefault(); } catch {}
      fn(e);
    }, { passive: false });
  }

  function log(msg) {
    // se tiver logger, usa; senão console
    try {
      if (window.RCF_LOG && typeof window.RCF_LOG.info === "function") window.RCF_LOG.info(msg);
      else console.log("[UI]", msg);
    } catch {}
  }

  // ---------- Agent runner glue ----------
  async function runAgentCommand(text) {
    const ctx = window.RCF_CTX || {}; // se você tiver contexto global, usa

    // ✅ prioridade: novo core
    if (window.RCF_COMMANDS && typeof window.RCF_COMMANDS.run === "function") {
      return await window.RCF_COMMANDS.run(text, ctx);
    }

    // fallback 1: runner antigo global
    if (typeof window.runAgentCommand === "function") {
      const r = await window.runAgentCommand(text);
      return { ok: true, message: String(r ?? "") };
    }

    // fallback 2: alguma função antiga
    if (typeof window.agentExec === "function") {
      const r = await window.agentExec(text);
      return { ok: true, message: String(r ?? "") };
    }

    return { ok: false, message: "Nenhum runner encontrado (RCF_COMMANDS.run / runAgentCommand / agentExec)." };
  }

  // ---------- Bindings ----------
  function bindAgentUI() {
    // Tentamos achar input e output por vários IDs comuns.
    const input = byIdAny(["agentInput", "agentCmd", "cmdInput", "agentText", "txtAgent", "agentBox"]);
    const out = byIdAny(["agentOut", "agentResult", "resultOut", "outAgent", "cmdOut", "preAgent"]);

    const btnExec = byIdAny(["btnAgentExec", "btnExecAgent", "agentExec", "btnRunAgent", "btnRun"]);
    const btnClear = byIdAny(["btnAgentClear", "btnClearAgent", "agentClear", "btnLimpar"]);
    const btnApprove = byIdAny(["btnAgentApprove", "btnApproveAgent", "agentApprove", "btnAprovar"]);

    // Se não achar pelo id, tenta pelo texto (último recurso)
    function findButtonByText(txt) {
      const btns = Array.from(document.querySelectorAll("button"));
      const t = (txt || "").toLowerCase();
      return btns.find(b => (b.textContent || "").trim().toLowerCase() === t) || null;
    }

    const execBtn = btnExec || findButtonByText("executar");
    const clearBtn = btnClear || findButtonByText("limpar");
    const approveBtn = btnApprove || findButtonByText("aprovar sugestão") || findButtonByText("aplicar sugestão");

    bindTap(execBtn, async function () {
      const text = (input?.value || "").trim();
      if (!text) {
        setText(out, "Digite um comando.");
        return;
      }
      setText(out, "Executando...");
      try {
        const res = await runAgentCommand(text);
        // res pode vir como {ok,message} ou qualquer coisa
        if (res && typeof res === "object" && "message" in res) {
          setText(out, res.message);
        } else {
          setText(out, safeJson(res));
        }
      } catch (e) {
        setText(out, "Erro: " + (e?.message || String(e)));
      }
    });

    bindTap(clearBtn, function () {
      if (input) input.value = "";
      setText(out, "");
    });

    // Aprovar: se existir um sistema de patch pendente, tentamos aplicar
    bindTap(approveBtn, async function () {
      try {
        // novo: patchset/apply se existir
        if (window.RCF_PATCH && typeof window.RCF_PATCH.applyPending === "function") {
          const r = await window.RCF_PATCH.applyPending();
          setText(out, r?.message || "Patch aplicado.");
          return;
        }
        // antigo: apply command
        const r2 = await runAgentCommand("apply");
        setText(out, r2?.message || "apply executado.");
      } catch (e) {
        setText(out, "Erro ao aplicar: " + (e?.message || String(e)));
      }
    });

    // Enter para executar (bom no iPhone)
    if (input) {
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          // não quebra multiline; se for textarea e o usuário quiser nova linha, ele usa shift+enter
          if (e.shiftKey) return;
          e.preventDefault();
          execBtn?.click?.();
        }
      });
    }

    log("Agent UI bound");
  }

  function bindDockUI() {
    // dock buttons: <button class="dockbtn" data-view="agente|admin|diag|logs">
    const dock = byIdAny(["dock", "dockBar"]);
    if (!dock) return;

    dock.addEventListener("click", function (e) {
      const btn = e.target?.closest?.("button[data-view]");
      if (!btn) return;
      const view = btn.getAttribute("data-view");
      // se existir um roteador de views, chama
      if (window.RCF_VIEWS && typeof window.RCF_VIEWS.open === "function") {
        window.RCF_VIEWS.open(view);
        return;
      }
      // fallback: tenta clicar na aba correspondente (top tabs)
      const map = {
        agente: "Agente",
        agent: "Agente",
        admin: "Admin",
        diag: "Diag",
        logs: "Logs",
        settings: "Settings",
      };
      const label = map[view] || view;
      const candidates = Array.from(document.querySelectorAll("button, a"));
      const target = candidates.find(x => (x.textContent || "").trim().toLowerCase() === String(label).toLowerCase());
      target?.click?.();
    }, { passive: true });

    log("Dock UI bound");
  }

  function bindToolsUI() {
    // tools drawer (se existir)
    const btnClearLogs = byIdAny(["btnClearLogs", "clearLogs"]);
    const btnCopyLogs = byIdAny(["btnCopyLogs", "copyLogs"]);
    const logsBox = byIdAny(["logsBox", "logBox", "preLogs"]);

    bindTap(btnClearLogs, function () {
      setText(logsBox, "");
      if (window.RCF_LOG && typeof window.RCF_LOG.clear === "function") window.RCF_LOG.clear();
    });

    bindTap(btnCopyLogs, async function () {
      const txt = (logsBox?.textContent || "").trim();
      if (!txt) return;
      try {
        await navigator.clipboard.writeText(txt);
        log("Logs copiados");
      } catch (e) {
        // fallback iOS: seleciona texto
        try {
          const range = document.createRange();
          range.selectNodeContents(logsBox);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          log("Selecionei logs (clipboard bloqueado)");
        } catch {}
      }
    });

    log("Tools UI bound");
  }

  // ---------- Public init ----------
  function init() {
    try { bindAgentUI(); } catch (e) { console.error("bindAgentUI fail", e); }
    try { bindDockUI(); } catch (e) { console.error("bindDockUI fail", e); }
    try { bindToolsUI(); } catch (e) { console.error("bindToolsUI fail", e); }
  }

  // expõe para app.js se quiser chamar manualmente
  window.RCF_UI = window.RCF_UI || {};
  window.RCF_UI.init = init;

  // auto-init quando DOM estiver pronto
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
