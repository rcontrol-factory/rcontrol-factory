(() => {
  // RCF UI Gear v5 (FULL FORCE)
  // Objetivo:
  // 1) Remover (na força) o DOCK inferior "Agent Admin Diag Logs"
  // 2) Remover o painel de logs/diagnóstico flutuante, se existir
  // 3) Garantir que os botões superiores sempre cliquem
  // 4) Manter engrenagem no topo com ferramentas escondidas

  const qs  = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));
  const byId = (id) => document.getElementById(id);

  function injectCSS() {
    if (byId("rcf-ui-v5-style")) return;
    const st = document.createElement("style");
    st.id = "rcf-ui-v5-style";
    st.textContent = `
      header.top{ position:sticky; top:0; z-index:9998 !important; }
      header.top *{ pointer-events:auto !important; }
      nav.tabs{ position:relative; z-index:9999 !important; }
      nav.tabs .tab{ pointer-events:auto !important; }

      /* qualquer coisa que a gente marcar pra matar some */
      [data-rcf-kill="1"]{ display:none !important; }

      /* Evita que algum overlay invisível pegue toque */
      .rcf-pointer-none{ pointer-events:none !important; }

      /* Barra das ferramentas do topo */
      #rcf-gearbar{
        position: sticky;
        top: 0;
        z-index: 10000 !important;
        backdrop-filter: blur(10px);
      }
    `;
    document.head.appendChild(st);
  }

  // ---------------- ROTEADOR PRÓPRIO (fallback) ----------------
  function showTab(tabName) {
    const tabs = qsa('button.tab[data-tab]');
    tabs.forEach(b => b.classList.toggle("active", b.getAttribute("data-tab") === tabName));

    const panels = qsa('section.panel[id^="tab-"]');
    panels.forEach(p => p.classList.add("hidden"));

    const panel = byId(`tab-${tabName}`);
    if (panel) panel.classList.remove("hidden");
  }

  function wireTopTabsForce() {
    const buttons = qsa('nav.tabs button.tab[data-tab]');
    if (!buttons.length) return;

    buttons.forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tab = btn.getAttribute("data-tab");
        try { window.RCF?.router?.go?.(tab); } catch(e){}
        showTab(tab);
      };
    });
  }

  // ---------------- DETECÇÃO FORTE DO DOCK INFERIOR ----------------
  function norm(s){ return (s || "").trim().toLowerCase(); }

  function hasDockButtons(el) {
    // procura botões com textos "agent", "admin", "diag", "logs"
    const btns = qsa("button").filter(b => el.contains(b));
    const texts = btns.map(b => norm(b.innerText));
    const need = ["agent","admin","diag","logs"];
    let hit = 0;
    for (const w of need) if (texts.includes(w)) hit++;
    return hit >= 3; // às vezes um pode estar oculto, mas 3 já confirma
  }

  function nearBottom(el) {
    try {
      const r = el.getBoundingClientRect();
      // se encosta no final da tela ou fica muito próximo
      return r.bottom > (window.innerHeight - 12) && r.top > (window.innerHeight * 0.55);
    } catch(e){ return false; }
  }

  function killElement(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    el.setAttribute("data-rcf-kill","1");
    try { el.remove(); } catch(e){ el.style.display="none"; }
    return true;
  }

  function killBottomDockHard() {
    // 1) Primeiro tenta achar o container mais óbvio: um bloco perto do fundo com botões agent/admin/diag/logs
    const all = qsa("body *");
    for (const el of all) {
      if (!nearBottom(el)) continue;
      if (!hasDockButtons(el)) continue;

      // sobe até achar um "container" que não seja pequeno demais
      let cur = el;
      for (let i=0;i<6;i++){
        const p = cur.parentElement;
        if (!p) break;
        const r = p.getBoundingClientRect();
        if (r.height < 44) break; // não sobe demais
        cur = p;
      }
      return killElement(cur);
    }

    // 2) Fallback: se tiver QUALQUER elemento perto do fundo com 2+ palavras chaves, mata
    const keywords = ["limpar logs","copiar logs","copiar diagnóstico","limpar cache pwa","log rcf"];
    for (const el of all) {
      if (!nearBottom(el)) continue;
      const t = norm(el.innerText);
      let k = 0;
      for (const w of keywords) if (t.includes(w)) k++;
      if (k >= 2) return killElement(el);
    }

    return false;
  }

  // Remove também overlays/chat flutuantes que ficam por cima e roubam clique
  function killOverlaysStealingClicks() {
    const overlays = qsa("body *").filter(el => {
      try {
        const cs = getComputedStyle(el);
        if (cs.position !== "fixed") return false;
        const r = el.getBoundingClientRect();
        // overlays grandes
        if (r.width < (window.innerWidth * 0.7)) return false;
        if (r.height < (window.innerHeight * 0.18)) return false;
        const t = norm(el.innerText);
        // se contém coisas de logs/diag, é overlay de ferramentas antigas
        return t.includes("copiar") && (t.includes("diagnóstico") || t.includes("logs") || t.includes("cache pwa"));
      } catch(e){ return false; }
    });

    overlays.forEach(killElement);
  }

  function keepKilling() {
    // roda várias vezes porque o core pode recriar depois
    killBottomDockHard();
    killOverlaysStealingClicks();
    setTimeout(() => { killBottomDockHard(); killOverlaysStealingClicks(); }, 250);
    setTimeout(() => { killBottomDockHard(); killOverlaysStealingClicks(); }, 700);
    setTimeout(() => { killBottomDockHard(); killOverlaysStealingClicks(); }, 1300);
    setTimeout(() => { killBottomDockHard(); killOverlaysStealingClicks(); }, 2200);
  }

  // ---------------- GEAR + DRAWER (Ferramentas escondidas) ----------------
  function ensureDrawer() {
    if (byId("rcf-drawer")) return;

    const overlay = document.createElement("div");
    overlay.id = "rcf-drawer";
    overlay.style.cssText = `position:fixed; inset:0; z-index:12000; background:rgba(0,0,0,.55); display:none;`;

    const panel = document.createElement("div");
    panel.style.cssText = `
      position:absolute; top:12px; left:12px; right:12px;
      max-width:760px; margin:0 auto;
      border-radius:18px;
      border:1px solid rgba(255,255,255,.14);
      background:rgba(12,18,32,.92);
      box-shadow:0 20px 60px rgba(0,0,0,.45);
      padding:14px;
    `;

    const rowTop = document.createElement("div");
    rowTop.style.cssText = "display:flex; align-items:center; gap:10px;";

    const title = document.createElement("div");
    title.innerHTML = `
      <div style="font-weight:1000;font-size:16px;">⚙️ Ferramentas</div>
      <div style="opacity:.8;font-size:12px;margin-top:2px;">Manutenção escondida aqui. Tela fica limpa.</div>
    `;

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Fechar";
    close.style.cssText = `
      margin-left:auto; padding:10px 12px; border-radius:12px;
      border:1px solid rgba(255,255,255,.14);
      background:rgba(255,255,255,.06);
      color:#fff; font-weight:900;
    `;
    close.onclick = () => toggleDrawer(false);

    rowTop.append(title, close);

    const grid = document.createElement("div");
    grid.style.cssText = "display:flex; flex-wrap:wrap; gap:10px; margin-top:12px;";

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

    const bKillDock = mkBtn("Matar barra de baixo (agora)", () => keepKilling());
    const bOpenAdmin = mkBtn("Abrir Admin", () => { const t = qs('button.tab[data-tab="admin"]'); if (t) t.click(); else showTab("admin"); });
    const bOpenAgent = mkBtn("Abrir Agent", () => { const t = qs('button.tab[data-tab="agent"]'); if (t) t.click(); });
    const bReload = mkBtn("Recarregar", () => location.reload());

    grid.append(bKillDock, bOpenAgent, bOpenAdmin, bReload);

    const note = document.createElement("div");
    note.style.cssText = `
      margin-top:12px; padding:10px 12px; border-radius:14px;
      border:1px dashed rgba(255,255,255,.18);
      background:rgba(255,255,255,.04);
      font-size:12px; opacity:.9;
    `;
    note.textContent = "Se a barra de baixo reaparecer, ela está sendo recriada pelo core — este v5 mata automaticamente.";

    panel.append(rowTop, grid, note);
    overlay.appendChild(panel);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) toggleDrawer(false); });

    document.body.appendChild(overlay);
  }

  function toggleDrawer(open) {
    const d = byId("rcf-drawer");
    if (!d) return;
    d.style.display = open ? "block" : "none";
  }

  function ensureGearBar() {
    const header = qs("header.top");
    if (!header) return;

    const old = byId("rcf-gearbar");
    if (old) old.remove();

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

    const mk = (label, fn) => {
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

    const bAgent = mk("Agent", () => { const t = qs('button.tab[data-tab="agent"]'); if (t) t.click(); });
    const bAdmin = mk("Admin", () => { const t = qs('button.tab[data-tab="admin"]'); if (t) t.click(); else showTab("admin"); });

    const ok = document.createElement("span");
    ok.textContent = "OK ✅";
    ok.style.cssText = `
      padding:6px 10px; border-radius:999px;
      border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.06);
      font-weight:900; font-size:12px;
    `;

    const gear = document.createElement("button");
    gear.type = "button";
    gear.textContent = "⚙️";
    gear.style.cssText = `
      width:44px; height:44px; border-radius:14px;
      border:1px solid rgba(255,255,255,.14);
      background:rgba(255,255,255,.06);
      color:#fff; font-size:18px; font-weight:900;
    `;
    gear.onclick = () => toggleDrawer(true);

    left.append(bAgent, bAdmin);
    right.append(ok, gear);
    bar.append(left, right);

    header.appendChild(bar);
    ensureDrawer();
  }

  function init() {
    injectCSS();
    wireTopTabsForce();
    ensureGearBar();
    keepKilling();

    // Se o core recriar depois, a gente mata de novo
    const mo = new MutationObserver(() => {
      killBottomDockHard();
      killOverlaysStealingClicks();
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Loop de segurança: a cada 2s garante que não voltou
    setInterval(() => {
      killBottomDockHard();
      killOverlaysStealingClicks();
    }, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
