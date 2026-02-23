/* FILE: app/js/core/doctor_scan.js
   RControl Factory — Doctor Scan — v1.0 (SAFE)

   ✅ Apenas DIAGNÓSTICO (não corrige, não remove cache, não mexe em SW)
   ✅ UI leve no painel do Agent (slot #rcfAgentSlotTools) ou fallback no body
   ✅ Gera um relatório copiável

   IMPORTANTE:
   - Este módulo NÃO tenta “resolver”. Ele só aponta.
   - Qualquer ação destrutiva fica com o operador (você).
*/

(() => {
  "use strict";

  const VER = "1.0";
  const TAG = "doctor_scan";

  // logger compat: tenta usar o logger da Factory, senão console
  function logLine(level, msg, obj) {
    const line = `[${TAG}] ${msg}`;
    try {
      if (typeof window.RCF_LOG === "function") {
        window.RCF_LOG(level || "INFO", line, obj);
        return;
      }
    } catch {}
    try {
      const fn = (level === "ERR") ? console.error : (level === "WARN" ? console.warn : console.log);
      fn(line, obj || "");
    } catch {}
  }

  const $ = (sel, root = document) => root.querySelector(sel);

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function nowISO() { return new Date().toISOString(); }

  function pickToolsRoot() {
    // prioridade: painel do Agent
    const a = $("#rcfAgentSlotTools");
    if (a) return a;

    // fallback: qualquer slot conhecido
    const b = $("#rcfToolsSlot") || $("#rcfAdminSlotTools") || $("#rcfSlotTools");
    if (b) return b;

    // fallback final
    return document.body;
  }

  function ensureUI() {
    const root = pickToolsRoot();

    // já existe?
    if ($("#rcfDoctorCard", root)) return;

    const wrap = document.createElement("div");
    wrap.id = "rcfDoctorCard";
    wrap.style.cssText = [
      "margin:10px 0",
      "padding:12px",
      "border-radius:14px",
      "border:1px solid rgba(255,255,255,.14)",
      "background:rgba(255,255,255,.06)"
    ].join(";");

    wrap.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div>
          <div style="font-weight:900">🩺 Doctor Scan <span style="opacity:.75;font-weight:700">(v${esc(VER)})</span></div>
          <div style="opacity:.8;font-size:12px;margin-top:2px">Diagnóstico seguro (sem ações automáticas).</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button id="rcfDoctorRun" style="border:0;border-radius:999px;padding:10px 12px;font-weight:900;background:#35d0b5;color:#111">Rodar Scan</button>
          <button id="rcfDoctorCopy" style="border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:10px 12px;font-weight:900;background:rgba(255,255,255,.10);color:#eaf0ff">Copiar relatório</button>
        </div>
      </div>
      <pre id="rcfDoctorOut" style="margin-top:10px;white-space:pre-wrap;background:rgba(0,0,0,.35);padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,.10);min-height:120px">Doctor pronto ✅ Clique em “Rodar Scan”.</pre>
    `;

    root.appendChild(wrap);

    const out = $("#rcfDoctorOut", wrap);
    const btnRun = $("#rcfDoctorRun", wrap);
    const btnCopy = $("#rcfDoctorCopy", wrap);

    btnRun.onclick = async () => {
      try {
        out.textContent = `[${nowISO()}] Rodando Doctor Scan…\n`;
        const rep = await runScan();
        out.textContent = rep;
      } catch (e) {
        out.textContent += `\n[ERRO] ${e && e.message ? e.message : String(e)}\n`;
      }
    };

    btnCopy.onclick = async () => {
      try {
        const txt = out.textContent || "";
        await navigator.clipboard.writeText(txt);
        out.textContent += `\n[${nowISO()}] Copiado ✅\n`;
      } catch (e) {
        out.textContent += `\n[${nowISO()}] Não consegui copiar automaticamente (iOS às vezes bloqueia). Selecione o texto e copie manual.\n`;
      }
    };

    logLine("OK", "UI injected ✅");
  }

  async function safeJsonParse(s) {
    try { return JSON.parse(s); } catch { return null; }
  }

  async function getSWInfo() {
    const info = { supported: false, controller: false, regs: [] };
    try {
      info.supported = ("serviceWorker" in navigator);
      if (!info.supported) return info;
      info.controller = !!navigator.serviceWorker.controller;
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) {
        info.regs.push({ scope: r.scope || "", active: !!r.active, waiting: !!r.waiting, installing: !!r.installing });
      }
    } catch (e) {
      info.err = e && e.message ? e.message : String(e);
    }
    return info;
  }

  async function getCachesInfo() {
    const info = { supported: false, keys: [] };
    try {
      info.supported = ("caches" in window);
      if (!info.supported) return info;
      const keys = await caches.keys();
      info.keys = keys.slice(0, 30);
      info.total = keys.length;
    } catch (e) {
      info.err = e && e.message ? e.message : String(e);
    }
    return info;
  }

  function getLSInfo() {
    const k = (key) => {
      try { return localStorage.getItem(key); } catch { return null; }
    };
    const has = (key) => {
      try { return localStorage.getItem(key) != null; } catch { return false; }
    };

    const out = {};
    const keys = [
      "mother_bundle_local",
      "rcf:ghcfg",
      "rcf:apps",
      "rcf:active",
      "rcf:zip_vault",
      "rcf:zip_templates",
      "rcf:vfs_overrides"
    ];

    for (const key of keys) {
      const v = k(key);
      out[key] = {
        present: has(key),
        bytes: v ? v.length : 0
      };
    }
    return out;
  }

  async function fetchTypeCheck(path) {
    // check leve pra detectar “HTML no lugar de JS”
    try {
      const r = await fetch(path, { cache: "no-store" });
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      const status = r.status;
      let sniff = "";
      try {
        const txt = await r.text();
        sniff = txt.slice(0, 120).replace(/\s+/g, " ");
      } catch {}
      const looksHtml = sniff.includes("<!doctype") || sniff.includes("<html") || ct.includes("text/html");
      return { path, status, ct, looksHtml, sniff };
    } catch (e) {
      return { path, err: e && e.message ? e.message : String(e) };
    }
  }

  async function runScan() {
    const lines = [];
    lines.push(`[${nowISO()}] RControl Factory — Doctor Scan v${VER}`);
    lines.push(``);

    // básicos
    lines.push(`ENV`);
    lines.push(`- href: ${location.href}`);
    lines.push(`- baseURI: ${document.baseURI}`);
    lines.push(`- ua: ${navigator.userAgent}`);
    lines.push(``);

    // status módulos (somente presença, sem assumir)
    lines.push(`MÓDULOS (presença)`);
    lines.push(`- RCF_GH_SYNC: ${!!window.RCF_GH_SYNC}`);
    lines.push(`- RCF_VFS: ${!!window.RCF_VFS || !!window.RCF_VFS_OVERRIDES || !!window.VFS_OVERRIDES}`);
    lines.push(`- RCF_AGENT: ${!!window.RCF_AGENT || !!window.RCF_AGENT_RUNTIME}`);
    lines.push(`- ZIP VAULT: ${!!window.RCF_ZIP_VAULT || !!window.RCF_AGENT_ZIP_BRIDGE}`);
    lines.push(``);

    // SW
    const sw = await getSWInfo();
    lines.push(`SERVICE WORKER`);
    lines.push(`- supported: ${sw.supported}`);
    if (sw.supported) {
      lines.push(`- controller: ${sw.controller}`);
      if (sw.err) lines.push(`- err: ${sw.err}`);
      lines.push(`- registrations: ${sw.regs.length}`);
      for (const r of sw.regs.slice(0, 10)) {
        lines.push(`  - scope=${r.scope} active=${r.active} waiting=${r.waiting} installing=${r.installing}`);
      }
    }
    lines.push(``);

    // caches
    const ci = await getCachesInfo();
    lines.push(`CACHES API`);
    lines.push(`- supported: ${ci.supported}`);
    if (ci.supported) {
      if (ci.err) lines.push(`- err: ${ci.err}`);
      lines.push(`- total keys: ${ci.total || 0}`);
      for (const k of (ci.keys || [])) lines.push(`  - ${k}`);
      if ((ci.total || 0) > (ci.keys || []).length) lines.push(`  ... (${(ci.total || 0) - (ci.keys || []).length} mais)`);
    }
    lines.push(``);

    // localStorage
    lines.push(`LOCALSTORAGE (tamanho aproximado)`);
    const ls = getLSInfo();
    for (const key of Object.keys(ls)) {
      const it = ls[key];
      lines.push(`- ${key}: present=${it.present} bytes=${it.bytes}`);
    }
    lines.push(``);

    // mother bundle quick parse
    lines.push(`MOTHER BUNDLE (quick)`);
    try {
      const raw = localStorage.getItem("mother_bundle_local");
      if (!raw) {
        lines.push(`- mother_bundle_local: ausente`);
      } else {
        const j = await safeJsonParse(raw);
        const files = j && j.files ? j.files : null;
        const count = files ? (Array.isArray(files) ? files.length : Object.keys(files).length) : 0;
        lines.push(`- present: sim`);
        lines.push(`- version: ${j && j.version ? j.version : "(?)"}`);
        lines.push(`- ts: ${j && j.ts ? j.ts : "(?)"}`);
        lines.push(`- filesCount: ${count}`);
      }
    } catch (e) {
      lines.push(`- erro lendo mother_bundle_local: ${e && e.message ? e.message : String(e)}`);
    }
    lines.push(``);

    // check “HTML no lugar de JS” (problema que você viu com JSZip)
    lines.push(`FETCH CHECK (HTML no lugar de JS)`);
    const checks = [
      "./app.js",
      "./js/core/doctor_scan.js",
      "./app/vendor/jszip.min.js",
      "./js/vendor/jszip.min.js"
    ];
    for (const p of checks) {
      const r = await fetchTypeCheck(p);
      if (r.err) {
        lines.push(`- ${p}: ERR ${r.err}`);
      } else {
        lines.push(`- ${p}: status=${r.status} ct=${r.ct || "(none)"} looksHtml=${r.looksHtml}`);
      }
    }
    lines.push(``);

    // recomendações seguras (sem executar)
    lines.push(`RECOMENDAÇÕES (SAFE)`);
    lines.push(`- Se looksHtml=true em um .js: caminho/roteamento está errado ou SW está servindo fallback HTML.`);
    lines.push(`- Se SW controller=true e cache keys explodindo: pode exigir “Unregister SW + Clear Caches” (manual).`);
    lines.push(`- Se mother_bundle_local filesCount=0: MAE/Bundle não salvou corretamente (ver gh pull + save).`);
    lines.push(``);

    return lines.join("\n");
  }

  // API pública (se você quiser chamar de outro lugar)
  window.RCF_DOCTOR = {
    version: VER,
    ensureUI,
    runScan
  };

  // mount automático (com tolerância)
  function tryMountSoon() {
    try { ensureUI(); } catch {}
  }

  // 1) tenta agora
  tryMountSoon();

  // 2) tenta quando DOM estiver pronto
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(tryMountSoon, 50), { once: true });
  } else {
    setTimeout(tryMountSoon, 50);
  }

  // 3) tenta quando a Factory sinalizar UI_READY (se existir)
  try {
    window.addEventListener("RCF:UI_READY", () => setTimeout(tryMountSoon, 80));
  } catch {}

  logLine("OK", `ready ✅ (v${VER})`);
})();
