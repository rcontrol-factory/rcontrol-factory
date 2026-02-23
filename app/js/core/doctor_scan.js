/* FILE: app/js/core/doctor_scan.js
   RControl Factory — Doctor Scan (READ-ONLY) — v1.0 SAFE
   Objetivo:
   - Não corrige nada automaticamente.
   - Apenas detecta/indica possíveis pontos de falha e gera um relatório copiável.
   - Monta UI no slot do Agente (rcfAgentSlotTools), sem quebrar se não existir.
*/
(() => {
  "use strict";

  const VERSION = "v1.0";
  if (window.__RCF_DOCTOR_SCAN_LOADED__) return;
  window.__RCF_DOCTOR_SCAN_LOADED__ = true;

  const log = (...a) => { try { console.log("[DOCTOR]", ...a); } catch {} };
  const now = () => new Date().toISOString();

  function qs(sel, root=document){ try { return root.querySelector(sel); } catch { return null; } }

  function getSWInfo() {
    const out = { supported: false, controller: false, regs: 0, scope: null };
    try {
      out.supported = ("serviceWorker" in navigator);
      out.controller = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    } catch {}
    return new Promise((resolve) => {
      if (!("serviceWorker" in navigator)) return resolve(out);
      try {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          out.regs = regs ? regs.length : 0;
          try { out.scope = regs && regs[0] && regs[0].scope ? regs[0].scope : null; } catch {}
          resolve(out);
        }).catch(() => resolve(out));
      } catch { resolve(out); }
    });
  }

  function collectSignals(swInfo) {
    const sig = [];
    const has = (name) => { try { return !!window[name]; } catch { return false; } };

    sig.push({ k: "ts", v: now() });
    sig.push({ k: "doctor", v: VERSION });
    sig.push({ k: "booted", v: !!window.__RCF_BOOTED__ });
    sig.push({ k: "ui_ready", v: !!window.__RCF_UI_READY__ });

    // core systems
    sig.push({ k: "VFS", v: has("RCF_VFS") || has("__RCF_VFS__") || has("VFS") });
    sig.push({ k: "GH_SYNC", v: has("RCF_GH_SYNC") || has("RCF_GITHUB_SYNC") });
    sig.push({ k: "MAE", v: has("RCF_MAE") || has("MAE") || has("RCF_MOTHER") });

    // optional subsystems
    sig.push({ k: "ZIP_VAULT", v: has("RCF_ZIP_VAULT") });
    sig.push({ k: "PREVIEW", v: has("RCF_PREVIEW_RUNNER") || has("RCF_PREVIEW") });

    // sw
    sig.push({ k: "sw_supported", v: !!swInfo.supported });
    sig.push({ k: "sw_controller", v: !!swInfo.controller });
    sig.push({ k: "sw_regs", v: Number(swInfo.regs || 0) });
    sig.push({ k: "sw_scope", v: swInfo.scope || "" });

    // storage sanity
    try {
      const keys = Object.keys(localStorage || {});
      sig.push({ k: "ls_keys", v: keys.length });
      sig.push({ k: "ls_has_ghcfg", v: keys.includes("rcf:ghcfg") });
    } catch {
      sig.push({ k: "ls_keys", v: "ERR" });
    }

    // DOM slots
    sig.push({ k: "slot_agent_tools", v: !!document.getElementById("rcfAgentSlotTools") });

    return sig;
  }

  function buildReport(sig) {
    const lines = [];
    lines.push("RCF Doctor Scan Report");
    lines.push("----------------------");
    for (const it of sig) lines.push(`${it.k}: ${it.v}`);
    lines.push("");
    lines.push("Notes:");
    lines.push("- Este relatório é somente leitura (não aplica mudanças).");
    lines.push("- Se algum item core estiver false, o módulo relacionado pode não ter carregado (ex.: index.html não incluiu).");
    return lines.join("\n");
  }

  function renderInto(slot, reportText) {
    if (!slot) return;

    let box = qs("#rcfDoctorBox", slot);
    if (!box) {
      box = document.createElement("div");
      box.id = "rcfDoctorBox";
      box.style.marginTop = "10px";
      box.style.padding = "10px";
      box.style.border = "1px solid rgba(255,255,255,.12)";
      box.style.borderRadius = "12px";
      box.style.background = "rgba(0,0,0,.15)";
      box.innerHTML = `
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <button id="rcfDoctorRun" style="padding:8px 12px; border-radius:999px; border:1px solid rgba(255,255,255,.18); background:rgba(255,255,255,.06); color:#fff;">
            Doctor Scan
          </button>
          <button id="rcfDoctorCopy" style="padding:8px 12px; border-radius:999px; border:1px solid rgba(255,255,255,.18); background:rgba(255,255,255,.06); color:#fff;">
            Copiar relatório
          </button>
          <span id="rcfDoctorStatus" style="opacity:.8; font-size:12px;">pronto</span>
        </div>
        <pre id="rcfDoctorOut" style="margin:10px 0 0 0; white-space:pre-wrap; word-break:break-word; font-size:12px; line-height:1.25; opacity:.95;"></pre>
      `;
      slot.appendChild(box);
    }

    const out = qs("#rcfDoctorOut", box);
    if (out) out.textContent = reportText || "";

    const status = qs("#rcfDoctorStatus", box);
    const btnRun = qs("#rcfDoctorRun", box);
    const btnCopy = qs("#rcfDoctorCopy", box);

    if (btnRun && !btnRun.__bound) {
      btnRun.__bound = true;
      btnRun.addEventListener("click", async () => {
        try {
          if (status) status.textContent = "rodando...";
          const sw = await getSWInfo();
          const sig = collectSignals(sw);
          const rep = buildReport(sig);
          if (out) out.textContent = rep;
          if (status) status.textContent = "ok ✅";
        } catch (e) {
          if (status) status.textContent = "erro ❌";
          if (out) out.textContent = "Doctor scan failed: " + (e && e.message ? e.message : String(e));
        }
      });
    }

    if (btnCopy && !btnCopy.__bound) {
      btnCopy.__bound = true;
      btnCopy.addEventListener("click", async () => {
        try {
          const txt = out ? out.textContent : "";
          if (!txt) return;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(txt);
            if (status) status.textContent = "copiado ✅";
          } else {
            const ta = document.createElement("textarea");
            ta.value = txt;
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            if (status) status.textContent = "copiado ✅";
          }
        } catch {
          if (status) status.textContent = "falhou copiar ❌";
        }
      });
    }
  }

  async function mount() {
    try {
      const slot = document.getElementById("rcfAgentSlotTools") || qs("[data-slot='rcfAgentSlotTools']");
      if (!slot) {
        log("slot rcfAgentSlotTools não encontrado; aguardando UI_READY...");
        return false;
      }
      const sw = await getSWInfo();
      const sig = collectSignals(sw);
      const rep = buildReport(sig);
      renderInto(slot, rep);
      log("mounted ✅", VERSION);
      return true;
    } catch (e) {
      log("mount failed", e);
      return false;
    }
  }

  window.RCF_DOCTOR = window.RCF_DOCTOR || {};
  window.RCF_DOCTOR.version = VERSION;
  window.RCF_DOCTOR.mount = mount;

  (async () => {
    const ok = await mount();
    if (!ok) {
      try { window.addEventListener("RCF:UI_READY", () => { mount(); }, { once: false }); } catch {}
      try { setTimeout(() => { mount(); }, 600); } catch {}
      try { setTimeout(() => { mount(); }, 1400); } catch {}
    }
  })();
})();
