/* RControl Factory — /app/js/core/agent.search.js (v1.0)
   Finder OFFLINE:
   - busca texto em mother_bundle (local) + overrides (localStorage)
   - comandos: find, where, paths, help
   - não depende do Editor
*/
(() => {
  "use strict";
  if (window.RCF_SEARCH && window.RCF_SEARCH.__v10) return;

  const log = (...a) => { try { window.RCF_LOGGER?.push?.("info", a.join(" ")); } catch {} };

  // --- helpers
  function normPath(p) {
    let x = String(p || "").trim();
    if (!x) return "";
    x = x.split("#")[0].split("?")[0].trim();
    if (!x.startsWith("/")) x = "/" + x;
    x = x.replace(/\/{2,}/g, "/");
    // compat: /app/index.html -> /index.html
    if (x === "/app/index.html") x = "/index.html";
    if (x.startsWith("/app/")) x = x.slice(4);
    if (!x.startsWith("/")) x = "/" + x;
    return x;
  }

  function safeParse(raw, fb) {
    try { return raw ? JSON.parse(raw) : fb; } catch { return fb; }
  }

  // --- sources
  function getOverridesVFS() {
    // no app.js você expôs window.RCF_OVERRIDES_VFS ✅
    const o = window.RCF_OVERRIDES_VFS;
    if (!o || typeof o.listFiles !== "function" || typeof o.readFile !== "function") return null;
    return o;
  }

  function getBundleTextAny() {
    // tenta chaves que já aparecem no seu sistema
    const candidates = [
      "rcf:mother_bundle",              // app.js (Storage.setRaw("mother_bundle"...))
      "rcf:mother_bundle_local",        // mae v2.2b (normalizado)
      "rcf:mother_bundle_raw",          // mae v2.2b (raw)
      "rcf:mother_bundle_json",
      "rcf:mother_bundle",
      "RCF_MOTHER_BUNDLE"
    ];

    for (const k of candidates) {
      try {
        const v = localStorage.getItem(k);
        if (v && String(v).trim().startsWith("{")) return String(v);
      } catch {}
    }
    return "";
  }

  function getBundleFilesMap() {
    const txt = getBundleTextAny();
    if (!txt) return { ok:false, files:{} };

    const j = safeParse(txt, null);
    if (!j || typeof j !== "object") return { ok:false, files:{} };

    // aceita {files:{}} OU objeto direto
    const filesObj = (j.files && typeof j.files === "object") ? j.files : j;
    const out = {};
    for (const [k, v] of Object.entries(filesObj || {})) {
      const p = normPath(k);
      if (!p) continue;

      let content = "";
      if (v && typeof v === "object" && "content" in v) content = String(v.content ?? "");
      else content = String(v ?? "");

      out[p] = content;
    }
    return { ok:true, files: out };
  }

  async function buildInventory() {
    const inv = {}; // path -> content

    // 1) bundle
    const b = getBundleFilesMap();
    if (b.ok) {
      for (const [p, c] of Object.entries(b.files)) inv[p] = String(c ?? "");
    }

    // 2) overrides por cima
    const ov = getOverridesVFS();
    if (ov) {
      try {
        const list = await ov.listFiles();
        for (const raw of (list || [])) {
          const p = normPath(raw);
          const txt = await ov.readFile(p);
          if (txt != null) inv[p] = String(txt);
        }
      } catch {}
    }

    return inv;
  }

  function findInText(text, q, maxHits = 8) {
    const s = String(text ?? "");
    const needle = String(q ?? "");
    if (!needle) return [];

    const hits = [];
    let at = 0;
    while (hits.length < maxHits) {
      const i = s.indexOf(needle, at);
      if (i < 0) break;

      // calcula linha
      const pre = s.slice(0, i);
      const line = pre.split("\n").length;
      const col = i - (pre.lastIndexOf("\n") + 1);

      hits.push({ index: i, line, col });
      at = i + needle.length;
    }
    return hits;
  }

  function contextAround(text, idx, radius = 140) {
    const s = String(text ?? "");
    const a = Math.max(0, idx - radius);
    const b = Math.min(s.length, idx + radius);
    return s.slice(a, b);
  }

  async function cmdFind(q) {
    const query = String(q || "").trim();
    if (!query) return { ok:false, text:"Use: find <texto>" };

    const inv = await buildInventory();
    const out = [];
    for (const [p, content] of Object.entries(inv)) {
      const hits = findInText(content, query, 2);
      if (hits.length) {
        out.push({ path: p, hits });
        if (out.length >= 20) break;
      }
    }

    if (!out.length) return { ok:true, text:`(nada encontrado para "${query}")` };

    const lines = [];
    lines.push(`FOUND: "${query}"`);
    for (const item of out) {
      for (const h of item.hits) {
        lines.push(`- ${item.path}  (line ${h.line}, col ${h.col})`);
      }
    }
    return { ok:true, text: lines.join("\n"), matches: out };
  }

  async function cmdWhere(q) {
    const query = String(q || "").trim();
    if (!query) return { ok:false, text:"Use: where <texto>" };

    const inv = await buildInventory();
    const out = [];
    for (const [p, content] of Object.entries(inv)) {
      const hits = findInText(content, query, 1);
      if (hits.length) {
        const h = hits[0];
        out.push({
          path: p,
          line: h.line,
          col: h.col,
          snippet: contextAround(content, h.index, 180)
        });
        if (out.length >= 12) break;
      }
    }

    if (!out.length) return { ok:true, text:`(nada encontrado para "${query}")` };

    const lines = [];
    lines.push(`WHERE: "${query}"`);
    for (const m of out) {
      lines.push(`\n=== ${m.path} @ line ${m.line}, col ${m.col} ===\n${m.snippet}`);
    }
    return { ok:true, text: lines.join("\n"), matches: out };
  }

  async function cmdPaths(q) {
    const query = String(q || "").trim().toLowerCase();
    if (!query) return { ok:false, text:"Use: paths <texto>" };

    const inv = await buildInventory();
    const paths = Object.keys(inv).filter(p => p.toLowerCase().includes(query)).slice(0, 60);
    if (!paths.length) return { ok:true, text:`(nenhum path bateu "${query}")` };

    return { ok:true, text: paths.map(p => "- " + p).join("\n"), paths };
  }

  function help() {
    return [
      "RCF SEARCH (offline)",
      "",
      "Comandos:",
      "- find <texto>    → lista arquivos/linhas onde aparece",
      "- where <texto>   → mostra contexto do trecho",
      "- paths <texto>   → busca só no nome/caminho",
      "- search help     → ajuda",
      "",
      "Exemplos:",
      'find "scan.tar"',
      'where "RCF_OVERRIDE_PUT"',
      'paths "scan"'
    ].join("\n");
  }

  window.RCF_SEARCH = {
    __v10: true,
    help,
    find: cmdFind,
    where: cmdWhere,
    paths: cmdPaths
  };

  log("OK: RCF_SEARCH ready ✅ v1.0");
})();
