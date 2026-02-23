/* FILE: app/js/core/doctor_scan.js
   RControl Factory — Doctor Scan (UI + report)
   v1.3 iOS FIX: modal scroll + block background scroll + pointer-events safe
*/
(() => {
  "use strict";

  const VER = "v1.3";
  const TAG = "[DOCTOR]";
  const log = (...a) => { try { console.log(TAG, ...a); } catch {} };

  // ---------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);

  function safeJsonParse(s, fallback = null) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function nowISO() {
    try { return new Date().toISOString(); } catch { return String(Date.now()); }
  }

  function countLocalStorageKeys(prefix = "") {
    try {
      const total = localStorage.length || 0;
      let pref = 0;
      for (let i = 0; i < total; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (!prefix || k.startsWith(prefix)) pref++;
      }
      return { total, pref };
    } catch {
      return { total: -1, pref: -1 };
    }
  }

  async function getSWStatus() {
    const out = {
      supported: ("serviceWorker" in navigator),
      controller: false,
      registrations: -1,
    };

    try {
      out.controller = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    } catch {}

    if (!out.supported) return out;

    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      out.registrations = regs ? regs.length : 0;
    } catch {
      out.registrations = -1;
    }

    return out;
  }

  async function getCacheStatus() {
    const out = { supported: ("caches" in window), keys: -1 };
    if (!out.supported) return out;
    try {
      const keys = await caches.keys();
      out.keys = keys ? keys.length : 0;
    } catch {
      out.keys = -1;
    }
    return out;
  }

  function getMotherBundleLocal() {
    // chave padrão usada no projeto
    const key = "rcf:mother_bundle_local";
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { present: false, key, size: 0, filesCount: 0 };
      const size = raw.length;
      const obj = safeJsonParse(raw, {});
      const filesCount = (obj && obj.files && typeof obj.files === "object")
        ? Object.keys(obj.files).length
        : (obj && Array.isArray(obj.files) ? obj.files.length : 0);
      return { present: true, key, size, filesCount };
    } catch {
      return { present: false, key, size: -1, filesCount: -1 };
    }
  }

  function getResourcesInfo() {
    try {
      const entries = performance && performance.getEntriesByType
        ? performance.getEntriesByType("resource")
        : [];
      const urls = [];
      for (const e of entries) {
        const n = e && e.name ? String(e.name) : "";
        if (n) urls.push(n);
      }
      const total = urls.length;
      const set = new Set(urls);
      const unique = set.size;
      const duplicates = total - unique;
      return { total, unique, duplicates };
    } catch {
      return { total: -1, unique: -1, duplicates: -1 };
    }
  }

  function buildReportText(data) {
    const lines = [];
    lines.push(`[${nowISO()}] RCF DOCTOR REPORT ${data.version}`);
    lines.push("");
    lines.push("== Service Worker ==");
    lines.push(`supported: ${data.sw.supported}`);
    lines.push(`controller: ${data.sw.controller}`);
    lines.push(`registrations: ${data.sw.registrations}`);
    lines.push("");
    lines.push("== Cache API ==");
    lines.push(`supported: ${data.cache.supported}`);
    lines.push(`keys: ${data.cache.keys}`);
    lines.push("");
    lines.push("== localStorage ==");
    lines.push(`total keys: ${data.ls.total}`);
    lines.push(`rcf:* keys: ${data.ls.rcf}`);
    lines.push("");
    lines.push("== mother_bundle_local ==");
    lines.push(`present: ${data.mbl.present}`);
    lines.push(`key: ${data.mbl.key}`);
    lines.push(`size: ${data.mbl.size}`);
    lines.push(`filesCount: ${data.mbl.filesCount}`);
    lines.push("");
    lines.push("== Resources ==");
    lines.push(`total: ${data.res.total}`);
    lines.push(`unique: ${data.res.unique}`);
    lines.push(`duplicates: ${data.res.duplicates}`);
    lines.push("");
    return lines.join("\n");
  }

  // ---------------------------------------------------------
  // iOS-safe modal (blocks background scroll)
  // ---------------------------------------------------------
  let __open = false;
  let __prevOverflowHtml = "";
  let __prevOverflowBody = "";
  let __touchBlocker = null;

  function lockBackgroundScroll() {
    try {
      const html = document.documentElement;
      const body = document.body;
      __prevOverflowHtml = html.style.overflow || "";
      __prevOverflowBody = body.style.overflow || "";
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
    } catch {}

    // Bloqueia swipe fora do modal (iOS)
    try {
      __touchBlocker = (ev) => {
        // se o toque NÃO estiver dentro do modal, bloqueia
        const modal = document.getElementById("rcfDoctorModal");
        if (!modal) return;
        if (!modal.contains(ev.target)) {
          ev.preventDefault();
          ev.stopPropagation();
        }
      };
      document.addEventListener("touchmove", __touchBlocker, { passive: false, capture: true });
    } catch {}
  }

  function unlockBackgroundScroll() {
    try {
      const html = document.documentElement;
      const body = document.body;
      html.style.overflow = __prevOverflowHtml;
      body.style.overflow = __prevOverflowBody;
    } catch {}

    try {
      if (__touchBlocker) {
        document.removeEventListener("touchmove", __touchBlocker, { capture: true });
      }
    } catch {}
    __touchBlocker = null;
  }

  function closeModal() {
    try {
      const el = document.getElementById("rcfDoctorOverlay");
      if (el && el.parentNode) el.parentNode.removeChild(el);
    } catch {}
    __open = false;
    unlockBackgroundScroll();
  }

  async function copyToClipboard(text) {
    // iOS: fallback com textarea selection
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}

    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "true");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch {
      return false;
    }
  }

  function openModal(reportText) {
    if (__open) closeModal();
    __open = true;

    lockBackgroundScroll();

    const overlay = document.createElement("div");
    overlay.id = "rcfDoctorOverlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "999999";
    overlay.style.background = "rgba(0,0,0,.55)";
    overlay.style.backdropFilter = "blur(6px)";
    overlay.style.webkitBackdropFilter = "blur(6px)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "flex-start";
    overlay.style.justifyContent = "center";
    overlay.style.padding = "14px";
    overlay.style.pointerEvents = "auto";

    // Fecha ao clicar fora
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    }, true);

    const modal = document.createElement("div");
    modal.id = "rcfDoctorModal";
    modal.style.width = "min(900px, 96vw)";
    modal.style.maxHeight = "86vh";
    modal.style.marginTop = "8vh";
    modal.style.borderRadius = "18px";
    modal.style.border = "1px solid rgba(255,255,255,.14)";
    modal.style.background = "rgba(10,16,32,.92)";
    modal.style.boxShadow = "0 18px 70px rgba(0,0,0,.55)";
    modal.style.overflow = "hidden";
    modal.style.pointerEvents = "auto";

    // impede clique no modal de “vazar” pro overlay
    modal.addEventListener("click", (e) => {
      e.stopPropagation();
    }, true);

    const head = document.createElement("div");
    head.style.display = "flex";
    head.style.gap = "10px";
    head.style.padding = "12px";
    head.style.borderBottom = "1px solid rgba(255,255,255,.10)";

    const btnClose = document.createElement("button");
    btnClose.textContent = "Fechar";
    btnClose.style.border = "1px solid rgba(255,255,255,.16)";
    btnClose.style.background = "rgba(255,255,255,.10)";
    btnClose.style.color = "#eaf0ff";
    btnClose.style.borderRadius = "999px";
    btnClose.style.padding = "10px 14px";
    btnClose.style.fontWeight = "800";
    btnClose.onclick = closeModal;

    const btnCopy = document.createElement("button");
    btnCopy.textContent = "Copiar report";
    btnCopy.style.border = "0";
    btnCopy.style.background = "#35d0b5";
    btnCopy.style.color = "#061019";
    btnCopy.style.borderRadius = "999px";
    btnCopy.style.padding = "10px 14px";
    btnCopy.style.fontWeight = "900";
    btnCopy.onclick = async () => {
      const ok = await copyToClipboard(reportText);
      try { btnCopy.textContent = ok ? "Copiado ✅" : "Falhou ❌"; } catch {}
      setTimeout(() => { try { btnCopy.textContent = "Copiar report"; } catch {} }, 1100);
    };

    head.appendChild(btnClose);
    head.appendChild(btnCopy);

    const body = document.createElement("div");
    body.style.padding = "12px";

    // textarea é o MAIS estável pra scroll/seleção no iOS
    const ta = document.createElement("textarea");
    ta.value = reportText;
    ta.readOnly = true;
    ta.style.width = "100%";
    ta.style.height = "60vh";
    ta.style.maxHeight = "62vh";
    ta.style.resize = "none";
    ta.style.borderRadius = "14px";
    ta.style.border = "1px solid rgba(255,255,255,.12)";
    ta.style.background = "rgba(0,0,0,.35)";
    ta.style.color = "#eaf0ff";
    ta.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";
    ta.style.fontSize = "14px";
    ta.style.lineHeight = "1.35";
    ta.style.padding = "12px";
    ta.style.outline = "none";
    ta.style.overflow = "auto";
    ta.style.webkitOverflowScrolling = "touch";
    ta.style.touchAction = "pan-y";
    ta.style.overscrollBehavior = "contain";

    body.appendChild(ta);

    modal.appendChild(head);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // foco ajuda iOS a entender que o scroll é “dentro”
    try { ta.focus(); } catch {}
    try { ta.scrollTop = 0; } catch {}
  }

  // ---------------------------------------------------------
  // Main doctor action
  // ---------------------------------------------------------
  async function runDoctor() {
    const sw = await getSWStatus();
    const cache = await getCacheStatus();
    const lsCnt = countLocalStorageKeys("rcf:");
    const mbl = getMotherBundleLocal();
    const res = getResourcesInfo();

    const report = buildReportText({
      version: "v1.3",
      sw,
      cache,
      ls: { total: lsCnt.total, rcf: lsCnt.pref },
      mbl,
      res,
    });

    openModal(report);
    return report;
  }

  // ---------------------------------------------------------
  // Mount button in Integrations slot (fixo)
  // ---------------------------------------------------------
  function ensureButton() {
    // lugar fixo pra integrações (pelo seu print existe)
    const root =
      document.getElementById("rcfAgentSlotTools") || // slot que vocês usam muito
      document.getElementById("rcfIntegrationSlot") ||
      document.getElementById("rcfIntegrationsSlot");

    if (!root) return false;

    if (document.getElementById("btnDoctorScan")) return true;

    const btn = document.createElement("button");
    btn.id = "btnDoctorScan";
    btn.type = "button";
    btn.textContent = "🩺 Doctor Scan";
    btn.style.border = "0";
    btn.style.borderRadius = "999px";
    btn.style.padding = "12px 14px";
    btn.style.fontWeight = "900";
    btn.style.background = "#35d0b5";
    btn.style.color = "#061019";
    btn.style.boxShadow = "0 10px 30px rgba(0,0,0,.35)";
    btn.style.cursor = "pointer";

    btn.onclick = () => { runDoctor().catch((e) => log("runDoctor err", e)); };

    // coloca dentro do slot (não “solto” na tela)
    try { root.appendChild(btn); } catch {}

    log("Doctor button injected ✅");
    return true;
  }

  function mount() {
    const ok = ensureButton();
    if (!ok) {
      // tenta de novo depois, porque UI pode carregar depois
      setTimeout(ensureButton, 350);
      setTimeout(ensureButton, 1200);
    }
  }

  // ---------------------------------------------------------
  // Public API
  // ---------------------------------------------------------
  window.RCF_DOCTOR_SCAN = {
    ver: VER,
    mount,
    run: runDoctor,
    close: closeModal,
  };

  // auto-mount
  try {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      mount();
    } else {
      document.addEventListener("DOMContentLoaded", mount, { once: true });
    }
  } catch {}

  // se o seu UI READY bus existir, melhor ainda
  try {
    window.addEventListener("RCF:UI_READY", () => mount());
  } catch {}

  log("doctor_scan.js ready ✅", VER);
})();
