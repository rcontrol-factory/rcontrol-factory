/* FILE: /app/js/core/pages_links.js
   RControl Factory — pages_links.js — v1.0 (PWA LINKS + OPEN FIX + DEPLOY HOOK)
   Objetivo:
   - ✅ Gerar link PWA com query (?who=Gabriel) rápido
   - ✅ Evitar abrir como about:srcdoc (forçar abrir “de verdade” no Safari)
   - ✅ Copiar Base / Copiar Link / Abrir Link
   - ✅ Disparar Deploy Hook do Cloudflare Pages (POST) sem CORS travar
   - ✅ Salvar cfg local (por aparelho)
*/
(() => {
  "use strict";

  if (window.RCF_PAGES_LINKS && window.RCF_PAGES_LINKS.__v10) return;

  const LS_KEY = "rcf:pagescfg";

  const log = (lvl, msg) => {
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[PAGES]", lvl, msg); } catch {}
  };

  function safeParse(raw, fallback){
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  }

  function loadCfg(){
    const c = safeParse(localStorage.getItem(LS_KEY), {}) || {};
    return {
      baseUrl: String(c.baseUrl || "https://timesheet-lite.pages.dev/").trim(),
      param: String(c.param || "who").trim() || "who",
      name: String(c.name || "Gabriel").trim() || "Gabriel",
      hookUrl: String(c.hookUrl || "").trim()
    };
  }

  function saveCfg(cfg){
    const safe = {
      baseUrl: String(cfg.baseUrl || "").trim(),
      param: String(cfg.param || "who").trim(),
      name: String(cfg.name || "Gabriel").trim(),
      hookUrl: String(cfg.hookUrl || "").trim()
    };
    try { localStorage.setItem(LS_KEY, JSON.stringify(safe)); } catch {}
    return safe;
  }

  function normalizeBase(baseUrl){
    let b = String(baseUrl || "").trim();
    if (!b) return "";
    if (!/^https?:\/\//i.test(b)) b = "https://" + b;
    // garante trailing slash (Pages normalmente funciona melhor assim)
    if (!b.endsWith("/")) b += "/";
    return b;
  }

  function buildLink(baseUrl, param, name){
    const b = normalizeBase(baseUrl);
    const p = encodeURIComponent(String(param || "who").trim() || "who");
    const v = encodeURIComponent(String(name || "").trim());
    if (!b) return "";
    if (!v) return b;
    return b + "?" + p + "=" + v;
  }

  function tryCopy(text){
    const t = String(text || "");
    if (!t) return false;

    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(t).catch(() => {});
        return true;
      }
    } catch {}

    try {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
      return true;
    } catch {}

    return false;
  }

  function setOut(msg){
    // tenta usar o output do modal do GitHub se existir
    const out = document.getElementById("ghOut");
    if (out) out.textContent = String(msg || "Pronto.");
  }

  function openExternal(url){
    const u = String(url || "").trim();
    if (!u) return false;

    // ✅ evita about:srcdoc: abrir na janela de cima / nova aba
    try {
      const w = window.open(u, "_blank", "noopener,noreferrer");
      if (w) return true;
    } catch {}

    try {
      if (window.top && window.top !== window) {
        window.top.location.href = u;
        return true;
      }
    } catch {}

    try {
      window.location.href = u;
      return true;
    } catch {}

    return false;
  }

  async function triggerDeployHook(hookUrl){
    const u = String(hookUrl || "").trim();
    if (!u) throw new Error("Deploy Hook vazio");

    // Cloudflare Pages Deploy Hook normalmente aceita POST e responde com CORS fechado.
    // Então usamos mode:no-cors e consideramos “disparado” se não der exception.
    try {
      await fetch(u, {
        method: "POST",
        mode: "no-cors",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ts: Date.now(), from: "RCF" })
      });
      return { ok: true, mode: "no-cors" };
    } catch (e) {
      throw new Error("Falha ao disparar deploy hook: " + (e?.message || e));
    }
  }

  // ---------------------------------------------------------
  // Binder: conecta nos IDs já existentes no teu modal
  // (sem depender de reescrever admin.github.js)
  // ---------------------------------------------------------
  function bindOnce(){
    const baseEl = document.getElementById("pagesBaseUrl");
    const paramEl = document.getElementById("pagesParam");
    const nameEl = document.getElementById("pagesName");
    const hookEl = document.getElementById("pagesHookUrl");

    const btnSave = document.getElementById("btnPagesSaveCfg");
    const btnCopyBase = document.getElementById("btnPagesCopyBase");
    const btnCopyLink = document.getElementById("btnPagesCopyLink");
    const btnOpen = document.getElementById("btnPagesOpen");
    const btnDeploy = document.getElementById("btnPagesDeploy");

    // Se não existe UI ainda, não faz nada.
    if (!baseEl && !btnCopyLink && !btnOpen && !btnDeploy) return false;

    // preencher
    const cfg = loadCfg();
    if (baseEl && !baseEl.value) baseEl.value = cfg.baseUrl;
    if (paramEl && !paramEl.value) paramEl.value = cfg.param;
    if (nameEl && !nameEl.value) nameEl.value = cfg.name;
    if (hookEl && !hookEl.value) hookEl.value = cfg.hookUrl;

    function readUI(){
      return saveCfg({
        baseUrl: baseEl ? baseEl.value : cfg.baseUrl,
        param: paramEl ? paramEl.value : cfg.param,
        name: nameEl ? nameEl.value : cfg.name,
        hookUrl: hookEl ? hookEl.value : cfg.hookUrl
      });
    }

    // listeners (proteger de double-bind)
    const FLAG = "__rcf_pages_links_bound__";
    const root = document.getElementById("rcfGhModal") || document.body;
    if (root && root[FLAG]) return true;
    try { if (root) root[FLAG] = true; } catch {}

    if (btnSave) btnSave.addEventListener("click", () => {
      const c = readUI();
      setOut("OK: Pages cfg salvo ✅");
      log("ok", "Pages cfg salvo " + JSON.stringify({ baseUrl: c.baseUrl, param: c.param, name: c.name }));
    });

    if (btnCopyBase) btnCopyBase.addEventListener("click", () => {
      const c = readUI();
      const b = normalizeBase(c.baseUrl);
      const ok = tryCopy(b);
      setOut(ok ? ("OK: copied base -> " + b) : ("INFO: base -> " + b));
    });

    if (btnCopyLink) btnCopyLink.addEventListener("click", () => {
      const c = readUI();
      const link = buildLink(c.baseUrl, c.param, c.name);
      const ok = tryCopy(link);
      setOut(ok ? ("OK: copied link -> " + link) : ("INFO: link -> " + link));
    });

    if (btnOpen) btnOpen.addEventListener("click", () => {
      const c = readUI();
      const link = buildLink(c.baseUrl, c.param, c.name);
      const ok = openExternal(link);
      setOut(ok ? ("OK: abrindo -> " + link) : ("ERR: não consegui abrir -> " + link));
    });

    if (btnDeploy) btnDeploy.addEventListener("click", async () => {
      try {
        const c = readUI();
        if (!c.hookUrl) {
          setOut("ERR: Deploy Hook vazio. Cole o Deploy Hook do Cloudflare Pages.");
          return;
        }
        setOut("Deploy: disparando…");
        const r = await triggerDeployHook(c.hookUrl);
        setOut("OK: deploy disparado ✅ (" + r.mode + ")");
      } catch (e) {
        setOut("ERR: " + (e?.message || e));
      }
    });

    setOut("OK: PWA Links online ✅ (pages_links.js)");
    return true;
  }

  function startObserver(){
    // tenta bind agora e depois observa mudanças (modal cria/destroi)
    try { bindOnce(); } catch {}
    const obs = new MutationObserver(() => { try { bindOnce(); } catch {} });
    try { obs.observe(document.body, { childList: true, subtree: true }); } catch {}
  }

  window.RCF_PAGES_LINKS = {
    __v10: true,
    loadCfg,
    saveCfg,
    buildLink,
    openExternal,
    triggerDeployHook
  };

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startObserver, { once: true });
  } else {
    startObserver();
  }

  log("info", "pages_links.js loaded (v1.0)");
})();
