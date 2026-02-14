/* RControl Factory — /app/js/core/mother_selfupdate.js (PADRÃO) — v1.2
   - Cria SEMPRE window.RCF_MAE (nunca "mae: absent")
   - updateFromGitHub: puxa bundle via RCF_GH_SYNC.pull() e aplica via RCF_VFS_OVERRIDES.put()
   - clearOverrides: tenta delete individual se existir listFiles/deleteFile; senão usa clear()
   - Anti-timeout iOS: timeout por arquivo + retries + progresso
*/
(() => {
  "use strict";

  // evita dupla carga
  if (window.RCF_MAE && window.RCF_MAE.__v12) return;

  const log = (lvl, msg) => {
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { /* console.log("[MAE]", lvl, msg); */ } catch {}
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function head80(t){
    return String(t || "").slice(0, 80).replace(/\s+/g, " ").trim();
  }

  function looksLikeJson(text){
    const t = String(text || "").trim();
    if (!t) return false;
    if (t.startsWith("<!DOCTYPE") || t.startsWith("<html")) return false;
    return t[0] === "{";
  }

  function parseBundle(text){
    if (!looksLikeJson(text)) {
      throw new Error(`bundle não é JSON (head="${head80(text)}")`);
    }
    let j;
    try { j = JSON.parse(text); }
    catch (e) { throw new Error("bundle JSON inválido: " + (e?.message || e)); }

    const files = j?.files;
    if (!files || typeof files !== "object" || Object.keys(files).length === 0) {
      throw new Error("bundle sem files (ou vazio)");
    }
    return j;
  }

  function normalizePath(p){
    let x = String(p || "").trim();
    if (!x) return "";
    x = x.split("#")[0].split("?")[0].trim();
    if (!x.startsWith("/")) x = "/" + x;
    x = x.replace(/\/{2,}/g, "/");

    // repo pode ter /app/... → runtime é /
    if (x.startsWith("/app/")) x = x.slice(4);
    if (!x.startsWith("/")) x = "/" + x;
    return x;
  }

  function pickOverrides(){
    const o = window.RCF_VFS_OVERRIDES;
    if (o && typeof o.put === "function") return o;
    return null;
  }

  function withTimeout(promise, ms, label){
    let t;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms (${label})`)), ms);
    });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(t));
  }

  async function applyBundle(bundleObj, opts){
    const onProgress = typeof opts?.onProgress === "function" ? opts.onProgress : null;

    const files = bundleObj?.files || {};
    const keys = Object.keys(files);
    const total = keys.length;

    const vfs = pickOverrides();
    if (!vfs) throw new Error("Overrides VFS ausente (RCF_VFS_OVERRIDES.put). Recarregue 1x.");

    let wrote = 0, failed = 0;

    for (let i = 0; i < keys.length; i++){
      const raw = keys[i];
      const entry = files[raw];

      // aceita {content, contentType} ou string direto
      let content, contentType;
      if (entry && typeof entry === "object" && ("content" in entry)) {
        content = String(entry.content ?? "");
        contentType = String(entry.contentType || "");
      } else {
        content = String(entry ?? "");
        contentType = "";
      }

      const path = normalizePath(raw);
      if (!path || path.endsWith("/")) continue;

      onProgress && onProgress({ step:"apply_progress", done:i, total, path });

      // retries curtinhos (iOS)
      let ok = false;
      let lastErr = null;
      for (let a = 1; a <= 3; a++){
        try{
          await withTimeout(vfs.put(path, content, contentType), 6000, `put(${path})`);
          wrote++;
          ok = true;
          lastErr = null;
          break;
        } catch (e){
          lastErr = e;
          await sleep(250 * a);
        }
      }

      if (!ok){
        failed++;
        log("warn", `mae apply fail: ${path} -> ${String(lastErr?.message || lastErr)}`);
      }
    }

    onProgress && onProgress({ step:"apply_done", done:wrote, total, failed });
    return { wrote, failed, total };
  }

  async function updateFromGitHub(opts){
    const onProgress = typeof opts?.onProgress === "function" ? opts.onProgress : null;

    log("ok", "update start");
    onProgress && onProgress({ step:"start" });

    if (!window.RCF_GH_SYNC?.pull) throw new Error("RCF_GH_SYNC.pull ausente");

    // puxa bundle (texto)
    const txt = await withTimeout(
      window.RCF_GH_SYNC.pull(),
      12000,
      "gh_pull"
    );

    const bundle = parseBundle(txt);

    // aplica (com timeout global um pouco maior)
    const res = await withTimeout(
      applyBundle(bundle, { onProgress }),
      20000,
      "apply_bundle"
    );

    log("ok", "update done");
    onProgress && onProgress({ step:"done", ...res });
    return { ok:true, ...res };
  }

  async function clearOverrides(){
    const vfs = pickOverrides();
    if (!vfs) throw new Error("Overrides VFS ausente (RCF_VFS_OVERRIDES).");

    // se tiver list/del, faz granular (mais seguro)
    if (typeof vfs.listFiles === "function" && typeof vfs.deleteFile === "function") {
      const paths = await withTimeout(vfs.listFiles(), 6500, "listFiles()");
      let del = 0;
      for (const p of paths){
        try{
          const ok = await withTimeout(vfs.deleteFile(p), 3500, `deleteFile(${p})`);
          if (ok) del++;
        } catch {}
      }
      log("ok", "clearOverrides ok");
      return { ok:true, deleted: del, mode:"list+del" };
    }

    // fallback universal
    if (typeof vfs.clear === "function") {
      await withTimeout(vfs.clear(), 8000, "clear()");
      log("ok", "clearOverrides ok");
      return { ok:true, mode:"clear()" };
    }

    throw new Error("clearOverrides: sem clear/listFiles/deleteFile");
  }

  function check(){
    const hasSync = !!window.RCF_GH_SYNC;
    const hasOverridesVFS = !!pickOverrides();
    return {
      ok: true,
      v: "v1.2",
      motherRoot: "/app",
      hasSync,
      hasOverridesVFS
    };
  }

  // ✅ EXPORTA SEMPRE (mesmo se algo falhar depois)
  window.RCF_MAE = {
    __v12: true,
    check,
    updateFromGitHub,
    clearOverrides
  };

  // log de vida (se der erro depois, pelo menos aparece)
  log("ok", "mother_selfupdate.js ready ✅");
})();
