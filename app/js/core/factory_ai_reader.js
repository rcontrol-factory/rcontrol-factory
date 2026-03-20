/* FILE: /app/js/core/factory_ai_code_reader.js
   RControl Factory — Factory AI Code Reader
   v1.0.0 READ-ONLY INTERNAL CODE READER + VFS/TREE/CONTEXT FALLBACKS

   Objetivo:
   - dar leitura interna real READ-ONLY para a Factory AI
   - permitir listar arquivos, checar existência, ler conteúdo, resumir e inspecionar arquivos
   - usar VFS/tree/context/local caches como fontes de leitura
   - NÃO escrever
   - NÃO aplicar patch
   - NÃO alterar arquivos
   - funcionar como script clássico

   API pública:
   - status()
   - listFiles({ prefix, contains, limit })
   - exists(path)
   - readFile(path, { cache, limit })
   - summarizeFile(path, { cache })
   - inspectTarget(path, { cache })
   - summarizeMany(paths, { limit, cache })

   Fontes tentadas:
   - RCF_VFS / RCF_RUNTIME_VFS / __RCF_VFS_RUNTIME
   - factory_tree / context_engine
   - localStorage caches conhecidos
   - memória local do reader
*/

;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_READER && global.RCF_FACTORY_AI_READER.__v100) return;

  var VERSION = "v1.0.0";
  var STORAGE_KEY = "rcf:factory_ai_code_reader";
  var CACHE_KEY = "rcf:factory_ai_code_reader_cache";
  var MAX_HISTORY = 120;
  var MAX_CACHE_ITEMS = 80;
  var DEFAULT_READ_LIMIT = 120000;
  var DEFAULT_LIST_LIMIT = 120;
  var DEFAULT_MANY_LIMIT = 6;

  var state = {
    version: VERSION,
    ready: false,
    lastUpdate: null,
    lastAction: "",
    lastPath: "",
    lastSource: "",
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

  function safe(fn, fallback) {
    try {
      var v = fn();
      return v === undefined ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  function trimText(v) {
    return String(v == null ? "" : v).trim();
  }

  function lower(v) {
    return trimText(v).toLowerCase();
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

  function normalizeFilePath(path) {
    var p = trimText(path || "").replace(/\\/g, "/");
    if (!p) return "";
    if (p.charAt(0) !== "/") p = "/" + p;
    p = p.replace(/\/{2,}/g, "/");
    return p;
  }

  function persist() {
    try {
      state.lastUpdate = nowISO();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: VERSION,
        ready: !!state.ready,
        lastUpdate: state.lastUpdate || null,
        lastAction: state.lastAction || "",
        lastPath: state.lastPath || "",
        lastSource: state.lastSource || "",
        history: asArray(state.history).slice(-MAX_HISTORY)
      }));

      localStorage.setItem(CACHE_KEY, JSON.stringify(compactCache(state.cache || {})));
      return true;
    } catch (_) {
      return false;
    }
  }

  function compactCache(cacheObj) {
    var src = cacheObj && typeof cacheObj === "object" ? cacheObj : {};
    var keys = Object.keys(src);
    keys.sort(function (a, b) {
      var ta = Date.parse(safe(function () { return src[a].ts; }, "")) || 0;
      var tb = Date.parse(safe(function () { return src[b].ts; }, "")) || 0;
      return tb - ta;
    });

    var out = {};
    keys.slice(0, MAX_CACHE_ITEMS).forEach(function (k) {
      out[k] = src[k];
    });

    return out;
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
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          state = merge(clone(state), parsed);
        }
      }
    } catch (_) {}

    try {
      var rawCache = localStorage.getItem(CACHE_KEY);
      if (rawCache) {
        var parsedCache = JSON.parse(rawCache);
        if (parsedCache && typeof parsedCache === "object") {
          state.cache = compactCache(parsedCache);
        }
      }
    } catch (_) {}

    if (!Array.isArray(state.history)) state.history = [];
    if (!state.cache || typeof state.cache !== "object") state.cache = {};
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

  function pushHistory(entry) {
    if (!Array.isArray(state.history)) state.history = [];
    state.history.push(clone(entry || {}));
    if (state.history.length > MAX_HISTORY) {
      state.history = state.history.slice(-MAX_HISTORY);
    }
    persist();
  }

  function rememberAction(name, path, source, extra) {
    state.lastAction = trimText(name || "");
    state.lastPath = normalizeFilePath(path || "");
    state.lastSource = trimText(source || "");
    pushHistory({
      ts: nowISO(),
      action: state.lastAction,
      path: state.lastPath,
      source: state.lastSource,
      extra: clone(extra || {})
    });
    persist();
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

  function getTreeAllPaths() {
    return safe(function () {
      if (global.RCF_FACTORY_TREE?.getAllPaths) return global.RCF_FACTORY_TREE.getAllPaths() || [];
      return [];
    }, []);
  }

  function getCandidateFiles() {
    var snap = getContextSnapshot();
    var out = [];

    try {
      if (Array.isArray(snap.candidateFiles)) out = out.concat(snap.candidateFiles);
    } catch (_) {}

    try {
      var tree = snap.tree || {};
      if (Array.isArray(tree.samples)) out = out.concat(tree.samples);

      var groups = tree.pathGroups || {};
      Object.keys(groups).forEach(function (k) {
        if (Array.isArray(groups[k])) out = out.concat(groups[k]);
      });
    } catch (_) {}

    out = out.concat(getTreeAllPaths());

    return uniq(out.map(normalizeFilePath).filter(Boolean));
  }

  function tryVFSRead(path) {
    var target = normalizeFilePath(path);
    if (!target) return null;

    var candidates = [
      safe(function () { return global.RCF_VFS; }, null),
      safe(function () { return global.RCF_RUNTIME_VFS; }, null),
      safe(function () { return global.__RCF_VFS_RUNTIME; }, null),
      safe(function () { return global.RCF_RUNTIME && global.RCF_RUNTIME.vfs; }, null),
      safe(function () { return global.RCF_VFS_OVERRIDES; }, null)
    ];

    for (var i = 0; i < candidates.length; i++) {
      var vfs = candidates[i];
      if (!vfs) continue;

      try {
        if (typeof vfs.readFile === "function") {
          var a = vfs.readFile(target);
          if (typeof a === "string" && a.length) {
            return { ok: true, source: "vfs.readFile", text: a };
          }
        }
      } catch (_) {}

      try {
        if (typeof vfs.get === "function") {
          var b = vfs.get(target);
          if (typeof b === "string" && b.length) {
            return { ok: true, source: "vfs.get", text: b };
          }
          if (b && typeof b === "object") {
            if (typeof b.content === "string") return { ok: true, source: "vfs.get.content", text: b.content };
            if (typeof b.text === "string") return { ok: true, source: "vfs.get.text", text: b.text };
            if (typeof b.code === "string") return { ok: true, source: "vfs.get.code", text: b.code };
          }
        }
      } catch (_) {}

      try {
        if (typeof vfs.read === "function") {
          var c = vfs.read(target);
          if (typeof c === "string" && c.length) {
            return { ok: true, source: "vfs.read", text: c };
          }
          if (c && typeof c === "object") {
            if (typeof c.content === "string") return { ok: true, source: "vfs.read.content", text: c.content };
            if (typeof c.text === "string") return { ok: true, source: "vfs.read.text", text: c.text };
          }
        }
      } catch (_) {}

      try {
        if (vfs.files && typeof vfs.files === "object") {
          var direct = vfs.files[target] || vfs.files[target.replace(/^\//, "")];
          if (typeof direct === "string" && direct.length) {
            return { ok: true, source: "vfs.files", text: direct };
          }
          if (direct && typeof direct === "object") {
            if (typeof direct.content === "string") return { ok: true, source: "vfs.files.content", text: direct.content };
            if (typeof direct.text === "string") return { ok: true, source: "vfs.files.text", text: direct.text };
          }
        }
      } catch (_) {}
    }

    return null;
  }

  function tryLocalStorageRead(path) {
    var target = normalizeFilePath(path);
    if (!target) return null;

    var keys = [
      "rcf:file:" + target,
      "rcf:vfs:" + target,
      "rcf:runtime_file:" + target,
      "rcf:override:" + target,
      "rcf:code:" + target
    ];

    for (var i = 0; i < keys.length; i++) {
      try {
        var raw = localStorage.getItem(keys[i]);
        if (!raw) continue;

        if (typeof raw === "string" && raw.length) {
          if (raw.charAt(0) === "{" || raw.charAt(0) === "[") {
            try {
              var parsed = JSON.parse(raw);
              if (typeof parsed === "string") {
                return { ok: true, source: "localStorage.json-string:" + keys[i], text: parsed };
              }
              if (parsed && typeof parsed === "object") {
                if (typeof parsed.content === "string") return { ok: true, source: "localStorage.content:" + keys[i], text: parsed.content };
                if (typeof parsed.text === "string") return { ok: true, source: "localStorage.text:" + keys[i], text: parsed.text };
                if (typeof parsed.code === "string") return { ok: true, source: "localStorage.code:" + keys[i], text: parsed.code };
              }
            } catch (_) {}
          }

          return { ok: true, source: "localStorage:" + keys[i], text: raw };
        }
      } catch (_) {}
    }

    return null;
  }

  function getCached(path) {
    var target = normalizeFilePath(path);
    if (!target) return null;

    var item = safe(function () { return state.cache[target]; }, null);
    if (!item || typeof item !== "object") return null;
    if (typeof item.text !== "string" || !item.text.length) return null;

    return {
      ok: true,
      source: item.source || "cache",
      text: item.text,
      cached: true,
      ts: item.ts || ""
    };
  }

  function setCached(path, source, text) {
    var target = normalizeFilePath(path);
    if (!target || typeof text !== "string" || !text.length) return false;

    if (!state.cache || typeof state.cache !== "object") state.cache = {};
    state.cache[target] = {
      ts: nowISO(),
      source: trimText(source || "unknown"),
      text: text
    };
    state.cache = compactCache(state.cache);
    persist();
    return true;
  }

  function inferKind(path) {
    var p = lower(path);
    if (!p) return "unknown";
    if (p.indexOf(".js") > -1) return "javascript";
    if (p.indexOf(".html") > -1) return "html";
    if (p.indexOf(".css") > -1) return "css";
    if (p.indexOf(".json") > -1) return "json";
    if (p.indexOf(".md") > -1) return "markdown";
    return "text";
  }

  function summarizeContent(text, path) {
    var src = String(text || "");
    var lines = src.split("\n");
    var imports = [];
    var exportsLike = [];
    var functions = [];
    var apiSurface = [];
    var events = [];
    var globals = [];

    lines.forEach(function (line) {
      var t = trimText(line);

      if (/^import\s+/.test(t)) imports.push(t);
      if (/^export\s+/.test(t)) exportsLike.push(t);

      if (/function\s+([A-Za-z0-9_$]+)\s*\(/.test(t)) {
        functions.push((t.match(/function\s+([A-Za-z0-9_$]+)\s*\(/) || [])[1] || "");
      }

      if (/([A-Za-z0-9_$]+)\s*:\s*function\s*\(/.test(t)) {
        apiSurface.push((t.match(/([A-Za-z0-9_$]+)\s*:\s*function\s*\(/) || [])[1] || "");
      }

      if (/([A-Za-z0-9_$]+)\s*=\s*function\s*\(/.test(t)) {
        apiSurface.push((t.match(/([A-Za-z0-9_$]+)\s*=\s*function\s*\(/) || [])[1] || "");
      }

      if (/addEventListener\s*\(\s*["']([^"']+)["']/.test(t)) {
        events.push((t.match(/addEventListener\s*\(\s*["']([^"']+)["']/) || [])[1] || "");
      }

      if (/global\.([A-Za-z0-9_$]+)/.test(t)) {
        globals.push((t.match(/global\.([A-Za-z0-9_$]+)/) || [])[1] || "");
      }

      if (/window\.([A-Za-z0-9_$]+)/.test(t)) {
        globals.push((t.match(/window\.([A-Za-z0-9_$]+)/) || [])[1] || "");
      }
    });

    return {
      path: normalizeFilePath(path),
      kind: inferKind(path),
      chars: src.length,
      lines: lines.length,
      head: lines.slice(0, 8).join("\n"),
      imports: uniq(imports).slice(0, 20),
      exportsLike: uniq(exportsLike).slice(0, 20),
      functions: uniq(functions.filter(Boolean)).slice(0, 40),
      apiSurface: uniq(apiSurface.filter(Boolean)).slice(0, 40),
      events: uniq(events.filter(Boolean)).slice(0, 30),
      globals: uniq(globals.filter(Boolean)).slice(0, 40)
    };
  }

  async function exists(path) {
    var target = normalizeFilePath(path);
    if (!target) {
      var fail = { ok: false, exists: false, path: "", msg: "path vazio" };
      rememberAction("exists", path, "", fail);
      return fail;
    }

    var files = getCandidateFiles();
    if (files.indexOf(target) >= 0) {
      var hit = { ok: true, exists: true, path: target, source: "context/tree" };
      rememberAction("exists", target, "context/tree", hit);
      return hit;
    }

    var cacheHit = getCached(target);
    if (cacheHit && cacheHit.text) {
      var cached = { ok: true, exists: true, path: target, source: "cache" };
      rememberAction("exists", target, "cache", cached);
      return cached;
    }

    var vfsHit = tryVFSRead(target);
    if (vfsHit && typeof vfsHit.text === "string") {
      setCached(target, vfsHit.source, vfsHit.text);
      var viaVfs = { ok: true, exists: true, path: target, source: vfsHit.source };
      rememberAction("exists", target, vfsHit.source, viaVfs);
      return viaVfs;
    }

    var lsHit = tryLocalStorageRead(target);
    if (lsHit && typeof lsHit.text === "string") {
      setCached(target, lsHit.source, lsHit.text);
      var viaLS = { ok: true, exists: true, path: target, source: lsHit.source };
      rememberAction("exists", target, lsHit.source, viaLS);
      return viaLS;
    }

    var miss = { ok: true, exists: false, path: target, source: "" };
    rememberAction("exists", target, "", miss);
    return miss;
  }

  async function readFile(path, opts) {
    var options = opts && typeof opts === "object" ? opts : {};
    var target = normalizeFilePath(path);
    var useCache = options.cache !== false;
    var limit = Math.max(0, Number(options.limit || DEFAULT_READ_LIMIT) || DEFAULT_READ_LIMIT);

    if (!target) {
      var fail = { ok: false, path: "", msg: "path vazio" };
      rememberAction("readFile", path, "", fail);
      return fail;
    }

    if (useCache) {
      var cached = getCached(target);
      if (cached && typeof cached.text === "string") {
        var cachedText = limit > 0 ? cached.text.slice(0, limit) : cached.text;
        var cacheResult = {
          ok: true,
          path: target,
          source: "cache",
          cached: true,
          text: cachedText,
          fullLength: cached.text.length,
          truncated: cachedText.length < cached.text.length
        };
        rememberAction("readFile", target, "cache", {
          chars: cacheResult.text.length,
          truncated: cacheResult.truncated
        });
        return cacheResult;
      }
    }

    var vfsHit = tryVFSRead(target);
    if (vfsHit && typeof vfsHit.text === "string") {
      setCached(target, vfsHit.source, vfsHit.text);
      var vfsText = limit > 0 ? vfsHit.text.slice(0, limit) : vfsHit.text;
      var vfsResult = {
        ok: true,
        path: target,
        source: vfsHit.source,
        cached: false,
        text: vfsText,
        fullLength: vfsHit.text.length,
        truncated: vfsText.length < vfsHit.text.length
      };
      rememberAction("readFile", target, vfsHit.source, {
        chars: vfsResult.text.length,
        truncated: vfsResult.truncated
      });
      return vfsResult;
    }

    var lsHit = tryLocalStorageRead(target);
    if (lsHit && typeof lsHit.text === "string") {
      setCached(target, lsHit.source, lsHit.text);
      var lsText = limit > 0 ? lsHit.text.slice(0, limit) : lsHit.text;
      var lsResult = {
        ok: true,
        path: target,
        source: lsHit.source,
        cached: false,
        text: lsText,
        fullLength: lsHit.text.length,
        truncated: lsText.length < lsHit.text.length
      };
      rememberAction("readFile", target, lsHit.source, {
        chars: lsResult.text.length,
        truncated: lsResult.truncated
      });
      return lsResult;
    }

    var failRead = {
      ok: false,
      path: target,
      source: "",
      msg: "arquivo não encontrado em fontes legíveis do runtime"
    };
    rememberAction("readFile", target, "", failRead);
    return failRead;
  }

  async function summarizeFile(path, opts) {
    var target = normalizeFilePath(path);
    var read = await readFile(target, opts || {});
    if (!read.ok) {
      var fail = {
        ok: false,
        path: target,
        msg: read.msg || "falha ao ler arquivo"
      };
      rememberAction("summarizeFile", target, read.source || "", fail);
      return fail;
    }

    var summary = summarizeContent(read.text, target);
    var result = {
      ok: true,
      path: target,
      source: read.source || "",
      summary: summary
    };

    rememberAction("summarizeFile", target, read.source || "", {
      lines: summary.lines,
      kind: summary.kind
    });
    return result;
  }

  async function inspectTarget(path, opts) {
    var target = normalizeFilePath(path);
    var read = await readFile(target, opts || {});
    if (!read.ok) {
      var fail = {
        ok: false,
        path: target,
        msg: read.msg || "falha ao ler arquivo"
      };
      rememberAction("inspectTarget", target, read.source || "", fail);
      return fail;
    }

    var summary = summarizeContent(read.text, target);
    var lines = String(read.text || "").split("\n");
    var result = {
      ok: true,
      path: target,
      source: read.source || "",
      summary: {
        kind: summary.kind,
        chars: summary.chars,
        lines: summary.lines,
        functions: summary.functions,
        apiSurface: summary.apiSurface,
        events: summary.events,
        globals: summary.globals,
        firstLines: lines.slice(0, 20),
        lastLines: lines.slice(Math.max(0, lines.length - 20))
      }
    };

    rememberAction("inspectTarget", target, read.source || "", {
      lines: summary.lines,
      apiSurface: summary.apiSurface.length
    });
    return result;
  }

  async function summarizeMany(paths, opts) {
    var options = opts && typeof opts === "object" ? opts : {};
    var list = asArray(paths).map(normalizeFilePath).filter(Boolean);
    var limit = Math.max(1, Number(options.limit || DEFAULT_MANY_LIMIT) || DEFAULT_MANY_LIMIT);

    if (!list.length) {
      list = getCandidateFiles().slice(0, limit);
    }

    list = list.slice(0, limit);

    var results = [];
    for (var i = 0; i < list.length; i++) {
      results.push(await summarizeFile(list[i], { cache: options.cache !== false }));
    }

    var okCount = results.filter(function (x) { return !!x && !!x.ok; }).length;

    var out = {
      ok: true,
      count: results.length,
      okCount: okCount,
      items: results
    };

    rememberAction("summarizeMany", list.join(","), "mixed", {
      count: results.length,
      okCount: okCount
    });
    return out;
  }

  function listFiles(opts) {
    var options = opts && typeof opts === "object" ? opts : {};
    var prefix = normalizeFilePath(options.prefix || "");
    var contains = lower(options.contains || "");
    var limit = Math.max(1, Number(options.limit || DEFAULT_LIST_LIMIT) || DEFAULT_LIST_LIMIT);

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

    var result = {
      ok: true,
      count: files.length,
      items: files.slice(0, limit)
    };

    rememberAction("listFiles", prefix || contains || "", "context/tree", {
      count: result.count,
      returned: result.items.length
    });
    return result;
  }

  function status() {
    return {
      version: VERSION,
      ready: !!state.ready,
      lastUpdate: state.lastUpdate || null,
      lastAction: state.lastAction || "",
      lastPath: state.lastPath || "",
      lastSource: state.lastSource || "",
      historyCount: asArray(state.history).length,
      cacheCount: Object.keys(state.cache || {}).length,
      canListFiles: true,
      canExists: true,
      canReadFile: true,
      canSummarizeFile: true,
      canInspectTarget: true,
      canSummarizeMany: true,
      readOnly: true
    };
  }

  function init() {
    load();
    state.ready = true;
    state.version = VERSION;
    state.lastUpdate = nowISO();
    persist();
    syncPresence();
    pushLog("OK", "factory_ai_code_reader ready ✅ " + VERSION);
    return status();
  }

  global.RCF_FACTORY_AI_READER = {
    __v100: true,
    version: VERSION,
    init: init,
    status: status,
    listFiles: listFiles,
    exists: exists,
    readFile: readFile,
    summarizeFile: summarizeFile,
    inspectTarget: inspectTarget,
    summarizeMany: summarizeMany,
    getState: function () { return clone(state); }
  };

  try { init(); } catch (_) {}

})(window);
