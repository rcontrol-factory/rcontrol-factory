// app/js/templates.js
(function () {
  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"
    }[c]));
  }

  function makeBasicPwaFiles(appName, appId) {
    const title = esc(appName);
    const theme = "#0b1220";

    const indexHtml = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <meta name="theme-color" content="${theme}" />
  <link rel="manifest" href="manifest.json" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="top">
    <h1>${title}</h1>
    <div class="muted">Gerado pelo RControl Factory • ID: ${esc(appId)}</div>
  </header>

  <main class="card">
    <h2>App rodando ✅</h2>
    <p>Este app é o resultado final (output). A Factory é separada.</p>
    <button id="btn" class="btn">Clique aqui</button>
    <div id="out" class="out"></div>
  </main>

  <script src="app.js"></script>
  <script>
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch(()=>{});
      });
    }
  </script>
</body>
</html>`;

    const appJs = `// App gerado (OUTPUT). Não tem engine da Factory aqui.
(function(){
  const btn = document.getElementById("btn");
  const out = document.getElementById("out");
  if (!btn || !out) return;
  btn.addEventListener("click", () => {
    out.textContent = "Funcionando! " + new Date().toLocaleString();
  });
})();`;

    const stylesCss = `:root{color-scheme:dark;}
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;background:#0b1220;color:#e5e7eb;}
.top{padding:18px 16px;border-bottom:1px solid rgba(255,255,255,.08);}
h1{margin:0 0 6px 0;font-size:28px}
.muted{opacity:.75;font-size:13px}
.card{margin:16px;padding:16px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.03)}
.btn{padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(34,197,94,.25);color:#e5e7eb;font-weight:700}
.out{margin-top:12px;padding:12px;border-radius:12px;border:1px dashed rgba(255,255,255,.18);min-height:44px;display:flex;align-items:center}
`;

    const manifest = JSON.stringify({
      name: appName,
      short_name: appName.slice(0, 12),
      start_url: "./",
      display: "standalone",
      background_color: "#0b1220",
      theme_color: "#0b1220",
      icons: []
    }, null, 2);

    const sw = `// SW simples
const CACHE="app-cache-v1";
self.addEventListener("install",(e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(["./","./index.html","./styles.css","./app.js","./manifest.json"])));
});
self.addEventListener("fetch",(e)=>{
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});`;

    return {
      "index.html": indexHtml,
      "app.js": appJs,
      "styles.css": stylesCss,
      "manifest.json": manifest,
      "sw.js": sw
    };
  }

  window.RCF = window.RCF || {};
  window.RCF.templates = { makeBasicPwaFiles };
})();
