/* FILE: /app/js/core/factory_ai_reader.js
   RControl Factory — Factory AI Reader
   v1.0.0 READ-ONLY INTERNAL CODE READER + VFS/FETCH FALLBACK + SAFE SUMMARY

   Objetivo:
   - dar à Factory AI capacidade real de leitura interna read-only
   - listar arquivos conhecidos da Factory
   - verificar existência de arquivo
   - ler conteúdo textual real de arquivos
   - resumir estrutura básica de cada arquivo
   - ajudar planner/bridge/actions a decidir com base em código real
   - NÃO escrever, NÃO aplicar patch, NÃO alterar arquivos
   - funcionar como script clássico

   Funções principais:
   - listFiles(opts)
   - exists(path)
   - readFile(path, opts)
   - summarizeFile(path, opts)
   - summarizeMany(paths, opts)
   - inspectTarget(path, opts)
   - getState()
   - status()

   Fontes de leitura tentadas:
   - factory_tree / context candidateFiles
   - VFS/runtime readers conhecidos
   - fetch same-origin como fallback final
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_READER && global.RCF_FACTORY_AI_READER.__v100) return;

  var VERSION = "v1.0.0";
  var STORAGE_KEY = "rcf:factory_ai_reader";
  var MAX_HISTORY = 80;
  var MAX_CACHE = 40;
  var DEFAULT_READ_LIMIT = 120000;

  var state = {
    version: VERSION,
    ready: false,
    busy: false,
    lastUpdate: null,
    lastAction: "",
    lastPath: "",
    lastSource: "",
    lastReadOk: false,
    cache: {},
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
      out.push(item);
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

  function shortText(text, max) {
    var src = String(text || "");
    var lim = Math.max(40, Number(max || 0) || 0);
    if (!lim) return src;
    if (src.length <= lim) return src;
    return src.slice(0, lim) + "\n/* ...truncated... */";
  }

  function persist() {
    try {
      state.lastUpdate = nowISO();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: VERSION,
        ready: !!state.ready,
        busy: false,
        lastUpdate: state.lastUpdate || null,
        lastAction: state.lastAction || "",
        lastPath: state.lastPath || "",
        lastSource: state.lastSource || "",
        lastReadOk: !!state.lastReadOk,
        cache: pruneCache(clone(state.cache || {})),
        history: asArray(state.history).slice(-MAX_HISTORY)
      }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return false;

      state.version = VERSION;
      state.ready = !!parsed.ready;
      state.busy = false;
      state.lastUpdate = parsed.lastUpdate || null;
      state.lastAction = trimText(parsed.lastAction || "");
      state.lastPath = trimText(parsed.lastPath || "");
      state.lastSource = trimText(parsed.lastSource || "");
      state.lastReadOk = !!parsed.lastReadOk;
      state.cache = parsed.cache && typeof parsed.cache === "object" ? parsed.cache : {};
      state.history = asArray(parsed.history).slice(-MAX_HISTORY);

      return true;
    } catch (_) {
      return false;
    }
  }

  function pruneCache(cacheObj) {
    var cache = cacheObj && typeof cacheObj === "object" ? cacheObj : {};
    var keys = Object.keys(cache);

    if (keys.length <= MAX_CACHE) return cache;

    keys.sort(function (a, b) {
      var ta = safe(function () { return Date.parse(cache[a].ts || ""); }, 0) || 0;
      var tb = safe(function () { return Date.parse(cache[b].ts || ""); }, 0) || 0;
      return tb - ta;
    });

    var out = {};
    keys.slice(0, MAX_CACHE).forEach(function (k) {
      out[k] = cache[k];
    });
    return out;
  }

  function pushLog(level, msg, extra) {
    try {
      if (extra !== undefined) {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_READER] " + msg + " " + JSON.stringify(extra));
      } else {
        global.RCF_LOGGER?.push?.(level, "[FACTORY_AI_READER] " + msg);
      }
    } catch (_) {}

    try { console.log("[FACTORY_AI_READER]", level, msg, extra || ""); } catch (_) {}
  }

  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function pushHistory(entry) {
    state.history.push(clone(entry || {}));
    if (state.history.length > MAX_HISTORY) {
      state.history = state.history.slice(-MAX_HISTORY);
    }
    persist();
  }

  function markAction(name, path, ok, source, extra) {
    state.lastAction = trimText(name || "");
    state.lastPath = normalizePath(path || "");
    state.lastReadOk = !!ok;
    state.lastSource = trimText(source || "");

    pushHistory({
      ts: nowISO(),
      action: state.lastAction,
      path: state.lastPath,
      ok: !!ok,
      source: state.lastSource,
      extra: clone(extra || {})
    });
  }

  function syncPresence() {
    try {
      if (global.RCF_FACTORY_STATE?.registerModule) {
        global.RCF_FACTORY_STATE.registerModule("factoryAIReader");
      } else if (global.RCF_FACTORY_STATE?.setModule) {
        global.RCF_FACTORY_STATE.setModule("factoryAIReader", true);
      }
    } catch (_) {}

    try {
      if (global.RCF_MODULE_REGISTRY?.register) {
        global.RCF_MODULE_REGISTRY.register("factoryAIReader");
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
        return asArray(global.RCF_FACTORY_TREE.getAllPaths()).map(normalizePath).filter(Boolean);
      }
      return [];
    }, []);
  }

  function getCandidateFiles() {
    var snap = getContextSnapshot();
    var out = [];

    out = out
      .concat(asArray(safe(function () { return snap.candidateFiles; }, [])))
      .concat(asArray(safe(function () { return snap.tree.samples; }, [])))
      .concat(asArray(safe(function () { return snap.tree.pathGroups.core; }, [])))
      .concat(asArray(safe(function () { return snap.tree.pathGroups.ui; }, [])))
      .concat(asArray(safe(function () { return snap.tree.pathGroups.admin; }, [])))
      .concat(asArray(safe(function () { return snap.tree.pathGroups.engine; }, [])))
      .concat(asArray(safe(function () { return snap.tree.pathGroups.functions; }, [])))
      .concat(getTreePaths());

    return uniq(out.map(normalizePath).filter(Boolean));
  }

  function listFiles(opts) {
    var options = opts && typeof opts === "object" ? opts : {};
    var prefix = normalizePath(options.prefix || "");
    var contains = lower(options.contains || "");
    var limit = Math.max(1, Number(options.limit || 200) || 200);

    var files = getCandidateFiles();

    if (prefix) {
      files = files.filter(function (p) {
        return p.indexOf(prefix) === 0;
      });
    }

    if (contains) {
      files = files.filter(function (p) {
        return lower(p).indexOf(contains) >= 0;
      });
    }

    files = files.slice(0, limit);

    markAction("listFiles", prefix || contains || "*", true, "context/tree", {
      count: files.length
    });

    return {
      ok: true,
      files: files,
      count: files.length,
      source: "context/tree"
    };
  }

  function getReaderCandidates() {
    return [
      {
        name: "RCF_RUNTIME_VFS",
        api: safe(function () { return global.RCF_RUNTIME_VFS; }, null)
      },
      {
        name: "RCF_VFS",
        api: safe(function () { return global.RCF_VFS; }, null)
      },
      {
        name: "__RCF_VFS",
        api: safe(function () { return global.__RCF_VFS; }, null)
      },
      {
        name: "RCF_FS",
        api: safe(function () { return global.RCF_FS; }, null)
      },
      {
        name: "RCF_VIRTUAL_FS",
        api: safe(function () { return global.RCF_VIRTUAL_FS; }, null)
      }
    ].filter(function (x) { return !!x.api; });
  }

  async function tryReadFromApi(path, apiName, api) {
    var p = normalizePath(path);
    if (!api || !p) return { ok: false };

    try {
      if (typeof api.readText === "function") {
        var a = await api.readText(p);
        if (a != null) return { ok: true, text: String(a), source: apiName + ".readText" };
      }
    } catch (_) {}

    try {
      if (typeof api.readFile === "function") {
        var b = await api.readFile(p);
        if (typeof b === "string") return { ok: true, text: b, source: apiName + ".readFile" };
        if (b && typeof b.text === "string") return { ok: true, text: b.text, source: apiName + ".readFile" };
        if (b && typeof b.content === "string") return { ok: true, text: b.content, source: apiName + ".readFile" };
      }
    } catch (_) {}

    try {
      if (typeof api.read === "function") {
        var c = await api.read(p);
        if (typeof c === "string") return { ok: true, text: c, source: apiName + ".read" };
        if (c && typeof c.text === "string") return { ok: true, text: c.text, source: apiName + ".read" };
        if (c && typeof c.content === "string") return { ok: true, text: c.content, source: apiName + ".read" };
      }
    } catch (_) {}

    try {
      if (typeof api.get === "function") {
        var d = await api.get(p);
        if (typeof d === "string") return { ok: true, text: d, source: apiName + ".get" };
        if (d && typeof d.text === "string") return { ok: true, text: d.text, source: apiName + ".get" };
        if (d && typeof d.content === "string") return { ok: true, text: d.content, source: apiName + ".get" };
      }
    } catch (_) {}

    try {
      if (typeof api.cat === "function") {
        var e = await api.cat(p);
        if (e != null) return { ok: true, text: String(e), source: apiName + ".cat" };
      }
    } catch (_) {}

    return { ok: false };
  }

  async function tryReadFromFetch(path) {
    var p = normalizePath(path);
    if (!p) return { ok: false };

    try {
      var res = await fetch(p, { method: "GET", cache: "no-store" });
      if (!res || !res.ok) return { ok: false };
      var text = await res.text();
      if (typeof text !== "string") return { ok: false };
      return { ok: true, text: text, source: "fetch" };
    } catch (_) {
      return { ok: false };
    }
  }

  async function readFile(path, opts) {
    var options = opts && typeof opts === "object" ? opts : {};
    var p = normalizePath(path);
    var useCache = options.cache !== false;
    var limit = Math.max(0, Number(options.limit || DEFAULT_READ_LIMIT) || DEFAULT_READ_LIMIT);
    var cacheHit = state.cache[p];

    if (!p) {
      markAction("readFile", path, false, "", { error: "invalid_path" });
      return {
        ok: false,
        path: "",
        error: "invalid_path"
      };
    }

    if (useCache && cacheHit && typeof cacheHit.text === "string") {
      markAction("readFile", p, true, "cache", { cached: true });
      return {
        ok: true,
        path: p,
        text: shortText(cacheHit.text, limit),
        fullLength: Number(cacheHit.fullLength || cacheHit.text.length || 0),
        truncated: limit > 0 ? cacheHit.text.length > limit : false,
        source: "cache",
        cached: true,
        ts: cacheHit.ts || null
      };
    }

    state.busy = true;
    persist();

    try {
      var readers = getReaderCandidates();
      var result = null;
      var i;

      for (i = 0; i < readers.length; i++) {
        result = await tryReadFromApi(p, readers[i].name, readers[i].api);
        if (result && result.ok) break;
      }

      if (!result || !result.ok) {
        result = await tryReadFromFetch(p);
      }

      if (!result || !result.ok || typeof result.text !== "string") {
        markAction("readFile", p, false, "", { error: "not_found_or_unreadable" });
        pushLog("WARN", "readFile falhou", { path: p });
        return {
          ok: false,
          path: p,
          error: "not_found_or_unreadable"
        };
      }

      var text = String(result.text || "");
      state.cache[p] = {
        ts: nowISO(),
        text: text,
        fullLength: text.length,
        source: result.source || ""
      };
      state.cache = pruneCache(state.cache);

      markAction("readFile", p, true, result.source || "", {
        length: text.length
      });

      pushLog("OK", "readFile ok", {
        path: p,
        source: result.source || "",
        length: text.length
      });

      return {
        ok: true,
        path: p,
        text: shortText(text, limit),
        fullLength: text.length,
        truncated: limit > 0 ? text.length > limit : false,
        source: result.source || "",
        cached: false,
        ts: nowISO()
      };
    } finally {
      state.busy = false;
      persist();
    }
  }

  async function exists(path) {
    var p = normalizePath(path);
    if (!p) {
      return { ok: false, exists: false, path: "" };
    }

    var known = getCandidateFiles().indexOf(p) >= 0;
    if (known) {
      markAction("exists", p, true, "context/tree", { known: true });
      return {
        ok: true,
        exists: true,
        path: p,
        source: "context/tree"
      };
    }

    var read = await readFile(p, { cache: true, limit: 256 });
    return {
      ok: !!read.ok,
      exists: !!read.ok,
      path: p,
      source: read.source || ""
    };
  }

  function collectMatches(regex, text, limit) {
    var out = [];
    var src = String(text || "");
    var max = Math.max(1, Number(limit || 20) || 20);
    var m;

    try {
      while ((m = regex.exec(src)) && out.length < max) {
        out.push(trimText(m[1] || m[0] || ""));
      }
    } catch (_) {}

    return uniq(out).filter(Boolean);
  }

  function estimateLanguage(path, text) {
    var p = lower(path);
    if (p.indexOf(".js") > 0) return "javascript";
    if (p.indexOf(".mjs") > 0) return "javascript";
    if (p.indexOf(".json") > 0) return "json";
    if (p.indexOf(".html") > 0) return "html";
    if (p.indexOf(".css") > 0) return "css";
    if (p.indexOf(".md") > 0) return "markdown";
    if (p.indexOf(".txt") > 0) return "text";

    var src = String(text || "");
    if (/^\s*<!doctype html/i.test(src) || /<html/i.test(src)) return "html";
    if (/^\s*\{[\s\S]*\}\s*$/.test(src)) return "json";
    return "text";
  }

  function buildFileSummary(path, text) {
    var src = String(text || "");
    var lines = src ? src.split("\n") : [];
    var topComment = "";
    var commentMatch = src.match(/\/\*[\s\S]*?\*\//);

    if (commentMatch) {
      topComment = trimText(commentMatch[0]).slice(0, 1200);
    }

    var functions = collectMatches(/function\s+([A-Za-z0-9_$]+)/g, src, 30);
    var asyncFunctions = collectMatches(/async\s+function\s+([A-Za-z0-9_$]+)/g, src, 20);
    var constFns = collectMatches(/const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(/g, src, 30);
    var arrowFns = collectMatches(/const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(?[^\n=]*?\)?\s*=>/g, src, 30);
    var classes = collectMatches(/class\s+([A-Za-z0-9_$]+)/g, src, 20);
    var events = collectMatches(/addEventListener\(\s*["']([^"']+)["']/g, src, 30);
    var customs = collectMatches(/CustomEvent\(\s*["']([^"']+)["']/g, src, 30);
    var globalsAssigned = collectMatches(/global\.([A-Za-z0-9_$]+)\s*=/g, src, 30);
    var windowAssigned = collectMatches(/window\.([A-Za-z0-9_$]+)\s*=/g, src, 30);
    var localStorageKeys = collectMatches(/localStorage\.(?:getItem|setItem)\(\s*["']([^"']+)["']/g, src, 30);
    var mentions = collectMatches(/\/(?:app|functions)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+/g, src, 40);

    var apiSurface = uniq(
      globalsAssigned
        .concat(windowAssigned)
        .filter(function (x) { return x.indexOf("RCF_") === 0; })
    );

    return {
      path: normalizePath(path),
      language: estimateLanguage(path, text),
      chars: src.length,
      lines: lines.length,
      nonEmptyLines: lines.filter(function (x) { return trimText(x); }).length,
      topComment: topComment,
      functions: uniq(functions.concat(asyncFunctions).concat(constFns).concat(arrowFns)).slice(0, 30),
      classes: classes.slice(0, 20),
      events: uniq(events.concat(customs)).slice(0, 30),
      apiSurface: apiSurface.slice(0, 30),
      localStorageKeys: localStorageKeys.slice(0, 30),
      relatedFiles: uniq(mentions).slice(0, 30),
      hasPatchWords: /patch|apply|stage|approve|reject/i.test(src),
      hasReadWords: /read|scan|summary|snapshot|context/i.test(src),
      hasWriteWords: /write|put\(|setItem|applyApprovedPlan|stageApprovedPlan/i.test(src)
    };
  }

  async function summarizeFile(path, opts) {
    var read = await readFile(path, mergeReadOptions(opts, { limit: DEFAULT_READ_LIMIT }));
    if (!read.ok) {
      markAction("summarizeFile", path, false, read.source || "", { error: read.error || "read_failed" });
      return {
        ok: false,
        path: normalizePath(path),
        error: read.error || "read_failed"
      };
    }

    var summary = buildFileSummary(read.path, read.text);
    markAction("summarizeFile", read.path, true, read.source || "", {
      lines: summary.lines
    });

    return {
      ok: true,
      path: read.path,
      source: read.source || "",
      summary: summary
    };
  }

  function mergeReadOptions(a, b) {
    var out = {};
    var x = a && typeof a === "object" ? a : {};
    var y = b && typeof b === "object" ? b : {};
    Object.keys(x).forEach(function (k) { out[k] = x[k]; });
    Object.keys(y).forEach(function (k) { out[k] = y[k]; });
    return out;
  }

  async function summarizeMany(paths, opts) {
    var list = uniq(asArray(paths).map(normalizePath).filter(Boolean));
    var limit = Math.max(1, Number(safe(function () { return opts.limit; }, 8) || 8));
    var out = [];
    var i;

    for (i = 0; i < list.length && out.length < limit; i++) {
      var item = await summarizeFile(list[i], opts || {});
      out.push(item);
    }

    markAction("summarizeMany", list[0] || "", true, "multi", {
      count: out.length
    });

    return {
      ok: true,
      count: out.length,
      items: out
    };
  }

  async function inspectTarget(path, opts) {
    var p = normalizePath(path);
    var read = await readFile(p, mergeReadOptions(opts, { limit: DEFAULT_READ_LIMIT }));
    if (!read.ok) return read;

    var summary = buildFileSummary(p, read.text);
    var previewHead = read.text.split("\n").slice(0, 80).join("\n");
    var previewTail = read.text.split("\n").slice(-40).join("\n");

    var result = {
      ok: true,
      path: p,
      source: read.source || "",
      summary: summary,
      previewHead: previewHead,
      previewTail: previewTail
    };

    markAction("inspectTarget", p, true, read.source || "", {
      lines: summary.lines,
      apiSurfaceCount: asArray(summary.apiSurface).length
    });

    emit("RCF:FACTORY_AI_READER_INSPECTED", {
      path: p,
      summary: clone(summary)
    });

    return result;
  }

  function getCacheKeys() {
    return Object.keys(state.cache || {}).slice(0, MAX_CACHE);
  }

  function getState() {
    return clone(state);
  }

  function status() {
    return {
      version: VERSION,
      ready: !!state.ready,
      busy: !!state.busy,
      lastUpdate: state.lastUpdate || null,
      lastAction: state.lastAction || "",
      lastPath: state.lastPath || "",
      lastSource: state.lastSource || "",
      lastReadOk: !!state.lastReadOk,
      knownFilesCount: getCandidateFiles().length,
      cacheCount: getCacheKeys().length,
      historyCount: asArray(state.history).length
    };
  }

  function init() {
    load();
    state.version = VERSION;
    state.ready = true;
    state.busy = false;
    persist();
    syncPresence();
    pushLog("OK", "factory_ai_reader ready ✅ " + VERSION, {
      knownFiles: getCandidateFiles().length
    });
    return status();
  }

  global.RCF_FACTORY_AI_READER = {
    __v100: true,
    version: VERSION,
    init: init,
    status: status,
    getState: getState,
    listFiles: listFiles,
    exists: exists,
    readFile: readFile,
    summarizeFile: summarizeFile,
    summarizeMany: summarizeMany,
    inspectTarget: inspectTarget
  };

  try { init(); } catch (_) {}

})(window);
