/* FILE: app/js/core/doctor_scan.js
   RControl Factory — DOCTOR SCAN — v1.5 (API ONLY + small)
   - ✅ Não injeta botão sozinho (sem bagunça)
   - ✅ Exponha: window.RCF_DOCTOR_SCAN.open() / scan()
   - ✅ Modal com scroll iOS safe
*/

(() => {
  "use strict";

  const VERSION = "v1.5";

  if (window.__RCF_DOCTOR_SCAN_BOOTED__) return;
  window.__RCF_DOCTOR_SCAN_BOOTED__ = true;

  const $ = (sel, root = document) => root.querySelector(sel);

  function ensureStyles() {
    if ($("#__rcfDoctorStyle")) return;
    const s = document.createElement("style");
    s.id = "__rcfDoctorStyle";
    s.textContent = `
      .rcfDoctorOverlay{
        position:fixed; inset:0;
        background:rgba(0,0,0,.55);
        z-index:999999;
        display:flex; align-items:center; justify-content:center;
        padding:14px;
        touch-action:none;
      }
      .rcfDoctorModal{
        width:min(920px, 100%);
        max-height: min(78vh, 720px);
        background:rgba(10,14,28,.98);
        border:1px solid rgba(255,255,255,.14);
        border-radius:18px;
        box-shadow: 0 14px 60px rgba(0,0,0,.65);
        display:flex; flex-direction:column;
        overflow:hidden;
      }
      .rcfDoctorHead{
        padding:12px 14px;
        display:flex; align-items:center; justify-content:space-between;
        gap:10px;
        border-bottom:1px solid rgba(255,255,255,.10);
      }
      .rcfDoctorTitle{
        font-weight:950; letter-spacing:.2px;
        color:#eaf0ff;
      }
      .rcfDoctorActions{
        display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;
      }
      .rcfDoctorAct{
        border:0; border-radius:999px; padding:10px 12px;
        font-weight:900; cursor:pointer;
      }
      .rcfDoctorAct.scan{ background:#35d0b5; color:#0b1020; }
      .rcfDoctorAct.copy{ background:rgba(255,255,255,.12); color:#eaf0ff; border:1px solid rgba(255,255,255,.18); }
      .rcfDoctorAct.close{ background:#ff4d4d; color:#1b0b0b; }
      .rcfDoctorBody{
        padding:12px 14px;
        overflow:auto;
        -webkit-overflow-scrolling:touch;
        touch-action:pan-y;
      }
      .rcfDoctorPre{
        margin:0;
        white-space:pre-wrap;
        background:rgba(0,0,0,.35);
        padding:12px;
        border-radius:12px;
        border:1px solid rgba(255,255,255,.10);
        min-height:180px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size:12px;
        line-height:1.45;
        color:#eaf0ff;
      }
      body.rcfDoctorNoScroll{
        overflow:hidden !important;
        touch-action:none !important;
      }
    `;
    document.head.appendChild(s);
  }

  function nowISO() {
    try { return new Date().toISOString(); } catch { return String(Date.now()); }
  }

  function safeJsonParse(s) {
    try { return JSON.parse(s); } catch { return null; }
  }

  function countLocalStorageKeys(prefix) {
    let total = 0, pref = 0;
    try {
      total = localStorage.length || 0;
      for (let i = 0; i < total; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) pref++;
      }
    } catch {}
    return { total, pref };
  }

  async function listSW() {
    const out = { supported: false, controller: false, registrations: 0, scopes: [] };
    try {
      out.supported = ("serviceWorker" in navigator);
      if (!out.supported) return out;
      out.controller = !!navigator.serviceWorker.controller;
      const regs = await navigator.serviceWorker.getRegistrations();
      out.registrations = regs.length;
      for (const r of regs) {
        try { out.scopes.push(r.scope || ""); } catch {}
      }
    } catch {}
    return out;
  }

  async function listCaches() {
    const out = { supported: false, keys: 0, names: [] };
    try {
      out.supported = ("caches" in window);
      if (!out.supported) return out;
      const keys = await caches.keys();
      out.keys = keys.length;
      out.names = keys.slice(0, 50);
    } catch {}
    return out;
  }

  function readMotherBundleLocal() {
    const key = "rcf:mother_bundle_local";
    const out = { present: false, key, size: 0, filesCount: 0 };
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return out;
      out.present = true;
      out.size = raw.length;
      const obj = safeJsonParse(raw);
      const files = obj && obj.files;
      if (Array.isArray(files)) out.filesCount = files.length;
      else if (files && typeof files === "object") out.filesCount = Object.keys(files).length;
    } catch {}
    return out;
  }

  function resourcesSummary() {
    const out = { total: 0, unique: 0, duplicates: 0 };
    try {
      const entries = performance.getEntriesByType?.("resource") || [];
      out.total = entries.length;
      const names = entries.map(e => e.name).filter(Boolean);
      const set = new Set(names);
      out.unique = set.size;
      out.duplicates = Math.max(0, names.length - set.size);
    } catch {}
    return out;
  }

  async function buildReport() {
    const sw = await listSW();
    const ca = await listCaches();
    const ls = countLocalStorageKeys("rcf:");
    const mb = readMotherBundleLocal();
    const rs = resourcesSummary();

    const lines = [];
    lines.push(`[${nowISO()}] RCF DOCTOR REPORT ${VERSION}`);
    lines.push("");
    lines.push("== Service Worker ==");
    lines.push(`supported: ${!!sw.supported}`);
    lines.push(`controller: ${!!sw.controller}`);
    lines.push(`registrations: ${sw.registrations}`);
    if (sw.scopes.length) lines.push(`scopes: ${sw.scopes.slice(0, 8).join(" | ")}`);
    lines.push("");
    lines.push("== Cache API ==");
    lines.push(`supported: ${!!ca.supported}`);
    lines.push(`keys: ${ca.keys}`);
    lines.push("");
    lines.push("== localStorage ==");
    lines.push(`total keys: ${ls.total}`);
    lines.push(`rcf:* keys: ${ls.pref}`);
    lines.push("");
    lines.push("== mother_bundle_local ==");
    lines.push(`present: ${!!mb.present}`);
    lines.push(`key: ${mb.key}`);
    lines.push(`size: ${mb.size}`);
    lines.push(`filesCount: ${mb.filesCount}`);
    lines.push("");
    lines.push("== Resources ==");
    lines.push(`total: ${rs.total}`);
    lines.push(`unique: ${rs.unique}`);
    lines.push(`duplicates: ${rs.duplicates}`);

    return lines.join("\n");
  }

  function openModal(initialText) {
    ensureStyles();

    const overlay = document.createElement("div");
    overlay.className = "rcfDoctorOverlay";

    const modal = document.createElement("div");
    modal.className = "rcfDoctorModal";

    const head = document.createElement("div");
    head.className = "rcfDoctorHead";

    const title = document.createElement("div");
    title.className = "rcfDoctorTitle";
    title.textContent = `RCF Doctor ${VERSION}`;

    const actions = document.createElement("div");
    actions.className = "rcfDoctorActions";

    const btnScan = document.createElement("button");
    btnScan.className = "rcfDoctorAct scan";
    btnScan.textContent = "Scan";

    const btnCopy = document.createElement("button");
    btnCopy.className = "rcfDoctorAct copy";
    btnCopy.textContent = "Copy";

    const btnClose = document.createElement("button");
    btnClose.className = "rcfDoctorAct close";
    btnClose.textContent = "Close";

    actions.appendChild(btnScan);
    actions.appendChild(btnCopy);
    actions.appendChild(btnClose);

    head.appendChild(title);
    head.appendChild(actions);

    const body = document.createElement("div");
    body.className = "rcfDoctorBody";

    const pre = document.createElement("pre");
    pre.className = "rcfDoctorPre";
    pre.textContent = initialText || "Carregando…";
    body.appendChild(pre);

    modal.appendChild(head);
    modal.appendChild(body);
    overlay.appendChild(modal);

    const prevActive = document.activeElement;

    function close() {
      try { document.body.classList.remove("rcfDoctorNoScroll"); } catch {}
      try { overlay.remove(); } catch {}
      try { prevActive?.focus?.(); } catch {}
    }

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    window.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape") {
        window.removeEventListener("keydown", onKey);
        close();
      }
    });

    btnClose.onclick = close;

    btnCopy.onclick = async () => {
      const txt = pre.textContent || "";
      try {
        await navigator.clipboard.writeText(txt);
        btnCopy.textContent = "Copied ✅";
        setTimeout(() => (btnCopy.textContent = "Copy"), 900);
      } catch {
        try {
          const r = document.createRange();
          r.selectNodeContents(pre);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
          document.execCommand("copy");
          sel.removeAllRanges();
          btnCopy.textContent = "Copied ✅";
          setTimeout(() => (btnCopy.textContent = "Copy"), 900);
        } catch {
          btnCopy.textContent = "Copy failed";
          setTimeout(() => (btnCopy.textContent = "Copy"), 900);
        }
      }
    };

    btnScan.onclick = async () => {
      btnScan.textContent = "Scanning…";
      btnScan.disabled = true;
      try {
        pre.textContent = await buildReport();
      } catch (e) {
        pre.textContent = "Doctor scan error: " + ((e && e.message) ? e.message : String(e));
      } finally {
        btnScan.disabled = false;
        btnScan.textContent = "Scan";
      }
    };

    try { document.body.classList.add("rcfDoctorNoScroll"); } catch {}
    document.body.appendChild(overlay);
    try { btnScan.focus(); } catch {}

    return { overlay, pre, close };
  }

  async function open() {
    const rep = await buildReport().catch(e => "Doctor error: " + ((e && e.message) ? e.message : String(e)));
    const modal = openModal(rep);
    try { modal.pre.scrollTop = 0; } catch {}
    return modal;
  }

  window.RCF_DOCTOR_SCAN = {
    version: VERSION,
    scan: buildReport,
    open
  };

  try { console.log("[DOCTOR] doctor_scan.js ready ✅ (" + VERSION + ")"); } catch {}
})();
