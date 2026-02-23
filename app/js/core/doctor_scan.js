/* FILE: app/js/core/doctor_scan.js
   RControl Factory — DOCTOR SCAN — v1.1 SAFE
   Objetivo agora: diagnóstico e “onde fica o quê”, sem corrigir nada.

   - Injeta botão "Doctor" no slot de ferramentas (rcfAgentSlotTools / fallback)
   - Abre painel com:
     - Scan rápido (SW / caches / localStorage rcf:* / mother_bundle_local)
     - Lista de scripts carregados (performance + <script>)
     - Detecta duplicados
     - Busca por nome (filtra a lista)
     - Copia relatório pro clipboard
*/

(() => {
  "use strict";

  const VER = "1.1";

  // evita double-init
  if (window.__RCF_DOCTOR_READY__) return;
  window.__RCF_DOCTOR_READY__ = true;

  const nowISO = () => new Date().toISOString();

  function log(...a) {
    try {
      // respeita teu logger se existir
      if (window.RCF_LOG && typeof window.RCF_LOG === "function") {
        window.RCF_LOG("[DOCTOR]", ...a);
        return;
      }
    } catch {}
    try { console.log("[DOCTOR]", ...a); } catch {}
  }

  function $(sel, root = document) {
    try { return root.querySelector(sel); } catch { return null; }
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function pickToolRoot() {
    // slots conhecidos na tua Factory
    return (
      $("#rcfAgentSlotTools") ||
      $("#rcfAgentSlot") ||
      $("#rcfToolsSlot") ||
      $("#toolsSlot") ||
      document.body
    );
  }

  function ensureStyle() {
    if ($("#rcfDoctorStyle")) return;
    const st = document.createElement("style");
    st.id = "rcfDoctorStyle";
    st.textContent = `
      .rcfDoctorBtn{
        display:inline-flex; align-items:center; gap:8px;
        padding:10px 12px; border-radius:999px;
        border:1px solid rgba(255,255,255,.18);
        background:rgba(255,255,255,.10);
        color:#eaf0ff; font-weight:900;
      }
      .rcfDoctorBtn:active{ transform:scale(.98); }
      .rcfDoctorPanel{
        margin-top:10px;
        border:1px solid rgba(255,255,255,.16);
        background:rgba(0,0,0,.35);
        border-radius:16px;
        padding:12px;
      }
      .rcfDoctorRow{ display:flex; gap:10px; flex-wrap:wrap; margin:10px 0; }
      .rcfDoctorRow button{
        padding:10px 12px; border-radius:999px;
        border:1px solid rgba(255,255,255,.18);
        background:rgba(255,255,255,.10);
        color:#eaf0ff; font-weight:900;
      }
      .rcfDoctorRow button.primary{ background:#35d0b5; color:#071018; border:0; }
      .rcfDoctorRow button.danger{ background:#ff4d4d; color:#180606; border:0; }
      .rcfDoctorInp{
        width:100%; padding:10px 12px; border-radius:12px;
        border:1px solid rgba(255,255,255,.18);
        background:rgba(255,255,255,.06);
        color:#eaf0ff;
        outline:none;
      }
      .rcfDoctorPre{
        white-space:pre-wrap;
        background:rgba(0,0,0,.45);
        border:1px solid rgba(255,255,255,.12);
        padding:10px; border-radius:12px;
        min-height:160px;
        user-select:text;
      }
      .rcfDoctorMeta{ opacity:.85; font-size:12px; line-height:1.35; }
      .rcfDoctorTag{ display:inline-block; padding:3px 8px; border-radius:999px;
        border:1px solid rgba(255,255,255,.18); background:rgba(255,255,255,.08);
        margin-right:6px; margin-top:6px; font-size:12px;
      }
    `;
    document.head.appendChild(st);
  }

  function buildUI() {
    ensureStyle();

    const wrap = document.createElement("div");
    wrap.id = "rcfDoctorWrap";

    const btn = document.createElement("button");
    btn.className = "rcfDoctorBtn";
    btn.type = "button";
    btn.innerHTML = `🩺 Doctor <span style="opacity:.8;font-weight:800">v${esc(VER)}</span>`;

    const panel = document.createElement("div");
    panel.className = "rcfDoctorPanel";
    panel.style.display = "none";
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div>
          <div style="font-weight:1000;font-size:16px">Doctor Scan</div>
          <div class="rcfDoctorMeta">
            Diagnóstico SAFE: mostra onde está o problema. <b>Não corrige</b>.
            <div style="margin-top:6px">
              <span class="rcfDoctorTag">SW/Caches</span>
              <span class="rcfDoctorTag">rcf:* storage</span>
              <span class="rcfDoctorTag">mother_bundle_local</span>
              <span class="rcfDoctorTag">scripts carregados</span>
              <span class="rcfDoctorTag">duplicados</span>
            </div>
          </div>
        </div>
        <button class="danger" id="rcfDoctorClose" type="button">Fechar</button>
      </div>

      <div class="rcfDoctorRow">
        <button class="primary" id="rcfDoctorRun" type="button">Rodar Scan</button>
        <button id="rcfDoctorCopy" type="button">Copiar relatório</button>
        <button id="rcfDoctorClear" type="button">Limpar saída</button>
      </div>

      <input class="rcfDoctorInp" id="rcfDoctorFilter" placeholder="Filtrar (ex: ui_bindings, github_sync, vfs, zip, app.js)..." />

      <div style="margin-top:10px">
        <pre class="rcfDoctorPre" id="rcfDoctorOut">pronto. clique em “Rodar Scan”.</pre>
      </div>
    `;

    wrap.appendChild(btn);
    wrap.appendChild(panel);

    btn.addEventListener("click", () => {
      panel.style.display = (panel.style.display === "none") ? "block" : "none";
    });

    panel.querySelector("#rcfDoctorClose").addEventListener("click", () => {
      panel.style.display = "none";
    });

    return { wrap, panel };
  }

  function safeJsonParse(s) {
    try { return JSON.parse(s); } catch { return null; }
  }

  function listRCFKeys() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith("rcf:") || k.startsWith("RCF_") || k.includes("mother_bundle_local")) out.push(k);
      }
    } catch {}
    out.sort();
    return out;
  }

  async function swInfo() {
    const info = {
      supported: false,
      controller: false,
      regs: [],
      err: null
    };

    try {
      info.supported = ("serviceWorker" in navigator);
      if (!info.supported) return info;

      info.controller = !!navigator.serviceWorker.controller;

      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) {
        try { info.regs.push({ scope: r.scope || "", active: !!(r.active), installing: !!(r.installing), waiting: !!(r.waiting) }); }
        catch {}
      }
    } catch (e) {
      info.err = (e && e.message) ? e.message : String(e);
    }
    return info;
  }

  async function cacheInfo() {
    const ci = { supported: false, keys: [], err: null };
    try {
      ci.supported = ("caches" in window);
      if (!ci.supported) return ci;
      ci.keys = await caches.keys();
    } catch (e) {
      ci.err = (e && e.message) ? e.message : String(e);
    }
    return ci;
  }

  function collectScriptURLs() {
    const urls = [];

    // 1) <script src=...>
    try {
      const ss = Array.from(document.scripts || []);
      for (const s of ss) {
        if (s && s.src) urls.push(s.src);
      }
    } catch {}

    // 2) performance entries (resources)
    try {
      const entries = performance.getEntriesByType("resource") || [];
      for (const e of entries) {
        if (!e || !e.name) continue;
        // foca em js/css/json (pra não poluir)
        if (/\.(js|css|json)(\?|#|$)/i.test(e.name)) urls.push(e.name);
      }
    } catch {}

    // normaliza + remove vazios
    const norm = [];
    for (const u of urls) {
      try {
        const uu = String(u).trim();
        if (!uu) continue;
        norm.push(uu);
      } catch {}
    }
    return norm;
  }

  function analyzeDuplicates(items) {
    const map = new Map();
    for (const it of items) {
      const k = it;
      map.set(k, (map.get(k) || 0) + 1);
    }
    const dups = [];
    for (const [k, c] of map.entries()) {
      if (c > 1) dups.push({ item: k, count: c });
    }
    dups.sort((a, b) => b.count - a.count);
    return { map, dups };
  }

  function summarizeMotherBundleLocal() {
    // pelo teu log: mother_bundle_local saved rawKeys version,ts,files
    const out = { ok: false, filesCount: 0, keys: [], sample: [], err: null };

    try {
      const raw = localStorage.getItem("mother_bundle_local");
      if (!raw) return out;

      const j = safeJsonParse(raw);
      if (!j || typeof j !== "object") return out;

      out.ok = true;
      out.keys = Object.keys(j).sort();
      const files = j.files;
      if (Array.isArray(files)) {
        out.filesCount = files.length;
        out.sample = files.slice(0, 30).map(f => {
          if (!f) return "";
          if (typeof f === "string") return f;
          if (typeof f === "object") return f.path || f.name || JSON.stringify(f).slice(0, 120);
          return String(f);
        }).filter(Boolean);
      } else if (files && typeof files === "object") {
        const ks = Object.keys(files);
        out.filesCount = ks.length;
        out.sample = ks.slice(0, 30);
      }

      return out;
    } catch (e) {
      out.err = (e && e.message) ? e.message : String(e);
      return out;
    }
  }

  function formatReport(data) {
    const lines = [];
    lines.push(`[${data.ts}] RCF DOCTOR REPORT v${VER}`);
    lines.push(`baseURI: ${data.baseURI}`);
    lines.push(`href: ${data.href}`);
    lines.push(`ua: ${data.ua}`);
    lines.push("");

    lines.push("== Service Worker ==");
    lines.push(`supported: ${data.sw.supported}`);
    if (data.sw.supported) {
      lines.push(`controller: ${data.sw.controller}`);
      lines.push(`registrations: ${data.sw.regs.length}`);
      for (const r of data.sw.regs) {
        lines.push(` - scope=${r.scope} active=${r.active} waiting=${r.waiting} installing=${r.installing}`);
      }
    }
    if (data.sw.err) lines.push(`err: ${data.sw.err}`);
    lines.push("");

    lines.push("== Caches ==");
    lines.push(`supported: ${data.cache.supported}`);
    if (data.cache.supported) {
      lines.push(`keys: ${data.cache.keys.length}`);
      for (const k of data.cache.keys.slice(0, 50)) lines.push(` - ${k}`);
      if (data.cache.keys.length > 50) lines.push(` - ... +${data.cache.keys.length - 50} more`);
    }
    if (data.cache.err) lines.push(`err: ${data.cache.err}`);
    lines.push("");

    lines.push("== localStorage (rcf / mother) ==");
    lines.push(`keys: ${data.rcfKeys.length}`);
    for (const k of data.rcfKeys.slice(0, 80)) lines.push(` - ${k}`);
    if (data.rcfKeys.length > 80) lines.push(` - ... +${data.rcfKeys.length - 80} more`);
    lines.push("");

    lines.push("== mother_bundle_local ==");
    lines.push(`present: ${data.mbl.ok}`);
    if (data.mbl.ok) {
      lines.push(`keys: ${data.mbl.keys.join(", ")}`);
      lines.push(`filesCount: ${data.mbl.filesCount}`);
      if (data.mbl.sample.length) {
        lines.push("sample paths:");
        for (const s of data.mbl.sample) lines.push(` - ${s}`);
      }
    }
    if (data.mbl.err) lines.push(`err: ${data.mbl.err}`);
    lines.push("");

    lines.push("== Scripts/Resources carregados ==");
    lines.push(`total: ${data.scripts.length}`);
    lines.push(`unique: ${data.scriptStats.unique}`);
    lines.push(`dups: ${data.scriptStats.dups.length}`);
    if (data.scriptStats.dups.length) {
      lines.push("duplicados (top):");
      for (const d of data.scriptStats.dups.slice(0, 20)) {
        lines.push(` - x${d.count} :: ${d.item}`);
      }
    }
    lines.push("");
    lines.push("lista (filtrável):");
    for (const u of data.scripts.slice(0, 200)) lines.push(` - ${u}`);
    if (data.scripts.length > 200) lines.push(` - ... +${data.scripts.length - 200} more`);

    return lines.join("\n");
  }

  function applyFilterToOutput(fullText, filterStr) {
    const f = String(filterStr || "").trim().toLowerCase();
    if (!f) return fullText;

    const lines = fullText.split("\n");
    const keep = [];
    for (const ln of lines) {
      if (ln.toLowerCase().includes(f)) keep.push(ln);
    }
    // mantém cabeçalho mínimo
    if (!keep.length) return `[filter="${filterStr}"] nada encontrado.\n\n` + fullText;
    return `[filter="${filterStr}"] linhas=${keep.length}\n` + keep.join("\n");
  }

  async function runScan() {
    const data = {
      ts: nowISO(),
      baseURI: "",
      href: "",
      ua: "",
      sw: null,
      cache: null,
      rcfKeys: [],
      mbl: null,
      scripts: [],
      scriptStats: { unique: 0, dups: [] }
    };

    try { data.baseURI = document.baseURI || ""; } catch {}
    try { data.href = location.href || ""; } catch {}
    try { data.ua = navigator.userAgent || ""; } catch {}

    data.sw = await swInfo();
    data.cache = await cacheInfo();
    data.rcfKeys = listRCFKeys();
    data.mbl = summarizeMotherBundleLocal();

    // scripts
    const scripts = collectScriptURLs();
    // remove cache-busters diferentes (normaliza)
    const cleaned = scripts.map(u => {
      try {
        const url = new URL(u, location.href);
        // mantém o caminho + arquivo, remove cb=...
        url.searchParams.delete("cb");
        return url.toString();
      } catch {
        return u;
      }
    });

    const stats = analyzeDuplicates(cleaned);
    data.scripts = Array.from(stats.map.keys()).sort();
    data.scriptStats.unique = data.scripts.length;
    data.scriptStats.dups = stats.dups;

    return data;
  }

  function mount() {
    const root = pickToolRoot();
    if (!root) return;

    // evita duplicar UI
    if ($("#rcfDoctorWrap")) return;

    const { wrap, panel } = buildUI();
    root.appendChild(wrap);

    const outEl = panel.querySelector("#rcfDoctorOut");
    const runBtn = panel.querySelector("#rcfDoctorRun");
    const copyBtn = panel.querySelector("#rcfDoctorCopy");
    const clearBtn = panel.querySelector("#rcfDoctorClear");
    const filterInp = panel.querySelector("#rcfDoctorFilter");

    let lastFull = "";

    function setOut(text) {
      lastFull = String(text || "");
      outEl.textContent = lastFull;
    }

    runBtn.addEventListener("click", async () => {
      setOut("rodando scan…");
      try {
        const data = await runScan();
        const report = formatReport(data);
        setOut(report);

        // aplica filtro se existir
        const f = filterInp.value || "";
        if (String(f).trim()) {
          outEl.textContent = applyFilterToOutput(report, f);
        }

        log("Doctor scan ok ✅");
      } catch (e) {
        const msg = (e && e.message) ? e.message : String(e);
        setOut("scan falhou ❌\n" + msg);
        log("Doctor scan failed ❌", msg);
      }
    });

    copyBtn.addEventListener("click", async () => {
      try {
        const txt = outEl.textContent || lastFull || "";
        if (!txt.trim()) return;
        await navigator.clipboard.writeText(txt);
        log("Report copied ✅");
      } catch (e) {
        log("Copy failed", (e && e.message) ? e.message : String(e));
      }
    });

    clearBtn.addEventListener("click", () => setOut("limpo."));

    filterInp.addEventListener("input", () => {
      const f = filterInp.value || "";
      if (!lastFull) return;
      outEl.textContent = applyFilterToOutput(lastFull, f);
    });

    log("Doctor button injected ✅");
    log("doctor_scan.js ready ✅ (v" + VER + ")");
  }

  // tenta montar agora + fallback no UI_READY
  try { mount(); } catch {}

  try {
    window.addEventListener("RCF:UI_READY", () => {
      try { mount(); } catch {}
    });
  } catch {}

})();
