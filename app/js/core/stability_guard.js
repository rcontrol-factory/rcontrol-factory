/* =========================================================
  RControl Factory — Stability Guard (v1.2 SAFE)
  - Captura errors/rejections/console.error
  - Nunca deixa tela branca (ErrorScreen)
  - Evita loop infinito (fatal lock)
  - Loga em localStorage (rcf:fatal:last / rcf:logs:extra)
  - iOS / Safari safe
========================================================= */

(() => {
  "use strict";

  if (window.RCF_STABILITY && window.RCF_STABILITY.__v12) return;

  const LS_FATAL = "rcf:fatal:last";
  const LS_EXTRA = "rcf:logs:extra";
  const MAX_EXTRA = 200;

  let __RCF_FATAL_LOCK__ = false;
  let __RCF_SCREEN_RENDERED__ = false;

  // --------------------------------------------------------
  // Helpers
  // --------------------------------------------------------

  const safeStr = (x) => {
    try {
      if (typeof x === "string") return x;
      return JSON.stringify(x);
    } catch {
      return String(x);
    }
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
    try { return JSON.parse(localStorage.getItem(LS_FATAL) || "null"); }
    catch { return null; }
  }

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
    try { console.log("[STABILITY]", level, msg); } catch {}
  }

  // --------------------------------------------------------
  // Error Screen
  // --------------------------------------------------------

  function renderErrorScreen(payload) {
    if (__RCF_SCREEN_RENDERED__) return;
    __RCF_SCREEN_RENDERED__ = true;

    try {
      const root = document.getElementById("app") || document.body;
      if (!root) return;

      const pre = safeStr(payload?.stack || payload?.message || payload);

      root.innerHTML = `
        <div style="
          min-height:100vh;
          background:#0b1220;
          color:#fff;
          padding:18px;
          font-family:system-ui;
        ">
          <div style="font-weight:800;font-size:18px">
            RControl Factory • Safe Mode
          </div>

          <div style="opacity:.8;margin-top:6px">
            Um erro foi detectado. A tela branca foi evitada.
          </div>

          <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
            <button id="rcf_err_reload"
              style="padding:10px 14px;border-radius:10px;border:0;background:#22c55e;color:#06111f;font-weight:800">
              Recarregar
            </button>

            <button id="rcf_err_clear"
              style="padding:10px 14px;border-radius:10px;border:0;background:#ef4444;color:#fff;font-weight:800">
              Limpar Overrides
            </button>

            <button id="rcf_err_copy"
              style="padding:10px 14px;border-radius:10px;border:0;background:#334155;color:#fff;font-weight:800">
              Copiar Log
            </button>
          </div>

          <pre style="
            white-space:pre-wrap;
            margin-top:14px;
            background:rgba(255,255,255,.06);
            padding:12px;
            border-radius:12px;
            overflow:auto;
            max-height:55vh;
          ">${pre}</pre>
        </div>
      `;

      document.getElementById("rcf_err_reload")
        ?.addEventListener("click", () => location.reload());

      document.getElementById("rcf_err_copy")
        ?.addEventListener("click", async () => {
          try {
            const fatal = getFatal();
            const extra = JSON.parse(localStorage.getItem(LS_EXTRA) || "[]");
            await navigator.clipboard.writeText(
              JSON.stringify({ fatal, extra }, null, 2)
            );
          } catch {}
        });

      document.getElementById("rcf_err_clear")
        ?.addEventListener("click", async () => {
          try { await window.RCF_VFS_OVERRIDES?.clear?.(); } catch {}
          location.reload();
        });

    } catch (e) {
      console.log("ErrorScreen falhou:", e);
    }
  }

  // --------------------------------------------------------
  // Fatal Reporter
  // --------------------------------------------------------

  function reportFatal(kind, eLike) {
    if (__RCF_FATAL_LOCK__) return;
    __RCF_FATAL_LOCK__ = true;

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
    log("err", `${kind}: ${payload.message}`);

    renderErrorScreen(payload);
  }

  // --------------------------------------------------------
  // Hooks Globais
  // --------------------------------------------------------

  window.addEventListener("error", (ev) => {
    reportFatal("window.error", ev?.error || ev?.message || ev);
  });

  window.addEventListener("unhandledrejection", (ev) => {
    reportFatal("unhandledrejection", ev?.reason || ev);
  });

  const origConsoleError = console.error;
  console.error = function (...args) {
    try {
      pushExtra(`[console.error] ${args.map(safeStr).join(" ")}`);
      log("err", args.map(safeStr).join(" "));
    } catch {}
    return origConsoleError.apply(console, args);
  };

  // --------------------------------------------------------
  // API Pública
  // --------------------------------------------------------

  window.RCF_STABILITY = {
    __v12: true,
    getFatal,
    clearFatal() {
      try { localStorage.removeItem(LS_FATAL); } catch {}
    },
    showLastFatal() {
      const f = getFatal();
      if (f) renderErrorScreen(f);
    }
  };

  log("ok", "stability_guard.js ready ✅ (v1.2 SAFE)");
})();
