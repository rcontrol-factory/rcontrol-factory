/* =========================================================
  RControl Factory — /app/js/core/github_sync.js (v1)
  GitHub Sync PRIVADO (SAFE)
  - GET/PUT via GitHub Contents API
  - Usado pela Mãe para Pull/Push do mother_bundle.json
  - Não loga token
========================================================= */

(function () {
  "use strict";

  const LS_KEY = "RCF_GH_SYNC_CFG_v1";

  function safeJsonParse(s) {
    try { return JSON.parse(String(s || "")); } catch { return null; }
  }

  function getCfg() {
    const raw = localStorage.getItem(LS_KEY);
    const cfg = safeJsonParse(raw) || {};
    return {
      owner: cfg.owner || "",
      repo: cfg.repo || "",
      branch: cfg.branch || "main",
      path: cfg.path || "app/import/mother_bundle.json",
      token: cfg.token || "" // PAT fine-grained (contents: read/write)
    };
  }

  function setCfg(patch) {
    const cur = getCfg();
    const next = { ...cur, ...(patch || {}) };
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    return next;
  }

  function assertCfg(cfg) {
    if (!cfg.owner || !cfg.repo) throw new Error("Config inválida: owner/repo.");
    if (!cfg.branch) throw new Error("Config inválida: branch.");
    if (!cfg.path) throw new Error("Config inválida: path.");
    if (!cfg.token) throw new Error("Token ausente. Cole seu PAT no campo Token.");
  }

  function apiBase(cfg) {
    return `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.path}`;
  }

  function headers(cfg) {
    return {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + cfg.token,
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  function b64EncodeUnicode(str) {
    // suporta acentos
    const utf8 = new TextEncoder().encode(String(str ?? ""));
    let bin = "";
    utf8.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin);
  }

  function b64DecodeUnicode(b64) {
    const bin = atob(String(b64 || ""));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  async function getFile(cfgIn) {
    const cfg = cfgIn || getCfg();
    assertCfg(cfg);

    const url = apiBase(cfg) + `?ref=${encodeURIComponent(cfg.branch)}&_=${Date.now()}`;
    const res = await fetch(url, { headers: headers(cfg), cache: "no-store" });

    if (res.status === 404) {
      return { ok: false, status: 404, msg: "Arquivo não existe no repo ainda.", data: null };
    }
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, status: res.status, msg: "GET falhou: HTTP " + res.status, detail: t };
    }

    const data = await res.json();
    const content = data && data.content ? b64DecodeUnicode(data.content.replace(/\n/g, "")) : "";
    return {
      ok: true,
      status: res.status,
      sha: data.sha,
      content,
      data
    };
  }

  async function putFile(cfgIn, content, message) {
    const cfg = cfgIn || getCfg();
    assertCfg(cfg);

    // pega SHA atual (se existir)
    const current = await getFile(cfg);
    const sha = current.ok ? current.sha : undefined;

    const url = apiBase(cfg);
    const body = {
      message: message || `RCF update: ${cfg.path}`,
      content: b64EncodeUnicode(String(content ?? "")),
      branch: cfg.branch
    };
    if (sha) body.sha = sha;

    const res = await fetch(url, {
      method: "PUT",
      headers: { ...headers(cfg), "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, status: res.status, msg: "PUT falhou: HTTP " + res.status, detail: t };
    }

    const data = await res.json();
    return { ok: true, status: res.status, data };
  }

  window.RCF_GITHUB = {
    getCfg,
    setCfg,
    getFile,
    putFile
  };
})();
