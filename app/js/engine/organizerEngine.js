/* organizerEngine.js — RCF Organizer Engine (REAL, SAFE)
   - classifica intenção do código recebido
   - calcula destino
   - detecta duplicidade / bloqueia overwrite silencioso
   - retorna preview + diffPreview
*/

(() => {
  "use strict";

  const DEFAULT_RULES = {
    component: "/components",
    screen: "/screens",
    style: "/themes",
    service: "/js/core",
    engine: "/js/engine",
    config: "/js/core/config"
  };

  function normPath(p) {
    p = String(p || "").trim();
    if (!p.startsWith("/")) p = "/" + p;
    return p.replace(/\/+/g, "/");
  }

  function basename(p) {
    const s = String(p || "");
    const parts = s.split("/");
    return parts[parts.length - 1] || s;
  }

  function extFromContent(type) {
    if (type === "style") return ".css";
    return ".js";
  }

  function safeNameFromContent(code) {
    const s = String(code || "");

    // tenta export default function Name / function Name / class Name
    let m =
      s.match(/export\s+default\s+function\s+([A-Za-z0-9_]+)/) ||
      s.match(/function\s+([A-Za-z0-9_]+)\s*\(/) ||
      s.match(/class\s+([A-Za-z0-9_]+)/) ||
      s.match(/export\s+(?:const|let|var)\s+([A-Za-z0-9_]+)/);

    if (m && m[1]) return m[1];

    // fallback: "unnamed"
    return "unnamed";
  }

  function classifyIntent(input) {
    const { filename = "", code = "", hint = "" } = input || {};
    const fn = String(filename).toLowerCase();
    const src = String(code);
    const h = String(hint).toLowerCase();

    // config
    if (fn.includes("config") || /config/i.test(h)) return "config";

    // sw / storage / core
    if (fn.includes("sw.js") || /service\s*worker/i.test(src) || /self\.addEventListener\("fetch"/.test(src)) return "service";
    if (/indexeddb|localstorage|storage/i.test(src) || fn.includes("storage")) return "service";

    // style
    if (fn.endsWith(".css") || /:root\s*{|--[a-z0-9_-]+\s*:|\.([a-z0-9_-]+)\s*\{/i.test(src) || h.includes("css")) return "style";

    // screen
    if (fn.includes("screen") || /renderScreen|route|router|view:/i.test(src) || h.includes("tela")) return "screen";

    // component
    if (fn.includes("component") || /export\s+function|export\s+default\s+function|class\s+[A-Za-z0-9_]+/i.test(src) || h.includes("component")) return "component";

    // engine
    if (fn.includes("engine") || /organizerengine|builder|pipeline|patch/i.test(src)) return "engine";

    // default
    return "service";
  }

  function riskFromType(type, targetPath) {
    const p = String(targetPath || "");
    // HIGH: boot/core principal, sw, storage crítico
    if (p === "/app.js" || p === "/index.html" || p === "/sw.js" || /\/js\/core\/(app|boot|router)\.js/i.test(p)) return "HIGH";
    if (type === "service" && /indexeddb|storage|sw/i.test(p)) return "HIGH";

    // MEDIUM: screen, route, imports
    if (type === "screen") return "MEDIUM";
    if (/router|routes|navigation/i.test(p)) return "MEDIUM";

    // LOW: style, component isolado
    if (type === "style") return "LOW";
    if (type === "component") return "LOW";

    return "MEDIUM";
  }

  function makeDiffPreview(oldText, newText) {
    // diff simples e seguro (não é git-diff perfeito)
    const a = String(oldText || "").split("\n");
    const b = String(newText || "").split("\n");

    const max = Math.max(a.length, b.length);
    const out = [];
    let changes = 0;

    for (let i = 0; i < max; i++) {
      const A = a[i];
      const B = b[i];
      if (A === B) continue;
      changes++;
      if (A !== undefined) out.push(`- ${A}`);
      if (B !== undefined) out.push(`+ ${B}`);
      if (out.length > 120) break; // evita explodir UI
    }

    return {
      changes,
      preview: out.slice(0, 120).join("\n")
    };
  }

  function plan(input, existingFilesMap, rules = DEFAULT_RULES) {
    const filename = (input && input.filename) ? String(input.filename) : "";
    const code = (input && input.code) ? String(input.code) : "";
    const hint = (input && input.hint) ? String(input.hint) : "";

    const intent = classifyIntent({ filename, code, hint });

    const baseDir = normPath(rules[intent] || "/js/core");
    const name = safeNameFromContent(code);
    const ext = filename ? (filename.includes(".") ? "." + filename.split(".").pop() : extFromContent(intent)) : extFromContent(intent);

    const safeFile = filename
      ? (filename.startsWith("/") ? filename : baseDir + "/" + filename)
      : (baseDir + "/" + name + ext);

    const targetPath = normPath(safeFile);

    const existing = existingFilesMap && (targetPath in existingFilesMap);
    const overwriteBlocked = existing; // regra: nunca sobrescreve sem confirmação explícita
    const risk = riskFromType(intent, targetPath);

    const oldText = existing ? String(existingFilesMap[targetPath] || "") : "";
    const diff = makeDiffPreview(oldText, code);

    // duplicidade por basename (ex: Button.js em outro lugar)
    const dup = [];
    if (existingFilesMap) {
      const targetBase = basename(targetPath).toLowerCase();
      for (const p of Object.keys(existingFilesMap)) {
        if (basename(p).toLowerCase() === targetBase && p !== targetPath) dup.push(p);
        if (dup.length >= 6) break;
      }
    }

    return {
      intent,
      hint,
      targetPath,
      overwriteBlocked,
      duplicates: dup,
      risk,
      diffPreview: diff.preview,
      diffChanges: diff.changes
    };
  }

  window.RCF_ORGANIZER = {
    DEFAULT_RULES,
    classifyIntent,
    plan
  };
})();
