/* RControl Factory — /app/js/core/github_sync.js (PADRÃO) — v2.4d
   PATCH MÍNIMO:
   - pull() robusto: aceita content | download_url | git_url
   - erro claro quando path vira diretório (array)
   - mantém normalizeBundlePath sempre app/import/mother_bundle.json
*/
(() => {
  "use strict";

  if (window.RCF_GH_SYNC && window.RCF_GH_SYNC.__v24d) return;

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
    cfg.path = norm.normalized;
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

  function decodeB64Utf8(b64){
    // GitHub manda base64, pode ter UTF-8
    const clean = String(b64 || "").replace(/\n/g, "");
    let bin = "";
    try { bin = atob(clean); } catch { throw new Error("Falha ao decodificar base64"); }
    try {
      // converte binário -> utf8
      return decodeURIComponent(escape(bin));
    } catch {
      return bin; // fallback
    }
  }

  async function pull(cfgIn){
    const cfg = saveConfig(cfgIn || loadConfig());
    const url = contentUrl(cfg);

    log("info", `GitHub: pull iniciando... path=${cfg.path}`);

    const txt = await ghFetch(url, cfg, { method: "GET" });
    const j = safeParse(txt, null);

    // ✅ se path virou diretório, GitHub retorna array
    if (Array.isArray(j)) {
      throw new Error("Resposta inválida: path parece ser diretório (array). Confirme cfg.path.");
    }

    // caso normal: vem content base64
    if (j && j.content) {
      const decoded = decodeB64Utf8(j.content);
      try { JSON.parse(decoded); } catch { throw new Error("Bundle puxado não é JSON válido"); }
      log("info", `GitHub: pull ok (content). url=${url}`);
      return decoded;
    }

    // ✅ fallback 1: download_url (raw)
    if (j && j.download_url) {
      const raw = await ghFetch(j.download_url, cfg, { method: "GET", headers: { "Accept": "application/vnd.github.raw" } });
      try { JSON.parse(raw); } catch { throw new Error("Bundle (download_url) não é JSON válido"); }
      log("info", `GitHub: pull ok (download_url). url=${j.download_url}`);
      return raw;
    }

    // ✅ fallback 2: git_url -> blob -> content
    if (j && j.git_url) {
      const blobTxt = await ghFetch(j.git_url, cfg, { method: "GET" });
      const blob = safeParse(blobTxt, null);
      if (!blob || !blob.content) throw new Error("Resposta inválida do GitHub (blob sem content)");
      const decoded = decodeB64Utf8(blob.content);
      try { JSON.parse(decoded); } catch { throw new Error("Bundle (git_url blob) não é JSON válido"); }
      log("info", `GitHub: pull ok (git_url). url=${j.git_url}`);
      return decoded;
    }

    // se chegou aqui, o shape não tem nada do que precisamos
    throw new Error("Resposta inválida do GitHub (sem content/download_url/git_url)");
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

  async function pushMotherBundle(cfgIn){
    const cfg = saveConfig(cfgIn || loadConfig());

    const norm = normalizeBundlePath(cfg.path);
    cfg.path = norm.normalized;
    log("info", "bundle path normalized", { raw: norm.raw, path: cfg.path });

    if (!window.RCF_MAE?.getLocalBundleText) {
      throw new Error("RCF_MAE.getLocalBundleText ausente");
    }

    const bundleTxt = await window.RCF_MAE.getLocalBundleText();
    if (!bundleTxt) throw new Error("Bundle local vazio");

    await push(cfg, bundleTxt);
    return { ok: true };
  }

  window.RCF_GH_SYNC = {
    __v24d: true,
    loadConfig,
    saveConfig,
    test,
    pull,
    push,
    pushMotherBundle,
  };

  log("info", "github_sync.js loaded (v2.4d)");
})();
