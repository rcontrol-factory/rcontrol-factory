/* /js/core/stability_guard.js — ERCtrl Stability Guard (v1)
   - Captura errors/rejections/console.error
   - Nunca deixa tela branca: injeta ErrorScreen
   - Loga em localStorage (rcf:fatal / rcf:logs-extra)
*/
(() => {
  "use strict";

  const LS_FATAL = "rcf:fatal:last";
  const LS_EXTRA = "rcf:logs:extra";
  const MAX_EXTRA = 200;

  const safeStr = (x) => {
    try { return typeof x === "string" ? x : JSON.stringify(x); }
    catch { return String(x); }
  };

  function pushExtra(line) {
    try {
      const arr = JSON.parse(localStorage.getItem(LS_EXTRA) || "[]");
      arr.push(line);
      while (arr.length > MAX_EXTRA) arr.shift();
      localStorage.setItem(LS_EXTRA, JSON.stringify(arr));
    } catch {}
  }

  function setFatal(payload) {
    try { localStorage.setItem(LS_FATAL, JSON.stringify(payload)); } catch {}
  }

  function getFatal() {
    try { return JSON.parse(localStorage.getItem(LS_FATAL) || "null"); } catch { return null; }
  }

  function renderErrorScreen(payload) {
    try {
      const root = document.getElementById("app") || document.body;
      const pre = safeStr(payload?.stack || payload?.message || payload);
      const html = `
        <div style="min-height:100vh;background:#0b1220;color:#fff;padding:18px;font-family:system-ui">
          <div style="font-weight:800;font-size:18px">ERCtrl • ErrorScreen (Safe)</div>
          <div style="opacity:.8;margin-top:6px">A Factory detectou um erro e evitou tela branca.</div>
          <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
            <button id="rcf_err_reload" style="padding:10px 14px;border-radius:10px;border:0;background:#22c55e;color:#06111f;font-weight:800">Recarregar</button>
            <button id="rcf_err_clear" style="padding:10px 14px;border-radius:10px;border:0;background:#ef4444;color:#fff;font-weight:800">Limpar overrides</button>
            <button id="rcf_err_copy" style="padding:10px 14px;border-radius:10px;border:0;background:#334155;color:#fff;font-weight:800">Copiar log</button>
          </div>
          <pre style="white-space:pre-wrap;margin-top:14px;background:rgba(255,255,255,.06);padding:12px;border-radius:12px;overflow:auto;max-height:55vh">${pre}</pre>
        </div>
      `;
      root.innerHTML = html;

      document.getElementById("rcf_err_reload")?.addEventListener("click", () => location.reload());
      document.getElementById("rcf_err_copy")?.addEventListener("click", async () => {
        const fatal = getFatal();
        const extra = localStorage.getItem(LS_EXTRA) || "[]";
        const text = JSON.stringify({ fatal, extra: JSON.parse(extra) }, null, 2);
        try { await navigator.clipboard.writeText(text); } catch {}
      });
      document.getElementById("rcf_err_clear")?.addEventListener("click", async () => {
        try { await window.RCF_VFS_OVERRIDES?.clear?.(); } catch {}
        location.reload();
      });
    } catch {}
  }

  function reportFatal(kind, eLike) {
    const payload = {
      kind,
      ts: new Date().toISOString(),
      message: safeStr(eLike?.message || eLike),
      stack: safeStr(eLike?.stack || ""),
      href: location.href,
      ua: navigator.userAgent,
    };
    setFatal(payload);
    pushExtra(`[FATAL] ${payload.ts} ${payload.kind}: ${payload.message}`);
    try { window.RCF_LOGGER?.push?.("err", `${kind}: ${payload.message}`); } catch {}
    renderErrorScreen(payload);
  }

  // Hook: window.onerror
  window.addEventListener("error", (ev) => {
    reportFatal("window.error", ev?.error || ev?.message || ev);
  });

  // Hook: unhandledrejection
  window.addEventListener("unhandledrejection", (ev) => {
    reportFatal("unhandledrejection", ev?.reason || ev);
  });

  // Hook: console.error mirror
  const origCE = console.error;
  console.error = function (...args) {
    try { pushExtra(`[console.error] ${args.map(safeStr).join(" ")}`); } catch {}
    try { window.RCF_LOGGER?.push?.("err", args.map(safeStr).join(" ")); } catch {}
    return origCE.apply(console, args);
  };

  // Expor API mínima
  window.RCF_STABILITY = {
    getFatal,
    clearFatal() { try { localStorage.removeItem(LS_FATAL); } catch {} },
    showLastFatal() { const f = getFatal(); if (f) renderErrorScreen(f); }
  };
})();
