/* =========================================================
  RControl Factory — js/core/thompson.js (MVP)
  Thompson = motor que recebe bundle da Mãe e aplica overrides
  - load/validate bundle
  - dry-run
  - apply -> VFS overrides (se existir) ou fallback localStorage
  - history + rollback (1 passo)
========================================================= */
(function () {
  "use strict";

  const KEY_BUNDLE = "rcf:mother_bundle";
  const KEY_BUNDLE_AT = "rcf:mother_bundle_at";
  const KEY_VFS = "rcf:vfs_overrides";         // fallback
  const KEY_HIST = "rcf:mother_hist";          // histórico simples

  function safeText(v){ return (v===undefined||v===null) ? "" : String(v); }
  function nowISO(){ return new Date().toISOString(); }

  function log(msg){
    try{
      if (window.RCF_LOGGER && typeof window.RCF_LOGGER.push === "function") window.RCF_LOGGER.push("log", msg);
      else if (window.RCF && typeof window.RCF.log === "function") window.RCF.log(msg);
      else console.log("[THOMPSON]", msg);
    } catch {}
  }

  function readJSON(key, fb){
    try{
      const raw = localStorage.getItem(key);
      if(!raw) return fb;
      return JSON.parse(raw);
    } catch { return fb; }
  }
  function writeJSON(key, obj){
    try{ localStorage.setItem(key, JSON.stringify(obj)); } catch {}
  }

  function normalizeBundle(b){
    if (!b || typeof b !== "object") return null;
    const meta = (b.meta && typeof b.meta === "object") ? b.meta : {};
    const files = (b.files && typeof b.files === "object") ? b.files : null;
    if (!files) return null;

    // normaliza paths: sempre começando com "/"
    const outFiles = {};
    Object.keys(files).forEach((k)=>{
      const p = String(k||"").trim();
      if(!p) return;
      const path = p.startsWith("/") ? p : ("/" + p);
      outFiles[path] = safeText(files[k]);
    });

    return { meta, files: outFiles };
  }

  function validateBundle(b){
    const nb = normalizeBundle(b);
    if(!nb) return { ok:false, err:"Bundle inválido: precisa ter {files:{...}}." };

    const paths = Object.keys(nb.files);
    if(!paths.length) return { ok:false, err:"Bundle sem arquivos (files vazio)." };

    // trava de segurança (whitelist simples) — pode ajustar depois
    const allowed = [
      "/core/", "/js/core/", "/js/", "/app.js", "/index.html", "/styles.css", "/manifest.json"
    ];
    const denied = [];

    for (const p of paths){
      const ok = allowed.some(prefix => p.startsWith(prefix) || p === prefix);
      if(!ok) denied.push(p);
    }

    if (denied.length){
      return {
        ok:false,
        err:"Bundle bloqueado (paths fora do permitido):\n- " + denied.join("\n- ")
      };
    }

    return { ok:true, bundle: nb };
  }

  function getBundle(){
    return readJSON(KEY_BUNDLE, null);
  }

  function setBundle(bundle){
    writeJSON(KEY_BUNDLE, bundle);
    localStorage.setItem(KEY_BUNDLE_AT, nowISO());
  }

  function addHist(entry){
    const hist = readJSON(KEY_HIST, []);
    hist.unshift(entry);
    while(hist.length > 10) hist.pop();
    writeJSON(KEY_HIST, hist);
  }

  function dryRun(bundle){
    const v = validateBundle(bundle);
    if(!v.ok) return { ok:false, msg:v.err };

    const b = v.bundle;
    const files = Object.keys(b.files);

    return {
      ok:true,
      meta: {
        name: safeText(b.meta?.name || "bundle"),
        version: safeText(b.meta?.version || "1.0"),
        createdAt: safeText(b.meta?.createdAt || "")
      },
      filesCount: files.length,
      files
    };
  }

  function applyToVFS(filesMap){
    // 1) tenta usar API do teu VFS se existir
    const V = window.RCF_VFS_OVERRIDES;
    if (V){
      // tenta padrões diferentes sem quebrar
      if (typeof V.applyBundle === "function") return V.applyBundle(filesMap);
      if (typeof V.apply === "function") return V.apply(filesMap);
      if (typeof V.setFiles === "function") return V.setFiles(filesMap);
      if (typeof V.setFile === "function"){
        Object.keys(filesMap).forEach(p => V.setFile(p, filesMap[p]));
        return true;
      }
    }

    // 2) fallback: salva num map local (SW/VFS pode ler isso)
    const cur = readJSON(KEY_VFS, { files:{} });
    cur.files = cur.files && typeof cur.files === "object" ? cur.files : {};
    Object.assign(cur.files, filesMap);
    cur.updatedAt = nowISO();
    writeJSON(KEY_VFS, cur);
    return true;
  }

  function apply(bundle){
    const v = validateBundle(bundle);
    if(!v.ok) return { ok:false, msg:v.err };

    const b = v.bundle;

    // salva bundle atual
    setBundle({ meta: b.meta, files: b.files });

    // histórico (pra rollback 1 passo)
    addHist({
      at: nowISO(),
      meta: b.meta || {},
      files: Object.keys(b.files)
    });

    // aplica no VFS
    try{
      applyToVFS(b.files);
      log("THOMPSON apply OK (" + Object.keys(b.files).length + " files)");
      return { ok:true, msg:"APPLY OK ✅ (" + Object.keys(b.files).length + " arquivos)" };
    } catch (e){
      return { ok:false, msg:"Falha ao aplicar no VFS: " + (e?.message || String(e)) };
    }
  }

  function exportCurrent(){
    const b = getBundle();
    if(!b) return { ok:false, msg:"Sem bundle salvo." };
    return { ok:true, json: JSON.stringify(b, null, 2) };
  }

  function rollback1(){
    // rollback simples: limpa overrides e bundle
    try{
      localStorage.removeItem(KEY_BUNDLE);
      localStorage.removeItem(KEY_BUNDLE_AT);
    } catch {}
    try{
      // zera overrides fallback
      writeJSON(KEY_VFS, { files:{}, updatedAt: nowISO() });
    } catch {}
    log("THOMPSON rollback1 OK");
    return { ok:true, msg:"Rollback (voltar 1) ✅" };
  }

  function resetAll(){
    try{
      localStorage.removeItem(KEY_BUNDLE);
      localStorage.removeItem(KEY_BUNDLE_AT);
      localStorage.removeItem(KEY_HIST);
      localStorage.removeItem(KEY_VFS);
    } catch {}
    log("THOMPSON resetAll OK");
    return { ok:true, msg:"Zerar tudo ✅" };
  }

  // Expose API
  window.RCF_THOMPSON = {
    dryRun,
    apply,
    exportCurrent,
    rollback1,
    resetAll,
    getBundle
  };

  log("THOMPSON v1 ✅ carregado");
})();
