/* FILE: app/js/core/doctor_scan.js
   RCF — Doctor Scan — v1.4 (iOS scroll FIX + mount fix Admin-first + Scan button)
   - ✅ Modal com scroll real no iPhone (overflow + -webkit-overflow-scrolling)
   - ✅ Trava scroll do fundo enquanto modal aberto
   - ✅ Botão fica no ADMIN (slot integrations) e não “migra” pro Agente
   - ✅ Botão "Rodar scan" dentro do modal
*/

(() => {
  "use strict";

  const VER = "v1.4";

  // =========================================================
  // Guard (evita double init)
  // =========================================================
  if (window.__RCF_DOCTOR_SCAN_BOOTED__) return;
  window.__RCF_DOCTOR_SCAN_BOOTED__ = true;

  const log = (...a) => { try { console.log("[DOCTOR]", ...a); } catch {} };
  const nowISO = () => new Date().toISOString();

  const $ = (sel, root = document) => root.querySelector(sel);

  // =========================================================
  // iOS: trava scroll do fundo (sem mexer no CSS global)
  // =========================================================
  function lockBodyScroll() {
    try {
      const b = document.body;
      if (!b) return;
      if (b.dataset.__rcf_scroll_locked__ === "1") return;

      b.dataset.__rcf_scroll_locked__ = "1";
      b.dataset.__rcf_scroll_top__ = String(window.scrollY || 0);

      // mantém visual estável e impede scroll “vazar”
      b.style.position = "fixed";
      b.style.top = "-" + (window.scrollY || 0) + "px";
      b.style.left = "0";
      b.style.right = "0";
      b.style.width = "100%";
      b.style.overflow = "hidden";
    } catch {}
  }

  function unlockBodyScroll() {
    try {
      const b = document.body;
      if (!b) return;
      if (b.dataset.__rcf_scroll_locked__ !== "1") return;

      const top = parseInt(b.dataset.__rcf_scroll_top__ || "0", 10) || 0;

      b.style.position = "";
      b.style.top = "";
      b.style.left = "";
      b.style.right = "";
      b.style.width = "";
      b.style.overflow = "";

      delete b.dataset.__rcf_scroll_locked__;
      delete b.dataset.__rcf_scroll_top__;

      window.scrollTo(0, top);
    } catch {}
  }

  // =========================================================
  // Estilos do modal (injetado localmente)
  // =========================================================
  function ensureStyles() {
    try {
      if (document.getElementById("rcfDoctorStyles")) return;

      const css = `
/* RCF Doctor Modal (isolado, não usa .overlay/.backdrop do app) */
.rcfDoctorScrim{
  position: fixed;
  inset: 0;
  z-index: 99990;
  background: rgba(0,0,0,.55);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  pointer-events: auto;
}

.rcfDoctorModal{
  width: min(720px, 100%);
  max-height: min(82vh, 720px);
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 18px 60px rgba(0,0,0,.55);
  pointer-events: auto;
}

.rcfDoctorHeader{
  display:flex;
  gap:10px;
  align-items:center;
  justify-content: space-between;
  padding: 12px 12px 10px;
  border-bottom: 1px solid rgba(255,255,255,.10);
  background: linear-gradient(to bottom, rgba(8,12,20,.75), rgba(8,12,20,.35));
}

.rcfDoctorTitle{
  font-weight: 900;
  letter-spacing: .2px;
}

.rcfDoctorBtns{
  display:flex;
  gap:8px;
  align-items:center;
  justify-content:flex-end;
  flex-wrap: wrap;
}

.rcfDoctorBody{
  padding: 12px;
}

.rcfDoctorReport{
  white-space: pre-wrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 14px;
  line-height: 1.35;

  background: rgba(0,0,0,.35);
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 14px;

  padding: 12px;

  /* ✅ AQUI é o fix do iOS */
  overflow: auto;
  -webkit-overflow-scrolling: touch;

  max-height: calc(min(82vh, 720px) - 86px);
}

/* evita “scroll passar pro fundo” no iOS */
.rcfDoctorScrim, .rcfDoctorModal, .rcfDoctorReport{
  touch-action: pan-y;
}
      `.trim();

      const st = document.createElement("style");
      st.id = "rcfDoctorStyles";
      st.textContent = css;
      document.head.appendChild(st);
    } catch {}
  }

  // =========================================================
  // Coleta SAFE (sem mexer em nada, só leitura)
  // =========================================================
  async function buildReport() {
    const lines = [];
    const push = (s = "") => lines.push(String(s));

    push(`[${nowISO()}] RCF DOCTOR REPORT ${VER}`);
    push("");

    // Service Worker
    push("== Service Worker ==");
    try {
      const supported = ("serviceWorker" in navigator);
      push(`supported: ${supported}`);
      if (supported) {
        push(`controller: ${!!navigator.serviceWorker.controller}`);
        let regs = [];
        try { regs = await navigator.serviceWorker.getRegistrations(); } catch {}
        push(`registrations: ${Array.isArray(regs) ? regs.length : 0}`);
      }
    } catch (e) {
      push(`error: ${e?.message || String(e)}`);
    }
    push("");

    // Cache API
    push("== Cache API ==");
    try {
      const supported = ("caches" in window);
      push(`supported: ${supported}`);
      if (supported) {
        let keys = [];
        try { keys = await caches.keys(); } catch {}
        push(`keys: ${Array.isArray(keys) ? keys.length : 0}`);
      }
    } catch (e) {
      push(`error: ${e?.message || String(e)}`);
    }
    push("");

    // localStorage
    push("== localStorage ==");
    try {
      const total = localStorage ? localStorage.length : 0;
      let rcf = 0;
      if (localStorage) {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) || "";
          if (k.startsWith("rcf:")) rcf++;
        }
      }
      push(`total keys: ${total}`);
      push(`rcf:* keys: ${rcf}`);
    } catch (e) {
      push(`error: ${e?.message || String(e)}`);
    }
    push("");

    // mother_bundle_local
    push("== mother_bundle_local ==");
    try {
      const key = "rcf:mother_bundle_local";
      const raw = localStorage ? localStorage.getItem(key) : null;
      push(`present: ${!!raw}`);
      push(`key: ${key}`);
      push(`size: ${raw ? raw.length : 0}`);
      let filesCount = 0;
      if (raw) {
        try {
          const obj = JSON.parse(raw);
          const files = obj && obj.files;
          if (files && typeof files === "object") filesCount = Object.keys(files).length;
        } catch {}
      }
      push(`filesCount: ${filesCount}`);
    } catch (e) {
      push(`error: ${e?.message || String(e)}`);
    }
    push("");

    // Resources (best-effort)
    push("== Resources ==");
    try {
      const scripts = Array.from(document.querySelectorAll("script[src]")).map(s => s.getAttribute("src") || "");
      const links = Array.from(document.querySelectorAll("link[rel='stylesheet'][href]")).map(l => l.getAttribute("href") || "");
      const total = scripts.length + links.length;
      const all = scripts.concat(links).filter(Boolean);
      const unique = new Set(all);
      const dup = all.length - unique.size;
      push(`total: ${total}`);
      push(`unique: ${unique.size}`);
      push(`duplicates: ${Math.max(0, dup)}`);
    } catch (e) {
      push(`error: ${e?.message || String(e)}`);
    }
    push("");

    // Hints SAFE
    push("== Hints (SAFE) ==");
    try {
      const swSup = ("serviceWorker" in navigator);
      const swCtl = swSup ? !!navigator.serviceWorker.controller : false;

      let regs = 0;
      if (swSup) {
        try { regs = (await navigator.serviceWorker.getRegistrations()).length; } catch {}
      }

      if (swCtl && regs === 0) {
        push("- SW controller=true mas registrations=0: pode ser SW antigo/controlando por outra scope.");
        push("  Use: SAFE BOOT > Show SW status / Unregister SW se ficar preso.");
      } else {
        push("- SW ok (sem alerta).");
      }

      const cacheSup = ("caches" in window);
      if (cacheSup) {
        let keys = 0;
        try { keys = (await caches.keys()).length; } catch {}
        if (keys === 0) push("- Cache API vazio (keys=0): ok se você está usando overrides + bundle local.");
      }
    } catch (e) {
      push(`- hints error: ${e?.message || String(e)}`);
    }

    return lines.join("\n");
  }

  // =========================================================
  // Modal UI
  // =========================================================
  function openModal(initialText) {
    ensureStyles();
    lockBodyScroll();

    const scrim = document.createElement("div");
    scrim.className = "rcfDoctorScrim";
    scrim.setAttribute("role", "dialog");
    scrim.setAttribute("aria-modal", "true");

    const modal = document.createElement("div");
    modal.className = "rcfDoctorModal";

    const header = document.createElement("div");
    header.className = "rcfDoctorHeader";

    const title = document.createElement("div");
    title.className = "rcfDoctorTitle";
    title.textContent = `RCF DOCTOR ${VER}`;

    const btns = document.createElement("div");
    btns.className = "rcfDoctorBtns";

    const btnClose = document.createElement("button");
    btnClose.className = "btn";
    btnClose.textContent = "Fechar";

    const btnScan = document.createElement("button");
    btnScan.className = "btn ok";
    btnScan.textContent = "Rodar scan";

    const btnCopy = document.createElement("button");
    btnCopy.className = "btn ok";
    btnCopy.textContent = "Copiar report";

    btns.appendChild(btnClose);
    btns.appendChild(btnScan);
    btns.appendChild(btnCopy);

    header.appendChild(title);
    header.appendChild(btns);

    const body = document.createElement("div");
    body.className = "rcfDoctorBody";

    const report = document.createElement("pre");
    report.className = "rcfDoctorReport";
    report.textContent = initialText || "carregando…";

    body.appendChild(report);

    modal.appendChild(header);
    modal.appendChild(body);
    scrim.appendChild(modal);

    const close = () => {
      try { scrim.remove(); } catch {}
      unlockBodyScroll();
    };

    // clica fora fecha
    scrim.addEventListener("click", (e) => {
      if (e.target === scrim) close();
    });

    // ESC fecha (se houver teclado)
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    }, { once: true });

    btnClose.onclick = close;

    btnCopy.onclick = async () => {
      try {
        const txt = report.textContent || "";
        await navigator.clipboard.writeText(txt);
        btnCopy.textContent = "Copiado ✅";
        setTimeout(() => (btnCopy.textContent = "Copiar report"), 900);
      } catch {
        // fallback (iOS às vezes bloqueia clipboard)
        try {
          const ta = document.createElement("textarea");
          ta.value = report.textContent || "";
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          document.execCommand("copy");
          ta.remove();
          btnCopy.textContent = "Copiado ✅";
          setTimeout(() => (btnCopy.textContent = "Copiar report"), 900);
        } catch {}
      }
    };

    btnScan.onclick = async () => {
      btnScan.textContent = "Escaneando…";
      btnScan.disabled = true;
      try {
        const txt = await buildReport();
        report.textContent = txt;
      } catch (e) {
        report.textContent = `erro: ${e?.message || String(e)}`;
      } finally {
        btnScan.disabled = false;
        btnScan.textContent = "Rodar scan";
      }
    };

    document.body.appendChild(scrim);

    // garante foco e scroll correto
    setTimeout(() => {
      try { report.scrollTop = 0; } catch {}
    }, 0);

    return { scrim, report };
  }

  // =========================================================
  // Mount: Admin-first (fixa no lugar certo)
  // =========================================================
  function findMountRoot() {
    // 1) Admin integrations slot (preferido)
    const adminSlot = document.getElementById("rcfAdminSlotIntegrations");
    if (adminSlot) return adminSlot;

    // 2) slot antigo (fallback)
    const legacy = document.getElementById("rcfAgentSlotTools");
    if (legacy) return legacy;

    return null;
  }

  function mountUI() {
    try {
      const root = findMountRoot();
      if (!root) return false;

      // evita duplicar
      if (root.querySelector("[data-rcf-doctor-btn='1']")) return true;

      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.gap = "10px";
      wrap.style.flexWrap = "wrap";
      wrap.style.alignItems = "center";
      wrap.style.justifyContent = "flex-start";

      const btn = document.createElement("button");
      btn.className = "btn ok";
      btn.setAttribute("data-rcf-doctor-btn", "1");
      btn.textContent = "🩺 Doctor Scan";

      btn.onclick = async () => {
        const { report } = openModal("carregando…");
        try {
          const txt = await buildReport();
          report.textContent = txt;
        } catch (e) {
          report.textContent = `erro: ${e?.message || String(e)}`;
        }
      };

      wrap.appendChild(btn);
      root.appendChild(wrap);

      log("Doctor button injected ✅ mountRoot=", root.id || "(no-id)");
      return true;
    } catch {
      return false;
    }
  }

  // =========================================================
  // Boot: tenta montar agora e em eventos de UI_READY
  // =========================================================
  function tryMountLoop() {
    let tries = 0;
    const max = 20;
    const t = setInterval(() => {
      tries++;
      if (mountUI()) { clearInterval(t); log("doctor_scan.js ready ✅ (" + VER + ")"); }
      if (tries >= max) clearInterval(t);
    }, 250);
  }

  // tenta já
  tryMountLoop();

  // tenta quando UI estiver pronta
  try {
    window.addEventListener("RCF:UI_READY", () => {
      setTimeout(() => { mountUI(); }, 50);
      setTimeout(() => { mountUI(); }, 350);
      setTimeout(() => { mountUI(); }, 1200);
    });
  } catch {}

})();
