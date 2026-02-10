/* =========================================================
  RControl Factory — core/mother_selfupdate.js (FULL)
  MAINTENANCE • Self-Update (Mãe)

  Objetivo:
  - Tornar clicáveis (iOS) os botões do painel Maintenance
  - Aplicar "overrides" (bundle JSON) por cima do site via SW (quando possível)
  - Fallback: salvar overrides no localStorage para diagnóstico/rollback

  Este módulo:
  - Procura os botões/textarea do painel (por id OU por texto/estrutura)
  - Bind iOS-safe: click + touchend (anti double-fire)
  - Lê bundle remoto: /import/mother_bundle.json
  - Lê bundle colado: textarea
  - Rollback: apaga overrides
  - Notifica SW via postMessage (se tiver SW pronto para isso)
========================================================= */

(function () {
  "use strict";

  // -----------------------------
  // Tiny helpers
  // -----------------------------
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const $ = (sel, root = document) => root.querySelector(sel);

  function safeText(v) {
    return (v === undefined || v === null) ? "" : String(v);
  }

  function nowISO() {
    try { return new Date().toISOString(); } catch { return "" + Date.now(); }
  }

  function jsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function jsonStringify(obj) {
    try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
  }

  // -----------------------------
  // iOS safe tap binding
  // -----------------------------
  const TAP_GUARD_MS = 420;
  let _lastTapAt = 0;

  function bindTap(el, fn) {
    if (!el) return;

    const handler = (e) => {
      const now = Date.now();
      if (now - _lastTapAt < TAP_GUARD_MS) {
        try { e.preventDefault(); e.stopPropagation(); } catch {}
        return;
      }
      _lastTapAt = now;

      try { e.preventDefault(); e.stopPropagation(); } catch {}
      try { fn(e); } catch (err) {
        log("mother_selfupdate tap err:", err && err.message ? err.message : String(err));
      }
    };

    el.style.pointerEvents = "auto";
    el.style.touchAction = "manipulation";
    el.style.webkitTapHighlightColor = "transparent";

    el.addEventListener("click", handler, { passive: false });
    el.addEventListener("touchend", handler, { passive: false });
  }

  // -----------------------------
  // Logger (RCF_LOGGER or fallback)
  // -----------------------------
  const LOGS_KEY = "rcf:logs";

  function fallbackLogsPush(line) {
    try {
      const raw = localStorage.getItem(LOGS_KEY);
      const arr = jsonParse(raw, []);
      if (!Array.isArray(arr)) return;
      arr.push(line);
      while (arr.length > 400) arr.shift();
      localStorage.setItem(LOGS_KEY, JSON.stringify(arr));
    } catch {}
  }

  function log(...args) {
    const msg = args.map(a => (typeof a === "string" ? a : jsonStringify(a))).join(" ");
    const line = `[${new Date().toLocaleString()}] ${msg}`;

    const L = window.RCF_LOGGER;
    if (L && typeof L.write === "function") {
      try { L.write(...args); return; } catch {}
    }

    fallbackLogsPush(line);
    try { console.log("[RCF/MOTHER]", ...args); } catch {}
  }

  // -----------------------------
  // Storage for overrides (local)
  // -----------------------------
  const OVERRIDES_KEY = "rcf:mother_overrides";

  function getOverrides() {
    try {
      const raw = localStorage.getItem(OVERRIDES_KEY);
      return jsonParse(raw, null);
    } catch {
      return null;
    }
  }

  function setOverrides(obj) {
    try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(obj)); } catch {}
  }

  function clearOverrides() {
    try { localStorage.removeItem(OVERRIDES_KEY); } catch {}
  }

  // -----------------------------
  // Bundle validation / normalize
  // bundle esperado:
  // {
  //   "files": { "/core/x.js": "..." , "/app.js": "..." }
  // }
  // -----------------------------
  function normalizeBundle(bundle) {
    if (!bundle || typeof bundle !== "object") {
      return { ok: false, msg: "Bundle inválido (não é objeto)." };
    }
    if (!bundle.files || typeof bundle.files !== "object") {
      return { ok: false, msg: "Bundle inválido (faltou 'files')." };
    }

    const files = {};
    for (const k of Object.keys(bundle.files)) {
      const path = String(k || "").trim();
      if (!path) continue;

      // normaliza path: sempre começa com "/"
      const norm = path.startsWith("/") ? path : ("/" + path);
      files[norm] = safeText(bundle.files[k]);
    }

    const keys = Object.keys(files);
    if (!keys.length) return { ok: false, msg: "Bundle vazio (files sem itens)." };

    return { ok: true, files };
  }

  // -----------------------------
  // SW messaging (se existir handler no sw.js)
  // -----------------------------
  async function notifyServiceWorker(type, payload) {
    if (!("serviceWorker" in navigator)) return { ok: false, msg: "Sem Service Worker (navigator.serviceWorker indisponível)." };

    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return { ok: false, msg: "SW não registrado ainda." };

      const sw = reg.active || reg.waiting || reg.installing;
      if (!sw) return { ok: false, msg: "SW sem worker ativo." };

      sw.postMessage({ type, payload });
      return { ok: true, msg: "Mensagem enviada ao SW." };
    } catch (e) {
      return { ok: false, msg: "Falha ao notificar SW: " + (e && e.message ? e.message : String(e)) };
    }
  }

  // -----------------------------
  // Apply / rollback
  // -----------------------------
  async function applyBundle(bundleObj, sourceLabel) {
    const n = normalizeBundle(bundleObj);
    if (!n.ok) {
      log("MAE apply bundle inválido:", n.msg);
      setStatus("Bundle inválido ❌");
      setAdminOut("❌ " + n.msg);
      return;
    }

    const pack = {
      version: "mother_override_" + Math.random().toString(16).slice(2),
      appliedAt: nowISO(),
      source: sourceLabel || "unknown",
      files: n.files
    };

    // guarda local (fallback)
    setOverrides(pack);

    // tenta avisar SW
    const swRes = await notifyServiceWorker("RCF_MOTHER_APPLY", pack);
    log("MAE apply:", { files: Object.keys(n.files).length, sw: swRes });

    setStatus("Override aplicado ✅");
    setAdminOut(
      [
        "✅ Override aplicado (Mãe)",
        `source: ${pack.source}`,
        `files: ${Object.keys(pack.files).length}`,
        `sw: ${swRes.ok ? "OK" : "NOK"} — ${swRes.msg}`,
        "",
        "Se não refletir na hora:",
        "- feche e abra o PWA",
        "- ou recarregue a página",
        "- ou limpe cache do Safari e reabra",
      ].join("\n")
    );

    // dica: forçar refresh visual
    try { setTimeout(() => { setStatus("OK ✅"); }, 900); } catch {}
  }

  async function rollback() {
    clearOverrides();

    const swRes = await notifyServiceWorker("RCF_MOTHER_ROLLBACK", { at: nowISO() });
    log("MAE rollback:", swRes);

    setStatus("Rollback ✅");
    setAdminOut(
      [
        "✅ Rollback aplicado (Mãe)",
        `sw: ${swRes.ok ? "OK" : "NOK"} — ${swRes.msg}`,
        "",
        "Se ainda estiver igual:",
        "- feche e abra o PWA",
        "- recarregue a página"
      ].join("\n")
    );

    try { setTimeout(() => { setStatus("OK ✅"); }, 900); } catch {}
  }

  // -----------------------------
  // UI finders (robusto)
  // -----------------------------
  function setStatus(text) {
    const st = document.getElementById("statusText");
    if (st) st.textContent = text;
  }

  function setAdminOut(text) {
    const out = document.getElementById("adminOut");
    if (out) out.textContent = safeText(text);
  }

  function findMaintenanceRoot() {
    // tenta achar por título "MAINTENANCE"
    const candidates = $$("h2, h1");
    for (const h of candidates) {
      const t = (h.textContent || "").toLowerCase();
      if (t.includes("maintenance") && t.includes("self-update")) {
        // sobe para card
        let p = h;
        for (let i = 0; i < 6 && p; i++) {
          if (p.classList && p.classList.contains("card")) return p;
          p = p.parentElement;
        }
        return h.parentElement || document;
      }
    }
    return document;
  }

  function findButtonByText(root, includesText) {
    const want = String(includesText || "").toLowerCase();
    const btns = $$("button", root);
    for (const b of btns) {
      const t = (b.textContent || "").trim().toLowerCase();
      if (t.includes(want)) return b;
    }
    return null;
  }

  function findTextareaInMaintenance(root) {
    // tenta pelo placeholder "bundle JSON" ou pelo primeiro textarea dentro do card
    const tas = $$("textarea", root);
    if (!tas.length) return null;

    for (const ta of tas) {
      const ph = (ta.getAttribute("placeholder") || "").toLowerCase();
      if (ph.includes("bundle") || ph.includes("json")) return ta;
    }
    return tas[0];
  }

  // -----------------------------
  // Remote loader: /import/mother_bundle.json
  // -----------------------------
  async function fetchRemoteBundle(url) {
    const u = url || "/import/mother_bundle.json";
    const res = await fetch(u, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const txt = await res.text();
    const obj = jsonParse(txt, null);
    if (!obj) throw new Error("JSON inválido em " + u);
    return obj;
  }

  // -----------------------------
  // Bind everything
  // -----------------------------
  function bindMaintenance() {
    const root = findMaintenanceRoot();

    // tenta ids conhecidos (se existirem)
    const btnApplyRemote =
      document.getElementById("btnMotherApplyRemote") ||
      findButtonByText(root, "aplicar /import/mother_bundle.json") ||
      findButtonByText(root, "aplicar /import");

    const btnRollback =
      document.getElementById("btnMotherRollback") ||
      findButtonByText(root, "rollback overrides") ||
      findButtonByText(root, "rollback");

    const btnApplyPasted =
      document.getElementById("btnMotherApplyPasted") ||
      findButtonByText(root, "aplicar bundle colado") ||
      findButtonByText(root, "bundle colado");

    const textarea =
      document.getElementById("motherBundleText") ||
      findTextareaInMaintenance(root);

    // segurança: pointer-events
    [btnApplyRemote, btnRollback, btnApplyPasted].forEach(b => {
      if (!b) return;
      b.style.pointerEvents = "auto";
      b.style.touchAction = "manipulation";
    });

    // bind remote
    if (btnApplyRemote) {
      bindTap(btnApplyRemote, async () => {
        try {
          setStatus("Baixando bundle…");
          const bundle = await fetchRemoteBundle("/import/mother_bundle.json");
          await applyBundle(bundle, "/import/mother_bundle.json");
        } catch (e) {
          log("MAE remote err:", e && e.message ? e.message : String(e));
          setStatus("Falha ❌");
          setAdminOut("❌ Falha ao baixar /import/mother_bundle.json: " + safeText(e && e.message ? e.message : e));
          try { setTimeout(() => setStatus("OK ✅"), 900); } catch {}
        }
      });
    }

    // bind rollback
    if (btnRollback) {
      bindTap(btnRollback, async () => {
        setStatus("Rollback…");
        await rollback();
      });
    }

    // bind pasted
    if (btnApplyPasted) {
      bindTap(btnApplyPasted, async () => {
        const raw = textarea ? String(textarea.value || "") : "";
        const obj = jsonParse(raw, null);
        if (!obj) {
          setStatus("Bundle inválido ❌");
          setAdminOut("❌ JSON inválido no bundle colado.");
          try { setTimeout(() => setStatus("OK ✅"), 900); } catch {}
          return;
        }
        setStatus("Aplicando…");
        await applyBundle(obj, "pasted");
      });
    }

    // log boot
    const ov = getOverrides();
    log("MAE mother_selfupdate.js bind ok",
      {
        hasRemoteBtn: !!btnApplyRemote,
        hasRollbackBtn: !!btnRollback,
        hasApplyPastedBtn: !!btnApplyPasted,
        hasTextarea: !!textarea,
        overrides: ov ? ("yes (" + Object.keys(ov.files || {}).length + " files)") : "no"
      }
    );
  }

  function init() {
    // iOS: garante que o body aceita toque
    try { document.body.addEventListener("touchstart", () => {}, { passive: true }); } catch {}
    bindMaintenance();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
