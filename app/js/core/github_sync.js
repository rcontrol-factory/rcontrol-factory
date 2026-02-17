/* RControl Factory — /app/js/core/github_sync.js — v2.4f FINAL STABLE */
(() => {
  "use strict";

  if (window.RCF_GH_SYNC && window.RCF_GH_SYNC.__v24f) return;

  const LS_CFG_KEY = "rcf:ghcfg";
  const API_BASE = "https://api.github.com";
  const FIXED_BUNDLE_PATH = "app/import/mother_bundle.json";

  const log = (lvl, msg, obj) => {
    try {
      if (obj !== undefined) {
        window.RCF_LOGGER?.push?.(lvl, msg + " " + JSON.stringify(obj));
      } else {
        window.RCF_LOGGER?.push?.(lvl, msg);
      }
    } catch {}
    try { console.log("[GH]", lvl, msg, obj ?? ""); } catch {}
  };

  function safeParse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; }
    catch { return fallback; }
  }

  function normalizeBundlePath(input) {
    const raw = String(input || "").trim();
    return {
      raw,
      normalized: FIXED_BUNDLE_PATH
    };
  }

  function loadConfig() {
    const c = safeParse(localStorage.getItem(LS_CFG_KEY), {}) || {};
    const norm = normalizeBundlePath(c.path || FIXED_BUNDLE_PATH);

    const cfg = {
      owner: String(c.owner || "").trim(),
      repo: String(c.repo || "").trim(),
      branch: String(c.branch || "main").trim(),
      path: norm.normalized,
      token: String(c.token || "").trim()
    };

    log("info", "bundle path normalized", {
      raw: norm.raw,
      path: cfg.path,
      fixed: true
    });

    return cfg;
  }

  function saveConfig(cfg) {
    const inCfg = cfg || {};
    const norm = normalizeBundlePath(inCfg.path || FIXED_BUNDLE_PATH);

    const safe = {
      owner: String(inCfg.owner || "").trim(),
      repo: String(inCfg.repo || "").trim(),
      branch: String(inCfg.branch || "main").trim(),
      path: norm.normalized,
      token: String(inCfg.token || "").trim()
    };

    localStorage.setItem(LS_CFG_KEY, JSON.stringify(safe));
    log("ok", "OK: ghcfg saved");

    return safe;
  }

  function headers(cfg) {
    const h = { "Accept": "application/vnd.github+json" };
    if (cfg.token) {
      h["Authorization"] = "token " + cfg.token;
    }
    return h;
  }

  async function ghFetch(url, cfg, opts) {
    const res = await fetch(url, {
      method: opts?.method || "GET",
      headers: {
        ...headers(cfg),
        ...(opts?.headers || {})
      },
      body: opts?.body
    });

    const text = await res.text();

    if (!res.ok) {
      let msg = "HTTP " + res.status;
      try {
        const j = JSON.parse(text);
        if (j?.message) msg += ": " + j.message;
      } catch {}
      const err = new Error(msg);
      err.status = res.status;
      err.body = text;
      throw err;
    }

    return text;
  }

  function contentUrl(cfg) {
    if (!cfg.owner || !cfg.repo) {
      throw new Error("ghcfg incompleto (owner/repo)");
    }

    const branch = encodeURIComponent(cfg.branch || "main");

    return API_BASE +
      "/repos/" + encodeURIComponent(cfg.owner) +
      "/" + encodeURIComponent(cfg.repo) +
      "/contents/" + cfg.path +
      "?ref=" + branch;
  }

  function decodeB64Utf8(b64) {
    const clean = String(b64 || "").replace(/\n/g, "");
    let bin;
    try { bin = atob(clean); }
    catch { throw new Error("Falha ao decodificar base64"); }

    try { return decodeURIComponent(escape(bin)); }
    catch { return bin; }
  }

  function assertValidBundleJSON(txt, where) {
    let j;
    try { j = JSON.parse(txt); }
    catch {
      throw new Error("Bundle inválido (" + where + ")");
    }

    if (!j || typeof j !== "object") {
      throw new Error("Bundle não é objeto JSON (" + where + ")");
    }

    if (!Array.isArray(j.files)) {
      throw new Error("Bundle sem files[] (" + where + ")");
    }

    return j;
  }

  async function pull(cfgIn) {
    const cfg = saveConfig(cfgIn || loadConfig());
    const url = contentUrl(cfg);

    log("info", "GitHub: pull iniciando... path=" + cfg.path);

    const txt = await ghFetch(url, cfg, { method: "GET" });
    const j = safeParse(txt, null);

    if (Array.isArray(j)) {
      throw new Error("Path é diretório (array retornado)");
    }

    if (j && j.content) {
      const decoded = decodeB64Utf8(j.content);
      assertValidBundleJSON(decoded, "content");
      log("info", "GitHub: pull ok (content)");
      return decoded;
    }

    if (j && j.download_url) {
      const raw = await ghFetch(j.download_url, cfg, {
        method: "GET",
        headers: { "Accept": "application/vnd.github.raw" }
      });
      assertValidBundleJSON(raw, "download_url");
      log("info", "GitHub: pull ok (download_url)");
      return raw;
    }

    if (j && j.git_url) {
      const blobTxt = await ghFetch(j.git_url, cfg, { method: "GET" });
      const blob = safeParse(blobTxt, null);
      if (!blob?.content) {
        throw new Error("Blob inválido");
      }
      const decoded = decodeB64Utf8(blob.content);
      assertValidBundleJSON(decoded, "git_url");
      log("info", "GitHub: pull ok (git_url)");
      return decoded;
    }

    throw new Error("Resposta inválida do GitHub");
  }

  async function getShaIfExists(cfg) {
    try {
      const url = contentUrl(cfg);
      const txt = await ghFetch(url, cfg, { method: "GET" });
      const j = safeParse(txt, null);
      return j?.sha || null;
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  async function push(cfgIn, contentStr) {
    const cfg = saveConfig(cfgIn || loadConfig());

    assertValidBundleJSON(String(contentStr || ""), "push");

    const sha = await getShaIfExists(cfg);

    const url = API_BASE +
      "/repos/" + encodeURIComponent(cfg.owner) +
      "/" + encodeURIComponent(cfg.repo) +
      "/contents/" + cfg.path;

    const body = {
      message: "rcf: update " + cfg.path,
      content: btoa(unescape(encodeURIComponent(String(contentStr || "")))),
      branch: cfg.branch || "main"
    };

    if (sha) body.sha = sha;

    await ghFetch(url, cfg, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    log("info", "GitHub: push ok.");
    return { ok: true };
  }

  async function pushMotherBundle(cfgIn) {
    const cfg = saveConfig(cfgIn || loadConfig());

    if (!window.RCF_MAE?.getLocalBundleText) {
      throw new Error("RCF_MAE.getLocalBundleText ausente");
    }

    const bundleTxt = await window.RCF_MAE.getLocalBundleText();
    if (!bundleTxt) {
      throw new Error("Bundle local vazio");
    }

    assertValidBundleJSON(bundleTxt, "pushMotherBundle");

    await push(cfg, bundleTxt);

    log("ok", "GitHub: pushMotherBundle ok");
    return { ok: true };
  }

  window.RCF_GH_SYNC = {
    __v24f: true,
    loadConfig,
    saveConfig,
    pull,
    push,
    pushMotherBundle
  };

  log("info", "github_sync.js loaded (v2.4f)");
})();
