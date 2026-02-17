/* =========================================================
  RControl Factory — /app/js/core/snapshot.js (PADRÃO) — v1.0
  - Snapshot simples do estado (localStorage chaveadas)
  - ✅ PATCH: Snapshot do Mother Bundle (overrides -> bundle rcf_bundle_v1)
    -> captura lista de overrides via RCF_VFS_OVERRIDES.listOverridesSafe()
    -> baixa conteúdo via fetch(no-store)
    -> salva em rcf:mother_bundle_local (+ compat keys)
  - API: window.RCF_SNAPSHOT
========================================================= */
(() => {
  "use strict";

  if (window.RCF_SNAPSHOT && window.RCF_SNAPSHOT.__v10) return;

  const KEY = "rcf:snapshots:v1";
  const MAX = 8;

  // ---- mother bundle keys (compat) ----
  const LS_BUNDLE_KEY      = "rcf:mother_bundle_local";
  const LS_BUNDLE_COMPAT_1 = "rcf:mother_bundle";
  const LS_BUNDLE_COMPAT_2 = "rcf:mother_bundle_json";

  function nowISO(){ return new Date().toISOString(); }

  function safeParse(s, fb){ try { return JSON.parse(s); } catch { return fb; } }

  function loadAll(){
    return safeParse(localStorage.getItem(KEY) || "[]", []);
  }

  function saveAll(arr){
    try { localStorage.setItem(KEY, JSON.stringify(arr || [])); } catch {}
  }

  // =========================================================
  // Base snapshot (já existia)
  // =========================================================
  function capture(){
    const snap = {
      at: nowISO(),
      keys: {
        "rcf:apps": localStorage.getItem("rcf:apps") || null,
        "rcf:active": localStorage.getItem("rcf:active") || null,
        "rcf:registry:v1": localStorage.getItem("rcf:registry:v1") || null
      },
      note: ""
    };

    const arr = loadAll();
    arr.unshift(snap);
    while (arr.length > MAX) arr.pop();
    saveAll(arr);

    try { window.RCF_LOGGER?.push?.("ok", `snapshot saved ✅ (${arr.length}/${MAX})`); } catch {}
    return snap;
  }

  function restore(index = 0){
    const arr = loadAll();
    const snap = arr[Number(index) || 0];
    if (!snap) throw new Error("snapshot não encontrado");

    const k = snap.keys || {};
    try {
      if (k["rcf:apps"] != null) localStorage.setItem("rcf:apps", String(k["rcf:apps"]));
      if (k["rcf:active"] != null) localStorage.setItem("rcf:active", String(k["rcf:active"]));
      if (k["rcf:registry:v1"] != null) localStorage.setItem("rcf:registry:v1", String(k["rcf:registry:v1"]));
    } catch {}

    try { window.RCF_LOGGER?.push?.("ok", `snapshot restore ✅ idx=${index}`); } catch {}
    return { ok:true, restored:index, at: snap.at };
  }

  function list(){
    return loadAll().map((s, i) => ({ i, at: s.at, note: s.note || "" }));
  }

  function clear(){
    try { localStorage.removeItem(KEY); } catch {}
    return true;
  }

  // =========================================================
  // ✅ PATCH: Snapshot do Mother Bundle (overrides -> bundle)
  // =========================================================
  function _log(lvl, msg, obj){
    try {
      if (obj !== undefined) window.RCF_LOGGER?.push?.(lvl, String(msg) + " " + JSON.stringify(obj));
      else window.RCF_LOGGER?.push?.(lvl, String(msg));
    } catch {}
    try {
      if (obj !== undefined) console.log("[SNAP]", lvl, msg, obj);
      else console.log("[SNAP]", lvl, msg);
    } catch {}
  }

  function _extractListItems(res){
    const items =
      Array.isArray(res?.items) ? res.items :
      Array.isArray(res?.list) ? res.list :
      Array.isArray(res?.paths) ? res.paths :
      Array.isArray(res?.keys) ? res.keys :
      null;

    if (!Array.isArray(items)) return [];

    // aceita strings ou objetos com path
    const out = [];
    for (const it of items){
      if (typeof it === "string") {
        const p = it.trim();
        if (p) out.push(p);
        continue;
      }
      if (it && typeof it === "object") {
        const p = String(it.path || it.key || it.name || "").trim();
        if (p) out.push(p);
      }
    }
    return out;
  }

  function _toRepoPath(p){
    // runtime path costuma vir como "/js/..." ou "/index.html"
    let x = String(p || "").trim();
    if (!x) return "";
    x = x.split("#")[0].split("?")[0].trim();

    // se já vier como "app/..." mantém
    if (x.startsWith("app/")) return x;

    // remove "/" inicial
    if (x.startsWith("/")) x = x.slice(1);

    // se vier vazio
    if (!x) return "";

    // prefixa app/
    return "app/" + x;
  }

  async function _fetchText(path){
    const res = await fetch(path, { cache: "no-store" });
    const ct = String(res.headers.get("content-type") || "").trim() || "text/plain; charset=utf-8";
    const txt = await res.text();
    return { ok: res.ok, status: res.status, contentType: ct, text: txt };
  }

  function _saveMotherBundleObj(bundleObj){
    const txt = JSON.stringify(bundleObj);
    try { localStorage.setItem(LS_BUNDLE_KEY, txt); } catch {}
    try { localStorage.setItem(LS_BUNDLE_COMPAT_1, txt); } catch {}
    try { localStorage.setItem(LS_BUNDLE_COMPAT_2, txt); } catch {}
    return txt;
  }

  /**
   * Captura bundle a partir do SW overrides (snapshot real do que está aplicado)
   * opts:
   * - maxFiles (default 250)
   * - allowStaleList (default true)
   * - onProgress({step, done, total, path, ok, status})
   */
  async function captureMotherBundle(opts = {}){
    const V = window.RCF_VFS_OVERRIDES;
    if (!V || typeof V.listOverridesSafe !== "function") {
      throw new Error("captureMotherBundle: RCF_VFS_OVERRIDES.listOverridesSafe ausente");
    }

    const maxFiles = Number(opts.maxFiles || 250);
    const allowStaleList = (opts.allowStaleList !== false);
    const onProgress = (typeof opts.onProgress === "function") ? opts.onProgress : null;

    _log("ok", "snapshot mother bundle: start");

    const listSafe = await V.listOverridesSafe({ allowStale: allowStaleList });
    if (!listSafe || !listSafe.ok || !listSafe.res) {
      throw new Error("captureMotherBundle: LIST falhou" + (listSafe?.warn ? " :: " + listSafe.warn : ""));
    }

    const paths = _extractListItems(listSafe.res);
    if (!paths.length) {
      // bundle vazio (bridge)
      const bundleEmpty = { version: "rcf_bundle_v1", ts: Date.now(), files: [] };
      _saveMotherBundleObj(bundleEmpty);
      _log("warn", "snapshot mother bundle: overrides list vazio (bridge)", { from: listSafe.from || "?", warn: listSafe.warn || "" });
      if (onProgress) {
        try { onProgress({ step:"done", done:0, total:0, bridge:true }); } catch {}
      }
      try { window.RCF_LOGGER?.push?.("ok", "mother_bundle_local saved filesCount=0 (bridge)"); } catch {}
      return { ok:true, bridge:true, total:0, saved:true };
    }

    const total = Math.min(paths.length, maxFiles);
    const files = [];

    for (let i = 0; i < total; i++){
      const runtimePath = paths[i];
      const repoPath = _toRepoPath(runtimePath);

      if (onProgress) {
        try { onProgress({ step:"fetch_progress", done:i, total, path: repoPath }); } catch {}
      }

      if (!repoPath) continue;

      try {
        // fetch usando o path runtime (com "/...") pois é o que o SW override atende
        const fetchPath = String(runtimePath || "").trim();
        const r = await _fetchText(fetchPath);

        if (!r.ok) {
          _log("warn", "snapshot fetch non-200", { path: fetchPath, status: r.status });
          files.push({ path: repoPath, content: r.text || "", contentType: r.contentType || "text/plain; charset=utf-8" });
        } else {
          files.push({ path: repoPath, content: r.text || "", contentType: r.contentType || "text/plain; charset=utf-8" });
        }

        if (onProgress) {
          try { onProgress({ step:"fetch_done", done:i+1, total, path: repoPath, ok:r.ok, status:r.status }); } catch {}
        }
      } catch (e) {
        const em = (e && e.message) ? e.message : String(e);
        _log("err", "snapshot fetch fail", { path: runtimePath, err: em });

        // ainda assim inclui placeholder pra não “sumir” do bundle
        files.push({ path: repoPath, content: "", contentType: "text/plain; charset=utf-8" });

        if (onProgress) {
          try { onProgress({ step:"fetch_err", done:i+1, total, path: repoPath, ok:false, err: em }); } catch {}
        }
      }
    }

    const bundle = { version: "rcf_bundle_v1", ts: Date.now(), files };
    _saveMotherBundleObj(bundle);

    try { window.RCF_LOGGER?.push?.("ok", `mother_bundle_local saved filesCount=${files.length} (snapshot)`); } catch {}
    _log("ok", "snapshot mother bundle: saved", { filesCount: files.length, from: listSafe.from || "rpc" });

    if (onProgress) {
      try { onProgress({ step:"done", done:files.length, total, saved:true }); } catch {}
    }

    return { ok:true, saved:true, total: files.length };
  }

  function getLocalMotherBundleText(){
    const txt = String(localStorage.getItem(LS_BUNDLE_KEY) || "").trim();
    return txt || "";
  }

  // expõe API
  window.RCF_SNAPSHOT = {
    __v10:true,
    capture,
    restore,
    list,
    clear,

    // ✅ novos
    captureMotherBundle,
    getLocalMotherBundleText
  };

  try { window.RCF_LOGGER?.push?.("ok", "core/snapshot.js ready ✅ (v1.0)"); } catch {}
})();
