/* RCF — engine.js (v1.0)
   API pública da Factory pra criar apps automaticamente.
   - Não mexe no visual.
   - Usa o State.apps do app.js se existir.
*/
(() => {
  "use strict";

  const Engine = {
    version: "1.0",
    _ctx: null,

    init(ctx) {
      // ctx vem do app.js: { State, Storage, Logger }
      this._ctx = ctx || null;
      try { ctx?.Logger?.write?.("ENGINE:", "ready ✅ v" + this.version); } catch {}
      return true;
    },

    createSpec({ name, slug, template, modules }) {
      const sname = String(name || "").trim();
      if (!sname) return { ok:false, err:"Nome inválido" };

      const sslug = (slug && String(slug).trim()) || (window.RCF_BUILDER?.slugify?.(sname) || "");
      if (!sslug) return { ok:false, err:"Slug inválido" };

      return {
        ok: true,
        spec: {
          name: sname,
          slug: sslug,
          template: template || "pwa-base",
          modules: Array.isArray(modules) ? modules : []
        }
      };
    },

    createAppFromSpec(spec) {
      const ctx = this._ctx;
      if (!ctx || !ctx.State) return { ok:false, err:"Engine não inicializada (ctx)" };

      const State = ctx.State;
      const Logger = ctx.Logger;

      if (State.apps.some(a => a.slug === spec.slug)) {
        return { ok:false, err:"Slug já existe: " + spec.slug };
      }

      const files = window.RCF_BUILDER.buildAppFiles(spec);

      const app = {
        name: spec.name,
        slug: spec.slug,
        createdAt: new Date().toISOString(),
        files
      };

      State.apps.push(app);
      try { ctx.Storage?.set?.("apps", State.apps); } catch {}
      try { Logger?.write?.("ENGINE:", "app created ✅", spec.slug, "modules=" + (spec.modules||[]).join(",")); } catch {}

      return { ok:true, app };
    }
  };

  window.RCF_ENGINE = Engine;
})();
