(() => {
  "use strict";

  const safeStr = (x) => {
    try { return typeof x === "string" ? x : JSON.stringify(x); }
    catch { return String(x); }
  };

  function log(level, msg, extra) {
    try { window.RCF_LOGGER?.push?.(level, msg + (extra ? " " + safeStr(extra) : "")); } catch {}
  }

  function uid() {
    return "e_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  async function persist(type, payload) {
    const doc = {
      id: uid(),
      ts: Date.now(),
      type,
      payload
    };
    try { await window.RCF_IDB?.putError?.(doc); } catch {}
    return doc;
  }

  function showErrorScreen(title, details) {
    try {
      // Nunca deixa tela branca sem explicação
      const root = document.getElementById("app") || document.body;
      if (!root) return;

      // Não sobrepõe se já existe
      if (document.getElementById("rcfErrorScreen")) return;

      const box = document.createElement("div");
      box.id = "rcfErrorScreen";
      box.style.cssText = `
        position:fixed; inset:0; z-index:2147483647;
        background:rgba(0,0,0,0.88); color:#fff;
        padding:18px; overflow:auto; font-family:system-ui;
      `;
      box.innerHTML = `
        <div style="max-width:920px;margin:0 auto">
          <div style="font-size:20px;font-weight:800;margin-bottom:8px">⚠️ ${title}</div>
          <div style="opacity:.9;margin-bottom:10px">
            A Factory capturou um erro e evitou tela branca. Copie os detalhes e mande pro suporte interno.
          </div>
          <pre style="white-space:pre-wrap;background:rgba(255,255,255,0.06);padding:12px;border-radius:12px;line-height:1.35">${details}</pre>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
            <button id="rcfErrCopy" style="padding:10px 12px;border-radius:12px;border:none;font-weight:700">Copiar</button>
            <button id="rcfErrReload" style="padding:10px 12px;border-radius:12px;border:none;font-weight:700">Recarregar</button>
            <button id="rcfErrClose" style="padding:10px 12px;border-radius:12px;border:none;font-weight:700">Fechar</button>
          </div>
        </div>
      `;
      (document.body || root).appendChild(box);

      const txt = `TITLE: ${title}\n\n${details}`;

      box.querySelector("#rcfErrCopy")?.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(txt); } catch {}
      });
      box.querySelector("#rcfErrReload")?.addEventListener("click", () => location.reload());
      box.querySelector("#rcfErrClose")?.addEventListener("click", () => box.remove());
    } catch {}
  }

  async function handle(kind, errObj) {
    const payload = {
      kind,
      message: errObj?.message || safeStr(errObj),
      stack: errObj?.stack || "",
      href: location.href,
      ua: navigator.userAgent,
      time: new Date().toISOString()
    };

    log("err", `GlobalErrorGuard: ${payload.message}`);
    await persist(kind, payload);

    // UI controlada
    showErrorScreen("Erro capturado", safeStr(payload));
  }

  function install() {
    // window.onerror
    window.addEventListener("error", (ev) => {
      const e = ev?.error || new Error(ev?.message || "window.error");
      handle("window.error", e);
    });

    // unhandled promise
    window.addEventListener("unhandledrejection", (ev) => {
      const e = ev?.reason instanceof Error ? ev.reason : new Error(safeStr(ev?.reason));
      handle("unhandledrejection", e);
    });

    // console.error hook (sem quebrar o console)
    const orig = console.error;
    console.error = function (...args) {
      try {
        orig.apply(console, args);
      } catch {}
      try {
        const e = args.find(a => a instanceof Error) || new Error(args.map(safeStr).join(" "));
        handle("console.error", e);
      } catch {}
    };

    log("ok", "GlobalErrorGuard instalado ✅");
  }

  window.RCF_ERROR_GUARD = window.RCF_ERROR_GUARD || { install };
})();
