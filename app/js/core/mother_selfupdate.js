/* =========================================================
  RControl Factory — core/mother_selfupdate.js (FULL)
  - Self-update da Mãe via Service Worker overrides (RCF_VFS)
  - iOS: click + touchend (passive:false)
  - FIX: auto-unblock overlays que ficam em cima dos 3 botões
========================================================= */
(() => {
  "use strict";

  const $id = (id) => document.getElementById(id);

  function safeText(v) {
    return (v === undefined || v === null) ? "" : String(v);
  }

  function isCriticalPath(path) {
    const p = String(path || "");
    return (
      p === "/index.html" ||
      p === "/app.js" ||
      p === "/styles.css" ||
      p === "/sw.js" ||
      p.startsWith("/core/")
    );
  }

  function defaultContentType(path) {
    const p = String(path || "").toLowerCase();
    if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
    if (p.endsWith(".css")) return "text/css; charset=utf-8";
    if (p.endsWith(".html")) return "text/html; charset=utf-8";
    if (p.endsWith(".json")) return "application/json; charset=utf-8";
    return "text/plain; charset=utf-8";
  }

  // -------- iOS tap binding (hard) --------
  const TAP_GUARD_MS = 450;
  let _lastTapAt = 0;

  function forceClickable(el) {
    if (!el) return;
    try {
      el.style.pointerEvents = "auto";
      el.style.touchAction = "manipulation";
      el.style.webkitTapHighlightColor = "transparent";
      el.style.userSelect = "none";
      el.style.position = el.style.position || "relative";
      el.style.zIndex = el.style.zIndex || "5";
    } catch {}
  }

  function bindTap(el, fn) {
    if (!el) return;

    forceClickable(el);

    const handler = (e) => {
      const now = Date.now();
      if (now - _lastTapAt < TAP_GUARD_MS) {
        try { e.preventDefault(); e.stopPropagation(); } catch {}
        return;
      }
      _lastTapAt = now;

      try { e.preventDefault(); e.stopPropagation(); } catch {}
      try { fn(e); } catch (err) {
        try { console.log("[RCF] mother_selfupdate tap err:", err); } catch {}
      }
    };

    // limpa binds antigos
    try { el.onclick = null; el.ontouchend = null; } catch {}

    el.addEventListener("click", handler, { passive: false });
    el.addEventListener("touchend", handler, { passive: false });

    // fallback
    try { el.onclick = (e) => handler(e || window.event); } catch {}
  }

  // -------- AUTO-UNBLOCK (overlay em cima dos botões) --------
  function isRoot(el) {
    return el === document.documentElement || el === document.body;
  }

  function sameOrInside(a, b) {
    if (!a || !b) return false;
    return a === b || a.contains(b);
  }

  function centerPoint(el) {
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    return { x, y, r };
  }

  function tagInfo(el) {
    if (!el) return "(null)";
    const id = el.id ? `#${el.id}` : "";
    const cls = (el.className && typeof el.className === "string") ? "." + el.className.split(/\s+/).filter(Boolean).slice(0,3).join(".") : "";
    return `${el.tagName}${id}${cls}`;
  }

  function unblockButton(btn, maxSteps = 8) {
    if (!btn) return { ok: false, msg: "btn null" };

    forceClickable(btn);

    const { x, y } = centerPoint(btn);

    const changed = [];
    for (let i = 0; i < maxSteps; i++) {
      const top = document.elementFromPoint(x, y);
      if (!top) return { ok: false, msg: "elementFromPoint vazio" };

      // se já chegou no botão (ou algo dentro dele), acabou
      if (sameOrInside(btn, top)) {
        return { ok: true, msg: `OK: alcançável. steps=${i}`, changed };
      }

      // se o topo for root, não dá pra matar
      if (isRoot(top)) {
        return { ok: false, msg: `Topo é root (${tagInfo(top)}).`, changed };
      }

      // tenta “furar” o overlay: pointer-events none
      try {
        const prev = top.style.pointerEvents;
        top.style.pointerEvents = "none";
        changed.push({ el: top, prev, now: "none", who: tagInfo(top) });
      } catch {}

      // continua loop para ver se liberou
    }

    const finalTop = document.elementFromPoint(x, y);
    const ok = !!finalTop && sameOrInside(btn, finalTop);
    return { ok, msg: ok ? "OK após loop" : `Ainda bloqueado por: ${tagInfo(finalTop)}`, changed };
  }

  function autoUnblockMaintenanceButtons() {
    const out = $id("adminOut");

    const ids = ["btnMotherApplyImport", "btnMotherApplyPaste", "btnMotherRollback"];
    const rep = [];
    rep.push("MAINTENANCE TAP FIX (auto-unblock) ✅");
    rep.push("—");

    ids.forEach((id) => {
      const btn = $id(id);
      if (!btn) {
        rep.push(`⚠️ ${id}: não encontrado`);
        return;
      }

      const r = unblockButton(btn, 10);
      rep.push(`${r.ok ? "✅" : "❌"} ${id}: ${r.msg}`);

      // loga quem foi “desativado”
      if (r.changed && r.changed.length) {
        rep.push("  overlays desativados:");
        r.changed.slice(0, 6).forEach(c => rep.push("  - " + c.who));
        if (r.changed.length > 6) rep.push(`  - ... +${r.changed.length - 6}`);
      }
    });

    rep.push("");
    rep.push("Se os botões ainda não clicarem: tire print do topo do adminOut após esse texto.");
    if (out) out.textContent = rep.join("\n");

    try { console.log("[RCF]", rep.join("\n")); } catch {}
  }

  // -------- bundle ops --------
  async function applyBundle(bundle, opts = {}) {
    const out = $id("adminOut");
    const statusText = $id("statusText");

    const VFS = window.RCF_VFS;
    if (!VFS || typeof VFS.put !== "function") {
      const msg = "❌ RCF_VFS não está disponível. Confere se core/vfs_overrides.js carregou e se o SW está ativo.";
      if (out) out.textContent = msg;
      if (statusText) statusText.textContent = "Erro ❌";
      return;
    }

    const files = bundle && (bundle.files || bundle.overrides || bundle);
    if (!files || typeof files !== "object") {
      const msg = "❌ Bundle inválido. Use { \"files\": { \"/app.js\": \"...\" } }";
      if (out) out.textContent = msg;
      if (statusText) statusText.textContent = "Erro ❌";
      return;
    }

    const entries = Object.entries(files)
      .map(([k, v]) => [String(k || "").trim(), safeText(v)])
      .filter(([k]) => k && k.startsWith("/"));

    if (!entries.length) {
      const msg = "⚠️ Bundle vazio (nenhum path começando com /).";
      if (out) out.textContent = msg;
      if (statusText) statusText.textContent = "OK ✅";
      return;
    }

    const autoConfirmCritical = !!opts.autoConfirmCritical;
    const critical = entries.filter(([p]) => isCriticalPath(p));

    if (critical.length && !autoConfirmCritical) {
      const preview = critical.slice(0, 8).map(([p]) => "• " + p).join("\n");
      const ok = confirm(
        "Atualização CRÍTICA detectada.\n\n" +
        "Arquivos críticos:\n" + preview +
        (critical.length > 8 ? `\n... +${critical.length - 8}` : "") +
        "\n\nDeseja aplicar mesmo assim?"
      );
      if (!ok) {
        const msg = "Cancelado pelo usuário (crítico).";
        if (out) out.textContent = msg;
        if (statusText) statusText.textContent = "OK ✅";
        return;
      }
    }

    if (statusText) statusText.textContent = "Aplicando... ✅";

    const report = [];
    report.push("SELF-UPDATE (MÃE) ✅");
    report.push("—");
    report.push(`Arquivos no pacote: ${entries.length}`);
    report.push("");

    for (const [path, content] of entries) {
      try {
        await VFS.put(path, content, defaultContentType(path));
        report.push(`✅ override: ${path} (${content.length} chars)`);
      } catch (e) {
        report.push(`❌ falha: ${path} — ${e?.message || e}`);
      }
    }

    report.push("");
    report.push("Pronto. Agora recarregue a página para ver o efeito.");
    report.push("Se algo der ruim: Rollback overrides no Admin.");

    if (out) out.textContent = report.join("\n");
    if (statusText) statusText.textContent = "OK ✅";
  }

  async function loadBundleFromUrl(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} ao buscar ${url}`);
    return await r.json();
  }

  function parseBundleFromTextarea() {
    const ta = $id("motherBundleText");
    const raw = ta ? String(ta.value || "").trim() : "";
    if (!raw) return null;
    return JSON.parse(raw);
  }

  async function onApplyFromImport() {
    const out = $id("adminOut");
    try {
      const bundle = await loadBundleFromUrl("/import/mother_bundle.json");
      await applyBundle(bundle, { autoConfirmCritical: false });
    } catch (e) {
      if (out) out.textContent = "❌ Não consegui ler /import/mother_bundle.json\n" + (e?.message || e);
    }
  }

  async function onApplyFromPaste() {
    const out = $id("adminOut");
    try {
      const bundle = parseBundleFromTextarea();
      if (!bundle) {
        if (out) out.textContent = "⚠️ Cole o JSON do bundle no campo e tente de novo.";
        return;
      }
      await applyBundle(bundle, { autoConfirmCritical: false });
    } catch (e) {
      if (out) out.textContent = "❌ JSON inválido no campo.\n" + (e?.message || e);
    }
  }

  async function onRollback() {
    const out = $id("adminOut");
    const statusText = $id("statusText");
    const VFS = window.RCF_VFS;

    if (!VFS || typeof VFS.clearAll !== "function") {
      if (out) out.textContent = "❌ RCF_VFS.clearAll não está disponível.";
      return;
    }

    const ok = confirm("Tem certeza que quer REMOVER todos overrides (rollback)?");
    if (!ok) return;

    if (statusText) statusText.textContent = "Limpando... ✅";
    try {
      await VFS.clearAll();
      if (out) out.textContent = "✅ Overrides limpos. Recarregue a página.";
    } catch (e) {
      if (out) out.textContent = "❌ Falha ao limpar overrides: " + (e?.message || e);
    } finally {
      if (statusText) statusText.textContent = "OK ✅";
    }
  }

  function init() {
    // garante “vida” no touch
    try { document.body.addEventListener("touchstart", () => {}, { passive: true }); } catch {}

    const b1 = $id("btnMotherApplyImport");
    const b2 = $id("btnMotherApplyPaste");
    const b3 = $id("btnMotherRollback");

    // força clique sempre
    forceClickable(b1); forceClickable(b2); forceClickable(b3);

    // 🔥 auto-desbloqueia overlays em cima deles
    autoUnblockMaintenanceButtons();

    // bindings (mesmo se overlay existia antes, agora deve estar furado)
    bindTap(b1, onApplyFromImport);
    bindTap(b2, onApplyFromPaste);
    bindTap(b3, onRollback);

    try { console.log("[RCF] mother_selfupdate.js loaded ✅"); } catch {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { passive: true });
  } else {
    init();
  }
})();
