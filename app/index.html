<!-- FILE: /app/index.html
     RControl Factory — index.html (vCLEAN-1+ENGINE + VENDOR ZIP + PAGES LINKS + EXTRAS3A)
     PATCH A (BOOT CLEANUP):
     - DEGRAU 3: lista oficial MUST inclui runtime + scanmap + bridge + tools_panel
     - mantém 1 reload no máximo
-->
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>RCF</title>
  <meta name="theme-color" content="#0b1020" />
  <base href="./" />
  <link rel="manifest" href="./manifest.json" />
  <link rel="stylesheet" href="./styles.css" />
  <meta name="rcf-index" content="vCLEAN-1+ENGINE+VENDORZIP+PAGESLINKS+EXTRAS3A" />
</head>

<body>
  <noscript>Ative o JavaScript para usar o app.</noscript>

  <div id="app">
    <div style="padding:14px;font-family:system-ui">Carregando…</div>
  </div>

  <script>
    (function () {
      if (window.__RCF_INDEX_BOOTED__) return;
      window.__RCF_INDEX_BOOTED__ = true;

      function log(){ try { console.log.apply(console, ["[RCF/index]"].concat([].slice.call(arguments))); } catch(e){} }

      function loadScript(src){
        return new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = src;
          s.async = false;
          s.onload = () => resolve(src);
          s.onerror = () => reject(new Error("load failed: " + src));
          document.head.appendChild(s);
        });
      }

      // =========================================================
      // DEGRAU 3 — AUTO EXTRA MODULES (SAFE + 1 reload)
      // =========================================================
      function ensureExtraModules(){
        const KEY = "rcf:boot:extra_modules";
        const GUARD = "rcf:extra_modules_installed:v1";
        const MUST = [
          "./js/core/agent_runtime.js",
          "./js/core/agent_scanmap.js",
          "./js/core/admin_scanmap_bridge.js",
          "./js/core/agent_tools_panel.js"
        ];

        try {
          if (sessionStorage.getItem(GUARD) === "1") return { changed:false, already:true };
        } catch {}

        let cur = [];
        try {
          const raw = localStorage.getItem(KEY);
          const j = raw ? JSON.parse(raw) : [];
          cur = Array.isArray(j) ? j : [];
        } catch {
          cur = [];
        }

        const norm = (p) => String(p || "").trim();
        const set = new Set(cur.map(norm).filter(Boolean));

        let changed = false;
        for (const p of MUST) {
          const x = norm(p);
          if (!set.has(x)) { set.add(x); changed = true; }
        }

        const list = Array.from(set).sort((a,b)=>a.localeCompare(b));

        if (changed) {
          try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
          try { sessionStorage.setItem(GUARD, "1"); } catch {}
          return { changed:true, list };
        }

        try { sessionStorage.setItem(GUARD, "1"); } catch {}
        return { changed:false, list };
      }

      async function boot(){
        log("BOOT: starting… base=", document.baseURI);

        try {
          const r = ensureExtraModules();
          if (r && r.changed) {
            log("DEGRAU3: extra_modules atualizado -> reload 1x", r.list || []);
            try { location.reload(); return; } catch {}
          } else {
            log("DEGRAU3: extra_modules ok");
          }
        } catch (e) {
          log("DEGRAU3: falhou (ignorado)", (e && e.message) ? e.message : e);
        }

        const modules = [
          "./js/core/logger.js",
          "./js/core/stability_guard.js",
          "./js/core/storage.js",

          "./js/core/vendor_loader.js",
          "./js/core/vendor_health.js",

          "./js/core/github_sync.js",
          "./js/core/vfs_overrides.js",
          "./js/core/vfs_shim.js",
          "./js/core/mother_selfupdate.js",
          "./js/core/errors.js",
          "./js/core/risk.js",
          "./js/core/snapshot.js",
          "./js/core/selfheal.js",
          "./js/core/ui_safety.js",
          "./js/core/ui_compact_outputs.js",
          "./js/core/ui_bindings.js",
          "./js/core/diagnostics.js",
          "./js/core/publish_queue.js",
          "./js/core/preview_runner.js",
          "./js/core/policy.js",
          "./js/core/settings_cleanup.js",
          "./js/core/injector.js",

          "./js/engine/template_registry.js",
          "./js/engine/module_registry.js",
          "./js/engine/builder.js",
          "./js/engine/engine.js",

          "./js/core/pages_links.js",

          "./js/admin.github.js"
        ];

        for (const src of modules) {
          try {
            await loadScript(src);
            try { window.RCF_LOGGER?.push?.("BOOT", "module loaded ✅ " + src); } catch {}
            log("module loaded ✅", src);
          } catch (e) {
            try { window.RCF_LOGGER?.push?.("WARN", "module missing/failed ❌ " + src + " :: " + (e.message||e)); } catch {}
            log("module missing/failed ❌", src, (e.message||e));
          }
        }

        try {
          await loadScript("./app.js");
          try { window.RCF_LOGGER?.push?.("BOOT", "app.js loaded ✅ ./app.js"); } catch {}
          log("app.js loaded ✅");
        } catch (e) {
          try { window.RCF_LOGGER?.push?.("ERR", "app.js missing/failed ❌ ./app.js :: " + (e.message||e)); } catch {}
          log("app.js missing/failed ❌", (e.message||e));
        }

        const afterApp = [
          "./js/core/zip_vault.js",
          "./js/core/agent_zip_bridge.js"
        ];

        for (const src of afterApp) {
          try {
            await loadScript(src);
            try { window.RCF_LOGGER?.push?.("BOOT", "module loaded ✅ " + src); } catch {}
            log("module loaded ✅", src);
          } catch (e) {
            try { window.RCF_LOGGER?.push?.("WARN", "module missing/failed ❌ " + src + " :: " + (e.message||e)); } catch {}
            log("module missing/failed ❌", src, (e.message||e));
          }
        }

        try {
          if (!window.__RCF_SW_REGISTERED__ && "serviceWorker" in navigator) {
            window.__RCF_SW_REGISTERED__ = true;
            navigator.serviceWorker.register("./sw.js", { scope: "./" })
              .then(() => {
                try { window.RCF_LOGGER?.push?.("BOOT", "sw register: ok (scope ./)"); } catch {}
                log("sw register ok");
              })
              .catch((e) => {
                try { window.RCF_LOGGER?.push?.("WARN", "sw register: fail/ignored :: " + (e?.message||e)); } catch {}
                log("sw register fail/ignored:", (e?.message||e));
              });
          }
        } catch {}
      }

      boot();
    })();
  </script>
</body>
</html>
