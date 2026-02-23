/* FILE: app/js/core/doctor_scan.js
   RControl Factory — Doctor Scan — v1.1 (FIX SLOT + STORAGE KEYS + REPORT UI)
*/

(() => {
  "use strict";

  const TAG = "[DOCTOR]";
  const VERSION = "1.1";

  if (window.__RCF_DOCTOR_LOADED__) return;
  window.__RCF_DOCTOR_LOADED__ = true;

  const log = (...a) => {
    try { console.log(TAG, ...a); } catch {}
  };

  const $ = (sel, root = document) => root.querySelector(sel);

  function tsISO() {
    try { return new Date().toISOString(); } catch { return "" + Date.now(); }
  }

  function findHost() {
    return (
      $("#rcfAdminSlotIntegrations") ||
      $("#rcfAdminSlotTop") ||
      $("#view-admin") ||
      null
    );
  }

  function ensureStyles() {
    if ($("#__rcf_doctor_css")) return;
    const st = document.createElement("style");
    st.id = "__rcf_doctor_css";
    st.textContent = `
      .rcfDoctorRow{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
      .rcfDoctorBtn{
        border:0;border-radius:999px;padding:10px 12px;font-weight:900;
        background:rgba(255,255,255,.12);color:#eaf0ff;border:1px solid rgba(255,255,255,.18)
      }
      .rcfDoctorBtn.ok{background:#35d0b5;color:#071018}
      .rcfDoctorBtn.danger{background:#ff4d4d;color:#1a0b0b}
      .rcfDoctorOverlay{
        position:fixed;inset:0;background:rgba(0,0,0,.6);
        display:none;align-items:flex-end;justify-content:center;
        z-index:999999;padding:10px;
      }
      .rcfDoctorPanel{
        width:min(980px,100%);max-height:82vh;overflow:auto;
        background:#0b1020;color:#eaf0ff;border-radius:16px;
        border:1px solid rgba(255,255,255,.14);
        padding:12px;
      }
      .rcfDoctorPanel pre{
        white-space:pre-wrap;word-break:break-word;
        background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.12);
        padding:10px;border-radius:12px;
      }
    `;
    document.head.appendChild(st);
  }

  function ensureOverlay() {
    ensureStyles();
    let ov = $("#__rcf_doctor_overlay");
    if (ov) return ov;

    ov = document.createElement("div");
    ov.id = "__rcf_doctor_overlay";
    ov.className = "rcfDoctorOverlay";
    ov.innerHTML = `
      <div class="rcfDoctorPanel">
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <button class="rcfDoctorBtn" id="__rcf_doc_close">Fechar</button>
          <button class="rcfDoctorBtn ok" id="__rcf_doc_copy">Copiar report</button>
        </div>
        <pre id="__rcf_doc_pre">Pronto.</pre>
      </div>
    `;
    document.body.appendChild(ov);

    $("#__rcf_doc_close").onclick = () => ov.style.display = "none";

    $("#__rcf_doc_copy").onclick = async () => {
      const txt = $("#__rcf_doc_pre").textContent || "";
      try {
        await navigator.clipboard.writeText(txt);
        alert("Report copiado ✅");
      } catch {
        alert("Falhou copiar ❌");
      }
    };

    ov.addEventListener("click", (e) => {
      if (e.target === ov) ov.style.display = "none";
    });

    return ov;
  }

  async function getSWInfo() {
    const out = { supported:false, controller:false, registrations:0 };
    try {
      out.supported = "serviceWorker" in navigator;
      if (!out.supported) return out;
      out.controller = !!navigator.serviceWorker.controller;
      const regs = await navigator.serviceWorker.getRegistrations();
      out.registrations = regs.length;
    } catch(e) {
      out.error = e.message || String(e);
    }
    return out;
  }

  async function getCacheInfo() {
    const out = { supported:false, keys:0 };
    try {
      out.supported = "caches" in window;
      if (!out.supported) return out;
      const keys = await caches.keys();
      out.keys = keys.length;
    } catch(e){
      out.error = e.message || String(e);
    }
    return out;
  }

  function getLocalStorageInfo() {
    const out = { keys:0, rcfKeys:[] };
    try {
      for (let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if (k) {
          out.keys++;
          if (k.startsWith("rcf:")) out.rcfKeys.push(k);
        }
      }
    } catch(e){
      out.error = e.message || String(e);
    }
    return out;
  }

  function getMotherBundleLocalInfo() {
    const keys = [
      "rcf:mother_bundle_local",
      "mother_bundle_local"
    ];
    const out = { present:false };
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v) {
        out.present = true;
        out.key = k;
        out.size = v.length;
        try {
          const parsed = JSON.parse(v);
          if (parsed.files) {
            out.filesCount = Array.isArray(parsed.files)
              ? parsed.files.length
              : Object.keys(parsed.files).length;
          }
        } catch {}
        break;
      }
    }
    return out;
  }

  function getResourceList() {
    const entries = performance.getEntriesByType("resource") || [];
    const urls = entries
      .map(e => e.name)
      .filter(n => n.includes(".js") || n.includes(".css"));

    const norm = urls.map(u => u.split("?")[0]);
    const map = new Map();
    norm.forEach(u => map.set(u, (map.get(u)||0)+1));

    const dups = [...map.entries()].filter(([_,c]) => c>1);
    return {
      total: norm.length,
      unique: map.size,
      dupsCount: dups.length,
      dups
    };
  }

  async function buildReport() {
    const sw = await getSWInfo();
    const cache = await getCacheInfo();
    const ls = getLocalStorageInfo();
    const mother = getMotherBundleLocalInfo();
    const res = getResourceList();

    const lines = [];
    lines.push(`[${tsISO()}] RCF DOCTOR REPORT v${VERSION}`);
    lines.push("");
    lines.push("== Service Worker ==");
    lines.push(`supported: ${sw.supported}`);
    lines.push(`controller: ${sw.controller}`);
    lines.push(`registrations: ${sw.registrations}`);
    if (sw.error) lines.push(`error: ${sw.error}`);
    lines.push("");

    lines.push("== Cache API ==");
    lines.push(`supported: ${cache.supported}`);
    lines.push(`keys: ${cache.keys}`);
    if (cache.error) lines.push(`error: ${cache.error}`);
    lines.push("");

    lines.push("== localStorage ==");
    lines.push(`total keys: ${ls.keys}`);
    lines.push(`rcf:* keys: ${ls.rcfKeys.length}`);
    lines.push("");

    lines.push("== mother_bundle_local ==");
    lines.push(`present: ${mother.present}`);
    if (mother.present) {
      lines.push(`key: ${mother.key}`);
      lines.push(`size: ${mother.size}`);
      lines.push(`filesCount: ${mother.filesCount || 0}`);
    }
    lines.push("");

    lines.push("== Resources ==");
    lines.push(`total: ${res.total}`);
    lines.push(`unique: ${res.unique}`);
    lines.push(`duplicates: ${res.dupsCount}`);
    if (res.dups.length){
      lines.push("top duplicates:");
      res.dups.slice(0,20).forEach(([u,c])=>{
        lines.push(` - x${c} ${u}`);
      });
    }

    return lines.join("\n");
  }

  function mountDoctorUI() {
    const host = findHost();
    if (!host) return false;
    if ($("#__rcf_doctor_mount")) return true;

    const wrap = document.createElement("div");
    wrap.id = "__rcf_doctor_mount";
    wrap.style.marginTop = "10px";

    const btn = document.createElement("button");
    btn.className = "rcfDoctorBtn ok";
    btn.textContent = "🩺 Doctor Scan";

    btn.onclick = async () => {
      const report = await buildReport();
      const ov = ensureOverlay();
      $("#__rcf_doc_pre").textContent = report;
      ov.style.display = "flex";
    };

    wrap.appendChild(btn);
    host.appendChild(wrap);

    log("Doctor mounted OK");
    return true;
  }

  // tenta montar agora e depois
  mountDoctorUI();
  window.addEventListener("RCF:UI_READY", mountDoctorUI);
  document.addEventListener("DOMContentLoaded", mountDoctorUI);

  log("doctor_scan.js ready", VERSION);

})();
