/* RControl Factory — /app/js/core/github_sync.js (PADRÃO) — v2.4a
   - Centraliza GitHub API (pull/push/test)
   - PATCH MÍNIMO: normalizeBundlePath() garante SEMPRE app/import/mother_bundle.json
   - Log obrigatório: "bundle path normalized" com {raw,path}
   - save/load cfg em rcf:ghcfg
*/
(() => {
  "use strict";

  if (window.RCF_GH_SYNC && window.RCF_GH_SYNC.__v24a) return;

  const LS_CFG_KEY = "rcf:ghcfg";
  const API_BASE = "https://api.github.com";

  const log = (lvl, msg, extra) => {
    try { window.RCF_LOGGER?.push?.(lvl, extra ? (msg + " " + JSON.stringify(extra)) : msg); } catch {}
    try { console.log("[GH]", lvl, msg, extra || ""); } catch {}
  };

  function safeParse(raw, fb){
    try { return raw ? JSON.parse(raw) : fb; } catch { return fb; }
  }

  // ✅ PATCH DEFINITIVO — padrão de repo-path: app/import/mother_bundle.json (sempre)
  function normalizeBundlePath(input) {
    const raw = String(input || "").trim();
    let p = raw.replace(/^\/+/, "");

    // default se vazio
    if (!p) p = "app/import/mother_bundle.json";

    // se veio "import/..." -> vira "app/import/..."
    if (p.startsWith("import/")) p = "app/" + p;

    // se veio só "mother_bundle.json" ou "mother_index.json" -> força pasta app/import/
    if (!p.includes("/")) p = "app/import/" + p;

    // garante prefixo app/
    if (!p.startsWith("app/")) p = "app/" + p;

    // garante que está dentro de app/import/
    if (!p.startsWith("app/import/")) {
      const file = (p.split("/").pop() || "mother_bundle.json").trim();
      p = "app/import/" + file;
    }

    return { raw, normalized: p };
  }

  function loadConfig(){
    const c = safeParse(localStorage.getItem(LS_CFG_KEY), {}) || {};
    const nbp = normalizeBundlePath(c.path || "app/import/mother_bundle.json");
    // log obrigatório (mas sem poluir toda hora — só se raw != normalized)
    if ((nbp.raw || "") && nbp.raw !== nbp.normalized) {
      log("info", "bundle path normalized", { raw: nbp.raw, path: nbp.normalized });
    }
    return {
      owner: String(c.owner || "").trim(),
      repo: String(c.repo || "").trim(),
      branch: String(c.branch || "main").trim(),
      path: nbp.normalized,
      token: String(c.token || "empty").trim(),
    };
  }

  function saveConfig(cfg){
    const nbp = normalizeBundlePath(cfg?.path || "app/import/mother_bundle.json");
    const safe = {
      owner: String(cfg?.owner || "").trim(),
      repo: String(cfg?.repo || "").trim(),
      branch: String(cfg?.branch || "main").trim(),
      path: nbp.normalized,
      token: String(cfg?.token || "empty").trim(),
    };

    localStorage.setItem(LS_CFG_KEY, JSON.stringify(safe));
    log("ok", "OK: ghcfg saved");

    // log obrigatório
    log("info", "bundle path normalized", { raw: nbp.raw, path: safe.path });

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

    // ✅ sempre normalizado aqui também
    const nbp = normalizeBundlePath(cfg.path);
    const path = nbp.normalized;

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

    const nbp = normalizeBundlePath(cfg.path);
    cfg.path = nbp.normalized;

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

    const nbp = normalizeBundlePath(cfg.path);
    cfg.path = nbp.normalized;

    const path = cfg.path;
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
    __v24a: true,
    loadConfig,
    saveConfig,
    test,
    pull,
    push,
    pushMotherBundle,
  };

  log("info", "github_sync.js loaded (v2.4a)");
})();
