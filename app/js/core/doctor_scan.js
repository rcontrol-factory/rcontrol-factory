/* FILE: app/js/core/doctor_scan.js
   RControl Factory — DOCTOR SCAN — v1.5 (ADMIN SLOT REMOVED + FAB/TOOLS READY)
   - ✅ NÃO injeta botão sozinho (evita “botão solto”)
   - ✅ Expõe API: window.RCF_DOCTOR_SCAN.open()
   - ✅ Modal com rolagem iOS: overflow:auto + -webkit-overflow-scrolling + touch-action
   - ✅ Botões: Scan / Copy / Close
*/

(() => {
  "use strict";

  const VERSION = "v1.6";

  // evita double init
  if (window.__RCF_DOCTOR_SCAN_BOOTED__) return;
  window.__RCF_DOCTOR_SCAN_BOOTED__ = true;

  const log = (...a) => {
    try { console.log("[DOCTOR]", ...a); } catch {}
    try { window.__RCF_LOGS__?.push?.({ t: Date.now(), tag: "DOCTOR", msg: a.join(" ") }); } catch {}
    try { window.RCF_LOGGER?.push?.("INFO", a.join(" ")); } catch {}
  };

  const $ = (sel, root = document) => root.querySelector(sel);

  // =========================================================
  // Modal (iOS-safe scroll)
  // =========================================================
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
      }

      body.rcfDoctorNoScroll{
        overflow:hidden !important;
        touch-action:none !important;
      }
    `;
    document.head.appendChild(s);
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

    // clicar fora fecha
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    // ESC fecha (desktop)
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
        // fallback: select
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
        const rep = await buildReport();
        pre.textContent = rep;
        try { pre.scrollTop = 0; } catch {}
      } catch (e) {
        pre.textContent = "DOCTOR scan error: " + ((e && e.message) ? e.message : String(e));
      } finally {
        btnScan.disabled = false;
        btnScan.textContent = "Scan";
      }
    };

    // trava scroll do body mas deixa scroll dentro do modal
    try { document.body.classList.add("rcfDoctorNoScroll"); } catch {}

    document.body.appendChild(overlay);

    // garante foco
    try { btnScan.focus(); } catch {}

    return { overlay, pre, close };
  }

  // =========================================================
  // Scan core
  // =========================================================
  function nowISO() {
    try { return new Date().toISOString(); } catch { return String(Date.now()); }
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

  function safeJsonParse(s) {
    try { return JSON.parse(s); } catch { return null; }
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


function checkModulePresence() {
  const mods = {
    stability_guard: !!window.__RCF_STABILITY_GUARD__ || !!window.__RCF_STABILITY_GUARD || !!window.RCF_STABILITY_GUARD,
    github_sync: !!window.RCF_GH_SYNC,
    diagnostics: !!window.RCF_DIAGNOSTICS,
    vfs_overrides: !!window.__RCF_VFS_OVERRIDES__ || !!window.__RCF_VFS__ || !!window.RCF_VFS
  };
  const ok = Object.values(mods).every(Boolean);
  return { ok, mods };
}

function detectRuntimeVFS() {
  try {
    return String(window.__RCF_VFS_RUNTIME || window.__RCF_RUNTIME_VFS || window.RCF_VFS?.runtime || "unknown");
  } catch {
    return "unknown";
  }
}

function detectUIMounts() {
  return {
    Admin: !!(document.getElementById("btnGoAdmin") || document.querySelector('[data-view="admin"]') || document.getElementById("view-admin")),
    Diagnostics: !!(window.RCF_DIAGNOSTICS || window.RCF_DOCTOR_SCAN),
    Logs: !!(document.getElementById("btnLogs") || document.querySelector('[data-rcf-action="logs.open"]') || Array.from(document.querySelectorAll("button,a")).some(b => String(b.textContent||"").trim().toLowerCase() === "logs")),
    GitHub: !!Array.from(document.querySelectorAll("button,a")).find(b => String(b.textContent||"").trim().toLowerCase() === "github")
  };
}

async function checkMotherBundlePath() {
  const out = { path: "app/import/mother_bundle.json", ok: false };
  try {
    const res = await fetch("/app/import/mother_bundle.json", { method: "HEAD", cache: "no-store" });
    out.ok = !!res.ok;
  } catch {}
  return out;
}

async function tryAIAnalysis(reportObj) {
  try {
    const res = await fetch("/api/admin-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "factory_diagnosis", payload: reportObj })
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}


async function buildReport() {
  const sw = await listSW();
  const ca = await listCaches();
  const ls = countLocalStorageKeys("rcf:");
  const mb = readMotherBundleLocal();
  const rs = resourcesSummary();
  const mod = checkModulePresence();
  const runtimeVFS = detectRuntimeVFS();
  const mounts = detectUIMounts();
  const motherPath = await checkMotherBundlePath();

  const reportObj = {
    ts: nowISO(),
    version: VERSION,
    serviceWorker: sw,
    caches: ca,
    localStorage: ls,
    motherBundleLocal: mb,
    resources: rs,
    modules: mod,
    runtimeVFS,
    uiMounts: mounts,
    motherBundlePath: motherPath
  };

  const hints = [];
  if (sw.supported && sw.controller && sw.registrations === 0) {
    hints.push("- SW controller=true mas registrations=0: pode ser SW antigo/controlando por outra scope.");
  }
  if (ca.supported && ca.keys === 0) {
    hints.push("- Cache API vazio: ok se você está usando overrides + bundle local.");
  }
  if (!mb.present) {
    hints.push("- mother_bundle_local não encontrado: confira GitHub pull e MAE update.");
  }
  if (!motherPath.ok) {
    hints.push("- app/import/mother_bundle.json ausente ou inacessível.");
  }

  const lines = [];
  lines.push(`[${reportObj.ts}] DOCTOR REPORT ${VERSION}`);
  lines.push("");
  lines.push(`Service Worker: ${sw.supported ? "OK" : "WARN"} regs=${sw.registrations} controller=${!!sw.controller}`);
  lines.push(`Caches: ${ca.supported ? "OK" : "WARN"} (${ca.keys})`);
  lines.push(`Modules: ${mod.ok ? "OK" : "WARN"} ${JSON.stringify(mod.mods)}`);
  lines.push(`Runtime VFS: ${runtimeVFS}`);
  lines.push(`UI Mounts: ${JSON.stringify(mounts)}`);
  lines.push(`Mother Bundle: ${motherPath.ok ? "OK" : "WARN"} (${motherPath.path})`);
  lines.push("");
  lines.push(`localStorage: total=${ls.total} rcf=${ls.pref}`);
  lines.push(`mother_bundle_local: present=${!!mb.present} files=${mb.filesCount} size=${mb.size}`);
  lines.push(`resources: total=${rs.total} unique=${rs.unique} duplicates=${rs.duplicates}`);

  if (hints.length) {
    lines.push("");
    lines.push("Hints:");
    for (const h of hints) lines.push(h);
  }

  const aiText = await tryAIAnalysis(reportObj);
  if (aiText) {
    lines.push("");
    lines.push("AI ANALYSIS");
    lines.push(String(aiText));
  }

  const finalText = lines.join("\n");
  try { window.RCF_LOGGER?.push?.("INFO", finalText); } catch {}
  return finalText;
}

  // =========================================================
  // Public API
  // =========================================================
  async function open() {
    const rep = await buildReport().catch(e => "Doctor error: " + ((e && e.message) ? e.message : String(e)));
    const modal = openModal(rep);
    try { modal.pre.scrollTop = 0; } catch {}
    return modal;
  }

  window.RCF_DOCTOR_SCAN = {
    version: VERSION,
    open,
    show: open,
    scan: buildReport
  };
  window.RCF_DOCTOR = window.RCF_DOCTOR || { open, show: open, scan: buildReport };

  log("doctor_scan.js ready ✅ (" + VERSION + ") API=window.RCF_DOCTOR_SCAN.open()");
})();
