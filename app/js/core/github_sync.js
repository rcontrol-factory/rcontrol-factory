/* RControl Factory — /app/js/core/github_sync.js (PADRÃO) — v2.3
   - GitHub Contents API: GET/PUT file
   - Storage: rcf:ghcfg
   - pull(cfg): retorna STRING do bundle JSON válido (ou lança erro)
   - push(cfg, content?): se content não vier, gera bundle “mãe” via fetch local
   - ✅ Path default CORRETO: "app/import/mother_bundle.json"
   - ✅ Local bundle fetch: new URL('import/mother_bundle.json', document.baseURI)
   - ✅ Logs claros + validação forte do bundle
   - ✅ Nunca salva token no bundle
*/
(() => {
  "use strict";

  const LS_KEY = "rcf:ghcfg";

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nowISO = () => new Date().toISOString();

  function log(msg)  { try { window.RCF_LOGGER?.push?.("info", msg); } catch {} }
  function warn(msg) { try { window.RCF_LOGGER?.push?.("warn", msg); } catch {} }
  function err(msg)  { try { window.RCF_LOGGER?.push?.("err", msg); } catch {} }

  function safeParse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  }

  function loadConfig() {
    return safeParse(localStorage.getItem(LS_KEY), {}) || {};
  }

  function saveConfig(cfg) {
    const safe = {
      owner: String(cfg.owner || "").trim(),
      repo: String(cfg.repo || "").trim(),
      branch: String(cfg.branch || "main").trim(),
      // ✅ default correto dentro de /app
      path: String(cfg.path || "app/import/mother_bundle.json").trim(),
      token: String(cfg.token || "").trim(),
    };
    localStorage.setItem(LS_KEY, JSON.stringify(safe));
    return safe;
  }

  function requireCfg(cfg, { requireToken = true } = {}) {
    const c = (cfg && Object.keys(cfg).length) ? cfg : loadConfig();

    if (!c.owner) throw new Error("Falta owner");
    if (!c.repo) throw new Error("Falta repo");
    if (!c.branch) throw new Error("Falta branch");
    if (!c.path) throw new Error("Falta path");

    if (requireToken && !c.token) throw new Error("Falta token (PAT)");

    return {
      owner: String(c.owner).trim(),
      repo: String(c.repo).trim(),
      branch: String(c.branch || "main").trim(),
      path: String(c.path || "app/import/mother_bundle.json").trim(),
      token: String(c.token || "").trim(),
    };
  }

  function apiUrl(c) {
    // GitHub Contents API usa path sem / inicial
    const path = String(c.path || "").replace(/^\/+/, "");
    return `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${path}?ref=${encodeURIComponent(c.branch)}`;
  }

  function headers(c) {
    return {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${c.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  function b64encode(str) {
    return btoa(unescape(encodeURIComponent(String(str ?? ""))));
  }
  function b64decode(b64) {
    return decodeURIComponent(escape(atob(String(b64 || ""))));
  }

  function head80(t) {
    return String(t || "").slice(0, 80).replace(/\s+/g, " ").trim();
  }

  function looksLikeJson(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    if (t.startsWith("<!DOCTYPE") || t.startsWith("<html")) return false;
    return t[0] === "{";
  }

  function assertBundleJson(text) {
    if (!looksLikeJson(text)) {
      throw new Error(`bundle não é JSON (head="${head80(text)}")`);
    }
    let j;
    try { j = JSON.parse(text); }
    catch (e) {
      throw new Error(`JSON inválido (${e?.message || e}) head="${head80(text)}"`);
    }
    const files = j?.files || null;
    if (!files || typeof files !== "object" || Object.keys(files).length === 0) {
      throw new Error(`JSON sem "files" (ou vazio) head="${head80(text)}"`);
    }
    return true;
  }

  async function getFile(c) {
    const url = apiUrl(c);
    const res = await fetch(url, { headers: headers(c) });

    if (res.status === 404) return { exists: false, url };

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`GitHub GET falhou: ${res.status} ${head80(t)} url=${url}`);
    }

    const j = await res.json();
    if (!j || j.type !== "file") throw new Error("Resposta inesperada do GitHub (não é file)");

    const decoded = b64decode(String(j.content || "").replace(/\n/g, ""));
    return { exists: true,
