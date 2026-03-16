/* FILE: /app/js/core/ui_runtime.js
   RControl Factory — UI Runtime helpers (safe extraction)
   v1.1 SAFE BRIDGE / PATCH MÍNIMO

   Objetivo:
   - helpers visuais/render leves
   - sem núcleo crítico de boot/agent/injector
   - compatível com app.js atual
   - fallback seguro quando deps vierem incompletos
*/
(() => {
  "use strict";

  const API = {
    __deps: null,

    init(deps) {
      this.__deps = deps || this.__deps || {};
      return this;
    },

    get d() {
      return this.__deps || {};
    },

    getState() {
      try {
        if (this.d.State) return this.d.State;
        if (window.RCF && window.RCF.state) return window.RCF.state;
      } catch {}
      return { apps: [], active: {}, cfg: {} };
    },

    saveAll(reason) {
      const d = this.d;
      try {
        if (typeof d.saveAll === "function") return d.saveAll(reason || "ui_runtime");
      } catch {}

      try {
        const State = this.getState();
        localStorage.setItem("rcf:cfg", JSON.stringify(State.cfg || {}));
        localStorage.setItem("rcf:apps", JSON.stringify(State.apps || []));
        localStorage.setItem("rcf:active", JSON.stringify(State.active || {}));
      } catch {}
      return true;
    },

    setView(name, opts) {
      const d = this.d;
      try {
        if (typeof d.setView === "function") return d.setView(name, opts || {});
      } catch {}
      try {
        if (window.RCF && typeof window.RCF.setView === "function") return window.RCF.setView(name, opts || {});
      } catch {}
      return false;
    },

    $(sel, root) {
      const d = this.d;
      try {
        if (typeof d.$ === "function") return d.$(sel, root);
        return (root || document).querySelector(sel);
      } catch {
        return null;
      }
    },

    $$(sel, root) {
      const d = this.d;
      try {
        if (typeof d.$$ === "function") return d.$$(sel, root);
        return Array.from((root || document).querySelectorAll(sel));
      } catch {
        return [];
      }
    },

    getActiveApp() {
      const d = this.d;
      const State = this.getState();

      try {
        if (typeof d.getActiveApp === "function") return d.getActiveApp();
      } catch {}

      try {
        if (d.helpers && typeof d.helpers.getActiveApp === "function") {
          return d.helpers.getActiveApp();
        }
      } catch {}

      try {
        const slug = State?.active?.appSlug || null;
        if (!slug) return null;
        const apps = Array.isArray(State?.apps) ? State.apps : [];
        return apps.find(a => a.slug === slug) || null;
      } catch {}

      return null;
    },

    ensureAppFiles(app) {
      const d = this.d;
      try {
        if (typeof d.ensureAppFiles === "function") return d.ensureAppFiles(app);
      } catch {}

      try {
        if (d.helpers && typeof d.helpers.ensureAppFiles === "function") {
          return d.helpers.ensureAppFiles(app);
        }
      } catch {}

      try {
        if (app && (!app.files || typeof app.files !== "object")) app.files = {};
      } catch {}
    },

    deleteApp(slug) {
      const d = this.d;
      const State = this.getState();
      const safeSlug = String(slug || "").trim();
      if (!safeSlug) return false;

      try {
        if (typeof d.deleteApp === "function") return d.deleteApp(safeSlug);
      } catch {}

      try {
        if (d.helpers && typeof d.helpers.deleteApp === "function") {
          return d.helpers.deleteApp(safeSlug);
        }
      } catch {}

      const app = Array.isArray(State.apps) ? State.apps.find(a => a.slug === safeSlug) : null;
      if (!app) return false;

      if (!confirm(`Apagar o app "${app.name}" (${app.slug})?\n\nIsso não tem volta.`)) {
        return false;
      }

      try {
        State.apps = (State.apps || []).filter(a => a.slug !== safeSlug);

        if (State.active && State.active.appSlug === safeSlug) {
          State.active.appSlug = null;
          State.active.file = null;
        }

        this.saveAll("ui_runtime.deleteApp");
        this.renderAppsList();
        this.renderFilesList();

        const text = this.$("#activeAppText");
        if (text) {
          if (typeof d.textContentSafe === "function") d.textContentSafe(text, "Sem app ativo ✅");
          else text.textContent = "Sem app ativo ✅";
        }

        d.uiMsg?.("#editorOut", "✅ App apagado.");
        d.Logger?.write?.("app deleted:", safeSlug);
        this.refreshDashboardUI();
        return true;
      } catch {}

      return false;
    },

    openTools(open) {
      const el = this.$("#toolsDrawer");
      if (!el) return;

      try {
        if (open) {
          el.classList.add("open");
          el.hidden = false;
          el.style.display = "";
        } else {
          el.classList.remove("open");
          el.hidden = true;
          el.style.display = "none";
        }
      } catch {}
    },

    openFabPanel(open) {
      const el = this.$("#rcfFabPanel");
      if (!el) return;

      try {
        if (open) {
          el.classList.add("open");
          el.hidden = false;
          el.style.display = "";
        } else {
          el.classList.remove("open");
          el.hidden = true;
          el.style.display = "none";
        }
      } catch {}
    },

    toggleFabPanel() {
      const el = this.$("#rcfFabPanel");
      if (!el) return;

      try {
        const isOpen = el.classList.contains("open") || !el.hidden;
        this.openFabPanel(!isOpen);
      } catch {}
    },

    syncFabStatusText() {
      try {
        const st = this.$("#statusText")?.textContent || "";
        const fab = this.$("#fabStatus");
        if (fab) fab.textContent = String(st || "OK ✅");
      } catch {}
    },

    setInjectorLogCollapsed(collapsed) {
      try {
        const pre = this.$("#injLog");
        const btn = this.$("#btnToggleInjectorLog");
        if (!pre || !btn) return;

        const wantCollapsed = !!collapsed;
        if (wantCollapsed) pre.classList.add("rcf-collapsed");
        else pre.classList.remove("rcf-collapsed");

        btn.textContent = wantCollapsed ? "Mostrar log" : "Esconder log";
      } catch {}
    },

    toggleInjectorLogCollapsed() {
      try {
        const pre = this.$("#injLog");
        if (!pre) return;
        const isCollapsed = pre.classList.contains("rcf-collapsed");
        this.setInjectorLogCollapsed(!isCollapsed);
      } catch {}
    },

    refreshDashboardUI() {
      const d = this.d;

      try {
        const State = this.getState();
        const Logger = d.Logger;
        const activeApp = this.getActiveApp();
        const appsCount = Array.isArray(State?.apps) ? State.apps.length : 0;
        const aiOnline = !!(window.RCF_ENGINE || window.RCF_AGENT_ZIP_BRIDGE || window.RCF_AI || window.RCF_FACTORY_AI);

        const elApps = this.$("#dashAppsCount");
        if (elApps) elApps.textContent = String(appsCount).padStart(2, "0");

        const elProjects = this.$("#dashProjectsCount");
        if (elProjects) elProjects.textContent = String(appsCount).padStart(2, "0");

        const elBuilds = this.$("#dashBuildsCount");
        if (elBuilds) elBuilds.textContent = String(appsCount).padStart(2, "0");

        const elAi = this.$("#dashAiStatus");
        if (elAi) elAi.textContent = aiOnline ? "ON" : "--";

        const aiBadge = this.$("#dashAiBadge");
        if (aiBadge) aiBadge.textContent = aiOnline ? "IA online ✅" : "IA aguardando…";

        const sideStatus = this.$("#rcfSidebarStatus");
        if (sideStatus) sideStatus.textContent = activeApp ? `Ativo: ${activeApp.slug}` : "Factory pronta ✅";

        const box = this.$("#dashActivityList");
        if (box) {
          const logs = Logger?.getAll ? Logger.getAll() : [];
          const recent = Array.isArray(logs) ? logs.slice(-4).reverse() : [];
          const esc = d.escapeHtml || ((v) => String(v));

          if (!recent.length) {
            box.innerHTML = `<div class="hint">Aguardando atividade...</div>`;
          } else {
            box.innerHTML = recent.map(line => `<div class="rcfActivityItem">${esc(String(line))}</div>`).join("");
          }
        }
      } catch {}
    },

    renderAppsList() {
      const d = this.d;
      const State = this.getState();
      const box = this.$("#appsList");
      if (!box) return;

      this.refreshDashboardUI();

      if (!Array.isArray(State.apps) || !State.apps.length) {
        box.innerHTML = `<div class="hint">Nenhum app salvo ainda.</div>`;
        this.refreshDashboardUI();
        return;
      }

      const escHtml = d.escapeHtml || ((v) => String(v));
      const escAttr = d.escapeAttr || ((v) => String(v).replace(/"/g, "&quot;"));

      box.innerHTML = "";
      State.apps.forEach(app => {
        const row = document.createElement("div");
        row.className = "app-item";
        row.innerHTML = `
          <div class="app-meta">
            <div class="app-name" style="font-weight:800">${escHtml(app.name)}</div>
            <div class="app-slug hint">${escHtml(app.slug)}</div>
          </div>
          <div class="app-actions">
            <button class="btn small" data-act="select" data-slug="${escAttr(app.slug)}" type="button">Selecionar</button>
            <button class="btn small" data-act="edit" data-slug="${escAttr(app.slug)}" type="button">Editor</button>
            <button class="btn small danger" data-act="delete" data-slug="${escAttr(app.slug)}" type="button">Apagar</button>
          </div>
        `;
        box.appendChild(row);
      });

      this.$$('[data-act="select"]', box).forEach(btn => {
        const fn = () => this.setActiveApp(btn.getAttribute("data-slug"));
        d.bindTap ? d.bindTap(btn, fn) : btn.addEventListener("click", fn);
      });

      this.$$('[data-act="edit"]', box).forEach(btn => {
        const fn = () => {
          this.setActiveApp(btn.getAttribute("data-slug"));
          this.setView("editor");
        };
        d.bindTap ? d.bindTap(btn, fn) : btn.addEventListener("click", fn);
      });

      this.$$('[data-act="delete"]', box).forEach(btn => {
        const fn = () => this.deleteApp(btn.getAttribute("data-slug"));
        d.bindTap ? d.bindTap(btn, fn) : btn.addEventListener("click", fn);
      });
    },

    renderFilesList() {
      const d = this.d;
      const State = this.getState();
      const box = this.$("#filesList");
      if (!box) return;

      const app = this.getActiveApp();
      if (!app) {
        box.innerHTML = `<div class="hint">Selecione um app para ver arquivos.</div>`;
        return;
      }

      this.ensureAppFiles(app);
      const files = Object.keys(app.files || {});
      if (!files.length) {
        box.innerHTML = `<div class="hint">App sem arquivos.</div>`;
        return;
      }

      box.innerHTML = "";
      files.forEach(fname => {
        const item = document.createElement("div");
        item.className = "file-item" + ((State?.active?.file === fname) ? " active" : "");
        item.textContent = fname;

        if (d.bindTap) d.bindTap(item, () => this.openFile(fname));
        else item.addEventListener("click", () => this.openFile(fname));

        box.appendChild(item);
      });
    },

    openFile(fname) {
      const d = this.d;
      const State = this.getState();
      const app = this.getActiveApp();
      if (!app) return false;

      this.ensureAppFiles(app);
      if (!(fname in (app.files || {}))) return false;

      if (State.active) State.active.file = fname;
      this.saveAll("ui_runtime.openFile");

      const head = this.$("#editorHead");
      if (head) head.textContent = `Arquivo atual: ${fname}`;

      const ta = this.$("#fileContent");
      if (ta) ta.value = String(app.files[fname] ?? "");

      this.renderFilesList();
      return true;
    },

    setActiveApp(slug) {
      const d = this.d;
      const State = this.getState();
      const app = Array.isArray(State.apps) ? State.apps.find(a => a.slug === slug) : null;
      if (!app) return false;

      this.ensureAppFiles(app);

      if (State.active) {
        State.active.appSlug = slug;
        State.active.file = State.active.file || Object.keys(app.files || {})[0] || null;
      }

      this.saveAll("ui_runtime.setActiveApp");

      const text = this.$("#activeAppText");
      if (text) {
        if (typeof d.textContentSafe === "function") d.textContentSafe(text, `App ativo: ${app.name} (${app.slug}) ✅`);
        else text.textContent = `App ativo: ${app.name} (${app.slug}) ✅`;
      }

      this.renderAppsList();
      this.renderFilesList();

      if (State.active?.file) this.openFile(State.active.file);

      d.Logger?.write?.("app selected:", slug);
      this.refreshDashboardUI();
      return true;
    },

    createApp(name, slugMaybe) {
      const d = this.d;
      const State = this.getState();

      const nameClean = String(name || "").trim();
      if (!nameClean) return { ok: false, msg: "Nome inválido" };

      const slugify = d.slugify || ((v) => String(v || "").toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, ""));
      const nowISO = d.nowISO || (() => new Date().toISOString());

      let slug = slugify(slugMaybe || nameClean);

      if (!slug) return { ok: false, msg: "Slug inválido" };
      if (Array.isArray(State.apps) && State.apps.some(a => a.slug === slug)) {
        return { ok: false, msg: "Slug já existe" };
      }

      const app = {
        name: nameClean,
        slug,
        createdAt: nowISO(),
        files: {
          "index.html": `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${nameClean}</title></head><body><h1>${nameClean}</h1><script src="app.js"><\/script></body></html>`,
          "styles.css": `body{font-family:system-ui;margin:0;padding:24px;background:#0b1220;color:#fff}`,
          "app.js": `console.log("${nameClean}");`
        }
      };

      if (!Array.isArray(State.apps)) State.apps = [];
      State.apps.push(app);

      this.saveAll("ui_runtime.createApp");
      this.renderAppsList();
      this.setActiveApp(slug);
      this.refreshDashboardUI();

      return { ok: true, msg: `✅ App criado: ${nameClean} (${slug})` };
    },

    saveFile() {
      const d = this.d;
      const State = this.getState();
      const app = this.getActiveApp();

      if (!app) return d.uiMsg?.("#editorOut", "⚠️ Sem app ativo.");

      const fname = State?.active?.file;
      if (!fname) return d.uiMsg?.("#editorOut", "⚠️ Sem arquivo ativo.");

      const ta = this.$("#fileContent");
      this.ensureAppFiles(app);
      app.files[fname] = ta ? String(ta.value || "") : "";

      this.saveAll("ui_runtime.saveFile");
      d.uiMsg?.("#editorOut", "✅ Arquivo salvo.");
      d.Logger?.write?.("file saved:", app.slug, fname);
    }
  };

  try { window.RCF_UI_RUNTIME = API; } catch {}
})();
