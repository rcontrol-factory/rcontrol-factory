/* FILE: /app/js/core/doctor_scan.js
   RControl Factory — Doctor Scan — v1.3 SAFE (STRICT HOST + MODAL SCROLL iOS)

   OBJETIVO:
   - Botão "Doctor Scan" fixo no slot do ADMIN (INTEGRATIONS) sem vazar pra outras telas
   - Gera relatório rápido (SW/cache/localStorage/mother_bundle_local/resources)
   - Modal com scroll real no iOS (não mexe a tela de trás)

   REGRAS SAFE:
   - Não altera arquivos, não limpa nada automaticamente
   - Só lê e reporta
*/

(() => {
  "use strict";

  try {
    const VERSION = "v1.3";

    // =========================================================
    // Logs (HARD SAFE)
    // =========================================================
    const logOk = (...a) => { try { console.log("[RCF]", "OK:", ...a); } catch {} };
    const logWarn = (...a) => { try { console.log("[RCF]", "WARN:", ...a); } catch {} };

    // =========================================================
    // Helpers
    // =========================================================
    const qs = (sel, root = document) => root.querySelector(sel);
    const safeStr = (v) => (v === null || v === undefined) ? "" : String(v);

    const tsISO = () => {
      try { return new Date().toISOString(); } catch { return String(Date.now()); }
    };

    // =========================================================
    // STRICT HOST: Admin Integrations Slot only
    // (isso impede o Doctor de ir parar no Agent)
    // =========================================================
    const ADMIN_SLOT_ID = "rcfAdminSlotIntegrations";

    function getAdminSlot() {
      try { return document.getElementById(ADMIN_SLOT_ID); } catch { return null; }
    }

    // =========================================================
    // Modal (iOS-safe scroll + no background scroll)
    // =========================================================
    let __overlay = null;
    let __lastBodyOverflow = null;

    function lockBodyScroll() {
      try {
        const b = document.body;
        if (!b) return;
        __lastBodyOverflow = b.style.overflow || "";
        b.style.overflow = "hidden";
      } catch {}
    }

    function unlockBodyScroll() {
      try {
        const b = document.body;
        if (!b) return;
        b.style.overflow = __lastBodyOverflow || "";
      } catch {}
    }

    function ensureOverlay() {
      if (__overlay && document.body && document.body.contains(__overlay)) return __overlay;

      const overlay = document.createElement("div");
      overlay.id = "rcfDoctorOverlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");

      // overlay ocupa tudo e segura scroll/touch
      overlay.style.position = "fixed";
      overlay.style.left = "0";
      overlay.style.top = "0";
      overlay.style.right = "0";
      overlay.style.bottom = "0";
      overlay.style.zIndex = "99999";
      overlay.style.background = "rgba(0,0,0,.55)";
      overlay.style.display = "none";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.padding = "14px";
      overlay.style.backdropFilter = "blur(6px)";

      // IMPORTANT: não deixa o toque rolar o fundo
      overlay.addEventListener("touchmove", (e) => {
        try { e.preventDefault(); } catch {}
      }, { passive: false });

      overlay.addEventListener("click", (e) => {
        // fecha se clicar fora do painel
        try {
          if (e.target === overlay) hideModal();
        } catch {}
      });

      const panel = document.createElement("div");
      panel.id = "rcfDoctorPanel";
      panel.style.width = "min(720px, 100%)";
      panel.style.maxHeight = "86vh";
      panel.style.borderRadius = "18px";
      panel.style.border = "1px solid rgba(255,255,255,.14)";
      panel.style.background = "rgba(10,14,26,.92)";
      panel.style.boxShadow = "0 24px 60px rgba(0,0,0,.45)";
      panel.style.overflow = "hidden"; // header fixo e body scrolla dentro
      panel.style.display = "flex";
      panel.style.flexDirection = "column";

      const head = document.createElement("div");
      head.style.display = "flex";
      head.style.alignItems = "center";
      head.style.justifyContent = "space-between";
      head.style.gap = "10px";
      head.style.padding = "12px 12px 10px 12px";
      head.style.borderBottom = "1px solid rgba(255,255,255,.12)";

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.gap = "10px";
      left.style.alignItems = "center";

      const title = document.createElement("div");
      title.textContent = "RCF DOCTOR";
      title.style.fontWeight = "900";
      title.style.letterSpacing = ".6px";
      title.style.color = "#eaf0ff";

      const ver = document.createElement("div");
      ver.textContent = VERSION;
      ver.style.opacity = ".75";
      ver.style.fontWeight = "800";
      ver.style.fontSize = "12px";
      ver.style.color = "#cfe1ff";

      left.appendChild(title);
      left.appendChild(ver);

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "10px";
      actions.style.alignItems = "center";

      const btnClose = document.createElement("button");
      btnClose.type = "button";
      btnClose.textContent = "Fechar";
      btnClose.style.border = "1px solid rgba(255,255,255,.14)";
      btnClose.style.background = "rgba(255,255,255,.08)";
      btnClose.style.color = "#eaf0ff";
      btnClose.style.borderRadius = "999px";
      btnClose.style.padding = "10px 14px";
      btnClose.style.fontWeight = "900";
      btnClose.onclick = () => hideModal();

      const btnCopy = document.createElement("button");
      btnCopy.type = "button";
      btnCopy.textContent = "Copiar report";
      btnCopy.style.border = "0";
      btnCopy.style.background = "#35d0b5";
      btnCopy.style.color = "#0a0f1a";
      btnCopy.style.borderRadius = "999px";
      btnCopy.style.padding = "10px 14px";
      btnCopy.style.fontWeight = "950";
      btnCopy.onclick = async () => {
        try {
          const pre = qs("#rcfDoctorPre", panel);
          const txt = pre ? pre.textContent : "";
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(txt);
          } else {
            // fallback iOS antigo
            const ta = document.createElement("textarea");
            ta.value = txt;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            document.execCommand("copy");
            ta.remove();
          }
          btnCopy.textContent = "Copiado ✅";
          setTimeout(() => { btnCopy.textContent = "Copiar report"; }, 900);
        } catch {
          btnCopy.textContent = "Falhou ❌";
          setTimeout(() => { btnCopy.textContent = "Copiar report"; }, 900);
        }
      };

      actions.appendChild(btnClose);
      actions.appendChild(btnCopy);

      head.appendChild(left);
      head.appendChild(actions);

      const body = document.createElement("div");
      body.id = "rcfDoctorBody";
      body.style.padding = "12px";
      body.style.overflow = "auto";                 // SCROLL AQUI
      body.style.webkitOverflowScrolling = "touch"; // iOS momentum
      body.style.maxHeight = "calc(86vh - 60px)";

      const pre = document.createElement("pre");
      pre.id = "rcfDoctorPre";
      pre.style.whiteSpace = "pre-wrap";
      pre.style.margin = "0";
      pre.style.padding = "12px";
      pre.style.borderRadius = "14px";
      pre.style.border = "1px solid rgba(255,255,255,.10)";
      pre.style.background = "rgba(0,0,0,.35)";
      pre.style.color = "#eaf0ff";
      pre.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      pre.style.fontSize = "14px";
      pre.style.lineHeight = "1.35";

      body.appendChild(pre);

      panel.appendChild(head);
      panel.appendChild(body);

      overlay.appendChild(panel);

      document.body.appendChild(overlay);
      __overlay = overlay;
      return overlay;
    }

    function showModal(text) {
      const ov = ensureOverlay();
      const pre = qs("#rcfDoctorPre", ov);
      if (pre) pre.textContent = safeStr(text);

      lockBodyScroll();
      ov.style.display = "flex";
    }

    function hideModal() {
      try {
        if (!__overlay) return;
        __overlay.style.display = "none";
      } catch {}
      unlockBodyScroll();
    }

    // =========================================================
    // Doctor Scan (coletores)
    // =========================================================
    async function getSWInfo() {
      const out = { supported: false, controller: false, registrations: null, scopes: [] };

      try {
        out.supported = ("serviceWorker" in navigator);
        if (!out.supported) return out;

        out.controller = !!navigator.serviceWorker.controller;

        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          out.registrations = regs.length;
          for (const r of regs) {
            try { out.scopes.push(r.scope || ""); } catch {}
          }
        } catch {
          out.registrations = null;
        }
      } catch {}

      return out;
    }

    async function getCacheInfo() {
      const out = { supported: false, keys: null };
      try {
        out.supported = ("caches" in window);
        if (!out.supported) return out;
        const keys = await caches.keys();
        out.keys = keys.length;
      } catch {
        out.keys = null;
      }
      return out;
    }

    function getLocalStorageInfo() {
      const out = { supported: false, totalKeys: null, rcfKeys: null };
      try {
        out.supported = !!window.localStorage;
        if (!out.supported) return out;

        const total = localStorage.length;
        let rcf = 0;
        for (let i = 0; i < total; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith("rcf:")) rcf++;
        }
        out.totalKeys = total;
        out.rcfKeys = rcf;
      } catch {
        out.totalKeys = null;
        out.rcfKeys = null;
      }
      return out;
    }

    function getMotherBundleLocalInfo() {
      const out = { present: false, key: "rcf:mother_bundle_local", size: null, filesCount: null };
      try {
        const k = out.key;
        const raw = localStorage.getItem(k);
        if (!raw) return out;
        out.present = true;
        out.size = raw.length;

        try {
          const obj = JSON.parse(raw);
          const files = obj && obj.files ? obj.files : null;
          if (files && typeof files === "object") {
            out.filesCount = Object.keys(files).length;
          }
        } catch {}
      } catch {}
      return out;
    }

    function getResourceInfo() {
      const out = { total: null, unique: null, duplicates: null };
      try {
        const res = performance && performance.getEntriesByType ? performance.getEntriesByType("resource") : [];
        const urls = [];
        for (const r of res) {
          try { if (r && r.name) urls.push(String(r.name)); } catch {}
        }
        const total = urls.length;
        const map = new Map();
        for (const u of urls) map.set(u, (map.get(u) || 0) + 1);
        let dup = 0;
        for (const [, c] of map) if (c > 1) dup += (c - 1);

        out.total = total;
        out.unique = map.size;
        out.duplicates = dup;
      } catch {
        out.total = null; out.unique = null; out.duplicates = null;
      }
      return out;
    }

    function buildReport(sw, cache, ls, mbl, res) {
      const lines = [];
      lines.push(`[${tsISO()}] RCF DOCTOR REPORT ${VERSION}`);
      lines.push("");
      lines.push("== Service Worker ==");
      lines.push(`supported: ${sw.supported}`);
      lines.push(`controller: ${sw.controller}`);
      lines.push(`registrations: ${sw.registrations === null ? "?" : sw.registrations}`);
      if (sw.scopes && sw.scopes.length) {
        lines.push(`scopes: ${sw.scopes.length}`);
        for (const s of sw.scopes.slice(0, 6)) lines.push(` - ${s}`);
        if (sw.scopes.length > 6) lines.push(` - ... (+${sw.scopes.length - 6})`);
      }

      lines.push("");
      lines.push("== Cache API ==");
      lines.push(`supported: ${cache.supported}`);
      lines.push(`keys: ${cache.keys === null ? "?" : cache.keys}`);

      lines.push("");
      lines.push("== localStorage ==");
      lines.push(`total keys: ${ls.totalKeys === null ? "?" : ls.totalKeys}`);
      lines.push(`rcf:* keys: ${ls.rcfKeys === null ? "?" : ls.rcfKeys}`);

      lines.push("");
      lines.push("== mother_bundle_local ==");
      lines.push(`present: ${mbl.present}`);
      lines.push(`key: ${mbl.key}`);
      lines.push(`size: ${mbl.size === null ? "?" : mbl.size}`);
      lines.push(`filesCount: ${mbl.filesCount === null ? "?" : mbl.filesCount}`);

      lines.push("");
      lines.push("== Resources ==");
      lines.push(`total: ${res.total === null ? "?" : res.total}`);
      lines.push(`unique: ${res.unique === null ? "?" : res.unique}`);
      lines.push(`duplicates: ${res.duplicates === null ? "?" : res.duplicates}`);

      // hints (SAFE: só sugestão, não executa)
      lines.push("");
      lines.push("== Hints (SAFE) ==");
      if (sw.supported && sw.controller && (sw.registrations === 0)) {
        lines.push("- SW controller=true mas registrations=0: pode ser SW antigo/controlando por outra scope.");
        lines.push("  Use: SAFE BOOT > Show SW status / Unregister SW se ficar preso.");
      }
      if (cache.supported && cache.keys === 0) {
        lines.push("- Cache API vazio (keys=0): ok se você está usando overrides + bundle local.");
      }
      if (mbl.present && (mbl.filesCount || 0) === 0) {
        lines.push("- mother_bundle_local filesCount=0: revisar MAE save / storage registry.");
      }

      return lines.join("\n");
    }

    async function collectReport() {
      const sw = await getSWInfo();
      const cache = await getCacheInfo();
      const ls = getLocalStorageInfo();
      const mbl = getMotherBundleLocalInfo();
      const res = getResourceInfo();
      return buildReport(sw, cache, ls, mbl, res);
    }

    // =========================================================
    // UI Button (Admin slot)
    // =========================================================
    function ensureButton() {
      const host = getAdminSlot();
      if (!host) return null;

      // se já existe, não duplica
      const existing = qs("[data-rcf-doctor-btn='1']", host);
      if (existing) return existing;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "🩺 Doctor Scan";
      btn.setAttribute("data-rcf-doctor-btn", "1");

      // tenta herdar estilo de botões do RCF
      btn.style.border = "0";
      btn.style.borderRadius = "999px";
      btn.style.padding = "12px 16px";
      btn.style.fontWeight = "950";
      btn.style.background = "#35d0b5";
      btn.style.color = "#0a0f1a";
      btn.style.cursor = "pointer";

      btn.onclick = async () => {
        try {
          btn.disabled = true;
          const old = btn.textContent;
          btn.textContent = "⏳ Doctor…";
          const report = await collectReport();
          showModal(report);
          btn.textContent = old;
        } catch (e) {
          try { showModal("Doctor failed: " + (e && e.message ? e.message : String(e))); } catch {}
        } finally {
          btn.disabled = false;
        }
      };

      // coloca no host
      try {
        host.appendChild(btn);
      } catch {
        try { host.insertAdjacentElement("beforeend", btn); } catch {}
      }

      logOk("[DOCTOR] Doctor button injected ✅ (Admin slot strict)");
      return btn;
    }

    function boot(){
      // tenta montar agora
      ensureButton();

      // acompanha troca de abas/DOM
      const mo = new MutationObserver(() => ensureButton());
      try { mo.observe(document.documentElement, { childList:true, subtree:true }); } catch {}

      // evento UI READY (compat)
      try {
        window.addEventListener("RCF:UI_READY", () => ensureButton(), { passive:true });
      } catch {}

      logOk(`[DOCTOR] doctor_scan.js ready ✅ (${VERSION})`);
    }

    // API pública
    window.RCF_DOCTOR = {
      __v13: true,
      version: VERSION,
      run: async () => collectReport(),
      show: (t) => showModal(t),
      hide: () => hideModal(),
      mountUI: () => ensureButton()
    };

    // start
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot, { once:true });
    } else {
      boot();
    }

  } catch (e) {
    try { console.error("doctor_scan.js failed", e); } catch {}
  }
})();
