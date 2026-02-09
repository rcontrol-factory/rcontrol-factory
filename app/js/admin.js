// app/js/admin.js
(function () {
  "use strict";

  window.RCF = window.RCF || {};

  const STORE_PIN = "rcf_admin_pin_v1";
  const STORE_LOCK = "rcf_admin_locked_v1";

  function $(id) { return document.getElementById(id); }
  function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

  function getPin() {
    return localStorage.getItem(STORE_PIN) || "";
  }
  function setPin(pin) {
    localStorage.setItem(STORE_PIN, String(pin || "").trim());
  }
  function isLocked() {
    return (localStorage.getItem(STORE_LOCK) || "1") === "1";
  }
  function setLocked(v) {
    localStorage.setItem(STORE_LOCK, v ? "1" : "0");
  }

  function showTab(tab) {
    const tabs = ["dashboard", "newapp", "editor", "generator", "settings", "admin"];
    tabs.forEach((t) => {
      const sec = $(`tab-${t}`);
      if (sec) sec.classList.toggle("hidden", t !== tab);
    });
    qsa(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  }

  // ---------- Diagnóstico / Cache ----------
  async function nukePwaCache() {
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) { console.warn("Falha ao limpar caches:", e); }

    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch (e) { console.warn("Falha ao desregistrar SW:", e); }
  }

  async function buildDiag() {
    const add = (k, v) => lines.push(`${k}: ${v}`);
    const lines = [];
    add("=== RCF DIAGNÓSTICO ===", "");
    add("URL", location.href);
    add("UA", navigator.userAgent);
    add("Hora", new Date().toString());

    // checa módulos
    add("RCF.engine", window.RCF?.engine ? "SIM" : "NÃO");
    add("RCF.templates", window.RCF?.templates ? "SIM" : "NÃO");
    add("RCF.router", window.RCF?.router ? "SIM" : "NÃO");
    add("RCF.admin", window.RCF?.admin ? "SIM" : "NÃO");

    // cache/sw
    add("SW supported", ("serviceWorker" in navigator) ? "SIM" : "NÃO");
    add("Cache API", ("caches" in window) ? "SIM" : "NÃO");
    if ("caches" in window) {
      try {
        const keys = await caches.keys();
        add("Caches", keys.join(", ") || "(nenhum)");
      } catch (e) {
        add("Caches", "ERRO: " + e.message);
      }
    }

    return lines.join("\n");
  }

  // ---------- UI: Admin Tab button (NO DUPLICATE) ----------
  function ensureAdminTabButton() {
    const tabs = $("tabs");
    if (!tabs) return;

    // se já existe, não cria outro
    if (document.getElementById("rcf-admin-tab-btn")) return;

    const btn = document.createElement("button");
    btn.id = "rcf-admin-tab-btn";
    btn.className = "tab";
    btn.dataset.tab = "admin";
    btn.textContent = "Admin 🔒";

    btn.addEventListener("click", async () => {
      if (isLocked()) {
        const pin = prompt("PIN Admin (6 dígitos):");
        if (!pin) return;

        const saved = getPin();
        if (!saved) {
          // primeiro uso: grava PIN
          setPin(pin);
          setLocked(false);
          btn.textContent = "Admin";
          showTab("admin");
          return;
        }

        if (pin !== saved) {
          alert("PIN incorreto.");
          return;
        }
        setLocked(false);
        btn.textContent = "Admin";
      }
      showTab("admin");
    });

    tabs.appendChild(btn);
    updateAdminButtonState();
  }

  function updateAdminButtonState() {
    const btn = $("rcf-admin-tab-btn");
    if (!btn) return;
    btn.textContent = isLocked() ? "Admin 🔒" : "Admin";
  }

  // ---------- UI: Floating quick buttons (NO DUPLICATE) ----------
  function ensureFloatingButtons() {
    // se já existe o container, não cria outro
    if (document.getElementById("rcf-fabs")) return;

    const box = document.createElement("div");
    box.id = "rcf-fabs";
    box.style.cssText = `
      position:fixed; right:12px; bottom:12px; z-index:99999;
      display:flex; gap:10px; align-items:center;
    `;

    function mk(label, onClick) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText = `
        padding:10px 14px;border-radius:14px;
        border:1px solid rgba(255,255,255,.18);
        background:rgba(0,0,0,.45); color:#fff; font-weight:900;
      `;
      b.addEventListener("click", onClick);
      return b;
    }

    const btnAdmin = mk("Admin", () => {
      // abre tab admin (vai pedir pin se travado)
      $("rcf-admin-tab-btn")?.click();
    });

    const btnDiag = mk("Diag", async () => {
      const diag = await buildDiag();
      try {
        await navigator.clipboard.writeText(diag);
        alert("Diagnóstico copiado ✅");
      } catch {
        alert(diag);
      }
    });

    const btnLogs = mk("Logs", () => {
      // abre/fecha o details de logs se existir
      const details = document.querySelector("details.card.inner");
      if (details) details.open = !details.open;
      else alert("Logs ainda não existem nesta tela.");
    });

    box.append(btnAdmin, btnDiag, btnLogs);
    document.body.appendChild(box);
  }

  // ---------- Wire Admin page buttons ----------
  function wireAdminPage() {
    $("adminDiagBtn")?.addEventListener("click", async () => {
      const out = $("adminOut");
      if (out) out.textContent = await buildDiag();
    });

    $("adminCopyDiagBtn")?.addEventListener("click", async () => {
      const diag = await buildDiag();
      try {
        await navigator.clipboard.writeText(diag);
        alert("Diagnóstico copiado ✅");
      } catch {
        alert("iOS bloqueou copiar. Vou mostrar na tela.");
      }
      const out = $("adminOut");
      if (out) out.textContent = diag;
    });

    $("adminClearPwaBtn")?.addEventListener("click", async () => {
      const ok = confirm("Vai limpar cache + desregistrar SW e recarregar. Continuar?");
      if (!ok) return;
      await nukePwaCache();
      alert("Cache limpo ✅ Recarregando…");
      location.reload();
    });

    $("adminExportBtn")?.addEventListener("click", () => {
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        data[k] = localStorage.getItem(k);
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "rcf-backup.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });

    $("adminImportBtn")?.addEventListener("click", () => {
      $("adminImportFile")?.click();
    });

    $("adminImportFile")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const txt = await file.text();
      const obj = JSON.parse(txt);
      Object.keys(obj).forEach((k) => localStorage.setItem(k, obj[k]));
      alert("Import feito ✅ Recarregando…");
      location.reload();
    });

    $("adminRepairBtn")?.addEventListener("click", async () => {
      const out = $("adminOut");
      const fixes = [];

      // auto-repair seguro (não mexe em código remoto)
      // 1) garante que existe PIN se input estiver preenchido
      const pinInput = $("adminPin")?.value || "";
      if (pinInput && pinInput.trim().length >= 4) {
        setPin(pinInput.trim());
        fixes.push("PIN salvo.");
      }

      // 2) remove duplicação visual (se existirem 2 admin tabs por algum bug antigo)
      // (apaga extras mantendo o primeiro)
      const adminTabs = qsa("#tabs .tab").filter(b => (b.dataset.tab === "admin"));
      if (adminTabs.length > 1) {
        adminTabs.slice(1).forEach(b => b.remove());
        fixes.push("Removi Admin duplicado (tabs).");
      }

      if (out) out.textContent = fixes.length ? fixes.map(x => "✅ " + x).join("\n") : "Nada a reparar agora.";
      updateAdminButtonState();
    });
  }

  function init() {
    // evita “duplicar” ao carregar duas vezes (cache antigo / script duplicado)
    if (window.__RCF_ADMIN_INIT__) return;
    window.__RCF_ADMIN_INIT__ = true;

    ensureAdminTabButton();
    ensureFloatingButtons();
    wireAdminPage();

    // se settings tem PIN preenchido, salva ao iniciar (opcional)
    const pinField = $("adminPin");
    if (pinField && pinField.value && !getPin()) {
      setPin(pinField.value);
    }
    updateAdminButtonState();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // API (se precisar depois)
  window.RCF.admin = {
    buildDiag,
    nukePwaCache,
    lock: () => { setLocked(true); updateAdminButtonState(); },
    unlock: () => { setLocked(false); updateAdminButtonState(); },
  };
})();
