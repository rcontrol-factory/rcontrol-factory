/* FILE: app/js/core/doctor_scan.js
   RControl Factory — Doctor Scan — v1.2
   FIX:
   - Scroll 100% funcional no iOS (100dvh + overlay scrollável)
   - Não trava
   - Não fica preso no fundo
   - Seguro (somente diagnóstico)
*/

(() => {
  "use strict";

  const TAG = "[DOCTOR]";
  const VERSION = "1.2";

  if (window.__RCF_DOCTOR_LOADED__) return;
  window.__RCF_DOCTOR_LOADED__ = true;

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
      .rcfDoctorBtn{
        border:0;
        border-radius:999px;
        padding:10px 14px;
        font-weight:900;
        background:rgba(255,255,255,.12);
        color:#eaf0ff;
        border:1px solid rgba(255,255,255,.18);
      }

      .rcfDoctorBtn.ok{
        background:#35d0b5;
        color:#071018;
      }

      /* OVERLAY CORRIGIDO */
      .rcfDoctorOverlay{
        position:fixed;
        inset:0;
        background:rgba(0,0,0,.6);
        display:none;
        align-items:stretch;
        justify-content:center;
        z-index:999999;
        overflow:auto;
        -webkit-overflow-scrolling:touch;
        padding:12px;
        height:100dvh;
      }

      .rcfDoctorPanel{
        width:min(980px,100%);
        min-height:100%;
        background:#0b1020;
        color:#eaf0ff;
        border-radius:16px;
        border:1px solid rgba(255,255,255,.14);
        padding:16px;
        box-sizing:border-box;
      }

      .rcfDoctorPanel pre{
        white-space:pre-wrap;
        word-break:break-word;
        background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.12);
        padding:12px;
        border-radius:12px;
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
        <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap">
          <button class="rcfDoctorBtn" id="__rcf_doc_close">Fechar</button>
          <button class="rcfDoctorBtn ok" id="__rcf_doc_copy">Copiar report</button>
        </div>
        <pre id="__rcf_doc_pre">Pronto.</pre>
      </div>
    `;

    document.body.appendChild(ov);

    $("#__rcf_doc_close").onclick = () => {
      ov.style.display = "none";
    };

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

  async function buildReport() {
    const lines = [];

    lines.push(`[${tsISO()}] RCF DOCTOR REPORT v${VERSION}`);
    lines.push("");

    // Service Worker
    lines.push("== Service Worker ==");
    try {
      const supported = "serviceWorker" in navigator;
      lines.push("supported: " + supported);

      if (supported) {
        lines.push("controller: " + !!navigator.serviceWorker.controller);

        const regs = await navigator.serviceWorker.getRegistrations();
        lines.push("registrations: " + regs.length);
      }
    } catch (e) {
      lines.push("error: " + (e.message || String(e)));
    }

    lines.push("");

    // Cache
    lines.push("== Cache API ==");
    try {
      const supported = "caches" in window;
      lines.push("supported: " + supported);

      if (supported) {
        const keys = await caches.keys();
        lines.push("keys: " + keys.length);
      }
    } catch (e) {
      lines.push("error: " + (e.message || String(e)));
    }

    lines.push("");

    // localStorage
    lines.push("== localStorage ==");
    try {
      let total = 0;
      let rcf = 0;
      for (let i = 0; i < localStorage.length; i++) {
        total++;
        const k = localStorage.key(i);
        if (k && k.startsWith("rcf:")) rcf++;
      }
      lines.push("total keys: " + total);
      lines.push("rcf:* keys: " + rcf);
    } catch (e) {
      lines.push("error: " + (e.message || String(e)));
    }

    lines.push("");

    // mother_bundle_local
    lines.push("== mother_bundle_local ==");
    try {
      const v = localStorage.getItem("rcf:mother_bundle_local");
      lines.push("present: " + !!v);

      if (v) {
        lines.push("size: " + v.length);
        try {
          const parsed = JSON.parse(v);
          if (parsed.files) {
            const count = Array.isArray(parsed.files)
              ? parsed.files.length
              : Object.keys(parsed.files).length;
            lines.push("filesCount: " + count);
          }
        } catch {}
      }
    } catch (e) {
      lines.push("error: " + (e.message || String(e)));
    }

    lines.push("");

    // Resources
    lines.push("== Resources ==");
    try {
      const entries = performance.getEntriesByType("resource") || [];
      const js = entries
        .map(e => e.name.split("?")[0])
        .filter(n => n.includes(".js") || n.includes(".css"));

      const unique = new Set(js);
      lines.push("total: " + js.length);
      lines.push("unique: " + unique.size);
      lines.push("duplicates: " + (js.length - unique.size));
    } catch (e) {
      lines.push("error: " + (e.message || String(e)));
    }

    return lines.join("\n");
  }

  function mountDoctorUI() {
    const host = findHost();
    if (!host) return false;
    if ($("#__rcf_doctor_mount")) return true;

    const wrap = document.createElement("div");
    wrap.id = "__rcf_doctor_mount";
    wrap.style.marginTop = "12px";

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

    return true;
  }

  mountDoctorUI();
  window.addEventListener("RCF:UI_READY", mountDoctorUI);
  document.addEventListener("DOMContentLoaded", mountDoctorUI);

})();
