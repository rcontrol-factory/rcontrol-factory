/* =========================================================
   RControl Factory — app/app.js (MODULAR, NO imports)
   - Usa: window.RCF.engine / window.RCF.templates / window.RCF.router
   - Debug Console iPhone-friendly (Logs/Diag)
   - ADMIN (PIN) com "chat" tipo Replit (comandos do engine)
   - Ações rápidas: limpar cache PWA / reset storage / export/import
   ========================================================= */

(function () {
  "use strict";

  // --------- Debug / Logs (iPhone friendly) ----------
  const __LOG_MAX = 300;
  const __logs = [];
  const __origConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  function __safeString(x) {
    try {
      if (typeof x === "string") return x;
      return JSON.stringify(x);
    } catch {
      return String(x);
    }
  }

  function __pushLog(level, args) {
    const time = new Date().toISOString().slice(11, 19);
    const msg = (args || []).map(__safeString).join(" ");
    __logs.push({ time, level, msg });
    while (__logs.length > __LOG_MAX) __logs.shift();
    __renderDebug();
  }

  console.log = (...a) => { __origConsole.log(...a); __pushLog("log", a); };
  console.warn = (...a) => { __origConsole.warn(...a); __pushLog("warn", a); };
  console.error = (...a) => { __origConsole.error(...a); __pushLog("error", a); };

  window.addEventListener("error", (e) => {
    __pushLog("error", [e.message || "Erro", e.filename, e.lineno, e.colno]);
  });
  window.addEventListener("unhandledrejection", (e) => {
    __pushLog("error", ["Promise rejeitada:", e.reason]);
  });

  // --------- Helpers ----------
  const $ = (id) => document.getElementById(id);

  function setStatus(msg) {
    const el = $("statusBox");
    if (el) el.textContent = msg;
    console.log("STATUS:", msg);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function __renderDebug() {
    const body = document.getElementById("rcf-debug-body");
    if (!body) return;
    body.textContent = __logs
      .map((l) => `[${l.time}] ${l.level.toUpperCase()} ${l.msg}`)
      .join("\n");
  }

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

  function getRCF() {
    return window.RCF || null;
  }

  function rcfExists() {
    const R = getRCF();
    return !!(R && R.engine && R.templates && R.router);
  }

  function __getLikelyStorageKeys() {
    // ai.js (v1) normalmente usa:
    // rcf_apps_v1 / rcf_active_app_v1
    // algumas versões usam:
    // rcf_apps_v2 / rcf_active_app_id_v2 etc
    const candidates = [
      "rcf_settings_v1", "rcf_settings_v2", "rcf_settings_v3",
      "rcf_apps_v1", "rcf_apps_v2", "rcf_apps_v3",
      "rcf_active_app_v1", "rcf_active_app_id_v2", "rcf_active_app_id_v3",
    ];
    return candidates;
  }

  async function buildDiagnosisReport() {
    const lines = [];
    const add = (k, v) => lines.push(`${k}: ${v}`);

    add("=== RCF DIAGNÓSTICO ===", "");
    add("URL", location.href);
    add("UA", navigator.userAgent);
    add("Hora", new Date().toString());

    const R = getRCF();
    add("RCF exists", R ? "SIM" : "NÃO");
    add("engine", (R && R.engine) ? "SIM" : "NÃO");
    add("templates", (R && R.templates) ? "SIM" : "NÃO");
    add("router", (R && R.router) ? "SIM" : "NÃO");

    // storage sizes
    try {
      const keys = __getLikelyStorageKeys();
      keys.forEach((k) => {
        const v = localStorage.getItem(k);
        if (v != null) add(`LS ${k} bytes`, v.length);
      });
      // se nenhum apareceu, mostra “vazio”
      const any = keys.some((k) => localStorage.getItem(k) != null);
      if (!any) add("localStorage", "(sem chaves RCF detectadas)");
    } catch (e) {
      add("localStorage", "ERRO: " + e.message);
    }

    // apps count
    try {
      if (R && R.engine) {
        const apps = R.engine.loadApps();
        const active = R.engine.getActiveId();
        add("Apps count", apps.length);
        add("Active ID", active || "(vazio)");
      } else {
        add("Apps count", "(sem engine)");
        add("Active ID", "(sem engine)");
      }
    } catch (e) {
      add("Apps parse", "ERRO: " + e.message);
    }

    // service worker / caches
    try {
      add("SW supported", ("serviceWorker" in navigator) ? "SIM" : "NÃO");
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        add("SW registrations", regs.length);
      }
    } catch (e) { add("SW", "ERRO: " + e.message); }

    try {
      add("Cache API", ("caches" in window) ? "SIM" : "NÃO");
      if ("caches" in window) {
        const keys = await caches.keys();
        add("Caches", keys.join(", ") || "(nenhum)");
      }
    } catch (e) { add("Caches", "ERRO: " + e.message); }

    // DOM IDs principais do factory (pra saber se index.html está certo)
    const must = [
      "appsList","statusBox","goNewApp","goEditor","goGenerator",
      "newName","newId","newTemplate","createAppBtn","newAppValidation",
      "activeAppLabel","filesList","codeArea","previewFrame","currentFileLabel",
      "genAppSelect","downloadZipBtn","genStatus","logs",
      "ghUser","ghToken","repoPrefix","pagesBase","saveSettingsBtn","resetFactoryBtn"
    ];
    const missing = must.filter((id) => !document.getElementById(id));
    add("DOM missing IDs", missing.length ? missing.join(", ") : "OK");

    add("---- últimos logs ----", "");
    lines.push(__logs.slice(-60).map((l) => `[${l.time}] ${l.level.toUpperCase()} ${l.msg}`).join("\n") || "(sem logs)");

    return lines.join("\n");
  }

  // --------- Debug UI + Admin UI ----------
     // ====== EXPOR APIs (pra Admin/Diag/Logs não “morrer” no clique) ======
    window.RCF = window.RCF || {};

    // Debug API
    window.RCF.debug = {
      buildDiagnosisReport,
      nukePwaCache,
      getLogs: () => (__logs ? __logs.slice() : []),
      clearLogs: () => { try { __logs.length = 0; __renderDebug(); } catch {} },
    };

    // Core API (storage + dados) — usado por admin.js (export/import/reset)
    window.RCF.core = {
      LS,
      loadSettings,
      saveSettings,
      loadApps,
      saveApps,
      getActiveAppId,
      setActiveAppId,
    };

    // Boot do admin (se existir)
    try {
      if (window.RCF.admin && typeof window.RCF.admin.init === "function") {
        window.RCF.admin.init();
      }
    } catch (e) {
      console.warn("Admin init falhou:", e);
    }
   const ADMIN = {
    pinKey: "rcf_admin_pin_v1",
    sessionKey: "rcf_admin_ok_session_v1",
    defaultPin: "7777",
  };

  function isAdminUnlocked() {
    return sessionStorage.getItem(ADMIN.sessionKey) === "1";
  }

  function ensureAdminPinExists() {
    const cur = localStorage.getItem(ADMIN.pinKey);
    if (!cur) localStorage.setItem(ADMIN.pinKey, ADMIN.defaultPin);
  }

  function promptAdminUnlock() {
    ensureAdminPinExists();
    const pin = prompt("ADMIN • Digite o PIN (padrão: 7777)");
    if (pin == null) return false;
    const real = localStorage.getItem(ADMIN.pinKey) || ADMIN.defaultPin;
    if (String(pin).trim() === String(real).trim()) {
      sessionStorage.setItem(ADMIN.sessionKey, "1");
      return true;
    }
    alert("PIN incorreto ❌");
    return false;
  }

  function lockAdmin() {
    sessionStorage.removeItem(ADMIN.sessionKey);
  }

  function __ensureDebugUI() {
    if (document.getElementById("rcf-debug-panel")) return;

    // Painel
    const panel = document.createElement("div");
    panel.id = "rcf-debug-panel";
    panel.style.display = "none";
    panel.style.cssText = `
      position:fixed; left:12px; right:12px; bottom:64px; z-index:99999;
      max-height:60vh; overflow:auto; padding:10px;
      border-radius:14px; border:1px solid rgba(255,255,255,.15);
      background:rgba(10,10,10,.92); color:#eaeaea;
      font:12px/1.35 -apple-system,system-ui,Segoe UI,Roboto,Arial;
      white-space:pre-wrap;
    `;

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;";

    const mkBtn = (label) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = "padding:7px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-weight:900;";
      return b;
    };

    const clear = mkBtn("Limpar logs");
    clear.onclick = () => { __logs.length = 0; __renderDebug(); };

    const copy = mkBtn("Copiar logs");
    copy.onclick = async () => {
      const text = __logs.map((l) => `[${l.time}] ${l.level.toUpperCase()} ${l.msg}`).join("\n");
      try { await navigator.clipboard.writeText(text); alert("Logs copiados ✅"); }
      catch { alert("iOS bloqueou copiar. Segura no texto e copia manual."); }
    };

    const diagBtn = mkBtn("Copiar diagnóstico");
    diagBtn.onclick = async () => {
      const diag = await buildDiagnosisReport();
      try { await navigator.clipboard.writeText(diag); alert("Diagnóstico copiado ✅"); }
      catch { alert("iOS bloqueou copiar. Vou mostrar na tela; copie manual."); }
      const body = document.getElementById("rcf-debug-body");
      if (body) body.textContent = diag;
      panel.style.display = "block";
    };

    const pwa = mkBtn("Limpar Cache PWA");
    pwa.onclick = async () => {
      const ok = confirm("Vai limpar caches + desregistrar Service Worker e recarregar. Continuar?");
      if (!ok) return;
      await nukePwaCache();
      alert("Cache limpo ✅ Recarregando…");
      location.reload();
    };

    actions.append(clear, copy, diagBtn, pwa);
    panel.append(actions);

    const body = document.createElement("div");
    body.id = "rcf-debug-body";
    panel.append(body);

    // Botões flutuantes
    function floatBtn(id, text, rightPx) {
      const b = document.createElement("button");
      b.id = id;
      b.textContent = text;
      b.style.cssText = `
        position:fixed; right:${rightPx}px; bottom:12px; z-index:99999;
        padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.2);
        background:rgba(0,0,0,.55); color:white; font-weight:900;
      `;
      return b;
    }

    const btnLogs = floatBtn("rcf-debug-btn", "Logs", 12);
    const btnDiag = floatBtn("rcf-diag-btn", "Diag", 76);
    const btnAdmin = floatBtn("rcf-admin-btn", "Admin", 144);

    btnLogs.onclick = () => {
      panel.style.display = (panel.style.display === "none") ? "block" : "none";
      __renderDebug();
    };

    btnDiag.onclick = async () => {
      const diag = await buildDiagnosisReport();
      const body = document.getElementById("rcf-debug-body");
      if (body) body.textContent = diag;
      panel.style.display = "block";
    };

    btnAdmin.onclick = () => {
      if (!isAdminUnlocked()) {
        const ok = promptAdminUnlock();
        if (!ok) return;
      }
      openAdminPanel();
    };

    document.body.append(panel, btnAdmin, btnDiag, btnLogs);
    __renderDebug();
  }

  // --------- Admin Panel ----------
  function openAdminPanel() {
    if (document.getElementById("rcf-admin-panel")) {
      document.getElementById("rcf-admin-panel").style.display = "block";
      return;
    }

    const wrap = document.createElement("div");
    wrap.id = "rcf-admin-panel";
    wrap.style.cssText = `
      position:fixed; left:12px; right:12px; top:12px; bottom:12px; z-index:100000;
      background:rgba(10,10,10,.94); color:#fff; border:1px solid rgba(255,255,255,.14);
      border-radius:16px; padding:12px; overflow:auto;
      font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;
    `;

    wrap.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="font-weight:1000;font-size:16px;">ADMIN • RControl Factory</div>
        <div style="display:flex;gap:8px;">
          <button id="rcf-admin-lock" style="padding:9px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-weight:900;">Lock</button>
          <button id="rcf-admin-close" style="padding:9px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-weight:900;">Fechar</button>
        </div>
      </div>

      <div style="display:grid;gap:10px;">
        <div style="border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:10px;">
          <div style="font-weight:900;margin-bottom:6px;">Auto-check / Reparos rápidos</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button id="rcf-admin-check" class="abtn">Rodar diagnóstico</button>
            <button id="rcf-admin-fix-cache" class="abtn">Limpar Cache PWA</button>
            <button id="rcf-admin-reset-storage" class="abtn">Reset Storage RCF</button>
            <button id="rcf-admin-export" class="abtn">Export (JSON)</button>
            <button id="rcf-admin-import" class="abtn">Import (JSON)</button>
            <button id="rcf-admin-pin" class="abtn">Trocar PIN</button>
          </div>
          <div style="margin-top:8px;font-size:12px;opacity:.85;">
            “Auto-corrigir” aqui = ações seguras (cache/storage) + diagnóstico. A IA real a gente liga depois.
          </div>
        </div>

        <div style="border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:10px;">
          <div style="font-weight:900;margin-bottom:6px;">Chat (tipo Replit) — comandos do engine</div>
          <div style="font-size:12px;opacity:.85;margin-bottom:8px;">
            Exemplos: <code>help</code> • <code>status</code> • <code>list</code> • <code>create app RQuotas</code> • <code>select &lt;id&gt;</code>
          </div>
          <textarea id="rcf-admin-cmd" rows="3"
            style="width:100%;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.25);color:#fff;padding:10px;outline:none;"
            placeholder="Digite um comando e toque em Executar..."></textarea>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
            <button id="rcf-admin-run" class="abtn">Executar</button>
            <button id="rcf-admin-clear-out" class="abtn">Limpar saída</button>
          </div>
          <pre id="rcf-admin-out" style="margin-top:10px;white-space:pre-wrap;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.12);padding:10px;border-radius:12px;min-height:90px;"></pre>
        </div>

        <div style="border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:10px;">
          <div style="font-weight:900;margin-bottom:6px;">Diagnóstico (visual)</div>
          <pre id="rcf-admin-diag" style="white-space:pre-wrap;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.12);padding:10px;border-radius:12px;"></pre>
        </div>
      </div>
    `;

    // style buttons inside admin
    const style = document.createElement("style");
    style.textContent = `
      .abtn{padding:9px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-weight:900}
      code{background:rgba(255,255,255,.08);padding:2px 6px;border-radius:8px}
    `;
    wrap.appendChild(style);

    document.body.appendChild(wrap);

    // Wire admin actions
    $("#rcf-admin-close").onclick = () => { wrap.style.display = "none"; };
    $("#rcf-admin-lock").onclick = () => { lockAdmin(); alert("Admin lock ✅"); wrap.style.display = "none"; };

    $("#rcf-admin-check").onclick = async () => {
      const diag = await buildDiagnosisReport();
      $("#rcf-admin-diag").textContent = diag;
    };

    $("#rcf-admin-fix-cache").onclick = async () => {
      const ok = confirm("Limpar Cache PWA + desregistrar SW e recarregar?");
      if (!ok) return;
      await nukePwaCache();
      alert("Cache limpo ✅ Recarregando…");
      location.reload();
    };

    $("#rcf-admin-reset-storage").onclick = async () => {
      const ok = confirm("Resetar storage RCF (apps e active) no seu iPhone? Isso apaga apps salvos localmente.");
      if (!ok) return;
      try {
        // tenta engine primeiro
        const R = getRCF();
        if (R && R.engine) {
          R.engine.saveApps([]);
          R.engine.setActiveId("");
        }
        // remove chaves conhecidas também
        __getLikelyStorageKeys().forEach((k) => localStorage.removeItem(k));
        alert("Storage resetado ✅");
      } catch (e) {
        alert("Erro ao resetar: " + e.message);
      }
    };

    $("#rcf-admin-export").onclick = async () => {
      try {
        const R = getRCF();
        const payload = {
          exportedAt: new Date().toISOString(),
          apps: (R && R.engine) ? R.engine.loadApps() : [],
          activeId: (R && R.engine) ? R.engine.getActiveId() : "",
        };
        const json = JSON.stringify(payload, null, 2);
        try { await navigator.clipboard.writeText(json); alert("Export copiado ✅ (cole num bloco de notas)"); }
        catch { alert("Não consegui copiar. Vou mostrar na saída."); }
        $("#rcf-admin-out").textContent = json;
      } catch (e) {
        $("#rcf-admin-out").textContent = "ERRO: " + e.message;
      }
    };

    $("#rcf-admin-import").onclick = async () => {
      const txt = prompt("Cole aqui o JSON exportado (vai substituir seus apps locais).");
      if (!txt) return;
      try {
        const data = JSON.parse(txt);
        const R = getRCF();
        if (!R || !R.engine) throw new Error("Engine não carregou.");
        if (!Array.isArray(data.apps)) throw new Error("JSON inválido: apps precisa ser array.");
        R.engine.saveApps(data.apps);
        R.engine.setActiveId(String(data.activeId || ""));
        alert("Import OK ✅ Recarregue a página.");
      } catch (e) {
        alert("Falha no import: " + e.message);
      }
    };

    $("#rcf-admin-pin").onclick = async () => {
      ensureAdminPinExists();
      const cur = prompt("Digite o PIN atual:");
      if (cur == null) return;
      const real = localStorage.getItem(ADMIN.pinKey) || ADMIN.defaultPin;
      if (String(cur).trim() !== String(real).trim()) return alert("PIN atual incorreto ❌");
      const next = prompt("Novo PIN (4-10 dígitos):");
      if (!next) return;
      localStorage.setItem(ADMIN.pinKey, String(next).trim());
      alert("PIN atualizado ✅");
    };

    $("#rcf-admin-run").onclick = () => {
      const cmd = ($("#rcf-admin-cmd").value || "").trim();
      if (!cmd) return;
      const R = getRCF();
      if (!R || !R.engine || !R.templates) {
        $("#rcf-admin-out").textContent = "ERRO: engine/templates não carregou.";
        return;
      }
      try {
        const out = R.engine.run(cmd, R.templates);
        if (out === "__CLEAR__") {
          $("#rcf-admin-out").textContent = "";
        } else {
          $("#rcf-admin-out").textContent = String(out);
        }
      } catch (e) {
        $("#rcf-admin-out").textContent = "ERRO: " + e.message;
      }
    };

    $("#rcf-admin-clear-out").onclick = () => {
      $("#rcf-admin-out").textContent = "";
      $("#rcf-admin-cmd").value = "";
    };

    // Primeiro diagnóstico automático
    (async () => {
      const diag = await buildDiagnosisReport();
      $("#rcf-admin-diag").textContent = diag;
    })();
  }
     // --------- Boot / Router glue ----------
  function boot() {
    __ensureDebugUI();

    const root = document.getElementById("root");
    const R = getRCF();

    if (!R || !R.engine || !R.templates || !R.router) {
      const msg =
        "ERRO: módulos faltando.\n\n" +
        "Confira se o index.html carrega nesta ordem:\n" +
        "1) js/ai.js\n2) js/templates.js\n3) js/router.js\n4) app.js\n\n" +
        "Dica: toque em 'Limpar Cache PWA' e recarregue.";
      console.error("RCF módulos faltando. Confira se index.html carrega js/ai.js, js/templates.js, js/router.js antes do app.js");
      if (root) root.innerHTML = "<pre style='padding:16px;color:#fff;white-space:pre-wrap'>" + escapeHtml(msg) + "</pre>";
      setStatus("Pronto ✅"); // não travar UI
      return;
    }

    // Monta rota atual e reage a hashchange
    const mount = () => {
      try {
        R.router.mount(R.router.getRoute());
      } catch (e) {
        console.error("Router mount falhou:", e);
        if (root) root.innerHTML = "<pre style='padding:16px;color:#fff;white-space:pre-wrap'>ERRO no router: " + escapeHtml(e.message) + "</pre>";
      }
    };

    window.addEventListener("hashchange", mount);
    mount();

    // Watchdog leve (ajuda em cache bugado)
    setTimeout(() => {
      if (!rcfExists()) console.warn("RCF ainda não completo após boot (cache/ordem de scripts?)");
    }, 800);

    setStatus("Pronto ✅");
    console.log("RCF pronto ✅");
  }

  // --------- Init ----------
  console.log("RCF init…");

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

})();
