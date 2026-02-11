/* =========================================================
  RControl Factory — app/js/github_sync.js (FULL) — GitHub Sync v1
  - Salva config (owner/repo/branch/token) no localStorage
  - Push arquivos via GitHub REST: Contents API (PUT /contents/{path})
  - Usado pelo Thompson: pushFilesFromOverrides(paths, overrides, meta)
========================================================= */
(() => {
  "use strict";

  const KEY = "rcf:github:cfg";

  function safeJsonParse(raw, fallback) {
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  function cfgGet() {
    const raw = localStorage.getItem(KEY);
    const cfg = safeJsonParse(raw || "{}", {});
    return cfg && typeof cfg === "object" ? cfg : {};
  }

  function cfgSet(cfg) {
    localStorage.setItem(KEY, JSON.stringify(cfg || {}));
  }

  function isConfigured() {
    const c = cfgGet();
    return !!(c.token && c.owner && c.repo);
  }

  function apiBase() {
    return "https://api.github.com";
  }

  function authHeaders() {
    const c = cfgGet();
    if (!c.token) return {};
    return {
      "Authorization": "Bearer " + c.token,
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  function normPathForRepo(p) {
    // Overrides usam "/core/x.js" etc. No repo, vamos salvar sem a "/" inicial
    const s = String(p || "").trim();
    return s.startsWith("/") ? s.slice(1) : s;
  }

  function b64EncodeUnicode(str) {
    // btoa não curte unicode; aqui vai safe
    return btoa(unescape(encodeURIComponent(String(str || ""))));
  }

  async function ghFetch(url, opt = {}) {
    const headers = {
      "Accept": "application/vnd.github+json",
      ...authHeaders(),
      ...(opt.headers || {})
    };
    const res = await fetch(url, { ...opt, headers });
    const txt = await res.text();
    let data = null;
    try { data = JSON.parse(txt); } catch { data = txt; }
    if (!res.ok) {
      const msg = (data && data.message) ? data.message : ("HTTP " + res.status);
      throw new Error(msg);
    }
    return data;
  }

  async function getFileSha(owner, repo, path, branch) {
    const q = branch ? ("?ref=" + encodeURIComponent(branch)) : "";
    const url = `${apiBase()}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}${q}`;
    try {
      const data = await ghFetch(url, { method: "GET" });
      // quando é file, vem { sha, content, ... }
      if (data && typeof data === "object" && data.sha) return data.sha;
      return null;
    } catch (e) {
      // se não existe, GitHub retorna 404 -> aqui vira erro; vamos tratar como sha null
      const m = String(e?.message || "");
      if (m.toLowerCase().includes("not found")) return null;
      return null;
    }
  }

  async function putFile(path, content, message) {
    const c = cfgGet();
    if (!c.owner || !c.repo || !c.token) throw new Error("GitHub não configurado.");

    const owner = c.owner;
    const repo = c.repo;
    const branch = c.branch || "main";

    const repoPath = normPathForRepo(path);
    const sha = await getFileSha(owner, repo, repoPath, branch);

    const url = `${apiBase()}/repos/${owner}/${repo}/contents/${encodeURIComponent(repoPath)}`;
    const body = {
      message: message || ("RCF update: " + repoPath),
      content: b64EncodeUnicode(String(content ?? "")),
      branch
    };
    if (sha) body.sha = sha;

    return ghFetch(url, { method: "PUT", body: JSON.stringify(body) });
  }

  async function pushFilesFromOverrides(paths, overrides, meta) {
    const c = cfgGet();
    const branch = c.branch || "main";
    const stamp = new Date().toISOString();
    const name = meta?.name || "mother-bundle";
    const ver = meta?.version || "1.0";

    const list = Array.isArray(paths) ? paths : [];
    for (const p of list) {
      const entry = overrides && overrides[p];
      if (!entry) continue;
      const msg = `RCF(${name}@${ver}) ${p} — ${stamp}`;
      await putFile(p, String(entry.content ?? ""), msg);
    }

    return { ok: true, pushed: list.length, branch };
  }

  function clearConfig() {
    localStorage.removeItem(KEY);
  }

  window.RCF_GITHUB_SYNC = {
    cfgGet,
    cfgSet,
    clearConfig,
    isConfigured,
    putFile,
    pushFilesFromOverrides
  };

  try { console.log("[RCF] GitHub Sync v1 carregado ✅"); } catch {}
})();
