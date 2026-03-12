/* FILE: /app/js/ui/ui_config.js
   RControl Factory — UI Config Module
   Configuração base da UI da Factory
*/

(() => {
  "use strict";

  const CONFIG = {
    brand: {
      title: "FACTORY",
      subtitle: "by RCONTROL"
    },

    sections: {
      dashboard: {
        title: "Dashboard",
        subtitle: "Visão principal da Factory"
      },
      appsWidgets: {
        title: "Apps & Widgets",
        subtitle: "Módulos e integrações da Factory"
      },
      projects: {
        title: "Projects",
        subtitle: "Projetos, código e deploy"
      }
    },

    nav: {
      defaultView: "dashboard",
      views: [
        "dashboard",
        "newapp",
        "editor",
        "generator",
        "agent",
        "settings",
        "admin",
        "diagnostics",
        "logs"
      ]
    },

    dashboard: {
      activityLimit: 4
    },

    projects: {
      defaultTab: "projects"
    }
  };

  const API = {
    getAll() {
      return CONFIG;
    },

    get(path, fallback = null) {
      try {
        const parts = String(path || "").split(".").filter(Boolean);
        let ref = CONFIG;

        for (const part of parts) {
          if (ref && typeof ref === "object" && part in ref) {
            ref = ref[part];
          } else {
            return fallback;
          }
        }

        return ref;
      } catch {
        return fallback;
      }
    },

    set(path, value) {
      try {
        const parts = String(path || "").split(".").filter(Boolean);
        if (!parts.length) return false;

        let ref = CONFIG;
        for (let i = 0; i < parts.length - 1; i++) {
          const key = parts[i];
          if (!ref[key] || typeof ref[key] !== "object") ref[key] = {};
          ref = ref[key];
        }

        ref[parts[parts.length - 1]] = value;
        return true;
      } catch {
        return false;
      }
    }
  };

  try {
    window.RCF_UI_CONFIG = API;
  } catch {}
})();
