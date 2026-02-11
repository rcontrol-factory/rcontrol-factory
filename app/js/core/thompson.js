/* =========================================================
  RControl Factory — js/core/thompson.js — v1.1
  THOMPSON = "cérebro" (prompt -> patch)
  - SAFE por padrão: gera patch, NÃO aplica.
  - LIVRE: pode aplicar via MAE.applyBundle() (se existir).
  - Integra com UI do Agent (#agentCmd/#btnAgentRun/#agentOut)
  - Logs no padrão RCF
========================================================= */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---------- logger ----------
  function log(msg) {
    try {
      if (window.RCF_LOGGER && typeof window.RCF_LOGGER.push === "function") {
        window.RCF_LOGGER.push("log", msg);
        return;
      }
    } catch {}
    try { console.log("[THOMPSON]", msg); } catch {}
  }

  function write(id, text) {
    const el = $(id);
    if (el) el.textContent = String(text ?? "");
  }

  function status(text) {
    const el = $("statusText");
    if (el) el.textContent = String(text ?? "");
  }

  // ---------- cfg (SAFE/LIVRE) ----------
  const CFG_KEY = "rcf:cfg";
  function readCfg() {
    try {
      const raw = localStorage.getItem(CFG_KEY);
      if (!raw) return { mode: "safe" };
      const cfg = JSON.parse(raw);
      return cfg && typeof cfg === "object" ? cfg : { mode: "safe" };
    } catch {
      return { mode: "safe" };
    }
  }

  function isLivre() {
    const cfg = readCfg();
    return String(cfg.mode || "").toLowerCase() === "livre";
  }

  // ---------- iOS safe tap ----------
  const TAP_GUARD_MS = 450;
  let _lastTapAt = 0;

  function bindTap(el, fn) {
    if (!el) return;

    const handler = (e) => {
      const now = Date.now();
      if (now - _lastTapAt < TAP_GUARD_MS) {
        try { e.preventDefault(); e.stopPropagation(); } catch {}
        return;
      }
      _lastTapAt = now;

      try { e.preventDefault(); e.stopPropagation(); } catch {}
      try { fn(e); } catch (err) {
        write("agentOut", "ERRO: " + (err?.message || String(err)));
      }
    };

    el.style.pointerEvents = "auto";
    el.style.touchAction = "manipulation";
    el.style.webkitTapHighlightColor = "transparent";

    el.addEventListener("touchend", handler, { passive: false, capture: true });
    el.addEventListener("click", handler, { passive: false, capture: true });
  }

  // ---------- patch format ----------
  // patch = { meta:{...}, files:{ "/path/file.js": "conteudo" }, notes:[...] }
  function makePatch(meta, files, notes) {
    return {
      meta: {
        name: meta?.name || "thompson-patch",
        version: meta?.version || "1.0",
        createdAt: new Date().toISOString()
      },
      files: files || {},
      notes: Array.isArray(notes) ? notes : []
    };
  }

  // ---------- simple prompt parsing ----------
  // suportado:
  // 1) "help"
  // 2) "status"
  // 3) "patch: { ...json... }"  (cola JSON)
  // 4) "make test" (gera um patch de teste)
  function parsePrompt(raw) {
    const text = String(raw || "").trim();
    if (!text) return { cmd: "empty" };

    if (text === "help") return { cmd: "help" };
    if (text === "status") return { cmd: "status" };

    if (text.toLowerCase().startsWith("patch:")) {
      const jsonPart = text.slice(6).trim();
      return { cmd: "patch_json", jsonPart };
    }

    if (text.toLowerCase().includes("make test")) {
      return { cmd: "make_test" };
    }

    // default: tratar como "task" (só descreve)
    return { cmd: "task", text };
  }

  // ---------- apply (via MAE) ----------
  function canApply() {
    // precisa estar em LIVRE e ter MAE com applyBundle
    if (!isLivre()) return false;
    return !!(window.MAE && typeof window.MAE.applyBundle === "function");
  }

  async function applyPatch(patch) {
    // aplica como "bundle" do formato da Mãe
    // bundle esperado: { meta, files }
    if (!canApply()) {
      return { ok: false, reason: "SAFE ou MAE.applyBundle indisponível" };
    }
    try {
      const res = await window.MAE.applyBundle({
        meta: patch.meta,
        files: patch.files
      }, { source: "thompson" });

      return { ok: true, res };
    } catch (e) {
      return { ok: false, reason: e?.message || String(e) };
    }
  }

  // ---------- engine ----------
  let lastPatch = null;

  function renderHelp() {
    return [
      "THOMPSON comandos:",
      "- help",
      "- status",
      "- make test",
      "- patch: {JSON}  (cole um patch pronto)",
      "",
      "Modo atual: " + (isLivre() ? "LIVRE ✅ (pode aplicar se MAE permitir)" : "SAFE ✅ (somente gerar patch)")
    ].join("\n");
  }

  function renderStatus() {
    return [
      "THOMPSON STATUS",
      "- modo: " + (isLivre() ? "LIVRE" : "SAFE"),
      "- mae.applyBundle: " + (window.MAE && typeof window.MAE.applyBundle === "function" ? "OK" : "não"),
      "- lastPatch: " + (lastPatch ? "sim" : "não")
    ].join("\n");
  }

  function buildTestPatch() {
    const files = {
      "/core/TESTE_THOMPSON.txt": "THOMPSON OK em {{DATE}}"
    };
    return makePatch({ name: "thompson-test", version: "1.0" }, files, [
      "Patch de teste gerado pelo Thompson."
    ]);
  }

  function tryParseJson(jsonPart) {
    try { return JSON.parse(jsonPart); } catch { return null; }
  }

  async function runPrompt(raw) {
    const p = parsePrompt(raw);

    if (p.cmd === "empty") {
      write("agentOut", "Digite um comando (help).");
      return;
    }

    if (p.cmd === "help") {
      write("agentOut", renderHelp());
      return;
    }

    if (p.cmd === "status") {
      write("agentOut", renderStatus());
      return;
    }

    if (p.cmd === "make_test") {
      lastPatch = buildTestPatch();

      const out = [
        "PATCH GERADO ✅",
        "name: " + lastPatch.meta.name,
        "version: " + lastPatch.meta.version,
        "files: " + Object.keys(lastPatch.files).length,
        "",
        "SAFE: não aplica sozinho.",
        "Se quiser aplicar: mude cfg.mode=livre e rode 'apply last' (vamos ligar isso já já)."
      ].join("\n");

      write("agentOut", out);
      return;
    }

    if (p.cmd === "patch_json") {
      const obj = tryParseJson(p.jsonPart);
      if (!obj || typeof obj !== "object") {
        write("agentOut", "JSON inválido no patch.");
        return;
      }

      // normaliza
      const meta = obj.meta || { name: "patch-colado", version: "1.0" };
      const files = obj.files || {};
      lastPatch = makePatch(meta, files, obj.notes || []);

      write("agentOut", [
        "PATCH CARREGADO ✅",
        "name: " + lastPatch.meta.name,
        "version: " + lastPatch.meta.version,
        "files: " + Object.keys(lastPatch.files).length,
        "",
        isLivre()
          ? "Modo LIVRE: pronto pra aplicar (se MAE permitir)."
          : "Modo SAFE: pronto, mas não aplica sozinho."
      ].join("\n"));

      return;
    }

    // cmd "task" (texto livre)
    lastPatch = makePatch(
      { name: "task-only", version: "1.0" },
      {},
      ["Prompt recebido (sem gerar patch automático):", p.text]
    );

    write("agentOut", [
      "Recebi seu pedido ✅",
      "Ainda não gerei patch automático pra isso.",
      "Cole 'help' pra ver comandos.",
      "",
      "Pedido:",
      p.text
    ].join("\n"));
  }

  // ---------- UI bindings ----------
  function initUI() {
    // log de startup
    log("THOMPSON v1.1 carregado ✅");
    status("OK ✅");

    // escreve no logsOut se existir
    try {
      const logsBox = $("logsBox");
      if (logsBox && typeof logsBox.textContent === "string" && logsBox.textContent.includes("Logs")) {
        // não mexe muito
      }
    } catch {}

    // integra com Agent tab
    const btnRun = $("btnAgentRun");
    const btnClear = $("btnAgentClear");
    const cmdInput = $("agentCmd");

    bindTap(btnRun, async () => {
      const raw = cmdInput ? cmdInput.value : "";
      await runPrompt(raw);
    });

    bindTap(btnClear, () => {
      if (cmdInput) cmdInput.value = "";
      write("agentOut", "Pronto.");
    });

    // atalho: Enter no input
    if (cmdInput) {
      cmdInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          try { btnRun && btnRun.click(); } catch {}
        }
      });
    }
  }

  // ---------- expose API ----------
  window.THOMPSON = {
    version: "1.1",
    run: runPrompt,
    getLastPatch: () => lastPatch,
    applyLast: async () => {
      if (!lastPatch) return { ok: false, reason: "Sem patch" };
      return await applyPatch(lastPatch);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUI);
  } else {
    initUI();
  }
})();
