/* =========================================================
  RControl Factory — app/js/admin.js (v3) — THOMPSON INTEGRATION (SAFE)
  - Renderiza "MAINTENANCE • Self-Update (Mãe)"
  - Botões iOS-safe (touchend+click, capture)
  - Integra com window.RCF_THOMPSON (v1+), com fallback robusto
  - SAFE mode: aplica somente via Thompson (e mostra DRY-RUN)
========================================================= */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---------- iOS safe tap ----------
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
      try { await fn(e); } catch (err) {
        writeOut("motherMaintOut", "❌ ERRO no clique: " + (err?.message || String(err)));
        setStatus("Falha ❌");
        log("ADMIN click error: " + (err?.message || String(err)));
      }
    };

    el.style.pointerEvents = "auto";
    el.style.touchAction = "manipulation";
    el.style.webkitTapHighlightColor = "transparent";

    el.addEventListener("touchend", handler, { passive: false, capture: true });
    el.addEventListener("click", handler, { passive: false, capture: true });
  }

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

  // ---------- helpers ----------
  function safeParseJSON(raw) {
    try { return JSON.parse(String(raw || "")); } catch { return null; }
  }

  function replaceDateTokens(obj) {
    // substitui {{DATE}} em strings dentro do bundle
    const iso = new Date().toISOString();
    const walk = (v) => {
      if (typeof v === "string") return v.replaceAll("{{DATE}}", iso);
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

  // ---------- Thompson adapter (robusto) ----------
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

  // ---------- UI (render) ----------
  function renderMaintenance() {
    const adminView = $("view-admin");
    if (!adminView) return;

    // evita duplicar
    if ($("motherMaintCard")) return;

    adminView.style.pointerEvents = "auto";
    adminView.style.position = "relative";
    adminView.style.zIndex = "1";

    const card = document.createElement("div");
    card.className = "card";
    card.id = "motherMaintCard";
    card.style.pointerEvents = "auto";

    card.innerHTML = `
      <h2 style="margin-top:4px">MAINTENANCE • Self-Update (Mãe)</h2>
      <p class="hint">SAFE: a Mãe só aplica via Thompson (com DRY-RUN + rollback).</p>

      <div class="row" style="flex-wrap:wrap; gap:10px; pointer-events:auto">
        <button class="btn primary" id="btnMotherApplyFile" type="button">Aplicar /import/mother_bundle.json</button>
        <button class="btn" id="btnMotherDryRun" type="button">Dry-run (prévia)</button>
        <button class="btn ok" id="btnMotherApplyPasted" type="button">Aplicar bundle colado</button>
        <button class="btn danger" id="btnMotherRollback1" type="button">Rollback (voltar 1)</button>
        <button class="btn" id="btnMotherExport" type="button">Exportar bundle atual</button>
        <button class="btn danger" id="btnMotherResetAll" type="button">Zerar tudo</button>
      </div>

      <div class="hint" style="margin:10px 0 6px 0">Cole um bundle JSON aqui:</div>
      <textarea id="motherBundleTextarea" spellcheck="false"
        style="
          width:100%;
          min-height:160px;
          border:1px solid rgba(255,255,255,.10);
          background: rgba(0,0,0,.22);
          color: rgba(255,255,255,.92);
          border-radius: 12px;
          padding: 12px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
          font-size: 13px;
          line-height: 1.45;
          outline: none;
          pointer-events:auto;
        "
      >{
  "meta": { "name": "mother-test", "version": "1.0", "createdAt": "{{DATE}}" },
  "files": {
    "/core/TESTE.txt": "OK — override ativo em {{DATE}}"
  }
}</textarea>

      <pre class="mono small" id="motherMaintOut" style="margin-top:10px; pointer-events:auto">Pronto.</pre>
    `;

    // coloca depois do primeiro card do admin (ou no fim)
    const firstCard = adminView.querySelector(".card");
    if (firstCard && firstCard.parentNode) firstCard.parentNode.insertBefore(card, firstCard.nextSibling);
    else adminView.appendChild(card);

    // força pointer-events em tudo do card
    card.querySelectorAll("*").forEach((el) => {
      try {
        el.style.pointerEvents = "auto";
        el.style.touchAction = "manipulation";
      } catch {}
    });
  }

  // ---------- Load bundle ----------
  async function loadBundleFromFile() {
    const url = "/import/mother_bundle.json?ts=" + Date.now();
    setStatus("Carregando…");
    writeOut("motherMaintOut", "Carregando: " + url);

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);

    const json = await res.json();
    return json;
  }

  function loadBundleFromPaste() {
    const ta = $("motherBundleTextarea");
    const raw = ta ? String(ta.value || "") : "";
    const json = safeParseJSON(raw);
    if (!json) throw new Error("JSON inválido.");
    return json;
  }

  // ---------- Actions ----------
  async function doDryRun(bundle) {
    // SAFE enforced
    const b = replaceDateTokens(ensureMeta(bundle));

    const r = await callT(["dryRun", "preview", "plan", "simulate"], b, { mode: "safe" });
    if (!r.ok) return r;

    // tenta extrair lista de arquivos sobrescritos (se o Thompson retornar algo)
    let files = [];
    try {
      const rr = r.res;
      if (rr && Array.isArray(rr.overwrite)) files = rr.overwrite;
      else if (rr && Array.isArray(rr.files)) files = rr.files;
      else files = Object.keys(b.files || {});
    } catch {}

    return {
      ok: true,
      msg:
        "DRY-RUN ✅ (" + r.used + ")\n" +
        "Arquivos que serão sobrescritos: " + files.length + "\n" +
        (files.length ? ("• " + files.join("\n• ")) : "")
    };
  }

  async function doApply(bundle) {
    // SAFE enforced
    const b = replaceDateTokens(ensureMeta(bundle));

    // valida (se existir)
    const v = await callT(["validate", "check", "guard"], b, { mode: "safe" });
    if (v.ok) {
      // se validate retornar algo útil, ok; se falhar, ele já daria msg
      log("THOMPSON validate OK (" + v.used + ")");
    }

    // aplica
    const r = await callT(["apply", "commit", "install"], b, { mode: "safe" });
    if (!r.ok) return r;

    return {
      ok: true,
      msg:
        "APPLY OK ✅ (" + r.used + ")\n" +
        summarizeBundle(b)
    };
  }

  async function onApplyFile() {
    try {
      const bundle = await loadBundleFromFile();
      const dr = await doDryRun(bundle);

      const out = [];
      out.push(summarizeBundle(ensureMeta(bundle)));
      out.push("");
      if (dr.ok) out.push(dr.msg);

      const ap = await doApply(bundle);
      if (ap.ok) out.push("\n" + ap.msg);
      else out.push("\n❌ " + ap.msg);

      writeOut("motherMaintOut", out.join("\n"));
      setStatus(ap.ok ? "Bundle salvo ✅" : "Falha ❌");
      log("MAE: apply file -> " + (ap.ok ? "OK" : "FAIL"));
    } catch (e) {
      writeOut("motherMaintOut", "❌ Falha: " + (e?.message || String(e)));
      setStatus("Falha ❌");
    }
  }

  async function onDryRunPasted() {
    try {
      const bundle = loadBundleFromPaste();
      const dr = await doDryRun(bundle);
      writeOut("motherMaintOut",
        summarizeBundle(ensureMeta(bundle)) +
        "\n\n" + (dr.ok ? dr.msg : ("❌ " + dr.msg))
      );
      setStatus(dr.ok ? "DRY-RUN ✅" : "Falha ❌");
    } catch (e) {
      writeOut("motherMaintOut", "❌ " + (e?.message || String(e)));
      setStatus("Falha ❌");
    }
  }

  async function onApplyPasted() {
    try {
      const bundle = loadBundleFromPaste();
      const dr = await doDryRun(bundle);

      const out = [];
      out.push(summarizeBundle(ensureMeta(bundle)));
      out.push("");
      if (dr.ok) out.push(dr.msg);

      const ap = await doApply(bundle);
      if (ap.ok) out.push("\n" + ap.msg);
      else out.push("\n❌ " + ap.msg);

      writeOut("motherMaintOut", out.join("\n"));
      setStatus(ap.ok ? "Bundle salvo ✅" : "Falha ❌");
      log("MAE: apply paste -> " + (ap.ok ? "OK" : "FAIL"));
    } catch (e) {
      writeOut("motherMaintOut", "❌ " + (e?.message || String(e)));
      setStatus("Falha ❌");
    }
  }

  async function onRollback1() {
    setStatus("Rollback…");
    const r = await callT(["rollback1", "rollback"], 1);
    if (!r.ok) {
      writeOut("motherMaintOut", "❌ " + r.msg);
      setStatus("Falha ❌");
      return;
    }
    writeOut("motherMaintOut", "✅ Rollback feito (voltar 1) ✅ (" + r.used + ")");
    setStatus("Rollback ✅");
    log("MAE: rollback1");
  }

  async function onExportCurrent() {
    setStatus("Exportando…");
    const r = await callT(["exportCurrent", "export", "dump"], {});
    if (!r.ok) {
      writeOut("motherMaintOut", "❌ " + r.msg);
      setStatus("Falha ❌");
      return;
    }

    // tenta serializar
    let txt = "";
    try { txt = JSON.stringify(r.res, null, 2); } catch { txt = String(r.res); }

    // joga no textarea + tenta copiar
    const ta = $("motherBundleTextarea");
    if (ta) ta.value = txt;

    try { await navigator.clipboard.writeText(txt); } catch {}

    writeOut("motherMaintOut", "✅ Export OK (" + r.used + ")\nBundle jogado no textarea (e tentei copiar).");
    setStatus("Export ✅");
    log("MAE: export");
  }

  async function onResetAll() {
    setStatus("Zerando…");
    const r = await callT(["resetAll", "clearAll", "wipe"], {});
    if (!r.ok) {
      writeOut("motherMaintOut", "❌ " + r.msg);
      setStatus("Falha ❌");
      return;
    }
    writeOut("motherMaintOut", "✅ Zerou tudo ✅ (" + r.used + ")");
    setStatus("OK ✅");
    log("MAE: resetAll");
  }

  // ---------- Bind ----------
  function bindMaintenanceButtons() {
    renderMaintenance();

    bindTap($("btnMotherApplyFile"), onApplyFile);
    bindTap($("btnMotherDryRun"), onDryRunPasted);
    bindTap($("btnMotherApplyPasted"), onApplyPasted);
    bindTap($("btnMotherRollback1"), onRollback1);
    bindTap($("btnMotherExport"), onExportCurrent);
    bindTap($("btnMotherResetAll"), onResetAll);
  }

  function init() {
    bindMaintenanceButtons();

    // feedback no painel adminOut
    const T = getThompson();
    const tOk = !!T;
    const line = "MAE v3 ✅ " + (tOk ? "Thompson OK" : "Thompson NÃO encontrado");
    const adminOut = $("adminOut");
    if (adminOut) {
      const prev = (adminOut.textContent || "Pronto.").trim();
      adminOut.textContent = prev + "\n\n" + line;
    }
    log(line);
    setStatus("OK ✅");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
