/* =========================================================
  RCF — app/js/core/github_sync.js
  GitHub Contents API (SAFE helper)
  - cfg via localStorage: "RCF_GH_CFG"
    { owner, repo, branch, path, token }

  API:
    window.RCF_GH_SYNC.saveCfg(cfg)
    window.RCF_GH_SYNC.loadCfg()
    window.RCF_GH_SYNC.peekRemote() -> {ok, sha, url}
    window.RCF_GH_SYNC.pullJson() -> {ok, sha, json}
    window.RCF_GH_SYNC.pushJson(json, message) -> {ok, sha}
========================================================= */

(function () {
  "use strict";

  const LS_KEY = "RCF_GH_CFG";

  function b64ToUtf8(b64) {
    // base64 -> utf8 (iOS safe)
    const bin = atob(String(b64 || "").replace(/\s/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    try { return new TextDecoder("utf-8").decode(bytes); }
    catch { // fallback
      let s = "";
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return decodeURIComponent(escape(s));
    }
  }

  function utf8ToB64(str) {
    // utf8 -> base64 (iOS safe)
    const s = String(str ?? "");
    try {
      const bytes = new TextEncoder().encode(s);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    } catch {
      return btoa(unescape(encodeURIComponent(s)));
    }
  }

  function cleanCfg(cfg) {
    const c = cfg && typeof cfg === "object" ? cfg : {};
    return {
      owner: String(c.owner || "").trim(),
      repo: String(c.repo || "").trim(),
      branch: String(c.branch || "main").trim(),
      path: String(c.path || "app/import/mother_bundle.json").trim(),
      token: String(c.token || "").trim()
    };
  }

  function saveCfg(cfg) {
    const c = cleanCfg(cfg);
    localStorage.setItem(LS_KEY, JSON.stringify(c));
    return c;
  }

  function loadCfg() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return cleanCfg({});
      return cleanCfg(JSON.parse(raw));
    } catch {
      return cleanCfg({});
    }
  }

  function hasCfg(cfg) {
    const c = cleanCfg(cfg);
    return !!(c.owner && c.repo && c.branch && c.path && c.token);
  }

  function apiUrl(cfg) {
    const c = cleanCfg(cfg);
    // NOTE: path precisa estar URL-encoded corretamente
    const p = encodeURIComponent(c.path).replace(/%2F/g, "/");
    return `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${p}?ref=${encodeURIComponent(c.branch)}`;
  }

  async function ghFetch(cfg, url, opts) {
    const c = cleanCfg(cfg);
    const headers = {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + c.token
    };
    const res = await fetch(url, {
      method: opts?.method || "GET",
      headers: { ...headers, ...(opts?.headers || {}) },
      body: opts?.body ? JSON.stringify(opts.body) : undefined
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    if (!res.ok) {
      const msg = (json && (json.message || json.error)) ? (json.message || json.error) : ("HTTP " + res.status);
      return { ok: false, status: res.status, msg, raw: text };
    }
    return { ok: true, status: res.status, json: json || {} };
  }

  async function peekRemote(cfg) {
    const c = cleanCfg(cfg);
    if (!hasCfg(c)) return { ok: false, msg: "Config GitHub incompleta." };
    const url = apiUrl(c);
    const r = await ghFetch(c, url);
    if (!r.ok) return r;
    const sha = r.json?.sha || "";
    return { ok: true, sha, url };
  }

  async function pullJson(cfg) {
    const c = cleanCfg(cfg);
    if (!hasCfg(c)) return { ok: false, msg: "Config GitHub incompleta." };

    const url = apiUrl(c);
    const r = await ghFetch(c, url);
    if (!r.ok) return r;

    const sha = r.json?.sha || "";
    const content = r.json?.content || "";
    if (!content) return { ok: false, msg: "Arquivo vazio/sem content no GitHub." };

    const txt = b64ToUtf8(content);
    let parsed = null;
    try { parsed = JSON.parse(txt); } catch (e) {
      return { ok: false, msg: "JSON inválido no GitHub: " + (e?.message || String(e)) };
    }
    return { ok: true, sha, json: parsed };
  }

  async function pushJson(cfg, jsonObj, message) {
    const c = cleanCfg(cfg);
    if (!hasCfg(c)) return { ok: false, msg: "Config GitHub incompleta." };

    // pega sha atual (se existir)
    const peek = await peekRemote(c);
    const currentSha = peek.ok ? (peek.sha || null) : null;

    const url = apiUrl(c);
    const txt = JSON.stringify(jsonObj, null, 2);
    const body = {
      message: String(message || "RCF: update mother_bundle.json"),
      content: utf8ToB64(txt),
      branch: c.branch
    };
    if (currentSha) body.sha = currentSha;

    const r = await ghFetch(c, url, { method: "PUT", body });
    if (!r.ok) return r;

    const newSha = r.json?.content?.sha || r.json?.sha || "";
    return { ok: true, sha: newSha, json: r.json };
  }

  window.RCF_GH_SYNC = {
    saveCfg,
    loadCfg,
    peekRemote: () => peekRemote(loadCfg()),
    pullJson: () => pullJson(loadCfg()),
    pushJson: (jsonObj, message) => pushJson(loadCfg(), jsonObj, message)
  };
})();
