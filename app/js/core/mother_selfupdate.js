/* RControl Factory — /app/js/core/mother_selfupdate.js (PADRÃO) — v1.2
   - Update da "Mãe" via GitHub bundle (mother_bundle.json)
   - Resolve Overrides API (RCF_VFS_OVERRIDES / RCF_VFS) + fallback clear via LIST+DEL
   - Salva bundle local (para Push Mother Bundle funcionar)
*/
(() => {
  "use strict";

  if (window.RCF_MAE && window.RCF_MAE.__v12) return;

  const VERSION = "v1.2";
  const LS_LOCAL_BUNDLE = "rcf:mother_bundle_local_text";

  const log = (lvl, msg) => {
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[MAE]", lvl, msg); } catch {}
  };

  function pickFn(obj, name) {
    const fn = obj && obj[name];
    return (typeof fn === "function") ? fn.bind(obj) : null;
  }

  function getOverridesApi() {
    // tenta várias opções (pra não depender de 1 nome só)
    const a = window.RCF_VFS_OVERRIDES;
    const b = window.RCF_VFS;

    // preferir o mais completo
    const cand = [a, b].filter(Boolean);

    for (const api of cand) {
      const put = pickFn(api, "put") || pickFn(api, "putOverride");
      const clear = pickFn(api, "clearOverrides") || pickFn(api, "clear");
      const list = pickFn(api, "listOverrides") || pickFn(api, "list");
      const del  = pickFn(api, "delOverride") || pickFn(api, "del") || pickFn(api, "deleteOverride");
      const norm = pickFn(api, "normPath");

      if (put) {
        return { api, put, clear, list, del, norm };
      }
    }

    return null;
  }

  async function fallbackClearUsingListDel(ovr) {
    // fallback robusto: LIST + DEL
    if (!ovr?.list || !ovr?.del) throw new Error("Overrides VFS sem clearOverrides() e sem LIST/DEL");
    const r = await ovr.list();
    const paths = r?.paths || r?.items || [];
    let n = 0;

    for (const p of paths) {
      try {
        await ovr.del(p);
        n++;
      } catch {}
    }
    return { ok: true, mode: "fallback(list+del)", deleted: n, count: paths.length };
  }

  function parseBundleText(txt) {
    let data;
    try { data = JSON.parse(String(txt || "")); }
    catch { throw new Error("bundle JSON inválido"); }

    // aceitar vários formatos
    // 1) { files: [ {path, content, contentType} ] }
    if (Array.isArray(data?.files)) return data.files;

    // 2) { files: { "app/index.html": "..." } } ou { files: {path:{content,contentType}}}
    if (data?.files && typeof data.files === "object") {
      const out = [];
      for (const [k, v] of Object.entries(data.files)) {
        if (typeof v === "string") out.push({ path: k, content: v });
        else out.push({ path: k, content: v?.content ?? "", contentType: v?.contentType });
      }
      return out;
    }

    // 3) array direto
    if (Array.isArray(data)) return data;

    throw new Error("bundle sem 'files' (formato não reconhecido)");
  }

  function normalizeRepoPathToRuntime(p) {
    // aceita "app/..." e transforma em "/..."
    let x = String(p || "").trim();
    x = x.replace(/^\/+/, "");
    if (x.startsWith("app/")) x = x.slice(4);
    return "/" + x;
  }

  async function getLocalBundleText() {
    const t = localStorage.getItem(LS_LOCAL_BUNDLE);
    return t && String(t).trim() ? String(t) : "";
  }

  async function setLocalBundleText(txt) {
    try { localStorage.setItem(LS_LOCAL_BUNDLE, String(txt || "")); } catch {}
  }

  async function clearOverrides() {
    const ovr = getOverridesApi();
    if (!ovr) throw new Error("Overrides VFS ausente");

    // se tiver clearOverrides nativo, usa
    if (ovr.clear) {
      const r = await ovr.clear();
      return r || { ok: true, mode: "clearOverrides()" };
    }

    // fallback
    return await fallbackClearUsingListDel(ovr);
  }

  async function updateFromGitHub(opts = {}) {
    const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;

    const ovr = getOverridesApi();
    if (!ovr) throw new Error("Overrides VFS ausente");
    if (!ovr.put) throw new Error("Overrides VFS sem put()");

    // ✅ aqui a gente NÃO falha só porque clearOverrides não existe
    // a gente usa fallback se precisar
    const haveClear = !!ovr.clear || (!!ovr.list && !!ovr.del);

    if (!haveClear) {
      throw new Error("Overrides VFS incompleto");
    }

    if (!window.RCF_GH_SYNC?.pull) throw new Error("RCF_GH_SYNC.pull ausente");

    log("ok", "update start");

    const cfg = window.RCF_GH_SYNC?.loadConfig ? window.RCF_GH_SYNC.loadConfig() : null;
    // pull do bundle (texto)
    const bundleText = await window.RCF_GH_SYNC.pull(cfg || {});
    await setLocalBundleText(bundleText);

    const files = parseBundleText(bundleText);
    const total = files.length;

    let wrote = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      const f = files[i] || {};
      const repoPath = String(f.path || f.file || "").trim();
      const runtimePath = normalizeRepoPathToRuntime(repoPath);
      const content = (f.content ?? f.text ?? "");
      const contentType = f.contentType;

      try {
        if (onProgress) onProgress({ step: "apply_progress", done: i, total });
        await ovr.put(runtimePath, String(content ?? ""), contentType);
        wrote++;
      } catch (e) {
        failed++;
        log("err", `apply fail ${runtimePath} :: ${e?.message || e}`);
      }
    }

    if (onProgress) onProgress({ step: "apply_done", done: wrote, total });

    log("ok", "update done");
    return { ok: true, wrote, failed, total };
  }

  const api = {
    __v12: true,
    VERSION,
    status() {
      const ovr = getOverridesApi();
      return {
        ok: true,
        v: VERSION,
        overrides_found: !!ovr,
        has_put: !!ovr?.put,
        has_clear: !!ovr?.clear,
        has_list: !!ovr?.list,
        has_del: !!ovr?.del,
        sw_controller: !!navigator.serviceWorker?.controller,
      };
    },
    clearOverrides,
    updateFromGitHub,
    getLocalBundleText,
    setLocalBundleText,
  };

  window.RCF_MAE = api;
  log("ok", "mother_selfupdate.js ready ✅");
})();
