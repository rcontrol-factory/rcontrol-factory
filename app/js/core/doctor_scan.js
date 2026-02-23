/* FILE: app/js/core/doctor_scan.js
   RControl Factory — Doctor Scan — v1.1 (SLOT SAFE + não “solto”)
   Objetivo:
   - NÃO injetar no body (evita botão aparecendo em todas as telas)
   - Montar no slot oficial: settings.security.actions
   - Fallback seguro: cria slot dentro de #view-settings (ou #view-admin)
   - Sem autonomia perigosa: só diagnóstico + botões manuais (opcional)
*/

(() => {
  "use strict";

  const TAG = "[DOCTOR]";
  const VER = "v1.1";

  // evita double init
  if (window.__RCF_DOCTOR_SCAN_BOOTED__) return;
  window.__RCF_DOCTOR_SCAN_BOOTED__ = true;

  const now = () => new Date().toISOString();
  const log = (...a) => { try { console.log(TAG, ...a); } catch {} };
  const warn = (...a) => { try { console.warn(TAG, ...a); } catch {} };

  function $(sel, root = document) {
    try { return root.querySelector(sel); } catch { return null; }
  }

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function safeText(s) {
    return String(s == null ? "" : s);
  }

  // ---------------------------------------------------------
  // SLOT RESOLVE (usa registry do app.js)
  // ---------------------------------------------------------
  function getUI() {
    try { return window.RCF_UI || null; } catch { return null; }
  }

  function resolveMountSlot() {
    const UI = getUI();

    // 1) Preferido: Settings > Security
    try {
      const s = UI && UI.getSlot ? UI.getSlot("settings.security.actions") : null;
      if (s) return s;
    } catch {}

    // 2) Fallback: Agent tools panel
    try {
      const s = UI && UI.getSlot ? UI.getSlot("agent.tools") : null;
      if (s) return s;
    } catch {}

    // 3) Fallback: Admin top
    try {
      const s = UI && UI.getSlot ? UI.getSlot("admin.top") : null;
      if (s) return s;
    } catch {}

    // 4) Último fallback: tenta criar slot (sem quebrar)
    try {
      if (UI && UI.ensureSlot) {
        // tenta criar dentro de Settings primeiro
        const s1 = UI.ensureSlot("settings.security.actions", {
          parentSelector: "#view-settings",
          id: "rcfSettingsSecurityActions",
          className: "rcfSlot rcfSlotDoctor"
        });
        if (s1) return s1;

        // se não existir settings, cria no admin
        const s2 = UI.ensureSlot("admin.top", {
          parentSelector: "#view-admin",
          id: "rcfAdminSlotTop",
          className: "rcfSlot rcfSlotDoctor"
        });
        if (s2) return s2;
      }
    } catch {}

    return null;
  }

  // ---------------------------------------------------------
  // UI BUILD
  // ---------------------------------------------------------
  function ensureContainer(slot) {
    if (!slot) return null;

    // container fixo do doctor (pra não duplicar)
    let host = $("#rcfDoctorHost", slot);
    if (host) return host;

    host = document.createElement("div");
    host.id = "rcfDoctorHost";
    host.setAttribute("data-rcf", "doctor");
    host.style.display = "flex";
    host.style.flexWrap = "wrap";
    host.style.gap = "8px";
    host.style.alignItems = "center";
    host.style.margin = "6px 0";

    // label pequeno
    const label = document.createElement("span");
    label.textContent = `Doctor ${VER}`;
    label.style.opacity = "0.85";
    label.style.fontWeight = "700";
    label.style.marginRight = "6px";
    host.appendChild(label);

    slot.appendChild(host);
    return host;
  }

  function makeBtn(id, text) {
    const b = document.createElement("button");
    b.id = id;
    b.type = "button";
    b.textContent = text;

    // tenta herdar estilos do app (rcf_btn), senão cai num inline seguro
    b.className = "rcf_btn d";
    b.style.borderRadius = "999px";
    b.style.padding = "8px 10px";
    b.style.fontWeight = "800";
    b.style.border = "1px solid rgba(255,255,255,.18)";
    b.style.background = "rgba(255,255,255,.10)";
    b.style.color = "inherit";

    return b;
  }

  // ---------------------------------------------------------
  // DOCTOR ACTIONS (somente diagnóstico / ações manuais)
  // ---------------------------------------------------------
  async function getSWStatus() {
    const out = {
      supported: false,
      controller: false,
      regs: 0,
      scopes: []
    };

    try {
      out.supported = ("serviceWorker" in navigator);
      if (!out.supported) return out;

      out.controller = !!navigator.serviceWorker.controller;

      const regs = await navigator.serviceWorker.getRegistrations();
      out.regs = regs.length;

      for (const r of regs) {
        try { out.scopes.push(r.scope || ""); } catch {}
      }
    } catch (e) {
      out.error = safeText(e && e.message ? e.message : e);
    }

    return out;
  }

  async function getCacheStatus() {
    const out = { supported: false, keys: 0, names: [] };

    try {
      out.supported = ("caches" in window);
      if (!out.supported) return out;

      const keys = await caches.keys();
      out.keys = keys.length;
      out.names = keys.slice(0, 40);
    } catch (e) {
      out.error = safeText(e && e.message ? e.message : e);
    }

    return out;
  }

  function getLocalStatus() {
    const out = {
      localStorage: { supported: false, keys: 0, rcfKeys: [], hasMotherBundleLocal: false, mother_bundle_local: null },
      sessionStorage: { supported: false }
    };

    // localStorage
    try {
      out.localStorage.supported = !!window.localStorage;
      if (out.localStorage.supported) {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k) keys.push(k);
        }
        out.localStorage.keys = keys.length;
        out.localStorage.rcfKeys = keys.filter(k => /^rcf:/i.test(k)).slice(0, 80);

        const raw = localStorage.getItem("mother_bundle_local");
        out.localStorage.hasMotherBundleLocal = !!raw;
        if (raw) {
          const mb = safeJsonParse(raw, null);
          if (mb && typeof mb === "object") {
            out.localStorage.mother_bundle_local = {
              version: mb.version || null,
              ts: mb.ts || null,
              filesCount: mb.files ? (Array.isArray(mb.files) ? mb.files.length : Object.keys(mb.files || {}).length) : 0
            };
          }
        }
      }
    } catch (e) {
      out.localStorage.error = safeText(e && e.message ? e.message : e);
    }

    // sessionStorage
    try {
      out.sessionStorage.supported = !!window.sessionStorage;
    } catch (e) {
      out.sessionStorage.error = safeText(e && e.message ? e.message : e);
    }

    return out;
  }

  async function runDoctorReport() {
    const report = {
      at: now(),
      href: safeText(location.href),
      ua: safeText(navigator.userAgent),
      sw: await getSWStatus(),
      cache: await getCacheStatus(),
      storage: getLocalStatus()
    };

    try { window.__RCF_DOCTOR_LAST__ = report; } catch {}

    // log resumido
    log("report ✅", {
      sw: report.sw,
      cacheKeys: report.cache.keys,
      mother_bundle_local: report.storage.localStorage.mother_bundle_local
    });

    // tenta jogar no logger do RCF, se existir
    try {
      if (window.RCF_LOG && typeof window.RCF_LOG === "function") {
        window.RCF_LOG(`${TAG} report ok swRegs=${report.sw.regs} cacheKeys=${report.cache.keys}`);
      }
    } catch {}

    // feedback visível sem “soltar” UI: usa alert curto
    try {
      const mb = report.storage.localStorage.mother_bundle_local;
      const mbTxt = mb ? `mother_bundle_local files=${mb.filesCount}` : "mother_bundle_local: (none)";
      alert(
        `Doctor Report ✅\n` +
        `SW regs=${report.sw.regs} controller=${report.sw.controller}\n` +
        `Caches=${report.cache.keys}\n` +
        `${mbTxt}`
      );
    } catch {}

    return report;
  }

  async function unregisterAllSW() {
    try {
      if (!("serviceWorker" in navigator)) {
        alert("Sem suporte a Service Worker neste navegador.");
        return;
      }
      const regs = await navigator.serviceWorker.getRegistrations();
      let ok = 0;
      for (const r of regs) {
        try { if (await r.unregister()) ok++; } catch {}
      }
      log("unregister ✅ ok=", ok, "regs=", regs.length);
      alert(`SW unregister ✅ ok=${ok} regs=${regs.length}`);
    } catch (e) {
      warn("unregister err", e);
      alert("SW unregister ❌ " + safeText(e && e.message ? e.message : e));
    }
  }

  async function clearAllCaches() {
    try {
      if (!("caches" in window)) {
        alert("Sem Cache API neste navegador.");
        return;
      }
      const keys = await caches.keys();
      let del = 0;
      for (const k of keys) {
        try { if (await caches.delete(k)) del++; } catch {}
      }
      log("caches clear ✅ del=", del, "keys=", keys.length);
      alert(`Caches clear ✅ deleted=${del} keys=${keys.length}`);
    } catch (e) {
      warn("caches err", e);
      alert("Caches clear ❌ " + safeText(e && e.message ? e.message : e));
    }
  }

  // ---------------------------------------------------------
  // MOUNT
  // ---------------------------------------------------------
  function mount() {
    const slot = resolveMountSlot();
    if (!slot) {
      warn("Sem slot disponível — não vou injetar no body (por segurança).");
      return false;
    }

    const host = ensureContainer(slot);
    if (!host) return false;

    // já existe?
    if ($("#btnDoctorReport", host)) {
      log("já montado (skip)");
      return true;
    }

    const b1 = makeBtn("btnDoctorReport", "Doctor Scan");
    b1.onclick = () => { runDoctorReport(); };

    const b2 = makeBtn("btnDoctorUnregSW", "Unreg SW");
    b2.onclick = () => { unregisterAllSW(); };

    const b3 = makeBtn("btnDoctorClearCaches", "Clear Caches");
    b3.onclick = () => { clearAllCaches(); };

    host.appendChild(b1);
    host.appendChild(b2);
    host.appendChild(b3);

    log("Doctor button injected ✅ slot=", slot.getAttribute("data-rcf-slot") || slot.id || "(unknown)");
    try {
      if (window.RCF_LOG && typeof window.RCF_LOG === "function") {
        window.RCF_LOG(`${TAG} Doctor button injected ✅`);
      }
    } catch {}

    return true;
  }

  // tenta montar cedo
  try { mount(); } catch {}

  // tenta montar depois do UI_READY (quando app reinjeta UI)
  try {
    window.addEventListener("RCF:UI_READY", () => {
      try { mount(); } catch {}
    });
  } catch {}

  // fallback: DOM ready
  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => { try { mount(); } catch {} });
    }
  } catch {}

  log("doctor_scan.js ready ✅", VER);
})();
