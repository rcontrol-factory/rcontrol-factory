/* builderEngine.js — Builder SAFE (MVP)
   - cria patches FILE_WRITE sem aplicar direto
   - preview + fila (patchQueue)
   - apply chama applyPipeline (se existir)
*/

(() => {
  "use strict";

  const STATE_KEY = "rcf:builderState:v1";

  function now() { return Date.now(); }

  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
      return {
        selectedApp: s.selectedApp || null,
        currentFile: s.currentFile || "",
        writeMode: false,
        buffer: [],
      };
    } catch {
      return { selectedApp: null, currentFile: "", writeMode: false, buffer: [] };
    }
  }

  function saveState(st) {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        selectedApp: st.selectedApp || null,
        currentFile: st.currentFile || "",
      }));
    } catch {}
  }

  function classifyIntent(file, content) {
    // tenta usar organizerEngine real (se existir)
    try {
      const org = window.RCF_ORGANIZER || window.organizerEngine;
      if (org?.classify) return org.classify({ file, content });
      if (org?.classifyCode) return org.classifyCode({ file, content });
    } catch {}

    // fallback simples
    const f = (file || "").toLowerCase();
    if (f.endsWith(".css")) return { intent: "style", risk: "LOW", dest: "/themes" };
    if (f.includes("/screens/")) return { intent: "screen", risk: "MEDIUM", dest: "/screens" };
    if (f.includes("/components/")) return { intent: "component", risk: "LOW", dest: "/components" };
    if (f.includes("/engine/")) return { intent: "engine", risk: "MEDIUM", dest: "/engine" };
    if (f.includes("/core/") || f.includes("/storage/")) return { intent: "service", risk: "HIGH", dest: "/core" };
    if (f.endsWith("sw.js")) return { intent: "service", risk: "HIGH", dest: "/" };
    if (f.endsWith(".js")) return { intent: "service", risk: "MEDIUM", dest: "/js" };
    return { intent: "unknown", risk: "LOW", dest: "" };
  }

  function diffPreviewBasic(file, content) {
    const lines = String(content || "").split("\n");
    const head = lines.slice(0, 24).join("\n");
    const more = lines.length > 24 ? `\n… (${lines.length - 24} linhas a mais)` : "";
    return [
      "================ DIFF PREVIEW (BÁSICO) ================",
      `FILE: ${file || "(sem arquivo)"}`,
      `SIZE: ${String(content || "").length} chars | LINES: ${lines.length}`,
      "-------------------------------------------------------",
      head + more,
      "=======================================================",
    ].join("\n");
  }

  function helpText() {
    return [
      "RCF Builder SAFE — comandos:",
      "",
      "help",
      "status",
      "list                (mostra patches pendentes)",
      "clear               (limpa fila de patches)",
      "select <slug>        (opcional — só registra estado)",
      "set file <caminho>   (define arquivo alvo)",
      "write               (entra no modo multi-linha)",
      "  ... cole linhas ...",
      "  /end              (fecha o write e cria patch pendente)",
      "show                (mostra patch atual)",
      "preview             (mostra intenção/destino/risco + diffPreview)",
      "apply               (tenta aplicar via applyPipeline; se não existir, só confirma)",
      "discard             (remove o patch atual da fila)",
    ].join("\n");
  }

  const st = loadState();

  function out(ok, text, extra) {
    return { ok: !!ok, text: String(text || ""), extra: extra || null, ts: now() };
  }

  function status() {
    const q = window.RCF_PATCH_QUEUE?.read?.() || [];
    return out(true, [
      "BUILDER STATUS:",
      `selectedApp: ${st.selectedApp || "(none)"}`,
      `currentFile: ${st.currentFile || "(none)"}`,
      `writeMode: ${st.writeMode ? "ON" : "OFF"}`,
      `queue: ${q.length}`,
    ].join("\n"));
  }

  function list() {
    const q = window.RCF_PATCH_QUEUE?.read?.() || [];
    if (!q.length) return out(true, "Fila vazia.");
    const lines = q.map((p, i) => {
      return `${i + 1}) ${p.id} | ${p.kind} | ${p.risk} | ${p.intent} | ${p.file || "(sem file)"} | ${new Date(p.ts).toLocaleString()}`;
    });
    return out(true, lines.join("\n"), { queue: q });
  }

  function show() {
    const p = window.RCF_PATCH_QUEUE?.peek?.();
    if (!p) return out(false, "Nenhum patch pendente.");
    return out(true, JSON.stringify(p, null, 2), { patch: p });
  }

  function discard() {
    const p = window.RCF_PATCH_QUEUE?.pop?.();
    if (!p) return out(false, "Nada pra descartar.");
    return out(true, `Descartado: ${p.id}`);
  }

  function clearQueue() {
    window.RCF_PATCH_QUEUE?.clear?.();
    return out(true, "Fila limpa.");
  }

  function setFile(path) {
    st.currentFile = String(path || "").trim();
    saveState(st);
    return out(true, `Arquivo alvo: ${st.currentFile || "(vazio)"}`);
  }

  function select(slug) {
    st.selectedApp = String(slug || "").trim() || null;
    saveState(st);
    return out(true, `App selecionado: ${st.selectedApp || "(none)"}`);
  }

  function preview() {
    const p = window.RCF_PATCH_QUEUE?.peek?.();
    if (!p) return out(false, "Nenhum patch pendente.");
    const lines = [
      "PREVIEW:",
      `kind: ${p.kind}`,
      `file: ${p.file}`,
      `intent: ${p.intent}`,
      `dest: ${p.dest}`,
      `risk: ${p.risk}`,
      "",
      p.diffPreview || "(sem diffPreview)",
    ];
    return out(true, lines.join("\n"), { patch: p });
  }

  async function apply() {
    const p = window.RCF_PATCH_QUEUE?.peek?.();
    if (!p) return out(false, "Nenhum patch pendente.");
    const pipeline = window.RCF_APPLY_PIPELINE || window.applyPipeline;

    // se tiver pipeline real, usa; senão só confirma (safe)
    if (pipeline?.apply) {
      try {
        const r = await pipeline.apply(p);
        return out(true, `APPLY OK: ${p.id}\n${r?.text || ""}`, { result: r });
      } catch (e) {
        return out(false, `APPLY FAIL: ${p.id}\n${e?.message || e}`);
      }
    }

    return out(true, `Pipeline não encontrado. Patch ficou pendente na fila: ${p.id}`);
  }

  function startWrite() {
    if (!st.currentFile) return out(false, "Use: set file <caminho> antes de write.");
    st.writeMode = true;
    st.buffer = [];
    return out(true, "WRITE MODE ON. Cole o código e finalize com /end");
  }

  function endWrite() {
    st.writeMode = false;
    const content = st.buffer.join("\n");
    st.buffer = [];

    const info = classifyIntent(st.currentFile, content);
    const patch = {
      kind: "FILE_WRITE",
      title: `Write ${st.currentFile}`,
      file: st.currentFile,
      content,
      intent: info.intent || "unknown",
      dest: info.dest || "",
      risk: info.risk || "LOW",
      diffPreview: diffPreviewBasic(st.currentFile, content),
      meta: { selectedApp: st.selectedApp || null },
    };

    const saved = window.RCF_PATCH_QUEUE?.enqueue?.(patch);
    return out(true, `Patch criado: ${saved?.id || "(ok)"}\nUse: preview / apply / discard`, { patch: saved });
  }

  function feedLine(line) {
    const s = String(line || "");
    if (s.trim() === "/end") return endWrite();
    st.buffer.push(s);
    return out(true, `+ linha (${st.buffer.length})`);
  }

  function parse(cmdLine) {
    const s = String(cmdLine || "").trim();
    if (!s) return { cmd: "", args: [] };
    const parts = s.split(/\s+/);
    return { cmd: (parts.shift() || "").toLowerCase(), args: parts };
  }

  function run(line) {
    // modo write (captura tudo)
    if (st.writeMode) return feedLine(line);

    const { cmd, args } = parse(line);

    if (!cmd || cmd === "help") return out(true, helpText());
    if (cmd === "status") return status();
    if (cmd === "list") return list();
    if (cmd === "show") return show();
    if (cmd === "preview") return preview();
    if (cmd === "apply") return apply();
    if (cmd === "discard") return discard();
    if (cmd === "clear") return clearQueue();

    if (cmd === "select") return select(args.join(" "));
    if (cmd === "set" && (args[0] || "").toLowerCase() === "file") return setFile(args.slice(1).join(" "));
    if (cmd === "write") return startWrite();

    return out(false, `Comando desconhecido: ${cmd}\nDigite: help`);
  }

  window.RCF_BUILDER = { run, status, list, show, preview, apply };
})();
