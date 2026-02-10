(() => {
  // RCF UI Gear v4 (FULL FIX)
  // - Mata o dock/painel flutuante inferior (remove do DOM)
  // - Conserta clique dos botões superiores (roteador próprio por data-tab)
  // - Engrenagem no topo com ferramentas escondidas
  // - Evita duplicação de barras

  const qs  = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));
  const byId = (id) => document.getElementById(id);

  function injectCSS() {
    if (byId("rcf-ui-v4-style")) return;
    const st = document.createElement("style");
    st.id = "rcf-ui-v4-style";
    st.textContent = `
      /* Prioridade máxima pro header/tabs clicarem sempre */
      header.top, header.top * { pointer-events: auto !important; }
      header.top { position: sticky; top: 0; z-index: 9998 !important; }

      /* Se algum overlay invisível estiver pegando toque */
      .rcf-pointer-none { pointer-events: none !important; }

      /* Barra de ferramentas do topo */
      #rcf-gearbar{
        position: sticky;
        top: 0;
        z-index: 9999 !important;
        backdrop-filter: blur(8px);
      }

      /* Esconde qualquer coisa que a gente marcar como dock inferior */
      [data-rcf-kill="bottomdock"]{ display:none !important; }

      /* Deixa as tabs “clicáveis” e acima de tudo */
      nav.tabs { position: relative; z-index: 9999 !important; }
      nav.tabs .tab { pointer-events:auto !important; }
    `;
    document.head.appendChild(st);
  }

  // --------- ROTEADOR PRÓPRIO (faz as tabs de cima funcionarem SEM core) ----------
  function showTab(tabName) {
    // Botões do header: .tab[data-tab="dashboard|newapp|editor|generator|settings|admin|agent..."]
    const tabs = qsa('button.tab[data-tab]');
    tabs.forEach(b => b.classList.toggle("active", b.getAttribute("data-tab") === tabName));

    // Panels: #tab-dashboard, #tab-newapp, #tab-editor, #tab-generator, #tab-settings, #tab-admin
    const panels = qsa('section.panel[id^="tab-"]');
    panels.forEach(p => p.classList.add("hidden"));

    const panel = byId(`tab-${tabName}`);
    if (panel) panel.classList.remove("hidden");
  }

  function wireTopTabsForce() {
    const buttons = qsa('nav.tabs button.tab[data-tab]');
    if (!buttons.length) return;

    // Se o core já colocou listeners, ok. Mas a gente força o nosso também.
    buttons.forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tab = btn.getAttribute("data-tab");
        // tenta core primeiro, se existir
        try { window.RCF?.router?.go?.(tab); } catch(e){}
        // fallback garantido
        showTab(tab);
      };
    });
  }

  // --------- DETECTA E REMOVE O DOCK / PAINEL DE BAIXO ----------
  function isFixedNearBottom(el) {
    try {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed") return false;
      const bottom = parseFloat(cs.bottom || "9999");
      const height = parseFloat(cs.height || "0");
      return bottom <= 40 && height >= 38;
    } catch(e) {
      return false;
    }
  }

  function textHits(el) {
    const t = (el.innerText || "").toLowerCase();
    const words = ["agent", "agente", "admin", "diag", "logs", "limpar cache", "copiar diagnóstico", "copiar logs", "log rcf"];
    let c = 0;
    for (const w of words) if (t.includes(w)) c++;
    return c;
  }

  function killBottomDockOnce() {
    const all = qsa("body *");
    let killed = 0;

    for (const el of all) {
      // pega o navzinho de baixo (Agent/Admin/Diag/Logs)
      if (isFixedNearBottom(el) && textHits(el) >= 2) {
        el.setAttribute("data-rcf-kill", "bottomdock");
        // remove de verdade (melhor que só esconder)
        try { el.remove(); killed++; } catch(e){ el.style.display="none"; }
        continue;
      }

      // pega o painel maior de logs (o retângulo grande)
      const t = (el.innerText || "").toLowerCase();
      if (isFixedNearBottom(el) && t.includes("log rcf") && (t.includes("copiar") || t.includes("limpar"))) {
        el.setAttribute("data-rcf-kill", "bottomdock");
        try { el.remove(); killed++; } catch(e){ el.style.display="none"; }
        continue;
      }
    }

    return killed;
  }

  function keepKillingBottomDock() {
    // roda algumas vezes porque o core pode recriar depois do load
    killBottomDockOnce();
    setTimeout(killBottomDockOnce, 300);
    setTimeout(killBottomDockOnce, 900);
    setTimeout(killBottomDockOnce, 1800);
  }

  // --------- GEAR + DRAWER (ferramentas escondidas) ----------
  function ensureDrawer() {
    if (byId("rcf-drawer")) return;

    const overlay = document.createElement("div");
    overlay.id = "rcf-drawer";
    overlay.style.cssText = `
      position:fixed; inset:0; z-index:10000;
      background:rgba(0,0,0,.55);
      display:none;
    `;

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

    const top = document.createElement("div");
    top.style.cssText = "display:flex; align-items:center; gap:10px;";

    const title = document.createElement("div");
    title.innerHTML = `
      <div style="font-weight:1000;font-size:16px;">⚙️ Ferramentas</div>
      <div style="opacity:.8;font-size:12px;margin-top:2px;">Tudo que é “manutenção” fica aqui, sem poluir a tela.</div>
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

    top.append(title, close);

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

    // Atalhos
    const bAgent = mkBtn("Abrir Agent", () => {
      try { window.RCF?.ui?.openAgent?.(); return; } catch(e){}
      const t = qs('button.tab[data-tab="agent"]');
      if (t) t.click(); else showTab("dashboard");
    });

    const bAdmin = mkBtn("Abrir Admin", () => {
      const t = qs('button.tab[data-tab="admin"]');
      if (t) t.click(); else showTab("admin");
    });

    const bDiag = mkBtn("Copiar diagnóstico", () => {
      try { window.RCF?.factory?.copyDiag?.(); } catch(e){}
    });

    const bClear = mkBtn("Limpar Cache PWA (reload)", async () => {
      if (!confirm("Limpar cache PWA e recarregar?")) return;
      try { await window.RCF?.factory?.nukePwaCache?.(); } catch(e){}
      location.reload();
    });

    const bKillDock = mkBtn("Matar barra de baixo", () => keepKillingBottomDock());

    grid.append(bAgent, bAdmin, bDiag, bClear, bKillDock);

    const note = document.createElement("div");
    note.style.cssText = `
      margin-top:12px; padding:10px 12px; border-radius:14px;
      border:1px dashed rgba(255,255,255,.18);
      background:rgba(255,255,255,.04);
      font-size:12px; opacity:.9;
    `;
    note.textContent =
      "Agora a tela fica limpa. Logs/Diag só por engrenagem. Próximo passo: INBOX DE PATCH (auto-encaixe de código + assets).";

    panel.append(top, grid, note);
    overlay.appendChild(panel);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) toggleDrawer(false);
    });

    document.body.appendChild(overlay);
  }

  function toggleDrawer(open) {
    const d = byId("rcf-drawer");
    if (!d) return;
    d.style.display = open ? "block" : "none";
  }

  function ensureGearBar() {
    // remove duplicatas
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

    // Botões mínimos no topo
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

    const bAgent = mkTopBtn("Agent", () => {
      try { window.RCF?.ui?.openAgent?.(); return; } catch(e){}
      const t = qs('button.tab[data-tab="agent"]');
      if (t) t.click(); else showTab("dashboard");
    });

    const bAdmin = mkTopBtn("Admin", () => {
      const t = qs('button.tab[data-tab="admin"]');
      if (t) t.click(); else showTab("admin");
    });

    left.append(bAgent, bAdmin);
    right.append(ok, gear);

    bar.append(left, right);

    header.appendChild(bar);
    ensureDrawer();
  }

  function init() {
    injectCSS();

    // garante que as tabs de cima funcionem
    wireTopTabsForce();

    // cria engrenagem e limpa duplicação
    ensureGearBar();

    // mata a barra de baixo (várias passadas)
    keepKillingBottomDock();

    // se o core recriar, a gente mata de novo
    const mo = new MutationObserver(() => killBottomDockOnce());
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
