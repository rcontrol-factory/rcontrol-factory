/* FILE: app/js/core/ui_runtime.js
   RControl Factory — UI Runtime helpers (safe extraction)
   - Patch mínimo
   - Somente helpers visuais/render leves
   - Sem núcleo crítico de boot/agent/injector
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

    $(sel, root) {
      const d = this.d;
      try {
        if (d.$) return d.$(sel, root);
        return (root || document).querySelector(sel);
      } catch {
        return null;
      }
    },

    $$(sel, root) {
      const d = this.d;
      try {
        if (d.$$) return d.$$(sel, root);
        return Array.from((root || document).querySelectorAll(sel));
      } catch {
        return [];
      }
    },

    openTools(open) {
      const el = this.$("#toolsDrawer");
      if (!el) return;
      if (open) el.classList.add("open");
      else el.classList.remove("open");
    },

    openFabPanel(open) {
      const el = this.$("#rcfFabPanel");
      if (!el) return;
      if (open) el.classList.add("open");
      else el.classList.remove("open");
    },

    toggleFabPanel() {
      const el = this.$("#rcfFabPanel");
      if (!el) return;
      el.classList.toggle("open");
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
        const State = d.State || { apps: [] };
        const Logger = d.Logger;
        const activeApp = d.helpers?.getActiveApp?.() || null;
        const appsCount = Array.isArray(State?.apps) ? State.apps.length : 0;
        const aiOnline = !!(window.RCF_ENGINE || window.RCF_AGENT_ZIP_BRIDGE || window.RCF_AI);

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
          if (!recent.length) {
            box.innerHTML = `<div class="hint">Aguardando atividade...</div>`;
          } else {
            const esc = d.escapeHtml || ((v) => String(v));
            box.innerHTML = recent.map(line => `<div class="rcfActivityItem">${esc(String(line))}</div>`).join("");
          }
        }
      } catch {}
    },

    renderAppsList() {
      const d = this.d;
      const State = d.State || { apps: [], active: {} };
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
        d.bindTap ? d.bindTap(btn, () => this.setActiveApp(btn.getAttribute("data-slug"))) :
        btn.addEventListener("click", () => this.setActiveApp(btn.getAttribute("data-slug")));
      });

      this.$$('[data-act="edit"]', box).forEach(btn => {
        const fn = () => {
          this.setActiveApp(btn.getAttribute("data-slug"));
          window.RCF?.setView?.("editor");
        };
        d.bindTap ? d.bindTap(btn, fn) : btn.addEventListener("click", fn);
      });

      this.$$('[data-act="delete"]', box).forEach(btn => {
        const fn = () => {
          const slug = btn.getAttribute("data-slug");
          d.helpers?.deleteApp?.(slug);
        };
        d.bindTap ? d.bindTap(btn, fn) : btn.addEventListener("click", fn);
      });
    },

    renderFilesList() {
      const d = this.d;
      const box = this.$("#filesList");
      if (!box) return;

      const app = d.helpers?.getActiveApp?.();
      if (!app) {
        box.innerHTML = `<div class="hint">Selecione um app para ver arquivos.</div>`;
        return;
      }

      d.helpers?.ensureAppFiles?.(app);
      const files = Object.keys(app.files || {});
      if (!files.length) {
        box.innerHTML = `<div class="hint">App sem arquivos.</div>`;
        return;
      }

      box.innerHTML = "";
      files.forEach(fname => {
        const item = document.createElement("div");
        item.className = "file-item" + ((d.State?.active?.file === fname) ? " active" : "");
        item.textContent = fname;

        if (d.bindTap) d.bindTap(item, () => this.openFile(fname));
        else item.addEventListener("click", () => this.openFile(fname));

        box.appendChild(item);
      });
    },

    openFile(fname) {
      const d = this.d;
      const app = d.helpers?.getActiveApp?.();
      if (!app) return false;

      d.helpers?.ensureAppFiles?.(app);
      if (!(fname in (app.files || {}))) return false;

      if (d.State?.active) d.State.active.file = fname;
      d.saveAll?.();

      const head = this.$("#editorHead");
      if (head) head.textContent = `Arquivo atual: ${fname}`;

      const ta = this.$("#fileContent");
      if (ta) ta.value = String(app.files[fname] ?? "");

      this.renderFilesList();
      return true;
    },

    setActiveApp(slug) {
      const d = this.d;
      const State = d.State || { apps: [], active: {} };
      const app = Array.isArray(State.apps) ? State.apps.find(a => a.slug === slug) : null;
      if (!app) return false;

      d.helpers?.ensureAppFiles?.(app);

      if (State.active) {
        State.active.appSlug = slug;
        State.active.file = State.active.file || Object.keys(app.files || {})[0] || null;
      }

      d.saveAll?.();

      const text = this.$("#activeAppText");
      if (text) {
        if (d.textContentSafe) d.textContentSafe(text, `App ativo: ${app.name} (${app.slug}) ✅`);
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
      const State = d.State || (d.State = { apps: [], active: {} });

      const nameClean = String(name || "").trim();
      if (!nameClean) return { ok: false, msg: "Nome inválido" };

      const slugify = d.slugify || ((v) => String(v || "").toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, ""));
      let slug = slugify(slugMaybe || nameClean);

      if (!slug) return { ok: false, msg: "Slug inválido" };
      if (Array.isArray(State.apps) && State.apps.some(a => a.slug === slug)) {
        return { ok: false, msg: "Slug já existe" };
      }

      const nowISO = d.nowISO || (() => new Date().toISOString());

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

      d.saveAll?.();
      this.renderAppsList();
      this.setActiveApp(slug);
      this.refreshDashboardUI();

      return { ok: true, msg: `✅ App criado: ${nameClean} (${slug})` };
    },

    saveFile() {
      const d = this.d;
      const app = d.helpers?.getActiveApp?.();
      if (!app) return d.uiMsg?.("#editorOut", "⚠️ Sem app ativo.");

      const fname = d.State?.active?.file;
      if (!fname) return d.uiMsg?.("#editorOut", "⚠️ Sem arquivo ativo.");

      const ta = this.$("#fileContent");
      d.helpers?.ensureAppFiles?.(app);
      app.files[fname] = ta ? String(ta.value || "") : "";

      d.saveAll?.();
      d.uiMsg?.("#editorOut", "✅ Arquivo salvo.");
      d.Logger?.write?.("file saved:", app.slug, fname);
    }
  };

  try { window.RCF_UI_RUNTIME = API; } catch {}
})();
