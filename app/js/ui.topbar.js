(() => {
  // UI Topbar + Alert (sem tocar no core)
  function $(id){ return document.getElementById(id); }

  // cria uma barra no topo, logo abaixo das tabs
  function ensureTopTools() {
    if ($("rcf-toptools")) return;

    const header = document.querySelector("header.top");
    if (!header) return;

    const bar = document.createElement("div");
    bar.id = "rcf-toptools";
    bar.style.cssText = `
      display:flex; gap:10px; align-items:center; flex-wrap:wrap;
      padding:10px 12px;
      border-top:1px solid rgba(255,255,255,.08);
      border-bottom:1px solid rgba(255,255,255,.08);
      background:rgba(0,0,0,.15);
    `;

    const left = document.createElement("div");
    left.style.cssText = "display:flex; gap:8px; align-items:center; flex-wrap:wrap;";

    const right = document.createElement("div");
    right.style.cssText = "margin-left:auto; display:flex; gap:8px; align-items:center; flex-wrap:wrap;";

    const badge = document.createElement("span");
    badge.id = "rcf-alert-badge";
    badge.textContent = "OK ✅";
    badge.style.cssText = `
      padding:6px 10px; border-radius:999px;
      border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.06);
      font-weight:900; font-size:12px;
    `;

    // botões principais (sempre visíveis)
    const bAgent = mkBtn("Agent", () => window.RCF?.ui?.openAgent?.());
    const bAdmin = mkBtn("Admin", () => {
      // se você já tem tab admin: foca nela
      const t = document.querySelector('[data-tab="admin"]');
      t?.click?.();
      // se tiver modal admin:
      window.RCF?.factory?.openAdmin?.();
    });

    // ferramentas “perigosas” (escondidas por padrão)
    const toolsWrap = document.createElement("div");
    toolsWrap.id = "rcf-hidden-tools";
    toolsWrap.style.cssText = "display:none; gap:8px; align-items:center; flex-wrap:wrap;";

    const bDiag = mkBtn("Diag", () => window.RCF?.ui?.openDiag?.());
    const bLogs = mkBtn("Logs", () => window.RCF?.ui?.openLogs?.());
    const bClear = mkBtn("Limpar Cache", async () => {
      if (!confirm("Limpar cache PWA + recarregar?")) return;
      try { await window.RCF?.factory?.nukePwaCache?.(); } catch(e){}
      location.reload();
    });

    toolsWrap.append(bDiag, bLogs, bClear);

    // botão de “mostrar ferramentas” (só quando precisar)
    const bTools = mkBtn("Ferramentas", () => {
      const el = $("rcf-hidden-tools");
      if (!el) return;
      el.style.display = (el.style.display === "none") ? "flex" : "none";
    });

    left.append(bAgent, bAdmin, bTools, toolsWrap);
    right.append(badge);

    bar.append(left, right);
    header.appendChild(bar);
  }

  function mkBtn(label, onClick){
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = `
      padding:10px 12px; border-radius:12px;
      border:1px solid rgba(255,255,255,.14);
      background:rgba(255,255,255,.06);
      color:#fff; font-weight:900;
    `;
    b.onclick = onClick;
    return b;
  }

  // alerta automático quando der erro JS
  function setAlert(level, text){
    const badge = $("rcf-alert-badge");
    const tools = $("rcf-hidden-tools");
    if (!badge) return;

    if (level === "ok") {
      badge.textContent = text || "OK ✅";
      badge.style.borderColor = "rgba(255,255,255,.12)";
      badge.style.background = "rgba(255,255,255,.06)";
      if (tools) tools.style.display = "none"; // esconde ferramentas
      return;
    }

    if (level === "warn") {
      badge.textContent = text || "ALERTA ⚠️";
      badge.style.borderColor = "rgba(255,200,0,.35)";
      badge.style.background = "rgba(255,200,0,.12)";
      if (tools) tools.style.display = "flex";
      return;
    }

    if (level === "err") {
      badge.textContent = text || "ERRO ❌";
      badge.style.borderColor = "rgba(255,80,80,.45)";
      badge.style.background = "rgba(255,80,80,.16)";
      if (tools) tools.style.display = "flex";
      return;
    }
  }

  function wireGlobalErrorHooks(){
    window.addEventListener("error", (e) => {
      setAlert("err", "ERRO JS ❌ (abrir Logs)");
    });
    window.addEventListener("unhandledrejection", (e) => {
      setAlert("err", "PROMISE ❌ (abrir Logs)");
    });
  }

  function hideBottomFloatIfExists(){
    // Se existir barra flutuante antiga, esconde
    const candidates = ["rcf-floatbar", "rcf-fab", "rcf-bottom-tools"];
    candidates.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
  }

  function init(){
    ensureTopTools();
    hideBottomFloatIfExists();
    wireGlobalErrorHooks();
    setAlert("ok", "OK ✅");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
