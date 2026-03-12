/* FILE: app/js/ui/ui_mount.js
   RControl Factory — UI Mount (safe extraction)
   - Patch mínimo
   - Responsável por montar a shell visual via ui_shell
   - Não executa boot crítico
   - Não substitui núcleo do app.js
*/
(() => {
  "use strict";

  const API = {
    __deps: null,
    __mounted: false,

    init(deps) {
      this.__deps = deps || this.__deps || {};
      return this;
    },

    get d() {
      return this.__deps || {};
    },

    getShell() {
      try {
        return (window && window.RCF_UI_SHELL && typeof window.RCF_UI_SHELL === "object")
          ? window.RCF_UI_SHELL
          : null;
      } catch {
        return null;
      }
    },

    ensureRoot() {
      const d = this.d;
      try {
        let root = d.$ ? d.$("#app") : document.querySelector("#app");
        if (root) return root;

        root = document.createElement("div");
        root.id = "app";
        (document.body || document.documentElement).appendChild(root);
        try { d.Logger?.write?.("ui_mount:", "created #app root fallback ✅"); } catch {}
        return root;
      } catch {
        return null;
      }
    },

    mount(opts = {}) {
      if (this.__mounted && !opts.force) return { ok: true, reused: true };

      const d = this.d;
      const root = this.ensureRoot();
      if (!root) return { ok: false, err: "#app root ausente" };

      const shell = this.getShell();
      if (!shell || typeof shell.mount !== "function") {
        try { d.Logger?.write?.("ui_mount:", "RCF_UI_SHELL.mount ausente"); } catch {}
        return { ok: false, err: "RCF_UI_SHELL.mount ausente" };
      }

      try {
        const result = shell.mount({
          root,
          deps: d,
          force: !!opts.force
        });

        this.__mounted = true;
        try { d.Logger?.write?.("ui_mount:", "mounted ✅"); } catch {}
        return { ok: true, result };
      } catch (e) {
        try { d.Logger?.write?.("ui_mount err:", e?.message || e); } catch {}
        return { ok: false, err: e?.message || String(e) };
      }
    },

    remount() {
      this.__mounted = false;
      return this.mount({ force: true });
    }
  };

  try {
    window.RCF_UI_MOUNT = API;
  } catch {}
})();
