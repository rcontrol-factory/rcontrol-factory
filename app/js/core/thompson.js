/* =========================================================
  RControl Factory — js/core/thompson.js (FULL)
  THOMPSON = motor OFFLINE de validação e “negociação” do bundle.

  Funções:
  - parseBundle(raw) -> {ok, bundle, error}
  - normalizeBundle(bundle) -> bundle normalizado + meta preenchida
  - dryRun(bundle, currentOverrides) -> relatório do que vai mudar
  - isCriticalPath(path) -> true/false
  - guardApply(bundle, mode) -> {ok, needsConfirm, criticalFiles[]}
========================================================= */

(function () {
  "use strict";

  const KEY_OVERRIDES = "rcf:vfs_overrides";     // mapa path->content
  const KEY_HISTORY   = "rcf:mother_history";    // array de snapshots

  function safeText(v){ return (v===undefined||v===null) ? "" : String(v); }

  function nowISO(){ return new Date().toISOString(); }

  function deepClone(obj){
    try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; }
  }

  function parseJSON(raw){
    try { return { ok:true, value: JSON.parse(String(raw||"")) }; }
    catch(e){ return { ok:false, error: e?.message || String(e) }; }
  }

  function ensureLeadingSlash(p){
    p = safeText(p).trim();
    if (!p) return "";
    if (!p.startsWith("/")) p = "/" + p;
    return p;
  }

  function normalizePath(p){
    p = ensureLeadingSlash(p);
    // remove duplo // e resolve .. simples (sem ficar complexo)
    p = p.replace(/\/{2,}/g, "/");
    while (p.includes("/./")) p = p.replace("/./", "/");
    // bloqueia caminhos vazios ou raiz
    if (p === "/") return "";
    return p;
  }

  function interpolateDate(str){
    return safeText(str).replace(/\{\{DATE\}\}/g, nowISO());
  }

  function isCriticalPath(path){
    const p = normalizePath(path);
    if (!p) return true;

    // CRÍTICOS absolutos
    if (p === "/index.html") return true;
    if (p === "/app.js") return true;
    if (p === "/sw.js") return true;
    if (p === "/manifest.json") return true;

    // Qualquer core
    if (p.startsWith("/js/core/")) return true;

    // (opcional) estilos também são sensíveis, mas não travam app normalmente:
    // if (p === "/styles.css") return true;

    return false;
  }

  function parseBundle(raw){
    const j = parseJSON(raw);
    if (!j.ok) return { ok:false, error: "JSON inválido: " + j.error };

    const b = j.value;
    if (!b || typeof b !== "object") return { ok:false, error:"Bundle precisa ser objeto." };

    if (!b.files || typeof b.files !== "object") {
      return { ok:false, error:"Bundle precisa ter 'files' (objeto)." };
    }

    return { ok:true, bundle: b };
  }

  function normalizeBundle(bundle){
    const b = deepClone(bundle || {});
    b.meta = b.meta && typeof b.meta === "object" ? b.meta : {};
    b.meta.name = safeText(b.meta.name || "mother-bundle");
    b.meta.version = safeText(b.meta.version || "1.0");
    b.meta.createdAt = safeText(b.meta.createdAt || "{{DATE}}");
    b.meta.createdAt = interpolateDate(b.meta.createdAt);

    const files = b.files || {};
    const out = {};
    Object.keys(files).forEach((k)=>{
      const nk = normalizePath(k);
      if (!nk) return;
      out[nk] = interpolateDate(files[k]);
    });
    b.files = out;
    return b;
  }

  function loadOverrides(){
    try {
      const raw = localStorage.getItem(KEY_OVERRIDES);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return (obj && typeof obj === "object") ? obj : {};
    } catch {
      return {};
    }
  }

  function saveOverrides(map){
    localStorage.setItem(KEY_OVERRIDES, JSON.stringify(map || {}));
  }

  function pushHistory(entry){
    try {
      const raw = localStorage.getItem(KEY_HISTORY);
      const arr = raw ? JSON.parse(raw) : [];
      const hist = Array.isArray(arr) ? arr : [];
      hist.unshift(entry);
      while (hist.length > 10) hist.pop();
      localStorage.setItem(KEY_HISTORY, JSON.stringify(hist));
    } catch {}
  }

  function getHistory(){
    try {
      const raw = localStorage.getItem(KEY_HISTORY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function diffKeys(newFiles, current){
    const changed = [];
    const added = [];
    const same = [];

    Object.keys(newFiles).forEach((k)=>{
      const nv = safeText(newFiles[k]);
      const cv = safeText(current[k]);
      if (current.hasOwnProperty(k)) {
        if (nv === cv) same.push(k);
        else changed.push(k);
      } else {
        added.push(k);
      }
    });

    return { added, changed, same };
  }

  function dryRun(bundle, currentOverrides){
    const b = normalizeBundle(bundle);
    const current = currentOverrides || {};
    const files = b.files || {};
    const keys = Object.keys(files);

    const d = diffKeys(files, current);

    const critical = keys.filter(isCriticalPath);
    const nonCritical = keys.filter(k => !isCriticalPath(k));

    return {
      meta: b.meta,
      totalFiles: keys.length,
      added: d.added,
      changed: d.changed,
      same: d.same,
      critical,
      nonCritical
    };
  }

  function guardApply(bundle, mode){
    const b = normalizeBundle(bundle);
    const keys = Object.keys(b.files || {});
    const critical = keys.filter(isCriticalPath);

    // mode: "safe" = condicional
    if ((mode || "safe") === "safe" && critical.length) {
      return { ok:true, needsConfirm:true, criticalFiles: critical };
    }
    return { ok:true, needsConfirm:false, criticalFiles: critical };
  }

  function apply(bundle){
    const b = normalizeBundle(bundle);
    const overrides = loadOverrides();

    // snapshot p/ rollback (guarda o mapa inteiro)
    pushHistory({
      at: nowISO(),
      meta: b.meta,
      overridesBefore: overrides
    });

    const next = { ...overrides };
    Object.keys(b.files || {}).forEach((k)=>{
      next[k] = safeText(b.files[k]);
    });

    saveOverrides(next);

    return {
      ok:true,
      meta: b.meta,
      files: Object.keys(b.files || {}).length
    };
  }

  function rollback(steps = 1){
    const hist = getHistory();
    if (!hist.length) return { ok:false, msg:"Sem histórico." };

    const idx = Math.max(0, Math.min(hist.length - 1, (steps|0) - 1));
    const snap = hist[idx];
    if (!snap || !snap.overridesBefore) return { ok:false, msg:"Snapshot inválido." };

    saveOverrides(snap.overridesBefore);

    // remove snapshots usados (até idx)
    try {
      const remain = hist.slice(idx + 1);
      localStorage.setItem(KEY_HISTORY, JSON.stringify(remain));
    } catch {}

    return { ok:true, msg:`Rollback OK (voltou ${idx+1})` };
  }

  function resetAll(){
    saveOverrides({});
    localStorage.removeItem(KEY_HISTORY);
    return { ok:true };
  }

  function exportCurrent(){
    const overrides = loadOverrides();
    const files = overrides || {};
    const bundle = normalizeBundle({
      meta: { name:"mother-export", version:"1.0", createdAt: "{{DATE}}" },
      files
    });
    return bundle;
  }

  // Expose
  window.RCF_THOMPSON = {
    parseBundle,
    normalizeBundle,
    dryRun,
    guardApply,
    isCriticalPath,
    apply,
    rollback,
    resetAll,
    exportCurrent,
    loadOverrides,
    getHistory
  };
})();
