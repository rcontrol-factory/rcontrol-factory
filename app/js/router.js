// app/js/router.js
(function () {
  const $ = (q) => document.querySelector(q);

  function ensureSeed() {
    // nada por enquanto
  }

  function renderNav(active) {
    const routes = [
      ["dashboard", "Dashboard"],
      ["new", "New App"],
      ["editor", "Editor"],
      ["generator", "Generator"],
      ["settings", "Settings"],
    ];
    return `
      <nav class="tabs">
        ${routes.map(([r, label]) => `
          <button class="tab ${active===r?"on":""}" data-route="${r}">${label}</button>
        `).join("")}
      </nav>
    `;
  }

  function renderDashboard() {
    const apps = window.RCF.engine.loadApps();
    const active = window.RCF.engine.getActiveId();
    return `
      <section class="panel">
        <h2>Bem-vindo 👋</h2>
        <p class="muted">Factory interna para criar e editar apps (local-first).</p>

        <div class="row">
          <button class="btn" data-route="new">+ Criar novo app</button>
          <button class="btn ghost" data-route="editor">Abrir Editor</button>
        </div>

        <h3>Apps salvos</h3>
        <div class="list">
          ${apps.length ? apps.map(a => `
            <div class="item">
              <div>
                <div class="title">${a.name}</div>
                <div class="sub">${a.id}</div>
              </div>
              <button class="pill ${a.id===active?"on":""}" data-action="select" data-id="${a.id}">
                ${a.id===active?"ativo":"selecionar"}
              </button>
            </div>
          `).join("") : `<div class="muted">Nenhum app salvo ainda.</div>`}
        </div>
      </section>
    `;
  }

  function renderNewApp() {
    return `
      <section class="panel">
        <h2>Criar novo app</h2>
        <div class="row">
          <input id="new-name" class="input" placeholder="Ex: Estoque, Finanças, Orçamentos" />
          <button id="new-create" class="btn">Criar</button>
        </div>
        <p class="muted">Isso cria o app no armazenamento local da Factory.</p>
      </section>
    `;
  }

  function renderEditor() {
    const apps = window.RCF.engine.loadApps();
    const activeId = window.RCF.engine.getActiveId();
    const active = apps.find(a => a.id === activeId) || apps[0] || null;
    if (active && active.id !== activeId) window.RCF.engine.setActiveId(active.id);

    const fileNames = active ? Object.keys(active.files || {}) : [];
    const firstFile = fileNames[0] || "";

    return `
      <section class="panel">
        <h2>Editor</h2>

        <div class="row">
          <label class="muted">App ativo:</label>
          <select id="app-select" class="select">
            ${apps.map(a => `<option value="${a.id}" ${a.id=== (active?active.id:"") ? "selected":""}>${a.name} (${a.id})</option>`).join("")}
          </select>
        </div>

        ${active ? `
          <div class="row">
            <label class="muted">Arquivo:</label>
            <select id="file-select" class="select">
              ${fileNames.map(fn => `<option value="${fn}" ${fn===firstFile?"selected":""}>${fn}</option>`).join("")}
            </select>
            <button id="save-file" class="btn">Salvar</button>
          </div>

          <textarea id="file-editor" class="textarea"></textarea>
          <div class="muted">Dica: se travar cache, recarregue a página.</div>
        ` : `<div class="muted">Crie um app primeiro (New App).</div>`}
      </section>
    `;
  }

  function renderGenerator() {
    return `
      <section class="panel">
        <h2>Generator</h2>
        <p class="muted">Aqui vai entrar Publish (GitHub Pages) depois. Agora é CORE local-first.</p>
      </section>
    `;
  }

  function renderSettings() {
    return `
      <section class="panel">
        <h2>Settings</h2>
        <p class="muted">Configurações locais do Factory (token GitHub vem depois).</p>
      </section>
    `;
  }

  function renderAIConsole() {
    return `
      <section class="panel">
        <h2>IA do Factory</h2>
        <div class="row">
          <input id="ai-input" class="input" placeholder="Ex: help | status | create app estoque" />
          <button id="ai-run" class="btn">Executar</button>
        </div>
        <pre id="ai-output" class="console"></pre>
        <div class="muted">No iPhone: depois de digitar, pode apertar Enter também.</div>
      </section>
    `;
  }

  function mount(route) {
    const root = $("#root");
    if (!root) return;

    const view =
      route === "dashboard" ? renderDashboard() :
      route === "new" ? renderNewApp() :
      route === "editor" ? renderEditor() :
      route === "generator" ? renderGenerator() :
      route === "settings" ? renderSettings() :
      renderDashboard();

    root.innerHTML = `
      ${renderNav(route)}
      ${view}
      ${renderAIConsole()}
    `;

    bind(route);
  }

  function bind(route) {
    // tabs
    document.querySelectorAll("[data-route]").forEach(btn => {
      btn.addEventListener("click", () => {
        location.hash = "#" + btn.getAttribute("data-route");
      });
    });

    // dashboard select app
    document.querySelectorAll('[data-action="select"]').forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        window.RCF.engine.setActiveId(id);
        location.hash = "#editor";
      });
    });

    // new app
    const cBtn = $("#new-create");
    if (cBtn) {
      cBtn.addEventListener("click", () => {
        const name = ($("#new-name")?.value || "").trim();
        const res = window.RCF.engine.run("create app " + (name || "novo"), window.RCF.templates);
        $("#ai-output").textContent = res;
        location.hash = "#editor";
      });
    }

    // editor app select
    const appSel = $("#app-select");
    if (appSel) {
      appSel.addEventListener("change", () => {
        window.RCF.engine.setActiveId(appSel.value);
        location.hash = "#editor";
      });
    }

    // editor file load/save
    const fileSel = $("#file-select");
    const ta = $("#file-editor");
    const saveBtn = $("#save-file");
    if (fileSel && ta && saveBtn) {
      const loadInto = () => {
        const apps = window.RCF.engine.loadApps();
        const activeId = window.RCF.engine.getActiveId();
        const active = apps.find(a => a.id === activeId);
        if (!active) return;
        const fn = fileSel.value;
        ta.value = active.files?.[fn] ?? "";
      };
      fileSel.addEventListener("change", loadInto);
      loadInto();

      saveBtn.addEventListener("click", () => {
        const apps = window.RCF.engine.loadApps();
        const activeId = window.RCF.engine.getActiveId();
        const idx = apps.findIndex(a => a.id === activeId);
        if (idx < 0) return;
        const fn = fileSel.value;
        apps[idx].files = apps[idx].files || {};
        apps[idx].files[fn] = ta.value;
        window.RCF.engine.saveApps(apps);
        $("#ai-output").textContent = "✅ Salvo: " + fn;
      });
    }

    // AI console run
    const aiBtn = $("#ai-run");
    const aiIn = $("#ai-input");
    const aiOut = $("#ai-output");
    const runCmd = () => {
      const cmd = (aiIn?.value || "").trim();
      const res = window.RCF.engine.run(cmd, window.RCF.templates);
      if (res === "__CLEAR__") {
        aiOut.textContent = "";
      } else {
        aiOut.textContent = (aiOut.textContent ? aiOut.textContent + "\n\n" : "") + "> " + cmd + "\n" + res;
      }
    };
    if (aiBtn && aiIn) {
      aiBtn.addEventListener("click", runCmd);
      aiIn.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); runCmd(); }
      });
    }
  }

  function getRoute() {
    const h = (location.hash || "#dashboard").replace("#", "");
    return h || "dashboard";
  }

  window.RCF = window.RCF || {};
  window.RCF.router = { mount, getRoute, ensureSeed };
})();
