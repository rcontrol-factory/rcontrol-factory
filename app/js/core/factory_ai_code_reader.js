/* FILE: /app/js/core/factory_ai_code_reader.js
   RControl Factory — Factory AI Code Reader
   v1.0.0 SAFE INTERNAL READER + STRUCTURE MAP + READ ONLY

   Objetivo:
   - dar à Factory AI leitura interna real da própria estrutura
   - mapear arquivos conhecidos da Factory
   - ler conteúdo de arquivos por múltiplos adaptadores seguros
   - extrair visão estrutural básica: funções, classes, exports, imports e tamanho
   - ajudar planner/actions/context a decidir com base em leitura real
   - NÃO escrever
   - NÃO aplicar patch
   - NÃO alterar arquivos
   - funcionar como script clássico

   Escopo desta v1.0.0:
   - leitura read-only
   - scan sob demanda
   - cache leve em memória + localStorage
   - integração com factory_state / module_registry
   - compatível com tree/context atuais
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_CODE_READER && global.RCF_FACTORY_AI_CODE_READER.__v100) return;

  var VERSION = "v1.0.0";
  var STORAGE_KEY = "rcf:factory_ai_code_reader";
  var MAX_HISTORY = 80;
  var MAX_CACHE_FILES = 120;
  var MAX_TEXT_PREVIEW = 2400;

  var STRATEGIC_FILES = [
    "/app/app.js",
    "/app/index.html",
    "/app/js/admin.admin_ai.js",
    "/app/js/core/context_engine.js",
    "/app/js/core/factory_state.js",
    "/app/js/core/module_registry.js",
    "/app/js/core/factory_tree.js",
    "/app/js/core/logger.js",
    "/app/js/core/doctor_scan.js",
    "/app/js/core/factory_ai_planner.js",
    "/app/js/core/factory_ai_bridge.js",
    "/app/js/core/factory_ai_actions.js",
    "/app/js/core/factory_ai_runtime.js",
    "/app/js/core/factory_ai_supervisor.js",
    "/app/js/core/patch_supervisor.js",
    "/app/js/core/factory_ai_diagnostics.js",
    "/app/js/core/factory_ai_memory.js",
    "/app/js/core/factory_phase_engine.js",
    "/app/js/core/factory_ai_autoloop.js",
    "/app/js/core/factory_ai_orchestrator.js",
    "/app/js/core/factory_ai_proposal_ui.js",
    "/app/js/core/factory_ai_self_evolution.js",
    "/app/js/core/factory_ai_autoheal.js",
    "/app/js/core/factory_ai_evolution_mode.js",
    "/app/js/core/factory_ai_governor.js",
    "/app/js/core/factory_ai_controller.js",
    "/app/js/core/factory_ai_code_reader.js",
    "/functions/api/admin-ai.js"
  ];

  var state = {
    version: VERSION,
    ready: false,
    busy: false,
    lastUpdate: null,
    lastScanAt: null,
    lastScanReason: "",
    lastReadFile: "",
    lastReadOk: false,
    lastError: "",
    knownFiles: [],
    cache: {},
    lastSummary: null,
    history: []
  };

  function nowISO() {
    try { return new Date().toISOString(); }
    catch (_) { return ""; }
  }

  function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); }
    catch (_) { return obj || {}; }
  }

  function trimText(v) {
    return String(v == null ? "" : v).trim();
  }

  function lower(v) {
    return trimText(v).toLowerCase();
  }

  function safe(fn, fallback) {
    try {
      var v = fn();
      return v === undefined ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function uniq(arr) {
    var out = [];
    var seen = {};
    asArray(arr).forEach(function (item) {
      var key = String(item || "");
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(key);
    });
    return out;
  }

  function normalizePath(path) {
    var p = trimText(path || "").replace(/\\/g, "/");
    if (!p) return "";
    if (p.charAt(0) !== "/") p = "/" + p;
    p = p.replace(/\/{2,}/g, "/");
    return p;
  }

  function persist() {
    try {
      state.lastUpdate = nowISO();

      var compactCache = {};
      var keys = Object.keys(state.cache || {}).slice(-MAX_CACHE_FILES);
      keys.forEach(function (k) {
        var item = state.cache[k];
        if (!item || typeof item !== "object") return;

        compactCache[k] = {
          path: item.path || "",
          ts: item.ts || "",
          ok: !!item.ok,
          source: item.source || "",
          size: Number(item.size || 0) || 0,
          ext: item.ext || "",
          kind: item.kind || "",
          preview: trimText(item.preview || "").slice(0, MAX_TEXT_PREVIEW),
          analysis: clone(item.analysis || {})
        };
      });

      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: VERSION,
        ready: !!state.ready,
        lastUpdate: state.lastUpdate || null,
        lastScanAt: state.lastScanAt || null,
        lastScanReason: state.lastScanReason || "",
        lastReadFile: state.lastReadFile || "",
        lastReadOk: !!state.lastReadOk,
        lastError: state.lastError || "",
        knownFiles: asArray(state.knownFiles).slice(0, 200),
        cache: compactCache,
        lastSummary: clone(state.lastSummary || null),
        history: asArray(state.history).slice(-MAX_HISTORY)
      }));

      return true;
    } catch (_) {
      return false;
    }
  }

  function merge(base, patch) {
    if (!patch || typeof patch !== "object") return base;

    Object.keys(patch).forEach(function (key) {
      var a = base[key];
      var b = patch[key];

      if (
        a && typeof a === "object" && !Array.isArray(a) &&
        b && typeof b === "object" && !Array.isArray(b)
      ) {
        base[key] = merge(clone(a), b);
      } else {
        base[key] = b;
      }
    });

    return base;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;

      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return false;

      state = merge(clone(state), parsed);

      if (!Array.isArray(state.knownFiles)) state.knownFiles = [];
      if (!Array.isArray(state.history)) state.history = [];
      if (!state.cache || typeof state.cache !== "object") state.cache = {};

      state.history = state.history.slice(-MAX_HISTORY);
      return true;
    } catch (_) {
      return false;
    }
  }

  function pushLog(level, msg, extra) {
    try {
      if (extra !== undefined) {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_CODE_READER] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_CODE_READER] " + msg);
      }
    } catch (_) {}

    try { console.log("[FACTORY_AI_CODE_READER]", level, msg, extra || ""); } catch (_) {}
  }

  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function pushHistory(entry) {
    if (!Array.isArray(state.history)) state.history = [];
    state.history.push(clone(entry || {}));
    if (state.history.length > MAX_HISTORY) {
      state.history = state.history.slice(-MAX_HISTORY);
    }
    persist();
  }

  function syncPresence() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAICodeReader");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAICodeReader", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAICodeReader");
      }
    } catch (_) {}

    try {
      if (global.RCF_FACTORY_STATE?.refreshRuntime) {
        global.RCF_FACTORY_STATE.refreshRuntime();
      }
    } catch (_) {}
  }

  function getContextSnapshot() {
    return safe(function () {
      if (global.RCF_CONTEXT?.getSnapshot) return global.RCF_CONTEXT.getSnapshot();
      if (global.RCF_CONTEXT?.getContext) return global.RCF_CONTEXT.getContext();
      return {};
    }, {});
  }

  function getTreePaths() {
    return safe(function () {
      if (global.RCF_FACTORY_TREE?.getAllPaths) {
        return asArray(global.RCF_FACTORY_TREE.getAllPaths());
      }
      return [];
    }, []);
  }

  function getCandidateFiles() {
    var ctx = getContextSnapshot();
    var out = [];

    try {
      out = out.concat(asArray(ctx.candidateFiles));
    } catch (_) {}

    try {
      var tree = ctx.tree || {};
      out = out.concat(asArray(tree.samples));
      out = out.concat(asArray(safe(function () { return tree.pathGroups.core; }, [])));
      out = out.concat(asArray(safe(function () { return tree.pathGroups.ui; }, [])));
      out = out.concat(asArray(safe(function () { return tree.pathGroups.admin; }, [])));
      out = out.concat(asArray(safe(function () { return tree.pathGroups.engine; }, [])));
      out = out.concat(asArray(safe(function () { return tree.pathGroups.functions; }, [])));
    } catch (_) {}

    return uniq(out.map(normalizePath).filter(Boolean));
  }

  function getKnownFiles() {
    var all = []
      .concat(STRATEGIC_FILES)
      .concat(getTreePaths())
      .concat(getCandidateFiles())
      .concat(asArray(state.knownFiles || []));

    return uniq(all.map(normalizePath).filter(Boolean)).slice(0, 240);
  }

  function getExtension(path) {
    var p = normalizePath(path);
    var idx = p.lastIndexOf(".");
    if (idx < 0) return "";
    return lower(p.slice(idx + 1));
  }

  function detectKind(path) {
    var ext = getExtension(path);

    if (ext === "js" || ext === "mjs" || ext === "cjs") return "javascript";
    if (ext === "html" || ext === "htm") return "html";
    if (ext === "json") return "json";
    if (ext === "css") return "css";
    if (ext === "md") return "markdown";
    return ext ? ext : "unknown";
  }

  function isProbablyText(path) {
    var kind = detectKind(path);
    return (
      kind === "javascript" ||
      kind === "html" ||
      kind === "json" ||
      kind === "css" ||
      kind === "markdown" ||
      kind === "txt" ||
      kind === "unknown"
    );
  }

  function textPreview(text) {
    return String(text || "").slice(0, MAX_TEXT_PREVIEW);
  }

  function analyzeJS(text) {
    var src = String(text || "");

    var functions = [];
    var classes = [];
    var imports = [];
    var exports = [];
    var listeners = [];

    var fnRegexes = [
      /function\s+([A-Za-z0-9_$]+)\s*\(/g,
      /(?:var|let|const)\s+([A-Za-z0-9_$]+)\s*=\s*function\s*\(/g,
      /(?:var|let|const)\s+([A-Za-z0-9_$]+)\s*=\s*\([^\)]*\)\s*=>/g,
      /(?:var|let|const)\s+([A-Za-z0-9_$]+)\s*=\s*async\s*\([^\)]*\)\s*=>/g
    ];

    fnRegexes.forEach(function (rg) {
      var m;
      while ((m = rg.exec(src))) {
        functions.push(String(m[1] || ""));
      }
    });

    var classRg = /class\s+([A-Za-z0-9_$]+)/g;
    var m1;
    while ((m1 = classRg.exec(src))) {
      classes.push(String(m1[1] || ""));
    }

    var importRg = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    var m2;
    while ((m2 = importRg.exec(src))) {
      imports.push(String(m2[1] || ""));
    }

    var exportRg = /export\s+(?:default\s+)?(?:function|class|const|let|var)?\s*([A-Za-z0-9_$]*)/g;
    var m3;
    while ((m3 = exportRg.exec(src))) {
      exports.push(String(m3[1] || "default"));
    }

    var listenerRg = /addEventListener\s*\(\s*['"]([^'"]+)['"]/g;
    var m4;
    while ((m4 = listenerRg.exec(src))) {
      listeners.push(String(m4[1] || ""));
    }

    return {
      type: "javascript",
      lines: src ? src.split("\n").length : 0,
      chars: src.length,
      functions: uniq(functions).slice(0, 80),
      classes: uniq(classes).slice(0, 40),
      imports: uniq(imports).slice(0, 40),
      exports: uniq(exports).slice(0, 40),
      listeners: uniq(listeners).slice(0, 60),
      hasIIFE: src.indexOf("(function") >= 0 || src.indexOf("(()=>") >= 0 || src.indexOf("(() =>") >= 0,
      hasWindowBinding: src.indexOf("window.") >= 0 || src.indexOf("global.") >= 0,
      hasFactoryAIRefs: src.indexOf("RCF_FACTORY_AI") >= 0 || src.indexOf("factory_ai") >= 0
    };
  }

  function analyzeHTML(text) {
    var src = String(text || "");
    var ids = [];
    var scripts = [];
    var styles = [];

    var idRg = /id=["']([^"']+)["']/g;
    var m1;
    while ((m1 = idRg.exec(src))) {
      ids.push(String(m1[1] || ""));
    }

    var scriptRg = /<script[^>]*src=["']([^"']+)["']/g;
    var m2;
    while ((m2 = scriptRg.exec(src))) {
      scripts.push(String(m2[1] || ""));
    }

    var styleRg = /<link[^>]*href=["']([^"']+)["']/g;
    var m3;
    while ((m3 = styleRg.exec(src))) {
      styles.push(String(m3[1] || ""));
    }

    return {
      type: "html",
      lines: src ? src.split("\n").length : 0,
      chars: src.length,
      ids: uniq(ids).slice(0, 100),
      scripts: uniq(scripts).slice(0, 80),
      styles: uniq(styles).slice(0, 80)
    };
  }

  function analyzeJSON(text) {
    var src = String(text || "");
    var parsed = null;
    var keys = [];

    try {
      parsed = JSON.parse(src);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        keys = Object.keys(parsed);
      }
    } catch (_) {}

    return {
      type: "json",
      lines: src ? src.split("\n").length : 0,
      chars: src.length,
      valid: !!parsed,
      rootKeys: keys.slice(0, 80)
    };
  }

  function analyzeText(path, text) {
    var kind = detectKind(path);

    if (kind === "javascript") return analyzeJS(text);
    if (kind === "html") return analyzeHTML(text);
    if (kind === "json") return analyzeJSON(text);

    return {
      type: kind,
      lines: String(text || "").split("\n").length,
      chars: String(text || "").length
    };
  }

  function tryReadFromTree(path) {
    var p = normalizePath(path);

    return safe(function () {
      if (global.RCF_FACTORY_TREE?.readFile) {
        var v = global.RCF_FACTORY_TREE.readFile(p);
        if (typeof v === "string") return { ok: true, text: v, source: "factory_tree.readFile" };
      }

      if (global.RCF_FACTORY_TREE?.getFileContent) {
        var c = global.RCF_FACTORY_TREE.getFileContent(p);
        if (typeof c === "string") return { ok: true, text: c, source: "factory_tree.getFileContent" };
      }

      if (global.RCF_FACTORY_TREE?.getNode) {
        var node = global.RCF_FACTORY_TREE.getNode(p);
        var content = safe(function () { return node.content; }, null);
        if (typeof content === "string") return { ok: true, text: content, source: "factory_tree.node.content" };
      }

      return null;
    }, null);
  }

  function tryReadFromVFS(path) {
    var p = normalizePath(path);

    return safe(function () {
      var readers = [
        safe(function () { return global.RCF_VFS; }, null),
        safe(function () { return global.__RCF_VFS; }, null),
        safe(function () { return global.RCF_RUNTIME_VFS; }, null),
        safe(function () { return global.RCF_VFS_BROWSER; }, null)
      ];

      for (var i = 0; i < readers.length; i++) {
        var api = readers[i];
        if (!api) continue;

        if (typeof api.readFile === "function") {
          var a = api.readFile(p);
          if (typeof a === "string") return { ok: true, text: a, source: "vfs.readFile" };
        }

        if (typeof api.get === "function") {
          var b = api.get(p);
          if (typeof b === "string") return { ok: true, text: b, source: "vfs.get" };
          if (b && typeof b.content === "string") return { ok: true, text: b.content, source: "vfs.get.content" };
        }

        if (typeof api.readText === "function") {
          var c = api.readText(p);
          if (typeof c === "string") return { ok: true, text: c, source: "vfs.readText" };
        }
      }

      return null;
    }, null);
  }

  function tryReadFromOverrides(path) {
    var p = normalizePath(path);

    return safe(function () {
      var sources = [
        safe(function () { return global.RCF_VFS_OVERRIDES; }, null),
        safe(function () { return global.__RCF_VFS_OVERRIDES; }, null),
        safe(function () { return global.RCF_RUNTIME_OVERRIDES; }, null)
      ];

      for (var i = 0; i < sources.length; i++) {
        var src = sources[i];
        if (!src || typeof src !== "object") continue;

        var direct = src[p] || src[p.replace(/^\//, "")];
        if (typeof direct === "string") return { ok: true, text: direct, source: "overrides.direct" };
        if (direct && typeof direct.content === "string") return { ok: true, text: direct.content, source: "overrides.content" };
      }

      return null;
    }, null);
  }

  async function tryReadByFetch(path) {
    var p = normalizePath(path);

    if (!isProbablyText(p)) return null;
    if (p.indexOf("/functions/") === 0) return null;

    try {
      var res = await fetch(p, { method: "GET", cache: "no-store" });
      if (!res || !res.ok) return null;

      var txt = await res.text();
      if (typeof txt !== "string") return null;

      return {
        ok: true,
        text: txt,
        source: "fetch"
      };
    } catch (_) {
      return null;
    }
  }

  function rememberFileResult(path, result) {
    var p = normalizePath(path);
    if (!p) return null;

    state.lastReadFile = p;
    state.lastReadOk = !!(result && result.ok);
    state.lastError = trimText(result && result.error || "");

    state.cache[p] = {
      path: p,
      ts: nowISO(),
      ok: !!(result && result.ok),
      source: trimText(result && result.source || ""),
      size: Number(result && result.size || 0) || 0,
      ext: getExtension(p),
      kind: detectKind(p),
      preview: trimText(result && result.preview || ""),
      analysis: clone(result && result.analysis || {}),
      text: result && result.ok ? String(result.text || "") : undefined
    };

    var keys = Object.keys(state.cache || {});
    if (keys.length > MAX_CACHE_FILES) {
      keys.sort(function (a, b) {
        var ta = safe(function () { return Date.parse(state.cache[a].ts || ""); }, 0) || 0;
        var tb = safe(function () { return Date.parse(state.cache[b].ts || ""); }, 0) || 0;
        return ta - tb;
      });

      while (keys.length > MAX_CACHE_FILES) {
        var oldest = keys.shift();
        if (oldest) delete state.cache[oldest];
      }
    }

    pushHistory({
      type: "read",
      path: p,
      ok: !!(result && result.ok),
      source: trimText(result && result.source || ""),
      ts: nowISO()
    });

    persist();
    return clone(state.cache[p]);
  }

  async function readFile(path, opts) {
    var p = normalizePath(path);
    var useCache = !opts || opts.useCache !== false;

    if (!p) {
      return { ok: false, error: "path vazio" };
    }

    if (useCache && state.cache && state.cache[p] && state.cache[p].ok) {
      var cached = clone(state.cache[p]);
      if (typeof cached.text !== "string") cached.text = "";
      return {
        ok: true,
        path: p,
        text: String(cached.text || ""),
        preview: trimText(cached.preview || ""),
        analysis: clone(cached.analysis || {}),
        source: trimText(cached.source || "cache"),
        cached: true,
        size: Number(cached.size || 0) || 0
      };
    }

    var fromTree = tryReadFromTree(p);
    if (fromTree && fromTree.ok) {
      var analysisA = analyzeText(p, fromTree.text);
      var resA = {
        ok: true,
        path: p,
        text: String(fromTree.text || ""),
        preview: textPreview(fromTree.text),
        analysis: analysisA,
        source: fromTree.source || "factory_tree",
        size: String(fromTree.text || "").length
      };
      rememberFileResult(p, resA);
      return resA;
    }

    var fromVFS = tryReadFromVFS(p);
    if (fromVFS && fromVFS.ok) {
      var analysisB = analyzeText(p, fromVFS.text);
      var resB = {
        ok: true,
        path: p,
        text: String(fromVFS.text || ""),
        preview: textPreview(fromVFS.text),
        analysis: analysisB,
        source: fromVFS.source || "vfs",
        size: String(fromVFS.text || "").length
      };
      rememberFileResult(p, resB);
      return resB;
    }

    var fromOverrides = tryReadFromOverrides(p);
    if (fromOverrides && fromOverrides.ok) {
      var analysisC = analyzeText(p, fromOverrides.text);
      var resC = {
        ok: true,
        path: p,
        text: String(fromOverrides.text || ""),
        preview: textPreview(fromOverrides.text),
        analysis: analysisC,
        source: fromOverrides.source || "overrides",
        size: String(fromOverrides.text || "").length
      };
      rememberFileResult(p, resC);
      return resC;
    }

    var fromFetch = await tryReadByFetch(p);
    if (fromFetch && fromFetch.ok) {
      var analysisD = analyzeText(p, fromFetch.text);
      var resD = {
        ok: true,
        path: p,
        text: String(fromFetch.text || ""),
        preview: textPreview(fromFetch.text),
        analysis: analysisD,
        source: fromFetch.source || "fetch",
        size: String(fromFetch.text || "").length
      };
      rememberFileResult(p, resD);
      return resD;
    }

    var fail = {
      ok: false,
      path: p,
      error: "conteúdo não acessível por tree/vfs/overrides/fetch"
    };

    rememberFileResult(p, fail);
    return fail;
  }

  async function scanFactory(opts) {
    if (state.busy) {
      return {
        ok: false,
        error: "code_reader busy"
      };
    }

    state.busy = true;
    persist();

    try {
      var reason = trimText(safe(function () { return opts.reason; }, "")) || "manual";
      var requested = asArray(safe(function () { return opts.files; }, []))
        .map(normalizePath)
        .filter(Boolean);

      var limit = Math.max(1, Number(safe(function () { return opts.limit; }, 24) || 24));
      var files = uniq((requested.length ? requested : getKnownFiles())).slice(0, limit);

      state.knownFiles = uniq(asArray(state.knownFiles).concat(files));
      state.lastScanAt = nowISO();
      state.lastScanReason = reason;
      state.lastError = "";

      var okCount = 0;
      var failCount = 0;
      var items = [];

      for (var i = 0; i < files.length; i++) {
        var item = await readFile(files[i], { useCache: false });
        items.push({
          path: normalizePath(files[i]),
          ok: !!item.ok,
          source: trimText(item.source || ""),
          size: Number(item.size || 0) || 0,
          kind: detectKind(files[i]),
          analysis: clone(item.analysis || {}),
          error: trimText(item.error || "")
        });

        if (item.ok) okCount += 1;
        else failCount += 1;
      }

      var summary = {
        ts: nowISO(),
        reason: reason,
        requestedCount: files.length,
        okCount: okCount,
        failCount: failCount,
        knownFilesCount: getKnownFiles().length,
        topReadable: items.filter(function (x) { return x.ok; }).slice(0, 20),
        topFailed: items.filter(function (x) { return !x.ok; }).slice(0, 12)
      };

      state.lastSummary = clone(summary);
      persist();

      emit("RCF:FACTORY_AI_CODE_READER_SCAN", {
        summary: clone(summary)
      });

      pushLog("OK", "scanFactory ✅", {
        reason: reason,
        okCount: okCount,
        failCount: failCount
      });

      return {
        ok: true,
        summary: clone(summary),
        items: items
      };
    } catch (e) {
      var msg = String(e && e.message || e || "scan error");
      state.lastError = msg;
      persist();
      pushLog("ERR", "scanFactory falhou", msg);
      return { ok: false, error: msg };
    } finally {
      state.busy = false;
      persist();
    }
  }

  function findFiles(query) {
    var q = lower(query);
    var files = getKnownFiles();

    if (!q) {
      return {
        ok: true,
        query: "",
        results: files.slice(0, 40)
      };
    }

    var scored = files.map(function (file) {
      var s = 0;
      var lf = lower(file);

      if (lf === q) s += 200;
      if (lf.indexOf(q) >= 0) s += 80;
      if (lf.indexOf("/" + q) >= 0) s += 30;
      if (lf.indexOf(q.replace(/\s+/g, "_")) >= 0) s += 20;
      if (lf.indexOf(q.replace(/\s+/g, "-")) >= 0) s += 20;

      return { file: file, score: s };
    }).filter(function (x) {
      return x.score > 0;
    });

    scored.sort(function (a, b) { return b.score - a.score; });

    return {
      ok: true,
      query: q,
      results: scored.slice(0, 40).map(function (x) { return x.file; })
    };
  }

  function explainFile(path) {
    var p = normalizePath(path);
    if (!p) return { ok: false, error: "path vazio" };

    var cached = clone(state.cache && state.cache[p] ? state.cache[p] : null);
    if (!cached || !cached.ok) {
      return {
        ok: false,
        path: p,
        error: "arquivo ainda não lido"
      };
    }

    var analysis = clone(cached.analysis || {});
    var out = {
      ok: true,
      path: p,
      kind: cached.kind || detectKind(p),
      source: cached.source || "",
      size: Number(cached.size || 0) || 0,
      ts: cached.ts || "",
      analysis: analysis
    };

    if (analysis.type === "javascript") {
      out.summary = {
        functionsCount: asArray(analysis.functions).length,
        classesCount: asArray(analysis.classes).length,
        importsCount: asArray(analysis.imports).length,
        exportsCount: asArray(analysis.exports).length,
        listenersCount: asArray(analysis.listeners).length,
        functions: asArray(analysis.functions).slice(0, 30),
        classes: asArray(analysis.classes).slice(0, 20)
      };
    } else if (analysis.type === "html") {
      out.summary = {
        idsCount: asArray(analysis.ids).length,
        scriptsCount: asArray(analysis.scripts).length,
        stylesCount: asArray(analysis.styles).length,
        ids: asArray(analysis.ids).slice(0, 40)
      };
    } else {
      out.summary = clone(analysis);
    }

    return out;
  }

  function getFileMap() {
    var files = getKnownFiles();
    return {
      ok: true,
      count: files.length,
      files: files
    };
  }

  function getReadableMap() {
    var cache = state.cache || {};
    var keys = Object.keys(cache);
    var items = keys.map(function (k) {
      var item = cache[k] || {};
      return {
        path: normalizePath(k),
        ok: !!item.ok,
        kind: item.kind || detectKind(k),
        source: item.source || "",
        size: Number(item.size || 0) || 0,
        ts: item.ts || "",
        analysis: clone(item.analysis || {})
      };
    });

    items.sort(function (a, b) {
      var ta = safe(function () { return Date.parse(a.ts || ""); }, 0) || 0;
      var tb = safe(function () { return Date.parse(b.ts || ""); }, 0) || 0;
      return tb - ta;
    });

    return {
      ok: true,
      count: items.length,
      items: items
    };
  }

  function buildReaderSnapshot() {
    return {
      version: VERSION,
      ready: !!state.ready,
      busy: !!state.busy,
      lastScanAt: state.lastScanAt || null,
      lastScanReason: state.lastScanReason || "",
      lastReadFile: state.lastReadFile || "",
      lastReadOk: !!state.lastReadOk,
      lastError: state.lastError || "",
      knownFilesCount: getKnownFiles().length,
      cacheCount: Object.keys(state.cache || {}).length,
      lastSummary: clone(state.lastSummary || null),
      readableMap: getReadableMap()
    };
  }

  function status() {
    return {
      version: VERSION,
      ready: !!state.ready,
      busy: !!state.busy,
      lastUpdate: state.lastUpdate || null,
      lastScanAt: state.lastScanAt || null,
      lastScanReason: state.lastScanReason || "",
      lastReadFile: state.lastReadFile || "",
      lastReadOk: !!state.lastReadOk,
      lastError: state.lastError || "",
      knownFilesCount: getKnownFiles().length,
      cacheCount: Object.keys(state.cache || {}).length,
      historyCount: asArray(state.history).length
    };
  }

  function init() {
    load();
    state.ready = true;
    state.version = VERSION;
    state.lastUpdate = nowISO();
    state.knownFiles = getKnownFiles();
    persist();
    syncPresence();
    pushLog("OK", "factory_ai_code_reader ready ✅ " + VERSION);
    return status();
  }

  global.RCF_FACTORY_AI_CODE_READER = {
    __v100: true,
    version: VERSION,
    init: init,
    status: status,
    scanFactory: scanFactory,
    readFile: readFile,
    explainFile: explainFile,
    findFiles: findFiles,
    getFileMap: getFileMap,
    getReadableMap: getReadableMap,
    buildReaderSnapshot: buildReaderSnapshot,
    getState: function () { return clone(state); }
  };

  try { init(); } catch (_) {}

})(window);
