/* FILE: /app/js/core/agent_scanmap.js
   RControl Factory — agent_scanmap.js — v1.0 SAFE
   Objetivo: Factory “saber onde tá cada coisa” (mapa)
   - ✅ Coleta: scripts[src], links[href], overrides (se houver), mother_bundle_local, fillers (GH_SYNC.listFillers)
   - ✅ UI no Agent (slot rcfAgentSlotTools): Scan / Copy JSON / Copy Summary
   - ✅ Salva localStorage: rcf:scanmap:v1
   - SAFE: nunca quebra tela, tudo em try/catch
*/
(() => {
  "use strict";

  try {
    if (window.RCF_SCANMAP && window.RCF_SCANMAP.__v10) return;

    const LS_KEY = "rcf:scanmap:v1";

    const log = (lvl, msg, obj) => {
      try {
        const line = obj !== undefined ? (msg + " " + JSON.stringify(obj)) : msg;
        window.RCF_LOGGER?.push?.(lvl, line);
      } catch {}
      try { console.log("[SCANMAP]", lvl, msg, obj ?? ""); } catch {}
    };

    const safeParse = (raw, fb) => { try { return raw ? JSON.parse(raw) : fb; } catch { return fb; } };

    function uniqSorted(arr){
      const m = new Map();
      for (const x of (arr || [])) {
        const s = String(x || "").trim();
        if (!s) continue;
        if (!m.has(s)) m.set(s, true);
      }
      return Array.from(m.keys()).sort((a,b)=>a.localeCompare(b));
    }

    function normPath(x){
      let p = String(x || "").trim();
      if (!p) return "";
      p = p.replace(/\\/g, "/");
      p = p.split("#")[0].split("?")[0];
      p = p.replace(/^(\.\/)+/, "");
      p = p.replace(/^\/+/, "");
      // normaliza script/link do runtime pra "app/..." quando vier "js/..."
      if (p.startsWith("js/")) p = "app/" + p;
      return p;
    }

    function getLoadedScripts(){
      const out = [];
      try {
        const list = Array.from(document.querySelectorAll("script[src]"));
        for (const s of list) {
          const src = s.getAttribute("src") || "";
          const p = normPath(src);
          if (p) out.push(p);
        }
      } catch {}
      return uniqSorted(out);
    }

    function getLoadedLinks(){
      const out = [];
      try {
        const list = Array.from(document.querySelectorAll('link[rel="stylesheet"][href], link[rel="manifest"][href]'));
        for (const l of list) {
          const href = l.getAttribute("href") || "";
          const p = normPath(href);
          if (p) out.push(p);
        }
      } catch {}
      return uniqSorted(out);
    }

    async function getOverridesPaths(){
      try {
        const O = window.RCF_VFS_OVERRIDES;
        if (!O) return { ok:false, paths: [], err: "RCF_VFS_OVERRIDES ausente" };

        // prefer SAFE
        if (typeof O.listOverridesSafe === "function") {
          const r = await O.listOverridesSafe({ allowStale:true });
          const res = r?.res || null;

          const items =
            Array.isArray(res?.items) ? res.items :
            Array.isArray(res?.list) ? res.list :
            Array.isArray(res?.paths) ? res.paths :
            Array.isArray(res?.keys) ? res.keys :
            null;

          const out = [];
          if (Array.isArray(items)) {
            for (const it of items){
              const p = normPath(
                (typeof it === "string") ? it :
                (it?.path != null) ? it.path :
                (it?.key != null) ? it.key :
                ""
              );
              if (p) out.push(p);
            }
          }
          return { ok:true, paths: uniqSorted(out), meta: { mode: r?.from || "safe", count: out.length } };
        }

        if (typeof O.listOverrides === "function") {
          const res = await O.listOverrides();
          const items =
            Array.isArray(res?.items) ? res.items :
            Array.isArray(res?.list) ? res.list :
            Array.isArray(res?.paths) ? res.paths :
            Array.isArray(res?.keys) ? res.keys :
            null;

          const out = [];
          if (Array.isArray(items)) {
            for (const it of items){
              const p = normPath(
                (typeof it === "string") ? it :
                (it?.path != null) ? it.path :
                (it?.key != null) ? it.key :
                ""
              );
              if (p) out.push(p);
            }
          }
          return { ok:true, paths: uniqSorted(out), meta: { mode: "listOverrides", count: out.length } };
        }

        return { ok:false, paths: [], err: "sem listOverridesSafe/listOverrides" };
      } catch (e) {
        return { ok:false, paths: [], err: String(e?.message || e) };
      }
    }

    function getBundleLocalPaths(){
      try {
        const raw = localStorage.getItem("rcf:mother_bundle_local") || "";
        const j = safeParse(raw, null);
        const files = Array.isArray(j?.files) ? j.files : [];
        const out = [];
        for (const f of files){
          const p = normPath(f?.path || "");
          if (p) out.push(p);
        }
        return { ok:true, paths: uniqSorted(out), meta: { filesCount: files.length, ts: j?.ts || 0, version: j?.version || "" } };
      } catch (e) {
        return { ok:false, paths: [], err: String(e?.message || e) };
      }
    }

    function getFillers(){
      try {
        if (window.RCF_GH_SYNC?.listFillers) {
          const r = window.RCF_GH_SYNC.listFillers();
          return {
            ok: true,
            defaults: uniqSorted((r?.defaults || []).map(normPath)),
            discovered: uniqSorted((r?.discovered || []).map(normPath)),
            all: uniqSorted((r?.all || []).map(normPath))
          };
        }
      } catch {}
      return { ok:false, defaults: [], discovered: [], all: [] };
    }

    function detectVersions(){
      const v = {};
      try { v.github_sync = window.RCF_GH_SYNC?.__v24h ? "v2.4h" : "unknown"; } catch {}
      try { v.admin_github = window.RCF_ADMIN_GH?.__v27d ? "v2.7d" : (window.RCF_ADMIN_GH?.__v28a ? "v2.8a" : "unknown"); } catch {}
      try { v.vfs_overrides = window.RCF_VFS_OVERRIDES?.__v13b ? "v1.3b" : "unknown"; } catch {}
      try { v.preview = window.RCF_PREVIEW?.open ? "present" : "missing"; } catch {}
      try { v.agent_runtime = window.RCF_AGENT_RUNTIME?.__v10 ? "v1.0" : "present"; } catch {}
      return v;
    }

    function buildSummary(map){
      const lines = [];
      lines.push(`RCF ScanMap @ ${new Date(map.ts).toLocaleString()}`);
      lines.push(`scripts=${map.loaded.scripts.length} links=${map.loaded.links.length}`);
      lines.push(`overrides=${map.overrides.paths.length} (ok=${map.overrides.ok})`);
      lines.push(`bundle_local=${map.bundle_local.paths.length} (ok=${map.bundle_local.ok})`);
      lines.push(`fillers=${map.fillers.all.length} (ok=${map.fillers.ok})`);
      lines.push(`versions=${JSON.stringify(map.versions)}`);
      return lines.join("\n");
    }

    async function runScan(opts = {}) {
      const startedAt = Date.now();

      const loaded = {
        scripts: getLoadedScripts(),
        links: getLoadedLinks()
      };

      const overrides = await getOverridesPaths();
      const bundle_local = getBundleLocalPaths();
      const fillers = getFillers();
      const versions = detectVersions();

      const map = {
        version: "scanmap_v1",
        ts: Date.now(),
        tookMs: Date.now() - startedAt,
        base: (() => {
          try { return String(window.location.href || ""); } catch { return ""; }
        })(),
        loaded,
        overrides: { ok: !!overrides.ok, paths: overrides.paths || [], meta: overrides.meta || {}, err: overrides.err || "" },
        bundle_local: { ok: !!bundle_local.ok, paths: bundle_local.paths || [], meta: bundle_local.meta || {}, err: bundle_local.err || "" },
        fillers,
        versions,
      };

      try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch {}
      try { window.__RCF_SCANMAP_LAST__ = map; } catch {}

      log("OK", "scanmap done ✅", {
        scripts: loaded.scripts.length,
        overrides: (overrides.paths || []).length,
        bundle: (bundle_local.paths || []).length,
        fillers: (fillers.all || []).length
      });

      // UI update (se existir)
      try { refreshUI(map); } catch {}

      return map;
    }

    function getLast() {
      try { return window.__RCF_SCANMAP_LAST__ || safeParse(localStorage.getItem(LS_KEY) || "", null); }
      catch { return null; }
    }

    // ---------------- UI (Agent Slot) ----------------
    const $ = (sel, root=document) => root.querySelector(sel);

    function ensureUI(){
      const host = document.getElementById("rcfAgentSlotTools") || document.body;
      if (!host) return null;

      let box = document.getElementById("rcfScanMapBox");
      if (box) return box;

      box = document.createElement("div");
      box.id = "rcfScanMapBox";
      box.style.cssText = [
        "margin-top:10px",
        "border:1px solid rgba(255,255,255,.12)",
        "background:rgba(0,0,0,.22)",
        "border-radius:14px",
        "padding:10px"
      ].join(";");

      box.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="font-weight:900;color:#fff">ScanMap</div>
          <div id="rcfScanMapStats" style="font-size:12px;opacity:.85;color:#fff">—</div>
          <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
            <button id="btnScanNow" type="button" style="padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:#fff;font-weight:800">Scan now</button>
            <button id="btnScanCopySummary" type="button" style="padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:#fff;font-weight:800">Copy summary</button>
            <button id="btnScanCopyJSON" type="button" style="padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:#fff;font-weight:800">Copy JSON</button>
          </div>
        </div>
        <pre id="rcfScanMapOut" style="margin-top:10px;padding:10px;border-radius:12px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.10);color:#fff;white-space:pre-wrap;word-break:break-word;font-size:12px;max-height:220px;overflow:auto">Pronto.</pre>
      `;

      try { host.appendChild(box); } catch { document.body.appendChild(box); }

      $("#btnScanNow", box)?.addEventListener("click", () => runScan({}), { passive:true });
      $("#btnScanCopySummary", box)?.addEventListener("click", () => {
        const last = getLast();
        const txt = last ? buildSummary(last) : "Sem scan ainda.";
        tryCopy(txt);
        try { $("#rcfScanMapOut", box).textContent = "✅ Summary copiado."; } catch {}
      }, { passive:true });

      $("#btnScanCopyJSON", box)?.addEventListener("click", () => {
        const last = getLast();
        const txt = last ? JSON.stringify(last, null, 2) : "{}";
        tryCopy(txt);
        try { $("#rcfScanMapOut", box).textContent = "✅ JSON copiado."; } catch {}
      }, { passive:true });

      return box;
    }

    function refreshUI(map){
      const box = ensureUI();
      if (!box || !map) return;

      const stats = $("#rcfScanMapStats", box);
      const out = $("#rcfScanMapOut", box);

      if (stats) {
        stats.textContent =
          `scripts=${map.loaded.scripts.length} • overrides=${map.overrides.paths.length} • bundle=${map.bundle_local.paths.length} • fillers=${map.fillers.all.length} • ${map.tookMs}ms`;
      }

      if (out) out.textContent = buildSummary(map);
    }

    function tryCopy(text){
      const t = String(text || "");
      if (!t) return false;

      try {
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(t).catch(()=>{});
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

    // ---------- Boot ----------
    function boot(){
      try { ensureUI(); } catch {}
      // auto scan leve (não agressivo)
      setTimeout(() => { runScan({}).catch(()=>{}); }, 600);
      setTimeout(() => { runScan({}).catch(()=>{}); }, 2200);
      log("OK", "agent_scanmap.js ready ✅ (v1.0)");
    }

    // API global
    window.RCF_SCANMAP = {
      __v10: true,
      run: runScan,
      getLast
    };

    if (document.readyState === "loading") {
      window.addEventListener("DOMContentLoaded", boot, { once:true });
    } else {
      boot();
    }

  } catch (e) {
    try { console.error("RCF scanmap fatal:", e); } catch {}
  }
})();
