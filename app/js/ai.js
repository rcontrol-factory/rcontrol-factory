// app/js/ai.js
(function () {
  const STORE_APPS = "rcf_apps_v1";
  const STORE_ACTIVE = "rcf_active_app_v1";

  function loadApps() {
    try { return JSON.parse(localStorage.getItem(STORE_APPS) || "[]"); }
    catch { return []; }
  }
  function saveApps(apps) {
    localStorage.setItem(STORE_APPS, JSON.stringify(apps));
  }
  function getActiveId() {
    return localStorage.getItem(STORE_ACTIVE) || "";
  }
  function setActiveId(id) {
    localStorage.setItem(STORE_ACTIVE, id);
  }
  function nowId(name) {
    const slug = String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const t = Date.now().toString(36);
    return (slug ? slug : "app") + "-" + t;
  }

  function parse(cmdRaw) {
    const raw = String(cmdRaw || "").trim();
    const lower = raw.toLowerCase();
    const tokens = lower.split(/\s+/).filter(Boolean);
    return { raw, lower, tokens };
  }

  function helpText() {
    return [
      "Comandos disponíveis:",
      "- help",
      "- status",
      "- list",
      "- select <id>",
      "- create app <nome>",
      "- clear"
    ].join("\n");
  }

  function statusText() {
    const apps = loadApps();
    const active = getActiveId();
    const activeApp = apps.find(a => a.id === active);
    return [
      "Engine ativa",
      `Apps: ${apps.length}`,
      activeApp ? `App atual: ${activeApp.name} (${activeApp.id})` : "App atual: (nenhum)",
      "Sem erros"
    ].join("\n");
  }

  function listText() {
    const apps = loadApps();
    if (!apps.length) return "Nenhum app salvo ainda.";
    return ["Apps salvos:"]
      .concat(apps.map(a => `- ${a.name} (${a.id})`))
      .join("\n");
  }

  // Exposto para o Router usar
  function createApp(name, templates) {
    const apps = loadApps();
    const id = nowId(name);
    const app = {
      id,
      name: String(name || "Novo App").trim() || "Novo App",
      createdAt: new Date().toISOString(),
      files: templates.makeBasicPwaFiles(String(name || "App"), id)
    };
    apps.unshift(app);
    saveApps(apps);
    setActiveId(id);
    return app;
  }

  function selectApp(id) {
    const apps = loadApps();
    const ok = apps.some(a => a.id === id);
    if (!ok) return { ok: false, msg: `App não encontrado: ${id}` };
    setActiveId(id);
    return { ok: true, msg: `App ativo: ${id}` };
  }

  function clearOutput(el) {
    if (el) el.textContent = "";
    return "Ok. Limpo.";
  }

  function run(cmdRaw, templates) {
    const { raw, tokens } = parse(cmdRaw);
    if (!raw) return helpText();

    if (tokens[0] === "help") return helpText();
    if (tokens[0] === "status") return statusText();
    if (tokens[0] === "list") return listText();
    if (tokens[0] === "clear") return "__CLEAR__";

    if (tokens[0] === "select" && tokens[1]) {
      const r = selectApp(tokens[1]);
      return r.ok ? r.msg : "ERRO: " + r.msg;
    }

    // create app <nome...>
    if (tokens[0] === "create" && tokens[1] === "app") {
      const name = raw.replace(/^create\s+app\s+/i, "").trim();
      if (!name) return "ERRO: Informe um nome. Ex: create app estoque";
      const app = createApp(name, templates);
      return [
        "✅ App criado!",
        `Nome: ${app.name}`,
        `ID: ${app.id}`,
        "Dica: vá no Editor para editar arquivos."
      ].join("\n");
    }

    return 'ERRO: Comando não reconhecido. Digite: help';
  }

  // API pública do engine (Factory)
  window.RCF = window.RCF || {};
  window.RCF.engine = {
    loadApps,
    saveApps,
    getActiveId,
    setActiveId,
    createApp,
    selectApp,
    run,
    clearOutput
  };
})();
