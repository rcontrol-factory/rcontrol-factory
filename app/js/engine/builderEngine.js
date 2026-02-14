/* builderEngine.js — Builder SAFE (PADRÃO) v1.1b
   - cria patches FILE_WRITE sem aplicar direto
   - preview + fila (RCF_PATCH_QUEUE) (auto-cria se não existir)
   - apply: DISPARA pipeline async e retorna texto síncrono (evita [object Promise])
   - compat: usa RCF_ORGANIZER.analyze(code, filename)
*/
(() => {
  "use strict";

  if (window.RCF_BUILDER && window.RCF_BUILDER.__v11b) return;

  const STATE_KEY = "rcf:builderState:v1";
  const QUEUE_KEY = "rcf:patchQueue:v1";

  function now() { return Date.now(); }
  function id() { return "P" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(36); }

  function log(lvl, msg) {
    try { window.RCF_LOGGER?.push?.(lvl, String(msg)); } catch {}
    try { console.log("[BUILDER]", lvl, msg); } catch {}
  }

  // ---------------------------
  // Patch Queue (auto-create)
  // ---------------------------
  function ensureQueue() {
    if (window.RCF_PATCH_QUEUE && window.RCF_PATCH_QUEUE.__v1) return window.RCF_PATCH_QUEUE;

    const safeParse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
    const save = (arr) => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(arr || [])); } catch {} };
    const load = () => safeParse(localStorage.getItem(QUEUE_KEY) || "[]", []);

    const api = {
      __v1: true,
      read() { return load(); },
      clear() { save([]); return true; },
      peek() {
        const q = load();
        return q.length ? q[q.length - 1] : null;
      },
      pop() {
        const q = load();
        const p = q.pop() || null;
        save(q);
        return p;
      },
      enqueue(patch) {
        const q = load();
        const p = { ...patch };
        if (!p.id) p.id = id();
        if (!p.ts) p.ts = now();
        q.push(p);
        save(q);
        return p;
      },
    };

    window.RCF_PATCH_QUEUE = api;
    return api;
  }

  const Q = ensureQueue();

  // ---------------------------
  // State
  // ---------------------------
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

  const st = loadState();

  // ---------------------------
  // Organizer integration
  // ---------------------------
  function classifyIntent(file, content) {
    // ✅ prefer RCF_ORGANIZER.analyze(code, filename)
    try {
      const org = window.RCF_ORGANIZER;
      if (org && typeof org.analyze === "function") {
        const a = org.analyze(String(content || ""), String(file || ""));
        // mapeia detectedType -> intent
        const intent = a.detectedType || "misc";
        return {
          intent,
          risk: a.risk || "LOW",
          dest: a.destination || "",
          reason: a.reason || "",
        };
      }
    } catch {}

    // fallback simples (não quebra)
    const f = (file || "").toLowerCase();
    if (f.endsWith(".css")) return { intent: "style", risk: "LOW", dest: "/themes", reason: "fallback ext=.css" };
    if (f.includes("/screens/")) return { intent: "screen", risk: "MEDIUM", dest: "/screens", reason: "fallback path contains /screens/" };
    if (f.includes("/components/")) return { intent: "component", risk: "LOW", dest: "/components", reason: "fallback path contains /components/" };
    if (f.includes("/engine/")) return { intent: "engine", risk: "HIGH", dest: "/engine", reason: "fallback path contains /engine/" };
    if (f.includes("/core/") || f.includes("/storage/")) return { intent: "service", risk: "HIGH", dest: "/core", reason: "fallback path contains /core/" };
    if (f.endsWith("sw.js")) return { intent: "service", risk: "HIGH", dest: "/", reason: "fallback sw.js" };
    if (f.endsWith(".js")) return { intent: "service", risk: "MEDIUM", dest: "/js", reason: "fallback ext=.js" };
    return { intent: "misc", risk: "LOW", dest: "/misc", reason: "fallback misc" };
  }

  // ---------------------------
  // Diff preview (basic)
  // ---------------------------
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

  function out(ok, text, extra) {
    return { ok: !!ok, text: String(text || ""), extra: extra || null, ts: now() };
  }

  // ---------------------------
  // Commands
  // ---------------------------
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
      "apply               (dispara applyPipeline async; retorna texto imediato)",
      "discard             (remove o patch atual da fila)",
    ].join("\n");
  }

  function status() {
    const q = Q.read() || [];
    return out(true, [
      "BUILDER STATUS:",
      `selectedApp: ${st.selectedApp || "(none)"}`,
      `currentFile: ${st.currentFile || "(none)"}`,
      `writeMode: ${st.writeMode ? "ON" : "OFF"}`,
      `queue: ${q.length}`,
    ].join("\n"));
  }

  function list() {
    const q = Q.read() || [];
    if (!q.length) return out(true, "Fila vazia.");
    const lines = q.map((p, i) => {
      return `${i + 1}) ${p.id} | ${p.kind} | ${p.risk} | ${p.intent} | ${p.file || "(sem file)"} | ${new Date(p.ts).toLocaleString()}`;
    });
    return out(true, lines.join("\n"), { queue: q });
  }

  function show() {
    const p = Q.peek();
    if (!p) return out(false, "Nenhum patch pendente.");
    return out(true, JSON.stringify(p, null, 2), { patch: p });
  }

  function discard() {
    const p = Q.pop();
    if (!p) return out(false, "Nada pra descartar.");
    return out(true, `Descartado: ${p.id}`);
  }

  function clearQueue() {
    Q.clear();
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
    const p = Q.peek();
    if (!p) return out(false, "Nenhum patch pendente.");
    const lines = [
      "PREVIEW:",
      `id: ${p.id}`,
      `kind: ${p.kind}`,
      `file: ${p.file}`,
      `intent: ${p.intent}`,
      `dest: ${p.dest}`,
      `risk: ${p.risk}`,
      (p.reason ? `reason: ${p.reason}` : ""),
      "",
      p.diffPreview || "(sem diffPreview)",
    ].filter(Boolean);
    return out(true, lines.join("\n"), { patch: p });
  }

  function apply() {
    const p = Q.peek();
    if (!p) return out(false, "Nenhum patch pendente.");

    const pipeline = window.RCF_APPLY_PIPELINE || window.applyPipeline;

    // ✅ SAFE: não bloqueia UI. Dispara async e retorna texto síncrono.
    if (pipeline && typeof pipeline.apply === "function") {
      (async () => {
        try {
          log("info", `apply start ${p.id}`);
          const r = await pipeline.apply(p);
          log("ok", `apply ok ${p.id} ${r?.text || ""}`.trim());
        } catch (e) {
          log("err", `apply fail ${p.id} :: ${e?.message || e}`);
        }
      })();

      return out(true, `APPLY DISPARADO ✅: ${p.id}\n(veja Logs para resultado)`);
    }

    return out(true, `Pipeline não encontrado. Patch continua pendente: ${p.id}`);
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
      id: id(),
      ts: now(),
      kind: "FILE_WRITE",
      title: `Write ${st.currentFile}`,
      file: st.currentFile,
      content,
      intent: info.intent || "misc",
      dest: info.dest || "",
      risk: info.risk || "LOW",
      reason: info.reason || "",
      diffPreview: diffPreviewBasic(st.currentFile, content),
      meta: { selectedApp: st.selectedApp || null },
    };

    const saved = Q.enqueue(patch);
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

  window.RCF_BUILDER = { __v11b: true, run, status, list, show, preview, apply };

  log("ok", "builderEngine.js carregado ✅ (v1.1b)");
})();
