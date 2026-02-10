(() => {
  // RCF UI Gear v3 - modo LIMPO:
  // - Engrenagem no topo com ferramentas escondidas
  // - Remove/oculta qualquer "dock" flutuante embaixo (Agent/Admin/Diag/Logs + logs)
  // - Não mexe no core do app.js (só UI)

  const qs  = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));
  const byId = (id) => document.getElementById(id);

  function cssInject() {
    if (byId("rcf-gear-style")) return;

    const st = document.createElement("style");
    st.id = "rcf-gear-style";
    st.textContent = `
      /* --- esconder dock/toolbar flutuante inferior (genérico) --- */
      .rcf-hide-bottom { display:none !important; }

      /* se o core usar algo parecido com "fixed bottom dock", a gente mata por atributo */
      [data-rcf-bottom-dock="1"] { display:none !important; }

      /* deixa o header mais “flutter-like” com respiro */
      #rcf-gearbar{
        position:sticky; top:0;
        z-index: 50;
        backdrop-filter: blur(8px);
      }
    `;
    document.head.appendChild(st);
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
    title.innerHTML = `
      <div style="font-weight:1000;font-size:16px;">⚙️ Ferramentas</div>
      <div style="opacity:.8;font-size:12px;margin-top:2px;">Tudo o que não precisa poluir a tela fica aqui.</div>
    `;

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Fechar";
    close.style.cssText = `
      margin-left:auto;
      padding:10px 12px; border-radius:12px;
      border:1px solid rgba(255,255,255,.14);
      background:rgba(255,255,255,.06);
      color:#fff; font-weight:900;
    `;
    close.onclick = () => toggleDrawer(false);

    topRow.append(title, close);

    const grid = document.createElement("div");
    grid.style.cssText = `display:flex; flex-wrap:wrap; gap:10px; margin-top:12px;`;

    const mkBtn = (label, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText = `
        padding:10px 12px; border-radius:12px;
        border:1px solid rgba(255,255,255,.14);
        background:rgba(255,255,255,.06);
        color:#fff; font-weight:900;
      `;
      b.onclick = fn;
      return b;
    };

    // Botões (chamam as funções se existirem; se não, só abre as tabs)
    const bAgent = mkBtn("Abrir Agent", () => window.RCF?.ui?.openAgent?.());
    const bAdmin = mkBtn("Abrir Admin", () => qs('[data-tab="admin"]')?.click?.());
    const bDiag  = mkBtn("Diagnóstico", () => window.RCF?.ui?.openDiag?.() || qs('[data-tab="admin"]')?.click?.());
    const bLogs  = mkBtn("Logs", () => window.RCF?.ui?.openLogs?.());
    const bCopyDiag = mkBtn("Copiar diagnóstico", () => window.RCF?.factory?.copyDiag?.());
    const bClearLogs = mkBtn("Limpar logs", () => window.RCF?.factory?.clearLogs?.());
    const bPwa = mkBtn("Limpar Cache PWA", async () => {
      if (!confirm("Limpar cache PWA + recarregar?")) return;
      try { await window.RCF?.factory?.nukePwaCache?.(); } catch(e){}
      location.reload();
    });

    grid.append(bAgent, bAdmin, bDiag, bLogs, bCopyDiag, bClearLogs, bPwa);

    const note = document.createElement("div");
    note.style.cssText = `
      margin-top:12px; padding:10px 12px; border-radius:14px;
      border:1px dashed rgba(255,255,255,.18);
      background:rgba(255,255,255,.04);
      font-size:12px; opacity:.9;
    `;
    note.textContent =
      "Próximo upgrade: INBOX DE PATCH (auto-ajuste). Você cola um pacote e a Factory sugere onde encaixa. Só aplica com Aprovar.";

    panel.append(topRow, grid, note);
    d.appendChild(panel);

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

  function ensureGearBar(){
    // Evita duplicar barras (na sua foto apareceu duplicado)
    const old = byId("rcf-gearbar");
    if (old) old.remove();

    const header = qs("header.top");
    if (!header) return;

    const bar = document.createElement("div");
    bar.id = "rcf-gearbar";
    bar.style.cssText = `
      display:flex; align-items:center; gap:10px;
      padding:10px 12px;
      border-top:1px solid rgba(255,255,255,.08);
      border-bottom:1px solid rgba(255,255,255,.08);
      background:rgba(0,0,0,.12);
    `;

    const left = document.createElement("div");
    left.style.cssText = "display:flex; align-items:center; gap:10px;";

    const right = document.createElement("div");
    right.style.cssText = "margin-left:auto; display:flex; align-items:center; gap:10px;";

    const badge = document.createElement("span");
    badge.id = "rcf-alert";
    badge.textContent = "OK ✅";
    badge.style.cssText = `
      padding:6px 10px; border-radius:999px;
      border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.06);
      font-weight:900; font-size:12px;
    `;

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

    // Só 2 botões no topo (limpo). O resto vai na engrenagem.
    const mkTopBtn = (label, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText = `
        padding:10px 12px; border-radius:12px;
        border:1px solid rgba(255,255,255,.14);
        background:rgba(255,255,255,.06);
        color:#fff; font-weight:900;
      `;
      b.onclick = fn;
      return b;
    };

    const bAgent = mkTopBtn("Agent", () => window.RCF?.ui?.openAgent?.());
    const bAdmin = mkTopBtn("Admin", () => qs('[data-tab="admin"]')?.click?.());

    left.append(bAgent, bAdmin);
    right.append(badge, gear);

    bar.append(left, right);

    // coloca logo abaixo das tabs
    header.appendChild(bar);

    ensureDrawer();
    wireGlobalErrors();
    setAlert("ok", "OK ✅");
  }

  function isBottomFixed(el){
    try{
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed") return false;
      const b = parseFloat(cs.bottom || "9999");
      const h = parseFloat(cs.height || "0");
      // “dock” típico: colado no fundo ou quase, e com tamanho visível
      return b <= 24 && h >= 40;
    }catch(e){
      return false;
    }
  }

  function looksLikeBottomTools(el){
    const txt = (el.innerText || "").toLowerCase();
    // bate com o que aparece na tua barra de baixo
    const hits = ["agent", "admin", "diag", "logs", "limpar cache", "copiar diagnóstico", "copiar logs"];
    const count = hits.reduce((acc, w) => acc + (txt.includes(w) ? 1 : 0), 0);
    return count >= 2; // se tiver 2+ palavras, é quase certeza que é o bloco de ferramentas
  }

  function killBottomDock(){
    // 1) mata qualquer coisa fixed embaixo que pareça ferramenta
    const all = qsa("body *");
    for (const el of all) {
      if (!isBottomFixed(el)) continue;
      if (!looksLikeBottomTools(el)) continue;

      // marca e esconde
      el.setAttribute("data-rcf-bottom-dock", "1");
      el.classList.add("rcf-hide-bottom");
    }

    // 2) Se existir um container maior (pai) também fixed, mata o pai
    for (const el of all) {
      if (!isBottomFixed(el)) continue;
      const txt = (el.innerText || "").toLowerCase();
      // esse pega o painel de logs completo
      if (txt.includes("log rcf") && (txt.includes("copiar") || txt.includes("limpar"))) {
        el.setAttribute("data-rcf-bottom-dock", "1");
        el.classList.add("rcf-hide-bottom");
      }
    }
  }

  function init(){
    cssInject();
    ensureGearBar();

    // roda agora e depois de 0.8s e 2.5s (pq às vezes o core monta depois)
    killBottomDock();
    setTimeout(killBottomDock, 800);
    setTimeout(killBottomDock, 2500);

    // observa mudanças e mata de novo (se o core recriar)
    const mo = new MutationObserver(() => killBottomDock());
    mo.observe(document.body, { childList:true, subtree:true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
