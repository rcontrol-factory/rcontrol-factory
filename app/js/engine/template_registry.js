/* RCF — template_registry.js (v1.0)
   Registro de templates base (app-filho).
*/
(() => {
  "use strict";

  const TemplateRegistry = {
    _templates: {},

    add(id, tpl) {
      if (!id) return false;
      this._templates[id] = Object.assign({ id }, tpl || {});
      return true;
    },

    get(id) {
      return this._templates[id] || null;
    },

    list() {
      return Object.keys(this._templates).sort();
    }
  };

  // ✅ Template base mínimo (pwa-base)
  TemplateRegistry.add("pwa-base", {
    title: "PWA Base",
    files(spec) {
      const name = (spec && spec.name) ? String(spec.name) : "Meu App";
      const theme = (spec && spec.themeColor) ? String(spec.themeColor) : "#0b1020";
      return {
        "index.html": `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>${name}</title>
  <meta name="theme-color" content="${theme}" />
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <div id="app">
    <h1>${name}</h1>
    <p>App criado pela RCF.</p>
  </div>
  <script src="./app.js"></script>
</body>
</html>`,

        "styles.css": `:root{color-scheme:dark;}
body{margin:0;padding:18px;font-family:system-ui;background:#0b1020;color:#fff}
#app{max-width:900px;margin:0 auto}`,

        "app.js": `console.log("RCF child app: ${name}");`
      };
    }
  });

  window.RCF_TEMPLATE_REGISTRY = TemplateRegistry;
})();
