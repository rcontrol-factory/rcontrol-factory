(() => {
  "use strict";

  let INSTALLED = false;
  let LAST_TS = 0;

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
    const doc = { id: uid(), ts: Date.now(), type, payload };
    try { await window.RCF_IDB?.putError?.(doc); } catch {}
    return doc;
  }

  function showErrorScreen(title, detailsObj) {
    try {
      if (document.getElementById("rcfErrorScreen")) return;

      const root = document.getElementById("app") || document.body;
      if (!root) return;

      const box = document.createElement("div");
      box.id = "rcfErrorScreen";
      box.style.cssText = `
        position:fixed; inset:0; z-index:2147483647;
        background:rgba(0,0,0,0.88); color:#fff;
        padding:18px; overflow:auto; font-family:system-ui;
      `;

      const wrap = document.createElement("div");
      wrap.style.cssText = "max-width:920px;margin:0 auto";

      const h = document.createElement("div");
      h.style.cssText = "font-size:20px;font-weight:800;margin-bottom:8px";
      h.textContent = `⚠️ ${title || "Erro"}`;

      const p = document.createElement("div");
      p.style.cssText = "opacity:.9;margin-bottom:10px";
      p.textContent = "A Factory capturou um erro e evitou tela branca. Copie os detalhes e mande pro suporte interno.";

      const pre = document.createElement("pre");
      pre.style.cssText = "white-space:pre-wrap;background:rgba(255,255,255,0.06);padding:12px;border-radius:12px;line-height:1.35";
      const detailsText = safeStr(detailsObj);
      pre.textContent = detailsText;

      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;margin-top:12px";

      const btnCopy = document.createElement("button");
      btnCopy.id = "rcfErrCopy";
      btnCopy.style.cssText = "padding:10px 12px;border-radius:12px;border:none;font-weight:700";
      btnCopy.textContent = "Copiar";

      const btnReload = document.createElement("button");
      btnReload.id = "rcfErrReload";
      btnReload.style.cssText = "padding:10px 12px;border-radius:12px;border:none;font-weight:700";
      btnReload.textContent = "Recarregar";

      const btnClose = document.createElement("button");
      btnClose.id = "rcfErrClose";
      btnClose.style.cssText = "padding:10px 12px;border-radius:12px;border:none;font-weight:700";
      btnClose.textContent = "Fechar";

      row.appendChild(btnCopy);
      row.appendChild(btnReload);
      row.appendChild(btnClose);

      wrap.appendChild(h);
      wrap.appendChild(p);
      wrap.appendChild(pre);
      wrap.appendChild(row);

      box.appendChild(wrap);
      (document.body || root).appendChild(box);

      const txt = `TITLE: ${title}\n\n${detailsText}`;

      btnCopy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(txt); } catch {}
      }, { passive: true });

      btnReload.addEventListener("click", () => location.reload(), { passive: true });
      btnClose.addEventListener("click", () => box.remove(), { passive: true });
    } catch {}
  }

  async function handle(kind, errObj) {
    // throttle anti-flood
    const ts = Date.now();
    if (ts - LAST_TS < 500) return;
    LAST_TS = ts;

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

    showErrorScreen("Erro capturado", payload);
  }

  function install() {
    if (INSTALLED) {
      log("warn", "GlobalErrorGuard já estava instalado (skip).");
      return;
    }
    INSTALLED = true;

    window.addEventListener("error", (ev) => {
      const e = ev?.error || new Error(ev?.message || "window.error");
      void handle("window.error", e);
    });

    window.addEventListener("unhandledrejection", (ev) => {
      const e = ev?.reason instanceof Error ? ev.reason : new Error(safeStr(ev?.reason));
      void handle("unhandledrejection", e);
    });

    const orig = console.error;
    console.error = function (...args) {
      try { orig.apply(console, args); } catch {}
      try {
        const e = args.find(a => a instanceof Error) || new Error(args.map(safeStr).join(" "));
        void handle("console.error", e);
      } catch {}
    };

    log("ok", "GlobalErrorGuard instalado ✅");
  }

  window.RCF_ERROR_GUARD = window.RCF_ERROR_GUARD || { install };
})();
