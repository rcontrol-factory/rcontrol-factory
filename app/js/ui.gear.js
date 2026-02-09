(() => {
  // RCF Top Gear: deixa a tela limpa e move ferramentas para um drawer (engrenagem).
  // Não toca no core: só UI.

  function qs(sel){ return document.querySelector(sel); }
  function byId(id){ return document.getElementById(id); }

  function mkBtn(label, onClick){
    const b = document.createElement("button");
    b.type = "button";
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

  function ensureGear(){
    if (byId("rcf-gear")) return;

    const header = qs("header.top");
    if (!header) return;

    // Linha fina abaixo das tabs (no topo)
    const bar = document.createElement("div");
    bar.id = "rcf-gearbar";
    bar.style.cssText = `
      display:flex; align-items:center; gap:10px; flex-wrap:wrap;
      padding:10px 12px;
      border-top:1px solid rgba(255,255,255,.08);
      border-bottom:1px solid rgba(255,255,255,.08);
      background:rgba(0,0,0,.12);
    `;

    const left = document.createElement("div");
    left.style.cssText = "display:flex; align-items:center; gap:8px; flex-wrap:wrap;";

    const right = document.createElement("div");
    right.style.cssText = "margin-left:auto; display:flex; align-items:center; gap:8px; flex-wrap:wrap;";

    // Badge de status/alerta (só informa)
    const badge = document.createElement("span");
    badge.id = "rcf-alert";
    badge.textContent = "OK ✅";
    badge.style.cssText = `
      padding:6px 10px; border-radius:999px;
      border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.06);
      font-weight:900; font-size:12px;
    `;

    // Botão engrenagem (abre drawer)
    const gear = document.createElement("button");
    gear.id = "rcf-gear";
    gear.type = "button";
    gear.setAttribute("aria-label", "Ferramentas");
    gear.textContent = "⚙️";
    gear.style.cssText = `
      width:44px; height:44px; border-radius:14px;
      border:1px solid rgba(255,255,255,.14);
      background:rgba(255,255,255,.06);
      color:#fff; font-size:18px; font-weight:900;
    `;
    gear.onclick = () => toggleDrawer(true);

    // Botões essenciais (mínimo no topo)
    const bAgent = mkBtn("Agent", () => window.RCF?.ui?.openAgent?.());
    const bAdmin = mkBtn("Admin", () => qs('[data-tab="admin"]')?.click?.());

    left.append(bAgent, bAdmin);
    right.append(badge, gear);
    bar.append(left, right);
    header.appendChild(bar);

    ensureDrawer();
    wireGlobalErrors();
  }

  function ensureDrawer(){
    if (byId("rcf-drawer")) return;

    const d = document.createElement("div");
    d.id = "rcf-drawer";
    d.style.cssText = `
      position:fixed; inset:0; z-index:9999;
      background:rgba(0,0,0,.55);
      display:none;
    `;

    const panel = document.createElement("div");
    panel.style.cssText = `
      position:absolute; top:12px; right:12px; left:12px;
      max-width:720px; margin:0 auto;
      border-radius:18px;
      border:1px solid rgba(255,255,255,.14);
      background:rgba(12,18,32,.92);
      box-shadow:0 20px 60px rgba(0,0,0,.45);
      padding:14px;
    `;

    const topRow = document.createElement("div");
    topRow.style.cssText = "display:flex; align-items:center; gap:10px;";

    const title = document.createElement("div");
    title.innerHTML = `<div style="font-weight:1000;font-size:16px;">⚙️ Ferramentas (escondidas)</div>
                       <div style="opacity:.8;font-size:12px;margin-top:2px;">Aqui fica o que NÃO precisa poluir a tela.</div>`;

    const close = mkBtn("Fechar", () => toggleDrawer(false));
    close.style.marginLeft = "auto";

    topRow.append(title, close);

    const grid = document.createElement("div");
    grid.style.cssText = `
      display:flex; flex-wrap:wrap; gap:10px;
      margin-top:12px;
    `;

    // Botões úteis (não ficam flutuando)
    const bDiag = mkBtn("Diagnóstico", () => window.RCF?.ui?.openDiag?.() || qs('[data-tab="admin"]')?.click?.());
    const bLogs = mkBtn("Logs", () => window.RCF?.ui?.openLogs?.());
    const bCopyDiag = mkBtn("Copiar diagnóstico", () => window.RCF?.factory?.copyDiag?.());
    const bClearLogs = mkBtn("Limpar logs", () => window.RCF?.factory?.clearLogs?.());
    const bPwa = mkBtn("Limpar Cache PWA", async () => {
      if (!confirm("Limpar cache PWA + recarregar?")) return;
      try { await window.RCF?.factory?.nukePwaCache?.(); } catch(e){}
      location.reload();
    });

    grid.append(bDiag, bLogs, bCopyDiag, bClearLogs, bPwa);

    // Dica: aqui entra “Auto-ajuste” depois (inbox de patch)
    const note = document.createElement("div");
    note.style.cssText = `
      margin-top:12px; padding:10px 12px; border-radius:14px;
      border:1px dashed rgba(255,255,255,.18);
      background:rgba(255,255,255,.04);
      font-size:12px; opacity:.9;
    `;
    note.textContent =
      "Próximo upgrade: Auto-ajuste da Factory (você cola um pacote e ela mesma sugere onde encaixar, com aprovação).";

    panel.append(topRow, grid, note);
    d.appendChild(panel);

    // clicar fora fecha
    d.addEventListener("click", (e) => {
      if (e.target === d) toggleDrawer(false);
    });

    document.body.appendChild(d);
  }

  function toggleDrawer(open){
    const d = byId("rcf-drawer");
    if (!d) return;
    d.style.display = open ? "block" : "none";
  }

  function setAlert(level, text){
    const badge = byId("rcf-alert");
    if (!badge) return;

    if (level === "ok") {
      badge.textContent = text || "OK ✅";
      badge.style.borderColor = "rgba(255,255,255,.12)";
      badge.style.background = "rgba(255,255,255,.06)";
      return;
    }
    if (level === "warn") {
      badge.textContent = text || "ALERTA ⚠️";
      badge.style.borderColor = "rgba(255,200,0,.35)";
      badge.style.background = "rgba(255,200,0,.12)";
      return;
    }
    badge.textContent = text || "ERRO ❌";
    badge.style.borderColor = "rgba(255,80,80,.45)";
    badge.style.background = "rgba(255,80,80,.16)";
  }

  function wireGlobalErrors(){
    window.addEventListener("error", () => setAlert("err", "ERRO JS ❌"));
    window.addEventListener("unhandledrejection", () => setAlert("err", "PROMISE ❌"));
  }

  function hideOldBottomBars(){
    // se existir algo flutuante antigo, esconde
    ["rcf-floatbar","rcf-fab","rcf-bottom-tools","floatTools","bottomTools"].forEach(id => {
      const el = byId(id);
      if (el) el.style.display = "none";
    });
  }

  function init(){
    ensureGear();
    hideOldBottomBars();
    setAlert("ok", "OK ✅");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
