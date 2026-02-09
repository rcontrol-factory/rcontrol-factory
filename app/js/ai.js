// app/js/ai.js  (v2)
// Engine + "cérebro" + patches + auto-apply (sem IA online ainda)
(function () {
  "use strict";

  // >>> Alinha com a Factory v3 (o seu app.js grande usa isso)
  const STORE_APPS = "rcf_apps_v3";
  const STORE_ACTIVE = "rcf_active_app_id_v3";
  const STORE_ENGINE = "rcf_engine_v2"; // prefs do engine (auto, etc)

  const MAX_HISTORY = 20;

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function loadApps() {
    return safeJsonParse(localStorage.getItem(STORE_APPS) || "[]", []);
  }
  function saveApps(apps) {
    localStorage.setItem(STORE_APPS, JSON.stringify(apps || []));
  }
  function getActiveId() {
    return localStorage.getItem(STORE_ACTIVE) || "";
  }
  function setActiveId(id) {
    localStorage.setItem(STORE_ACTIVE, id || "");
  }

  function loadEnginePrefs() {
    const d = safeJsonParse(localStorage.getItem(STORE_ENGINE) || "{}", {});
    return {
      autoApply: !!d.autoApply,
      lastPlan: d.lastPlan || null,
      lastPatches: d.lastPatches || null,
    };
  }
  function saveEnginePrefs(p) {
    localStorage.setItem(STORE_ENGINE, JSON.stringify(p || {}));
  }

  function getActiveApp() {
    const apps = loadApps();
    const id = getActiveId();
    let app = apps.find(a => a && a.id === id) || null;
    if (!app && apps.length) {
      app = apps[0];
      setActiveId(app.id);
    }
    return { apps, app };
  }

  function ensureAppMeta(app) {
    app.meta = app.meta || {};
    app.meta.goal = app.meta.goal || "";
    app.meta.audience = app.meta.audience || "";
    app.meta.modules = Array.isArray(app.meta.modules) ? app.meta.modules : [];
    app.meta.entities = Array.isArray(app.meta.entities) ? app.meta.entities : [];
    app.meta.status = app.meta.status || "draft";
    return app;
  }

  function pushHistory(app, entry) {
    app.history = Array.isArray(app.history) ? app.history : [];
    app.history.push({
      at: new Date().toISOString(),
      ...entry
    });
    while (app.history.length > MAX_HISTORY) app.history.shift();
  }

  function slugify(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function nowId(name) {
    const slug = slugify(name) || "app";
    const t = Date.now().toString(36);
    return slug + "-" + t;
  }

  // --------- Heurística: detectar se o input é CÓDIGO colado ----------
  function looksLikeHtml(s) {
    const t = String(s || "");
    return /<!doctype\s+html>/i.test(t) || (/<html[\s>]/i.test(t) && /<\/html>/i.test(t));
  }
  function looksLikeServiceWorker(s) {
    const t = String(s || "");
    return /self\.addEventListener\(["']install["']/i.test(t) && /caches\./i.test(t);
  }
  function looksLikeCss(s) {
    const t = String(s || "");
    return /{[^}]*}/.test(t) && /:root|body|\.|#/.test(t);
  }
  function looksLikeJs(s) {
    const t = String(s || "");
    return /function\s*\(|const\s+|let\s+|=>|document\.getElementById|addEventListener/.test(t);
  }

  // --------- Patch system ----------
  // Patch = {type:"patch", action:"setFile"|"replace"|"append"|"insertAfter"|"insertBefore",
  //          file:"index.html"|"app.js"|"styles.css"|"manifest.json"|"sw.js",
  //          content:"...", find:"...", once:true}
  function applyPatchToText(text, patch) {
    const src = String(text ?? "");
    const content = String(patch.content ?? "");
    const find = patch.find != null ? String(patch.find) : "";

    if (patch.action === "setFile") {
      return { ok: true, out: content, note: "setFile" };
    }

    if (patch.action === "append") {
      return { ok: true, out: src + content, note: "append" };
    }

    if (patch.action === "replace") {
      if (!find) return { ok: false, out: src, note: "replace precisa de find" };
      if (!src.includes(find)) return { ok: false, out: src, note: "find não encontrado" };
      const out = patch.once ? src.replace(find, content) : src.split(find).join(content);
      return { ok: true, out, note: "replace" };
    }

    if (patch.action === "insertAfter") {
      if (!find) return { ok: false, out: src, note: "insertAfter precisa de find" };
      const i = src.indexOf(find);
      if (i < 0) return { ok: false, out: src, note: "find não encontrado" };
      const pos = i + find.length;
      return { ok: true, out: src.slice(0, pos) + content + src.slice(pos), note: "insertAfter" };
    }

    if (patch.action === "insertBefore") {
      if (!find) return { ok: false, out: src, note: "insertBefore precisa de find" };
      const i = src.indexOf(find);
      if (i < 0) return { ok: false, out: src, note: "find não encontrado" };
      return { ok: true, out: src.slice(0, i) + content + src.slice(i), note: "insertBefore" };
    }

    return { ok: false, out: src, note: "ação desconhecida" };
  }

  function applyPatches(patches) {
    const { apps, app } = getActiveApp();
    if (!app) return { ok: false, msg: "Nenhum app ativo." };

    ensureAppMeta(app);
    app.files = app.files || {};
    const results = [];

    (patches || []).forEach((p) => {
      const file = p.file;
      if (!file) {
        results.push({ ok: false, file: "(sem file)", note: "Patch sem file" });
        return;
      }
      const prev = String(app.files[file] ?? "");
      const r = applyPatchToText(prev, p);
      if (r.ok) {
        app.files[file] = r.out;
        results.push({ ok: true, file, note: r.note });
      } else {
        results.push({ ok: false, file, note: r.note });
      }
    });

    pushHistory(app, { kind: "patches", patchesCount: (patches || []).length, results });

    // salva de volta
    const idx = apps.findIndex(a => a && a.id === app.id);
    if (idx >= 0) apps[idx] = app;
    saveApps(apps);

    return { ok: true, msg: "Patches aplicados.", results };
  }

  // --------- Planejamento (sem IA online) ----------
  function makePlanFromIntent(text, app) {
    const t = String(text || "").toLowerCase();
    const plan = { goal: "", modules: [], entities: [], patches: [] };

    // goal
    plan.goal = app?.meta?.goal || "";
    if (!plan.goal) {
      if (t.includes("quota") || t.includes("quotas")) plan.goal = "Controle de quotas e regras de cálculo.";
      else if (t.includes("agro") || t.includes("leite")) plan.goal = "Gestão agropecuária (produção, vacas, produtores).";
      else plan.goal = "App de gestão.";
    }

    // modules
    const addM = (m) => { if (!plan.modules.includes(m)) plan.modules.push(m); };
    addM("dashboard");
    if (t.includes("cadastro") || t.includes("produtor") || t.includes("clientes")) addM("cadastros");
    if (t.includes("relat") || t.includes("relatório")) addM("relatorios");
    if (t.includes("quota") || t.includes("regra")) addM("regras");
    if (t.includes("config") || t.includes("settings")) addM("config");

    // entities
    const addE = (e) => { if (!plan.entities.includes(e)) plan.entities.push(e); };
    if (t.includes("vaca")) addE("vacas");
    if (t.includes("produtor")) addE("produtores");
    if (t.includes("quota")) addE("quotas");
    if (t.includes("leite")) addE("leite");

    // patches iniciais (bem leves)
    plan.patches.push({
      type: "patch",
      action: "append",
      file: "app.js",
      content:
`\n\n// --- RCF v2 hint ---\n// Objetivo: ${plan.goal}\n// Módulos: ${plan.modules.join(", ")}\n// Entidades: ${plan.entities.join(", ")}\n`
    });

    return plan;
  }

  function ensureFactoryLayoutFixesPlan() {
    // Aqui você pode adicionar patches de auto-repair do Factory (não do app gerado)
    // Por enquanto, vazio. (A gente liga depois.)
    return [];
  }

  // --------- Comandos ----------
  function helpText(prefs) {
    return [
      "RCF Engine v2 — comandos:",
      "- help",
      "- status",
      "- list",
      "- select <id>",
      "- create app <nome>",
      "- define goal <texto>",
      "- add module <nome>",
      "- add entity <nome>",
      "- plan <texto>          (gera plano + patches)",
      "- apply                 (aplica últimos patches)",
      `- auto on|off            (AUTO APPLY: ${prefs.autoApply ? "ON" : "OFF"})`,
      "- history               (últimas ações)",
      "",
      "✅ DICA: você pode COLAR CÓDIGO direto aqui:",
      "- Se colar um HTML completo → vai para index.html",
      "- Se colar um SW → vai para sw.js",
      "- Se colar CSS → vai para styles.css",
      "- Se colar JS → vai para app.js",
    ].join("\n");
  }

  function statusText() {
    const apps = loadApps();
    const active = getActiveId();
    const activeApp = apps.find(a => a && a.id === active) || null;
    return [
      "Engine v2 ativa ✅",
      `Apps: ${apps.length}`,
      activeApp ? `App atual: ${activeApp.name} (${activeApp.id})` : "App atual: (nenhum)",
      activeApp?.meta?.goal ? `Goal: ${activeApp.meta.goal}` : "Goal: (não definido)",
    ].join("\n");
  }

  function listText() {
    const apps = loadApps();
    if (!apps.length) return "Nenhum app salvo ainda.";
    return ["Apps salvos:"].concat(apps.map(a => `- ${a.name} (${a.id})`)).join("\n");
  }

  function historyText() {
    const { app } = getActiveApp();
    if (!app) return "Sem app ativo.";
    const h = Array.isArray(app.history) ? app.history.slice(-10) : [];
    if (!h.length) return "Sem histórico ainda.";
    return h.map(x => `${x.at} • ${x.kind} • patches:${x.patchesCount || 0}`).join("\n");
  }

  // Exposto para router/admin usar
  function createApp(name, templates) {
    const apps = loadApps();
    const id = nowId(name);
    const nm = String(name || "Novo App").trim() || "Novo App";

    const files = (templates && templates.makeBasicPwaFiles)
      ? templates.makeBasicPwaFiles(nm, id)
      : (templates && templates.makePwaBaseTemplateFiles)
        ? templates.makePwaBaseTemplateFiles(nm, id)
        : { "index.html": "<h1>"+nm+"</h1>", "app.js":"", "styles.css":"", "manifest.json":"{}", "sw.js":"" };

    const app = {
      id,
      name: nm,
      type: "pwa",
      templateId: "pwa-base",
      createdAt: Date.now(),
      files,
      baseFiles: { ...files },
      meta: { goal: "", audience: "", modules: [], entities: [], status: "draft" },
      history: []
    };

    apps.unshift(app);
    saveApps(apps);
    setActiveId(id);
    return app;
  }

  function selectApp(id) {
    const apps = loadApps();
    const ok = apps.some(a => a && a.id === id);
    if (!ok) return { ok: false, msg: `App não encontrado: ${id}` };
    setActiveId(id);
    return { ok: true, msg: `App ativo: ${id}` };
  }
  // app/js/ai.js  (v2)
// Engine + "cérebro" + patches + auto-apply (sem IA online ainda)
(function () {
  "use strict";

  // >>> Alinha com a Factory v3 (o seu app.js grande usa isso)
  const STORE_APPS = "rcf_apps_v3";
  const STORE_ACTIVE = "rcf_active_app_id_v3";
  const STORE_ENGINE = "rcf_engine_v2"; // prefs do engine (auto, etc)

  const MAX_HISTORY = 20;

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function loadApps() {
    return safeJsonParse(localStorage.getItem(STORE_APPS) || "[]", []);
  }
  function saveApps(apps) {
    localStorage.setItem(STORE_APPS, JSON.stringify(apps || []));
  }
  function getActiveId() {
    return localStorage.getItem(STORE_ACTIVE) || "";
  }
  function setActiveId(id) {
    localStorage.setItem(STORE_ACTIVE, id || "");
  }

  function loadEnginePrefs() {
    const d = safeJsonParse(localStorage.getItem(STORE_ENGINE) || "{}", {});
    return {
      autoApply: !!d.autoApply,
      lastPlan: d.lastPlan || null,
      lastPatches: d.lastPatches || null,
    };
  }
  function saveEnginePrefs(p) {
    localStorage.setItem(STORE_ENGINE, JSON.stringify(p || {}));
  }

  function getActiveApp() {
    const apps = loadApps();
    const id = getActiveId();
    let app = apps.find(a => a && a.id === id) || null;
    if (!app && apps.length) {
      app = apps[0];
      setActiveId(app.id);
    }
    return { apps, app };
  }

  function ensureAppMeta(app) {
    app.meta = app.meta || {};
    app.meta.goal = app.meta.goal || "";
    app.meta.audience = app.meta.audience || "";
    app.meta.modules = Array.isArray(app.meta.modules) ? app.meta.modules : [];
    app.meta.entities = Array.isArray(app.meta.entities) ? app.meta.entities : [];
    app.meta.status = app.meta.status || "draft";
    return app;
  }

  function pushHistory(app, entry) {
    app.history = Array.isArray(app.history) ? app.history : [];
    app.history.push({
      at: new Date().toISOString(),
      ...entry
    });
    while (app.history.length > MAX_HISTORY) app.history.shift();
  }

  function slugify(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function nowId(name) {
    const slug = slugify(name) || "app";
    const t = Date.now().toString(36);
    return slug + "-" + t;
  }

  // --------- Heurística: detectar se o input é CÓDIGO colado ----------
  function looksLikeHtml(s) {
    const t = String(s || "");
    return /<!doctype\s+html>/i.test(t) || (/<html[\s>]/i.test(t) && /<\/html>/i.test(t));
  }
  function looksLikeServiceWorker(s) {
    const t = String(s || "");
    return /self\.addEventListener\(["']install["']/i.test(t) && /caches\./i.test(t);
  }
  function looksLikeCss(s) {
    const t = String(s || "");
    return /{[^}]*}/.test(t) && /:root|body|\.|#/.test(t);
  }
  function looksLikeJs(s) {
    const t = String(s || "");
    return /function\s*\(|const\s+|let\s+|=>|document\.getElementById|addEventListener/.test(t);
  }

  // --------- Patch system ----------
  // Patch = {type:"patch", action:"setFile"|"replace"|"append"|"insertAfter"|"insertBefore",
  //          file:"index.html"|"app.js"|"styles.css"|"manifest.json"|"sw.js",
  //          content:"...", find:"...", once:true}
  function applyPatchToText(text, patch) {
    const src = String(text ?? "");
    const content = String(patch.content ?? "");
    const find = patch.find != null ? String(patch.find) : "";

    if (patch.action === "setFile") {
      return { ok: true, out: content, note: "setFile" };
    }

    if (patch.action === "append") {
      return { ok: true, out: src + content, note: "append" };
    }

    if (patch.action === "replace") {
      if (!find) return { ok: false, out: src, note: "replace precisa de find" };
      if (!src.includes(find)) return { ok: false, out: src, note: "find não encontrado" };
      const out = patch.once ? src.replace(find, content) : src.split(find).join(content);
      return { ok: true, out, note: "replace" };
    }

    if (patch.action === "insertAfter") {
      if (!find) return { ok: false, out: src, note: "insertAfter precisa de find" };
      const i = src.indexOf(find);
      if (i < 0) return { ok: false, out: src, note: "find não encontrado" };
      const pos = i + find.length;
      return { ok: true, out: src.slice(0, pos) + content + src.slice(pos), note: "insertAfter" };
    }

    if (patch.action === "insertBefore") {
      if (!find) return { ok: false, out: src, note: "insertBefore precisa de find" };
      const i = src.indexOf(find);
      if (i < 0) return { ok: false, out: src, note: "find não encontrado" };
      return { ok: true, out: src.slice(0, i) + content + src.slice(i), note: "insertBefore" };
    }

    return { ok: false, out: src, note: "ação desconhecida" };
  }

  function applyPatches(patches) {
    const { apps, app } = getActiveApp();
    if (!app) return { ok: false, msg: "Nenhum app ativo." };

    ensureAppMeta(app);
    app.files = app.files || {};
    const results = [];

    (patches || []).forEach((p) => {
      const file = p.file;
      if (!file) {
        results.push({ ok: false, file: "(sem file)", note: "Patch sem file" });
        return;
      }
      const prev = String(app.files[file] ?? "");
      const r = applyPatchToText(prev, p);
      if (r.ok) {
        app.files[file] = r.out;
        results.push({ ok: true, file, note: r.note });
      } else {
        results.push({ ok: false, file, note: r.note });
      }
    });

    pushHistory(app, { kind: "patches", patchesCount: (patches || []).length, results });

    // salva de volta
    const idx = apps.findIndex(a => a && a.id === app.id);
    if (idx >= 0) apps[idx] = app;
    saveApps(apps);

    return { ok: true, msg: "Patches aplicados.", results };
  }

  // --------- Planejamento (sem IA online) ----------
  function makePlanFromIntent(text, app) {
    const t = String(text || "").toLowerCase();
    const plan = { goal: "", modules: [], entities: [], patches: [] };

    // goal
    plan.goal = app?.meta?.goal || "";
    if (!plan.goal) {
      if (t.includes("quota") || t.includes("quotas")) plan.goal = "Controle de quotas e regras de cálculo.";
      else if (t.includes("agro") || t.includes("leite")) plan.goal = "Gestão agropecuária (produção, vacas, produtores).";
      else plan.goal = "App de gestão.";
    }

    // modules
    const addM = (m) => { if (!plan.modules.includes(m)) plan.modules.push(m); };
    addM("dashboard");
    if (t.includes("cadastro") || t.includes("produtor") || t.includes("clientes")) addM("cadastros");
    if (t.includes("relat") || t.includes("relatório")) addM("relatorios");
    if (t.includes("quota") || t.includes("regra")) addM("regras");
    if (t.includes("config") || t.includes("settings")) addM("config");

    // entities
    const addE = (e) => { if (!plan.entities.includes(e)) plan.entities.push(e); };
    if (t.includes("vaca")) addE("vacas");
    if (t.includes("produtor")) addE("produtores");
    if (t.includes("quota")) addE("quotas");
    if (t.includes("leite")) addE("leite");

    // patches iniciais (bem leves)
    plan.patches.push({
      type: "patch",
      action: "append",
      file: "app.js",
      content:
`\n\n// --- RCF v2 hint ---\n// Objetivo: ${plan.goal}\n// Módulos: ${plan.modules.join(", ")}\n// Entidades: ${plan.entities.join(", ")}\n`
    });

    return plan;
  }

  function ensureFactoryLayoutFixesPlan() {
    // Aqui você pode adicionar patches de auto-repair do Factory (não do app gerado)
    // Por enquanto, vazio. (A gente liga depois.)
    return [];
  }

  // --------- Comandos ----------
  function helpText(prefs) {
    return [
      "RCF Engine v2 — comandos:",
      "- help",
      "- status",
      "- list",
      "- select <id>",
      "- create app <nome>",
      "- define goal <texto>",
      "- add module <nome>",
      "- add entity <nome>",
      "- plan <texto>          (gera plano + patches)",
      "- apply                 (aplica últimos patches)",
      `- auto on|off            (AUTO APPLY: ${prefs.autoApply ? "ON" : "OFF"})`,
      "- history               (últimas ações)",
      "",
      "✅ DICA: você pode COLAR CÓDIGO direto aqui:",
      "- Se colar um HTML completo → vai para index.html",
      "- Se colar um SW → vai para sw.js",
      "- Se colar CSS → vai para styles.css",
      "- Se colar JS → vai para app.js",
    ].join("\n");
  }

  function statusText() {
    const apps = loadApps();
    const active = getActiveId();
    const activeApp = apps.find(a => a && a.id === active) || null;
    return [
      "Engine v2 ativa ✅",
      `Apps: ${apps.length}`,
      activeApp ? `App atual: ${activeApp.name} (${activeApp.id})` : "App atual: (nenhum)",
      activeApp?.meta?.goal ? `Goal: ${activeApp.meta.goal}` : "Goal: (não definido)",
    ].join("\n");
  }

  function listText() {
    const apps = loadApps();
    if (!apps.length) return "Nenhum app salvo ainda.";
    return ["Apps salvos:"].concat(apps.map(a => `- ${a.name} (${a.id})`)).join("\n");
  }

  function historyText() {
    const { app } = getActiveApp();
    if (!app) return "Sem app ativo.";
    const h = Array.isArray(app.history) ? app.history.slice(-10) : [];
    if (!h.length) return "Sem histórico ainda.";
    return h.map(x => `${x.at} • ${x.kind} • patches:${x.patchesCount || 0}`).join("\n");
  }

  // Exposto para router/admin usar
  function createApp(name, templates) {
    const apps = loadApps();
    const id = nowId(name);
    const nm = String(name || "Novo App").trim() || "Novo App";

    const files = (templates && templates.makeBasicPwaFiles)
      ? templates.makeBasicPwaFiles(nm, id)
      : (templates && templates.makePwaBaseTemplateFiles)
        ? templates.makePwaBaseTemplateFiles(nm, id)
        : { "index.html": "<h1>"+nm+"</h1>", "app.js":"", "styles.css":"", "manifest.json":"{}", "sw.js":"" };

    const app = {
      id,
      name: nm,
      type: "pwa",
      templateId: "pwa-base",
      createdAt: Date.now(),
      files,
      baseFiles: { ...files },
      meta: { goal: "", audience: "", modules: [], entities: [], status: "draft" },
      history: []
    };

    apps.unshift(app);
    saveApps(apps);
    setActiveId(id);
    return app;
  }

  function selectApp(id) {
    const apps = loadApps();
    const ok = apps.some(a => a && a.id === id);
    if (!ok) return { ok: false, msg: `App não encontrado: ${id}` };
    setActiveId(id);
    return { ok: true, msg: `App ativo: ${id}` };
  }
