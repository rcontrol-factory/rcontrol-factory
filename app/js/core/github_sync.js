/* RControl Factory — /app/js/core/github_sync.js (PADRÃO) — v2.4c
   - Centraliza GitHub API (pull/push/test)
   - Evita logs duplicados (guard)
   - pushMotherBundle robusto (auto-pull se bundle local vazio)
   - save/load cfg em rcf:ghcfg
   - PATCH MÍNIMO: normalizeBundlePath -> SEMPRE app/import/mother_bundle.json
*/
(() => {
  "use strict";

  if (window.RCF_GH_SYNC && window.RCF_GH_SYNC.__v24c) return;

  const LS_CFG_KEY = "rcf:ghcfg";
  const API_BASE = "https://api.github.com";

  const log = (lvl, msg, obj) => {
    try {
      if (obj !== undefined) window.RCF_LOGGER?.push?.(lvl, `${msg} ${JSON.stringify(obj)}`);
      else window.RCF_LOGGER?.push?.(lvl, msg);
    } catch {}
    try { console.log("[GH]", lvl, msg, obj ?? ""); } catch {}
  };

  function safeParse(raw, fb){
    try { return raw ? JSON.parse(raw) : fb; } catch { return fb; }
  }

  // ✅ PADRÃO DEFINITIVO: sempre app/import/mother_bundle.json
  function normalizeBundlePath(input) {
    const raw = String(input || "").trim();
    let p = raw.replace(/^\/+/, "");

    if (p.startsWith("import/")) p = "app/" + p;
    if (!p.startsWith("app/")) p = "app/" + p;

    if (!p.startsWith("app/import/")) {
      const file = (p.split("/").pop() || "mother_bundle.json").trim();
      p = "app/import/" + file;
    }

    return { raw, normalized: p };
  }

  function loadConfig(){
    const c = safeParse(localStorage.getItem(LS_CFG_KEY), {}) || {};
    const norm = normalizeBundlePath(c.path || "app/import/mother_bundle.json");

    const cfg = {
      owner: String(c.owner || "").trim(),
      repo: String(c.repo || "").trim(),
      branch: String(c.branch || "main").trim(),
      path: norm.normalized,
      token: String(c.token || "empty").trim(),
    };

    log("info", "bundle path normalized", { raw: norm.raw, path: cfg.path });
    return cfg;
  }

  function saveConfig(cfg){
    const inCfg = cfg || {};
    const norm = normalizeBundlePath(inCfg.path || "app/import/mother_bundle.json");

    const safe = {
      owner: String(inCfg.owner || "").trim(),
      repo: String(inCfg.repo || "").trim(),
      branch: String(inCfg.branch || "main").trim(),
      path: norm.normalized,
      token: String(inCfg.token || "empty").trim(),
    };

    localStorage.setItem(LS_CFG_KEY, JSON.stringify(safe));
    log("ok", "OK: ghcfg saved");
    log("info", "bundle path normalized", { raw: norm.raw, path: safe.path });
    return safe;
  }

  function headers(cfg){
    const h = { "Accept": "application/vnd.github+json" };
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

    const norm = normalizeBundlePath(cfg.path);
    cfg.path = norm.normalized; // ✅ garante dentro do objeto também
    log("info", "bundle path normalized", { raw: norm.raw, path: cfg.path });

    const branch = encodeURIComponent(cfg.branch || "main");
    return `${API_BASE}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.path}?ref=${branch}`;
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

    log("info", `GitHub: pull iniciando... path=${cfg.path}`);

    const txt = await ghFetch(url, cfg, { method: "GET" });
    const j = safeParse(txt, null);
    if (!j || !j.content) throw new Error("Resposta inválida do GitHub (sem content)");

    const b64 = String(j.content || "").replace(/\n/g, "");
    let decoded = "";
    try { decoded = atob(b64); } catch { throw new Error("Falha ao decodificar base64"); }

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
      if (e && e.status === 404) return null;
      throw e;
    }
  }

  async function push(cfgIn, contentStr){
    const cfg = saveConfig(cfgIn || loadConfig());

    const norm = normalizeBundlePath(cfg.path);
    cfg.path = norm.normalized;
    log("info", "bundle path normalized", { raw: norm.raw, path: cfg.path });

    const branch = cfg.branch || "main";
    log("info", `GitHub: push iniciando... path=${cfg.path}`);

    const sha = await getShaIfExists(cfg);

    const url = `${API_BASE}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.path}`;

    const body = {
      message: `rcf: update ${cfg.path}`,
      content: btoa(unescape(encodeURIComponent(String(contentStr ?? "")))),
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

  // ✅ PATCH MÍNIMO: se bundle local estiver vazio, faz MAE.updateFromGitHub antes
  async function getBundleTextOrAutoPull(cfg){
    if (!window.RCF_MAE?.getLocalBundleText) {
      throw new Error("RCF_MAE.getLocalBundleText ausente");
    }

    let txt = String(await window.RCF_MAE.getLocalBundleText() || "").trim();
    if (txt) return txt;

    // tenta auto-pull via MAE (puxa + salva localStorage padronizado)
    if (window.RCF_MAE?.updateFromGitHub) {
      log("info", "pushMotherBundle: bundle local vazio -> fazendo MAE.updateFromGitHub…");
      await window.RCF_MAE.updateFromGitHub({
        onProgress: (p) => {
          // mantém leve, sem spam
          if (p?.step === "apply_done") log("info", `MAE apply_done ${p.done}/${p.total}`);
        }
      });

      txt = String(await window.RCF_MAE.getLocalBundleText() || "").trim();
      if (txt) return txt;
    }

    throw new Error("Bundle local vazio");
  }

  async function pushMotherBundle(cfgIn){
    const cfg = saveConfig(cfgIn || loadConfig());

    // ✅ garante normalização antes de qualquer push
    const norm = normalizeBundlePath(cfg.path);
    cfg.path = norm.normalized;
    log("info", "bundle path normalized", { raw: norm.raw, path: cfg.path });

    const bundleTxt = await getBundleTextOrAutoPull(cfg);
    await push(cfg, bundleTxt);
    return { ok: true };
  }

  window.RCF_GH_SYNC = {
    __v24c: true,
    loadConfig,
    saveConfig,
    test,
    pull,
    push,
    pushMotherBundle,
  };

  log("info", "github_sync.js loaded (v2.4c)");
})();
