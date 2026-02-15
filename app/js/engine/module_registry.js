/* RCF — module_registry.js (v1.0)
   Registro de “módulos” plugáveis que entram no app-filho.
*/
(() => {
  "use strict";

  const ModuleRegistry = {
    _mods: {},

    add(id, mod) {
      if (!id) return false;
      this._mods[id] = Object.assign({ id }, mod || {});
      return true;
    },

    get(id) {
      return this._mods[id] || null;
    },

    list() {
      return Object.keys(this._mods).sort();
    }
  };

  // ✅ Exemplo: módulo "calculator" (stub)
  ModuleRegistry.add("calculator", {
    title: "Calculadora (stub)",
    files() {
      return {
        "modules/calculator.js": `export function calc(a,b){ return Number(a)+Number(b); }`
      };
    },
    patchAppJs(spec) {
      return `\n// module: calculator\nconsole.log("module calculator loaded");\n`;
    }
  });

  // ✅ Exemplo: módulo "agenda" (stub)
  ModuleRegistry.add("agenda", {
    title: "Agenda (stub)",
    files() {
      return {
        "modules/agenda.js": `export function helloAgenda(){ return "agenda ok"; }`
      };
    },
    patchAppJs() {
      return `\n// module: agenda\nconsole.log("module agenda loaded");\n`;
    }
  });

  window.RCF_MODULE_REGISTRY = ModuleRegistry;
})();
