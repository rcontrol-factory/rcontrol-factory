/* =========================================================
  RControl Factory — core/admin.js (FULL)
  Admin UI + Maintenance Self-Update (Mãe)
  - Renderiza seção MAINTENANCE dentro do #view-admin
  - iOS-safe bindTap (click + touchend, sem duplo-fire)
  - Botões:
      - Aplicar /import/mother_bundle.json
      - Rollback overrides
      - Aplicar bundle colado
  - Armazena overrides em localStorage: rcf:mother_overrides
========================================================= */

(() => {
  "use strict";

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);

  const TAP_GUARD_MS = 450;
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
      try { fn(e); } catch (err) { log("admin tap err:", err?.message || String(err)); }
    };

    // iOS: precisa dos dois
    el.addEventListener("click", handler, { passive: false });
    el.addEventListener("touchend", handler, { passive: false });

    // garante que o elemento aceite toque
    try {
      el.style.pointerEvents = "auto";
      el.style.touchAction = "manipulation";
      el.style.webkitTapHighlightColor = "transparent";
    } catch {}
  }

  function log(...args) {
    // Se tiver logger core, usa. Se não, console.
    const L = window.RCF_LOGGER;
    if (L && typeof L.push === "function") {
      try { L.push("log", args.map(String).join(" ")); } catch {}
      return;
    }
    if (window.RCF && typeof window.RCF.log === "function") {
      try { window.RCF.log(...args); return; } catch {}
    }
    try { console.log("[RCF][ADMIN]", ...args); } catch {}
  }

  function setStatus(text) {
    const el = $("#statusText");
    if (el) el.textContent = text;
  }

  function getOverrides() {
    try { return JSON.parse(localStorage.getItem("rcf:mother_overrides") || "null"); }
    catch { return null; }
  }

  function setOverrides(obj) {
    try { localStorage.setItem("rcf:mother_overrides", JSON.stringify(obj)); } catch {}
  }

  function clearOverrides() {
    try { localStorage.removeItem("rcf:mother_overrides"); } catch {}
  }

  function templateDate(str) {
    return String(str || "").replace(/\{\{DATE\}\}/g, new Date().toLocaleString());
  }

  // ---------- UI render ----------
  function ensureMaintenanceUI() {
    const view = $("#view-admin");
    if (!view) return null;

    // já existe?
    if ($("#rcfMotherBox", view)) return $("#rcfMotherBox", view);

    // injeta depois do card principal (o primeiro .card do admin)
    const card = $(".card", view);
    if (!card) return null;

    const box = document.createElement("div");
    box.id = "rcfMotherBox";
    box.className = "card";
    box.innerHTML = `
      <h2>MAINTENANCE • Self-Update (Mãe)</h2>
      <p class="hint">
        Aplica overrides por cima do site (no iPhone) via Service Worker.
        Se quebrar, use Rollback.
      </p>

      <div class="row" style="flex-wrap:wrap">
        <button class="btn primary" id="btnMotherApplyFile" type="button">Aplicar /import/mother_bundle.json</button>
        <button class="btn danger" id="btnMotherRollback" type="button">Rollback overrides</button>
      </div>

      <div style="margin-top:10px" class="hint">Ou cole um bundle JSON aqui:</div>
      <textarea id="motherBundleText" spellcheck="false" style="
        width:100%;
        min-height:140px;
        margin-top:8px;
        border:1px solid rgba(255,255,255,.10);
        background: rgba(0,0,0,.22);
        color: rgba(255,255,255,.92);
        border-radius: 12px;
        padding: 12px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
        font-size: 13px;
        line-height: 1.45;
        outline: none;
      " placeholder='{
  "files": {
    "/core/TESTE.txt": "OK — bundle aplicado em {{DATE}}"
  }
}'></textarea>

      <div class="row" style="margin-top:10px">
        <button class="btn ok" id="btnMotherApplyPaste" type="button">Aplicar bundle colado</button>
      </div>

      <pre class="mono" id="motherOut">Pronto.</pre>
    `;

    // coloca logo abaixo do primeiro card do admin
    card.insertAdjacentElement("afterend", box);
    return box;
  }

  // ---------- Apply / Rollback ----------
  async function fetchBundleJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`fetch falhou: ${res.status}`);
    const txt = await res.text();
    return JSON.parse(txt);
  }

  function validateBundle(b) {
    if (!b || typeof b !== "object") return "Bundle inválido (não é objeto)";
    if (!b.files || typeof b.files !== "object") return "Bundle inválido: precisa de { files: {...} }";
    return "";
  }

  function normalizeBundle(b) {
    const out = { files: {} };
    for (const k of Object.keys(b.files || {})) {
      const v = b.files[k];
      out.files[String(k)] = templateDate(typeof v === "string" ? v : JSON.stringify(v));
    }
    return out;
  }

  async function notifySW(bundle) {
    // tenta avisar o SW (se estiver ativo)
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "RCF_MOTHER_APPLY",
          payload: bundle
        });
        return true;
      }
    } catch {}
    return false;
  }

  function out(text) {
    const el = $("#motherOut");
    if (el) el.textContent = String(text ?? "");
  }

  async function applyBundle(bundle, sourceLabel) {
    const err = validateBundle(bundle);
    if (err) {
      out("❌ " + err);
      setStatus("Erro ❌");
      log("MAE invalid bundle:", err);
      return;
    }

    const norm = normalizeBundle(bundle);
    setOverrides(norm);

    const swOk = await notifySW(norm);

    out(
      `✅ Bundle aplicado (${sourceLabel})\n` +
      `files: ${Object.keys(norm.files).length}\n` +
      `sw: ${swOk ? "OK" : "NOK (sem controller ainda)"}\n\n` +
      `Dica: se o SW ainda não estiver controlando, feche o PWA e abra de novo.`
    );

    setStatus("Override aplicado ✅");
    log("MAE apply:", { files: Object.keys(norm.files).length, sw: swOk ? "OK" : "NOK" });
  }

  function rollback() {
    clearOverrides();
    out("✅ Rollback feito. Overrides removidos.");
    setStatus("Rollback ✅");
    log("MAE rollback");

    // opcional: força reload pra voltar ao normal
    try { location.reload(); } catch {}
  }

  // ---------- Bind ----------
  function bindMaintenanceButtons() {
    const btnFile = $("#btnMotherApplyFile");
    const btnRollback = $("#btnMotherRollback");
    const btnPaste = $("#btnMotherApplyPaste");
    const ta = $("#motherBundleText");

    bindTap(btnFile, async () => {
      setStatus("Aplicando…");
      out("Aplicando /import/mother_bundle.json …");
      try {
        const b = await fetchBundleJSON("/import/mother_bundle.json");
        await applyBundle(b, "/import/mother_bundle.json");
      } catch (e) {
        out("❌ Falhou: " + (e?.message || String(e)));
        setStatus("Erro ❌");
        log("MAE apply file error:", e?.message || String(e));
      }
    });

    bindTap(btnRollback, () => rollback());

    bindTap(btnPaste, async () => {
      setStatus("Aplicando…");
      const raw = (ta && ta.value) ? ta.value : "";
      if (!raw.trim()) {
        out("⚠️ Cole um JSON no textarea primeiro.");
        setStatus("OK ✅");
        return;
      }
      try {
        const b = JSON.parse(raw);
        await applyBundle(b, "bundle colado");
      } catch (e) {
        out("❌ JSON inválido: " + (e?.message || String(e)));
        setStatus("Erro ❌");
      }
    });
  }

  function init() {
    const box = ensureMaintenanceUI();
    if (!box) return;

    bindMaintenanceButtons();

    // mostra se já existe override salvo
    const existing = getOverrides();
    if (existing && existing.files) {
      out(
        `ℹ️ Existe override salvo.\nfiles: ${Object.keys(existing.files).length}\n` +
        `Use Rollback se quiser remover.`
      );
      log("MAE existing overrides:", Object.keys(existing.files).length);
    }

    log("core/admin.js loaded ✅ (maintenance bound)");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
