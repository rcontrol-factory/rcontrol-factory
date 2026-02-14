/* RControl Factory — /app/js/core/github_sync.js (PADRÃO) — v2.4
   - Centraliza GitHub API (pull/push/test)
   - Evita logs duplicados (guard)
   - pushMotherBundle robusto (retorna ok/throw correto)
   - save/load cfg em rcf:ghcfg
*/
(() => {
  "use strict";

  if (window.RCF_GH_SYNC && window.RCF_GH_SYNC.__v24) return;

  const LS_CFG_KEY = "rcf:ghcfg";
  const API_BASE = "https://api.github.com";

  const log = (lvl, msg) => {
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[GH]", lvl, msg); } catch {}
  };

  function safeParse(raw, fb){
    try { return raw ? JSON.parse(raw) : fb; } catch { return fb; }
  }

  function normalizePath(p){
    let x = String(p || "").trim();
    if (!x) return "app/import/mother_bundle.json";
    x = x.replace(/^\/+/, "");
    // compat: se usuário colocou import/..., grava como app/import/...
    if (x.startsWith("import/")) x = "app/" + x;
    return x;
  }

  function loadConfig(){
    const c = safeParse(localStorage.getItem(LS_CFG_KEY), {}) || {};
    return {
      owner: String(c.owner || "").trim(),
      repo: String(c.repo || "").trim(),
      branch: String(c.branch || "main").trim(),
      path: normalizePath(c.path || "app/import/mother_bundle.json"),
      token: String(c.token || "empty").trim(),
    };
  }

  function saveConfig(cfg){
    const safe = {
      owner: String(cfg.owner || "").trim(),
      repo: String(cfg.repo || "").trim(),
      branch: String(cfg.branch || "main").trim(),
      path: normalizePath(cfg.path || "app/import/mother_bundle.json"),
      token: String(cfg.token || "empty").trim(),
    };
    localStorage.setItem(LS_CFG_KEY, JSON.stringify(safe));
    log("ok", "OK: ghcfg saved");
    return safe;
  }

  function headers(cfg){
    const h = {
      "Accept": "application/vnd.github+json",
    };
    const t = String(cfg.token || "").trim();
    if (t && t !== "empty") h["Authorization"] = "token " + t;
    return h;
  }

  async function ghFetch(url, cfg, opts){
    const res = await fetch(url, {
      method: opts?.method || "GET",
      headers: { ...headers(cfg), ...(opts?.headers || {}) },
      body: opts?.body,
    });

    // GitHub manda json em erro; tenta ler
    let text = "";
    try { text = await res.text(); } catch {}

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const j = JSON.parse(text);
        if (j?.message) errMsg += `: ${j.message}`;
      } catch {}
      const e = new Error(errMsg);
      e.status = res.status;
      e.body = text;
      throw e;
    }

    return text;
  }

  function contentUrl(cfg){
    if (!cfg.owner || !cfg.repo) throw new Error("ghcfg incompleto (owner/repo)");
    const path = normalizePath(cfg.path);
    const branch = encodeURIComponent(cfg.branch || "main");
    return `${API_BASE}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${path}?ref=${branch}`;
  }

  async function test(cfgIn){
    const cfg = saveConfig(cfgIn || loadConfig());
    const url = `${API_BASE}/user`;
    await ghFetch(url, cfg, { method: "GET" });
    return "OK: token test ok";
  }

  async function pull(cfgIn){
    const cfg = saveConfig(cfgIn || loadConfig());
    const url = contentUrl(cfg);

    log("info", `GitHub: pull iniciando... path=${normalizePath(cfg.path)}`);

    const txt = await ghFetch(url, cfg, { method: "GET" });
    const j = safeParse(txt, null);
    if (!j || !j.content) throw new Error("Resposta inválida do GitHub (sem content)");

    // content vem base64
    const b64 = String(j.content || "").replace(/\n/g, "");
    let decoded = "";
    try { decoded = atob(b64); } catch { throw new Error("Falha ao decodificar base64"); }

    // valida JSON do bundle
    try { JSON.parse(decoded); } catch { throw new Error("Bundle puxado não é JSON válido"); }

    log("info", `GitHub: pull ok (bundle JSON válido). url=${url}`);
    return decoded;
  }

  async function getShaIfExists(cfg){
    try {
      const url = contentUrl(cfg);
      const txt = await ghFetch(url, cfg, { method: "GET" });
      const j = safeParse(txt, null);
      return j?.sha || null;
    } catch (e) {
      // 404: não existe ainda
      if (e && e.status === 404) return null;
      throw e;
    }
  }

  async function push(cfgIn, contentStr){
    const cfg = saveConfig(cfgIn || loadConfig());
    const path = normalizePath(cfg.path);
    const branch = cfg.branch || "main";

    log("info", `GitHub: push iniciando... path=${path}`);

    const sha = await getShaIfExists(cfg);
    const url = `${API_BASE}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${path}`;

    const body = {
      message: `rcf: update ${path}`,
      content: btoa(unescape(encodeURIComponent(String(contentStr ?? "")))), // utf8 safe
      branch,
    };
    if (sha) body.sha = sha;

    await ghFetch(url, cfg, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    log("info", "GitHub: push ok.");
    return { ok: true };
  }

  async function pushMotherBundle(cfgIn){
    const cfg = saveConfig(cfgIn || loadConfig());
    if (!window.RCF_MAE?.getLocalBundleText) {
      throw new Error("RCF_MAE.getLocalBundleText ausente");
    }
    const bundleTxt = await window.RCF_MAE.getLocalBundleText();
    if (!bundleTxt) throw new Error("Bundle local vazio");

    await push(cfg, bundleTxt);
    return { ok: true };
  }

  window.RCF_GH_SYNC = {
    __v24: true,
    loadConfig,
    saveConfig,
    test,
    pull,
    push,
    pushMotherBundle,
  };

  log("info", "github_sync.js loaded (v2.4)");
})();
