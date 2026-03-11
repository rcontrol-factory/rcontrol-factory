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
    openTools(open) {
      const d = this.d;
      const el = d.$ ? d.$("#toolsDrawer") : null;
      if (!el) return;
      if (open) el.classList.add("open");
      else el.classList.remove("open");
    },
    openFabPanel(open) {
      const d = this.d;
      const el = d.$ ? d.$("#rcfFabPanel") : null;
      if (!el) return;
      if (open) el.classList.add("open");
      else el.classList.remove("open");
    },
    toggleFabPanel() {
      const d = this.d;
      const el = d.$ ? d.$("#rcfFabPanel") : null;
      if (!el) return;
      el.classList.toggle("open");
    },
    syncFabStatusText() {
      const d = this.d;
      try {
        const st = d.$("#statusText")?.textContent || "";
        const fab = d.$("#fabStatus");
        if (fab) fab.textContent = String(st || "OK ✅");
      } catch {}
    },
    setInjectorLogCollapsed(collapsed) {
      const d = this.d;
      try {
        const pre = d.$("#injLog");
        const btn = d.$("#btnToggleInjectorLog");
        if (!pre || !btn) return;
        const wantCollapsed = !!collapsed;
        if (wantCollapsed) pre.classList.add("rcf-collapsed");
        else pre.classList.remove("rcf-collapsed");
        btn.textContent = wantCollapsed ? "Mostrar log" : "Esconder log";
      } catch {}
    },
    toggleInjectorLogCollapsed() {
      const d = this.d;
      try {
        const pre = d.$("#injLog");
        if (!pre) return;
        const isCollapsed = pre.classList.contains("rcf-collapsed");
        this.setInjectorLogCollapsed(!isCollapsed);
      } catch {}
    },
    refreshDashboardUI() {
      const d = this.d;
      try {
        const State = d.State;
        const Logger = d.Logger;
        const activeApp = d.helpers?.getActiveApp?.() || null;
        const appsCount = Array.isArray(State?.apps) ? State.apps.length : 0;
        const aiOnline = !!(window.RCF_ENGINE || window.RCF_AGENT_ZIP_BRIDGE || window.RCF_AI);

        const elApps = d.$("#dashAppsCount");
        if (elApps) elApps.textContent = String(appsCount).padStart(2, "0");

        const elProjects = d.$("#dashProjectsCount");
        if (elProjects) elProjects.textContent = String(appsCount).padStart(2, "0");

        const elBuilds = d.$("#dashBuildsCount");
        if (elBuilds) elBuilds.textContent = String(appsCount).padStart(2, "0");

        const elAi = d.$("#dashAiStatus");
        if (elAi) elAi.textContent = aiOnline ? "ON" : "--";

        const aiBadge = d.$("#dashAiBadge");
        if (aiBadge) aiBadge.textContent = aiOnline ? "IA online ✅" : "IA aguardando…";

        const sideStatus = d.$("#rcfSidebarStatus");
        if (sideStatus) sideStatus.textContent = activeApp ? `Ativo: ${activeApp.slug}` : "Factory pronta ✅";

        const box = d.$("#dashActivityList");
        if (box) {
          const logs = Logger?.getAll ? Logger.getAll() : [];
          const recent = logs.slice(-4).reverse();
          if (!recent.length) {
            box.innerHTML = `<div class="hint">Aguardando atividade...</div>`;
          } else {
            box.innerHTML = recent.map(line => `<div class="rcfActivityItem">${d.escapeHtml(String(line))}</div>`).join("");
          }
        }
      } catch {}
    },
    renderAppsList() {
      const d = this.d;
      const State = d.State;
      const box = d.$("#appsList");
      if (!box) return;

      this.refreshDashboardUI();
      if (!State.apps.length) {
        box.innerHTML = `<div class="hint">Nenhum app salvo ainda.</div>`;
        this.refreshDashboardUI();
        return;
      }

      box.innerHTML = "";
      State.apps.forEach(app => {
        const row = document.createElement("div");
        row.className = "app-item";
        row.innerHTML = `
          <div class="app-meta">
            <div class="app-name" style="font-weight:800">${d.escapeHtml(app.name)}</div>
            <div class="app-slug hint">${d.escapeHtml(app.slug)}</div>
          </div>
          <div class="app-actions">
            <button class="btn small" data-act="select" data-slug="${d.escapeAttr(app.slug)}" type="button">Selecionar</button>
            <button class="btn small" data-act="edit" data-slug="${d.escapeAttr(app.slug)}" type="button">Editor</button>
            <button class="btn small danger" data-act="delete" data-slug="${d.escapeAttr(app.slug)}" type="button">Apagar</button>
          </div>
        `;
        box.appendChild(row);
      });

      d.$$('[data-act="select"]', box).forEach(btn => d.bindTap(btn, () => this.setActiveApp(btn.getAttribute("data-slug"))));
      d.$$('[data-act="edit"]', box).forEach(btn => d.bindTap(btn, () => {
        this.setActiveApp(btn.getAttribute("data-slug"));
        window.RCF?.setView?.("editor");
      }));
      d.$$('[data-act="delete"]', box).forEach(btn => d.bindTap(btn, () => {
        const slug = btn.getAttribute("data-slug");
        d.helpers?.deleteApp?.(slug);
      }));
    },
    renderFilesList() {
      const d = this.d;
      const box = d.$("#filesList");
      if (!box) return;

      const app = d.helpers?.getActiveApp?.();
      if (!app) {
        box.innerHTML = `<div class="hint">Selecione um app para ver arquivos.</div>`;
        return;
      }

      d.helpers?.ensureAppFiles?.(app);
      const files = Object.keys(app.files);
      if (!files.length) {
        box.innerHTML = `<div class="hint">App sem arquivos.</div>`;
        return;
      }

      box.innerHTML = "";
      files.forEach(fname => {
        const item = document.createElement("div");
        item.className = "file-item" + (d.State.active.file === fname ? " active" : "");
        item.textContent = fname;
        d.bindTap(item, () => this.openFile(fname));
        box.appendChild(item);
      });
    },
    openFile(fname) {
      const d = this.d;
      const app = d.helpers?.getActiveApp?.();
      if (!app) return false;

      d.helpers?.ensureAppFiles?.(app);
      if (!(fname in app.files)) return false;

      d.State.active.file = fname;
      d.saveAll?.();

      const head = d.$("#editorHead");
      if (head) head.textContent = `Arquivo atual: ${fname}`;

      const ta = d.$("#fileContent");
      if (ta) ta.value = String(app.files[fname] ?? "");

      this.renderFilesList();
      return true;
    },
    setActiveApp(slug) {
      const d = this.d;
      const app = d.State.apps.find(a => a.slug === slug);
      if (!app) return false;

      d.helpers?.ensureAppFiles?.(app);
      d.State.active.appSlug = slug;
      d.State.active.file = d.State.active.file || Object.keys(app.files || {})[0] || null;
      d.saveAll?.();

      const text = d.$("#activeAppText");
      if (text) d.textContentSafe(text, `App ativo: ${app.name} (${app.slug}) ✅`);

      this.renderAppsList();
      this.renderFilesList();
      if (d.State.active.file) this.openFile(d.State.active.file);

      d.Logger?.write?.("app selected:", slug);
      return true;
    },
    createApp(name, slugMaybe) {
      const d = this.d;
      const State = d.State;
      const nameClean = String(name || "").trim();
      if (!nameClean) return { ok: false, msg: "Nome inválido" };

      let slug = d.slugify(slugMaybe || nameClean);
      if (!slug) return { ok: false, msg: "Slug inválido" };
      if (State.apps.some(a => a.slug === slug)) return { ok: false, msg: "Slug já existe" };

      const app = {
        name: nameClean,
        slug,
        createdAt: d.nowISO(),
        files: {
          "index.html": `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${nameClean}</title></head><body><h1>${nameClean}</h1><script src="app.js"></script></body></html>`,
          "styles.css": `body{font-family:system-ui;margin:0;padding:24px;background:#0b1220;color:#fff}`,
          "app.js": `console.log("${nameClean}");`
        }
      };

      State.apps.push(app);
      d.saveAll?.();
      this.renderAppsList();
      this.setActiveApp(slug);
      return { ok: true, msg: `✅ App criado: ${nameClean} (${slug})` };
    },
    saveFile() {
      const d = this.d;
      const app = d.helpers?.getActiveApp?.();
      if (!app) return d.uiMsg("#editorOut", "⚠️ Sem app ativo.");

      const fname = d.State.active.file;
      if (!fname) return d.uiMsg("#editorOut", "⚠️ Sem arquivo ativo.");

      const ta = d.$("#fileContent");
      d.helpers?.ensureAppFiles?.(app);
      app.files[fname] = ta ? String(ta.value || "") : "";

      d.saveAll?.();
      d.uiMsg("#editorOut", "✅ Arquivo salvo.");
      d.Logger?.write?.("file saved:", app.slug, fname);
    }
  };

  try { window.RCF_UI_RUNTIME = API; } catch {}
})();
