/* =========================================================
  RControl Factory — app/js/admin.js (v3 FULL)
  MAE (Self-Update) + THOMPSON (SAFE/CONDICIONAL)

  - Renderiza card MAINTENANCE no Admin
  - Botões iOS-safe: touchend + click (capture + preventDefault)
  - Fluxos:
      • Aplicar /import/mother_bundle.json (com cache-bust)
      • Dry-run (prévia do bundle colado)
      • Aplicar bundle colado
      • Rollback (voltar 1)
      • Exportar bundle atual
      • Zerar tudo
  - SAFE condicional:
      • Se bundle tocar arquivos críticos -> exige checkbox "Confirmo..."
========================================================= */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // -----------------------------
  // iOS safe tap
  // -----------------------------
  const TAP_GUARD_MS = 450;
  let _lastTapAt = 0;

  function bindTap(el, fn) {
    if (!el) return;

    const handler = async (e) => {
      const now = Date.now();
      if (now - _lastTapAt < TAP_GUARD_MS) {
        try { e.preventDefault(); e.stopPropagation(); } catch {}
        return;
      }
      _lastTapAt = now;

      try { e.preventDefault(); e.stopPropagation(); } catch {}
      try { await fn(e); }
      catch (err) {
        writeOut("motherMaintOut", "❌ ERRO: " + (err?.message || String(err)));
        setStatus("Falha ❌");
        log("MAE click error: " + (err?.message || String(err)));
      }
    };

    try {
      el.style.pointerEvents = "auto";
      el.style.touchAction = "manipulation";
      el.style.webkitTapHighlightColor = "transparent";
    } catch {}

    el.addEventListener("touchend", handler, { passive: false, capture: true });
    el.addEventListener("click", handler, { passive: false, capture: true });
  }

  // -----------------------------
  // UI helpers
  // -----------------------------
  function setStatus(text) {
    const el = $("statusText");
    if (el) el.textContent = String(text || "");
  }

  function writeOut(id, text) {
    const el = $(id);
    if (el) el.textContent = String(text || "");
  }

  function log(msg) {
    try {
      if (window.RCF_LOGGER && typeof window.RCF_LOGGER.push === "function") {
        window.RCF_LOGGER.push("log", msg);
      } else if (window.RCF && typeof window.RCF.log === "function") {
        window.RCF.log(msg);
      } else {
        console.log("[RCF ADMIN]", msg);
      }
    } catch {}
  }

  // -----------------------------
  // Thompson adapter
  // -----------------------------
  function getThompson() {
    return window.RCF_THOMPSON || window.THOMPSON || null;
  }

  async function callT(methodNames, ...args) {
    const T = getThompson();
    if (!T) return { ok: false, msg: "THOMPSON não encontrado (window.RCF_THOMPSON)." };

    for (const name of methodNames) {
      const fn = T && T[name];
      if (typeof fn === "function") {
        try {
          const r = await fn.apply(T, args);
          return { ok: true, res: r, used: name };
        } catch (e) {
          return { ok: false, msg: `THOMPSON.${name} erro: ` + (e?.message || String(e)) };
        }
      }
    }
    return { ok: false, msg: "THOMPSON sem método: " + methodNames.join(" | ") };
  }

  // -----------------------------
  // SAFE / Condicional
  // -----------------------------
  const CRITICAL_PATHS = [
    "/index.html",
    "/app.js",
    "/core/ui_bindings.js",
    "/core/commands.js",
    "/core/patchset.js",
    "/core/patch.js",
    "/core/selfheal.js",
    "/sw.js",
    "/service-worker.js",
  ];

  function isCriticalPath(p) {
    const path = String(p || "").trim();
    return CRITICAL_PATHS.includes(path);
  }

  function guardBundleOrThrow(bundle) {
    // Padrão: SAFE sempre. Se tocar critical -> exige checkbox.
    const files = bundle?.files && typeof bundle.files === "object" ? Object.keys(bundle.files) : [];
    const critical = files.filter(isCriticalPath);

    if (critical.length) {
      const chk = $("motherConfirmCritical");
      const ok = !!(chk && chk.checked);
      if (!ok) {
        throw new Error(
          "SAFE MODE: bundle toca arquivo CRÍTICO.\n" +
          "Marque 'Confirmo aplicar...' antes.\n\nCríticos:\n- " +
          critical.slice(0, 12).join("\n- ") +
          (critical.length > 12 ? `\n… +${critical.length - 12}` : "")
        );
      }
    }

    return { files, critical };
  }

  // -----------------------------
  // Bundle helpers
  // -----------------------------
  function safeParseJSON(raw) {
    try { return JSON.parse(String(raw || "")); } catch { return null; }
  }

  function replaceDateTokens(obj) {
    const iso = new Date().toISOString();
    const walk = (v) => {
      if (typeof v === "string") return v.split("{{DATE}}").join(iso);
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === "object") {
        const out = {};
        for (const k of Object.keys(v)) out[k] = walk(v[k]);
        return out;
      }
      return v;
    };
    return walk(obj);
  }

  function ensureMeta(bundle) {
    if (!bundle || typeof bundle !== "object") return bundle;
    if (!bundle.meta) bundle.meta = {};
    if (!bundle.meta.name) bundle.meta.name = "mother-bundle";
    if (!bundle.meta.version) bundle.meta.version = "1.0";
    if (!bundle.meta.createdAt) bundle.meta.createdAt = "{{DATE}}";
    return bundle;
  }

  function summarizeBundle(bundle) {
    const files = bundle?.files && typeof bundle.files === "object" ? Object.keys(bundle.files) : [];
    const meta = bundle?.meta || {};
    return [
      "name: " + (meta.name || "-"),
      "version: " + (meta.version || "-"),
      "createdAt: " + (meta.createdAt || "-"),
      "files: " + files.length
    ].join("\n");
  }

  function renderDryRunReport(rep, bundle, guardInfo) {
    const lines = [];
    lines.push("DRY-RUN ✅");
    lines.push(summarizeBundle(bundle));
    lines.push("");
    lines.push("Arquivos no bundle: " + (guardInfo.files.length || 0));
    guardInfo.files.slice(0, 20).forEach(p => lines.push("• " + p));
    if (guardInfo.files.length > 20) lines.push("… + " + (guardInfo.files.length - 20));

    if (guardInfo.critical.length) {
      lines.push("");
      lines.push("⚠️ CRÍTICOS detectados:");
      guardInfo.critical.slice(0, 20).forEach(p => lines.push("• " + p));
      if (guardInfo.critical.length > 20) lines.push("… + " + (guardInfo.critical.length - 20));
    }

    // se Thompson retornar alguma lista útil, tenta mostrar
    try {
      const rr = rep || {};
      const changed = rr.changed || rr.overwrite || rr.files || null;
      if (Array.isArray(changed) && changed.length) {
        lines.push("");
        lines.push("Thompson preview:");
        changed.slice(0, 20).forEach(p => lines.push("• " + p));
        if (changed.length > 20) lines.push("… + " + (changed.length - 20));
      }
    } catch {}

    return lines.join("\n");
  }

  // -----------------------------
  // Render card
  // -----------------------------
  function renderMaintenanceCard() {
    const adminView = $("view-admin");
    if (!adminView) return;

    if ($("motherMaintCard")) return;

    try {
      adminView.style.pointerEvents = "auto";
      adminView.style.position = "relative";
      adminView.style.zIndex = "1";
    } catch {}

    const card = document.createElement("div");
    card.className = "card";
    card.id = "motherMaintCard";
    card.style.pointerEvents = "auto";

    card.innerHTML = `
      <h2 style="margin-top:4px">MAINTENANCE • Self-Update (Mãe)</h2>
      <p class="hint">SAFE condicional: sempre faz DRY-RUN; se tocar arquivo crítico exige confirmação.</p>

      <div class="row" style="flex-wrap:wrap; gap:10px">
        <button class="btn primary" id="btnMotherApplyFile" type="button">Aplicar /import/mother_bundle.json</button>
        <button class="btn" id="btnMotherDryRun" type="button">Dry-run (prévia)</button>
        <button class="btn ok" id="btnMotherApplyPasted" type="button">Aplicar bundle colado</button>
        <button class="btn danger" id="btnMotherRollback1" type="button">Rollback (voltar 1)</button>
        <button class="btn" id="btnMotherExport" type="button">Exportar bundle atual</button>
        <button class="btn danger" id="btnMotherResetAll" type="button">Zerar tudo</button>
      </div>

      <div style="margin-top:10px; padding:10px; border:1px dashed rgba(255,255,255,.15); border-radius:14px">
        <label style="display:flex; gap:10px; align-items:center">
          <input id="motherConfirmCritical" type="checkbox" />
          <span class="hint">Confirmo aplicar mesmo se tiver arquivo crítico (SAFE)</span>
        </label>
      </div>

      <div class="hint" style="margin:10px 0 6px 0">Cole um bundle JSON aqui:</div>
      <textarea id="motherBundleTextarea" spellcheck="false"
        style="
          width:100%;
          min-height:170px;
          border:1px solid rgba(255,255,255,.10);
          background: rgba(0,0,0,.22);
          color: rgba(255,255,255,.92);
          border-radius: 12px;
          padding: 12px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
          font-size: 13px;
          line-height: 1.45;
          outline: none;
        "
      >{
  "meta": { "name":"mother-test", "version":"1.0", "createdAt":"{{DATE}}" },
  "files": {
    "/core/TESTE.txt": "OK — override ativo em {{DATE}}"
  }
}</textarea>

      <pre class="mono small" id="motherMaintOut" style="margin-top:10px">Pronto.</pre>
    `;

    const firstCard = adminView.querySelector(".card");
    if (firstCard && firstCard.parentNode) firstCard.parentNode.insertBefore(card, firstCard.nextSibling);
    else adminView.appendChild(card);

    // força pointer-events
    card.querySelectorAll("*").forEach((el) => {
      try { el.style.pointerEvents = "auto"; el.style.touchAction = "manipulation"; } catch {}
    });
  }

  // -----------------------------
  // Load bundles
  // -----------------------------
  async function loadBundleFromImport() {
    const url = "/import/mother_bundle.json?ts=" + Date.now();
    setStatus("Carregando…");
    writeOut("motherMaintOut", "Carregando: " + url);

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);

    return await res.json();
  }

  function loadBundleFromPaste() {
    const ta = $("motherBundleTextarea");
    const raw = ta ? String(ta.value || "") : "";
    const json = safeParseJSON(raw);
    if (!json) throw new Error("JSON inválido.");
    return json;
  }

  // -----------------------------
  // Actions
  // -----------------------------
  async function doDryRun(bundle) {
    const b = replaceDateTokens(ensureMeta(bundle));
    const guardInfo = guardBundleOrThrow({ files: b.files }); // só pra extrair lista; confirmação só exigimos no APPLY
    // dry-run pelo Thompson se existir
    const r = await callT(["dryRun", "preview", "plan", "simulate"], b, { mode: "safe" });
    return { bundle: b, rep: r.ok ? r.res : null, ok: r.ok, msg: r.ok ? ("OK (" + r.used + ")") : r.msg, guardInfo };
  }

  async function doApply(bundle) {
    const b = replaceDateTokens(ensureMeta(bundle));

    // SAFE condicional: trava críticos sem checkbox
    const files = b?.files && typeof b.files === "object" ? Object.keys(b.files) : [];
    const critical = files.filter(isCriticalPath);
    if (critical.length) {
      const chk = $("motherConfirmCritical");
      const ok = !!(chk && chk.checked);
      if (!ok) {
        throw new Error(
          "SAFE MODE: bundle toca arquivo CRÍTICO.\n" +
          "Marque 'Confirmo aplicar...' antes.\n\nCríticos:\n- " +
          critical.slice(0, 12).join("\n- ")
        );
      }
    }

    // aplica via Thompson
    const r = await callT(["apply", "commit", "install"], b, { mode: "safe" });
    if (!r.ok) throw new Error(r.msg);
    return { used: r.used, bundle: b };
  }

  async function onApplyFile() {
    const bundle = await loadBundleFromImport();
    const b = replaceDateTokens(ensureMeta(bundle));

    // mostra DRY-RUN antes
    setStatus("Dry-run…");
    const dr = await callT(["dryRun", "preview", "plan", "simulate"], b, { mode: "safe" });

    const guardInfo = { files: Object.keys(b.files || {}), critical: Object.keys(b.files || {}).filter(isCriticalPath) };
    writeOut("motherMaintOut", renderDryRunReport(dr.ok ? dr.res : null, b, guardInfo));

    // aplica
    setStatus("Aplicando…");
    const ap = await doApply(b);

    writeOut("motherMaintOut",
      renderDryRunReport(dr.ok ? dr.res : null, b, guardInfo) +
      "\n\nAPPLY ✅ (" + ap.used + ")\n" + summarizeBundle(ap.bundle)
    );

    setStatus("Bundle salvo ✅");
    log("MAE apply file OK");
  }

  async function onDryRunPasted() {
    const bundle = loadBundleFromPaste();
    const b = replaceDateTokens(ensureMeta(bundle));

    setStatus("Dry-run…");
    const dr = await callT(["dryRun", "preview", "plan", "simulate"], b, { mode: "safe" });

    const guardInfo = { files: Object.keys(b.files || {}), critical: Object.keys(b.files || {}).filter(isCriticalPath) };
    writeOut("motherMaintOut", renderDryRunReport(dr.ok ? dr.res : null, b, guardInfo));
    setStatus(dr.ok ? "Dry-run ✅" : "Dry-run (fallback) ✅");
  }

  async function onApplyPasted() {
    const bundle = loadBundleFromPaste();
    const b = replaceDateTokens(ensureMeta(bundle));

    setStatus("Dry-run…");
    const dr = await callT(["dryRun", "preview", "plan", "simulate"], b, { mode: "safe" });
    const guardInfo = { files: Object.keys(b.files || {}), critical: Object.keys(b.files || {}).filter(isCriticalPath) };

    writeOut("motherMaintOut", renderDryRunReport(dr.ok ? dr.res : null, b, guardInfo));

    setStatus("Aplicando…");
    const ap = await doApply(b);

    writeOut("motherMaintOut",
      renderDryRunReport(dr.ok ? dr.res : null, b, guardInfo) +
      "\n\nAPPLY ✅ (" + ap.used + ")\n" + summarizeBundle(ap.bundle)
    );

    setStatus("Bundle salvo ✅");
    log("MAE apply pasted OK");
  }

  async function onRollback1() {
    setStatus("Rollback…");
    const r = await callT(["rollback", "rollback1"], 1);
    if (!r.ok) throw new Error(r.msg);
    writeOut("motherMaintOut", "✅ Rollback feito (voltar 1) ✅ (" + r.used + ")\nRecarregue a página se precisar.");
    setStatus("Rollback ✅");
    log("MAE rollback1");
  }

  async function onExportCurrent() {
    setStatus("Exportando…");
    const r = await callT(["exportCurrent", "export", "dump"], {});
    if (!r.ok) throw new Error(r.msg);

    let txt = "";
    try { txt = JSON.stringify(r.res, null, 2); } catch { txt = String(r.res); }

    const ta = $("motherBundleTextarea");
    if (ta) ta.value = txt;

    try { await navigator.clipboard.writeText(txt); } catch {}
    writeOut("motherMaintOut", "✅ Export OK (" + r.used + ")\nBundle jogado no textarea (e tentei copiar).");
    setStatus("Export ✅");
    log("MAE export");
  }

  async function onResetAll() {
    setStatus("Zerando…");
    const r = await callT(["resetAll", "clearAll", "wipe"], {});
    if (!r.ok) throw new Error(r.msg);
    writeOut("motherMaintOut", "✅ Zerou tudo ✅ (" + r.used + ")");
    setStatus("OK ✅");
    log("MAE resetAll");
  }

  // -----------------------------
  // Boot
  // -----------------------------
  function bind() {
    renderMaintenanceCard();

    bindTap($("btnMotherApplyFile"), onApplyFile);
    bindTap($("btnMotherDryRun"), onDryRunPasted);
    bindTap($("btnMotherApplyPasted"), onApplyPasted);
    bindTap($("btnMotherRollback1"), onRollback1);
    bindTap($("btnMotherExport"), onExportCurrent);
    bindTap($("btnMotherResetAll"), onResetAll);

    const T = getThompson();
    const adminOut = $("adminOut");
    const line = "MAE v3 ✅ " + (T ? "Thompson OK" : "Thompson NÃO encontrado");
    if (adminOut) adminOut.textContent = ((adminOut.textContent || "Pronto.").trim() + "\n\n" + line);

    log(line);
    setStatus("OK ✅");
  }

  function init() {
    bind();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
