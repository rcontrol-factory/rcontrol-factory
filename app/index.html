<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>RControl Factory</title>
  <meta name="theme-color" content="#0b1020" />

  <!-- importante: base relativo pra funcionar em /app/ -->
  <base href="./" />

  <link rel="manifest" href="./manifest.json" />
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <noscript>Ative o JavaScript para usar o app.</noscript>

  <div id="app">
    <div style="padding:14px;font-family:system-ui">Carregando…</div>
  </div>

  <script>
    (function () {
      function rcfLog(msg) {
        try {
          if (window.RCF_LOGGER && typeof window.RCF_LOGGER.push === "function") {
            window.RCF_LOGGER.push("boot", msg);
          } else {
            console.log("[BOOT]", msg);
          }
        } catch {}
      }

      function loadAny(paths) {
        return new Promise((resolve, reject) => {
          let i = 0;
          function tryNext() {
            if (i >= paths.length) return reject(new Error("all paths failed"));
            const src = paths[i++];
            const s = document.createElement("script");
            s.src = src;
            s.async = false;
            s.onload = () => resolve(src);
            s.onerror = () => tryNext();
            document.head.appendChild(s);
          }
          tryNext();
        });
      }

      async function boot() {
        rcfLog("index boot: starting module loader...");

        // MÓDULOS CORE (ordem importa)
        const modules = [
          // github pull/push
          { name: "github_sync", paths: ["./js/core/github_sync.js"] },

          // overrides
          { name: "vfs_overrides", paths: ["./js/core/vfs_overrides.js"] },

          // mae selfupdate
          { name: "mother_selfupdate", paths: ["./js/core/mother_selfupdate.js"] },

          // injector (Settings)
          { name: "injector", paths: ["./js/core/injector.js"] },

          // remove Logs dentro do Settings (patch)
          { name: "settings_cleanup", paths: ["./js/core/settings_cleanup.js"] },

          // sua UI do Admin GitHub (o seu arquivo real é admin.github.js)
          { name: "admin_ui_github", paths: ["./js/admin.github.js"] },

          // engine/builder opcionais (se existirem)
          { name: "patchQueue", paths: ["./js/engine/patchQueue.js"] },
          { name: "organizerEngine", paths: ["./js/engine/organizerEngine.js"] },
          { name: "applyPipeline", paths: ["./js/engine/applyPipeline.js"] },
          { name: "builderSafe", paths: ["./js/builder/builderSafe.js"] },
        ];

        for (const m of modules) {
          try {
            const okPath = await loadAny(m.paths);
            rcfLog("module loaded ✅ " + m.name + " ← " + okPath);
          } catch {
            rcfLog("module missing ❌ " + m.name + " (tentou: " + m.paths.join(" | ") + ")");
          }
        }

        // app principal
        try {
          await loadAny(["./app.js"]);
          rcfLog("app.js loaded ✅ ./app.js");
        } catch {
          rcfLog("app.js missing ❌ ./app.js");
        }

        // SW (scope /app/ para ficar estável com base href)
        try {
          if ("serviceWorker" in navigator) {
            navigator.serviceWorker.register("./sw.js", { scope: "./" })
              .then(() => rcfLog("sw register: ok"))
              .catch(() => rcfLog("sw register: fail/ignored"));
          }
        } catch {}
      }

      boot();
    })();
  </script>
</body>
</html>
