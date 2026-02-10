/* RControl Factory — app/js/admin.js (FULL) — Mother Bundle Receiver v1.0
   - Botões clicáveis (iOS safe)
   - Aplica bundle via:
        1) /import/mother_bundle.json
        2) JSON colado
   - Salva em localStorage (rcf:mother_bundle)
   - Responde o Service Worker com o bundle (postMessage channel)
*/

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ============ iOS safe tap ============
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
      try { fn(e); } catch (err) {
        writeOut("motherMaintOut", "ERRO: " + (err?.message || String(err)));
      }
    };
    el.style.pointerEvents = "auto";
    el.style.touchAction = "manipulation";
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
      if (window.RCF && typeof window.RCF.log === "function") window.RCF.log(msg);
      else console.log("[RCF ADMIN]", msg);
    } catch {}
  }

  // ============ bundle storage ============
  const KEY_BUNDLE = "rcf:mother_bundle";
  const KEY_AT = "rcf:mother_bundle_at";

  function stampPlaceholders(str) {
    return String(str || "").replaceAll("{{DATE}}", new Date().toISOString());
  }

  function validateBundle(obj) {
    if (!obj || typeof obj !== "object") return { ok: false, msg: "Bundle não é objeto" };
    if (!obj.files || typeof obj.files !== "object") return { ok: false, msg: "Bundle precisa de 'files' (objeto)" };

    const keys = Object.keys(obj.files);
    if (!keys.length) return { ok: false, msg: "Bundle 'files' está vazio" };

    for (const k of keys) {
      if (!k.startsWith("/")) return { ok: false, msg: `Path inválido: ${k} (precisa começar com /)` };
      if (typeof obj.files[k] !== "string") return { ok: false, msg: `Conteúdo de ${k} precisa ser string` };
    }
    return { ok: true, msg: "OK" };
  }

  function saveBundle(obj) {
    // aplica {{DATE}} nos valores
    const fixed = { ...obj, files: { ...obj.files } };
    Object.keys(fixed.files).forEach((k) => fixed.files[k] = stampPlaceholders(fixed.files[k]));

    localStorage.setItem(KEY_BUNDLE, JSON.stringify(fixed));
    localStorage.setItem(KEY_AT, new Date().toISOString());
    return fixed;
  }

  function loadBundle() {
    try {
      const raw = localStorage.getItem(KEY_BUNDLE);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function clearBundle() {
    try { localStorage.removeItem(KEY_BUNDLE); } catch {}
    try { localStorage.removeItem(KEY_AT); } catch {}
  }

  // ============ UI render ============
  function renderMaintenanceCard() {
    const adminView = $("view-admin");
    if (!adminView) return;
    if ($("motherMaintCard")) return;

    const card = document.createElement("div");
    card.className = "card";
    card.id = "motherMaintCard";

    card.innerHTML = `
      <h2 style="margin-top:4px">MAINTENANCE • Self-Update (Mãe)</h2>
      <p class="hint">Recebe um bundle JSON e ativa overrides via Service Worker.</p>

      <div class="row" style="flex-wrap:wrap; gap:10px">
        <button class="btn primary" id="btnMotherApplyFile" type="button">
          Aplicar /import/mother_bundle.json
        </button>
        <button class="btn ok" id="btnMotherApplyPasted" type="button">
          Aplicar bundle colado
        </button>
        <button class="btn danger" id="btnMotherRollback" type="button">
          Rollback overrides
        </button>
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
        "
      >{
  "meta": { "name": "mother-test", "version": "1.0", "createdAt": "{{DATE}}" },
  "files": {
    "/core/TESTE.txt": "OK — override ativo em {{DATE}}"
  }
}</textarea>

      <pre class="mono small" id="motherMaintOut" style="margin-top:10px">Pronto.</pre>
    `;

    adminView.appendChild(card);

    // força clique no card inteiro
    card.style.pointerEvents = "auto";
    card.querySelectorAll("*").forEach((el) => {
      if (el && el.style) el.style.pointerEvents = "auto";
    });
  }

  // ============ actions ============
  async function applyFromFile() {
    setStatus("Aplicando…");
    writeOut("motherMaintOut", "Carregando /import/mother_bundle.json …");

    const url = "/import/mother_bundle.json?ts=" + Date.now();
    let json;

    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      json = await res.json();
    } catch (e) {
      writeOut("motherMaintOut", "❌ Falha ao carregar " + url + "\n" + (e?.message || String(e)));
      setStatus("Falha ❌");
      return;
    }

    const v = validateBundle(json);
    if (!v.ok) {
      writeOut("motherMaintOut", "❌ Bundle inválido: " + v.msg);
      setStatus("Inválido ❌");
      return;
    }

    const saved = saveBundle(json);
    const count = Object.keys(saved.files).length;

    writeOut("motherMaintOut", `✅ Bundle carregado e salvo.\nArquivos no bundle: ${count}\n\nAgora o SW vai servir overrides automaticamente.`);
    setStatus("Bundle salvo ✅");
    log("MAE: bundle salvo via arquivo (" + count + ")");
  }

  function applyFromPaste() {
    setStatus("Aplicando…");
    const ta = $("motherBundleTextarea");
    const raw = ta ? String(ta.value || "") : "";

    let json;
    try { json = JSON.parse(raw); }
    catch (e) {
      writeOut("motherMaintOut", "❌ JSON inválido.\n" + (e?.message || String(e)));
      setStatus("JSON inválido ❌");
      return;
    }

    const v = validateBundle(json);
    if (!v.ok) {
      writeOut("motherMaintOut", "❌ Bundle inválido: " + v.msg);
      setStatus("Inválido ❌");
      return;
    }

    const saved = saveBundle(json);
    const count = Object.keys(saved.files).length;

    writeOut("motherMaintOut", `✅ Bundle colado salvo.\nArquivos no bundle: ${count}\n\nAgora o SW vai servir overrides automaticamente.`);
    setStatus("Bundle salvo ✅");
    log("MAE: bundle salvo via colado (" + count + ")");
  }

  function rollback() {
    clearBundle();
    writeOut("motherMaintOut", "✅ Rollback feito (bundle apagado).");
    setStatus("Rollback ✅");
    log("MAE: rollback");
  }

  // ============ Service Worker bridge ============
  // SW manda: { type:"RCF_GET_MOTHER_BUNDLE" } e espera receber o bundle
  function setupSWBridge() {
    if (!navigator.serviceWorker) return;

    navigator.serviceWorker.addEventListener("message", (event) => {
      const msg = event.data || {};
      if (msg.type === "RCF_GET_MOTHER_BUNDLE") {
        const bundle = loadBundle();
        // responde usando MessageChannel (port)
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage(bundle);
        }
      }
    });
  }

  // ============ init ============
  function init() {
    renderMaintenanceCard();

    bindTap($("btnMotherApplyFile"), applyFromFile);
    bindTap($("btnMotherApplyPasted"), applyFromPaste);
    bindTap($("btnMotherRollback"), rollback);

    setupSWBridge();

    const saved = loadBundle();
    if (saved) {
      const at = localStorage.getItem(KEY_AT) || "";
      const count = saved.files ? Object.keys(saved.files).length : 0;
      writeOut("motherMaintOut", `Bundle já existe ✅\nArquivos: ${count}\n${at ? ("Salvo em: " + at) : ""}`);
      setStatus("Bundle salvo ✅");
    }

    // marca visível
    const prev = $("adminOut") ? $("adminOut").textContent || "Pronto." : "Pronto.";
    writeOut("adminOut", prev + "\n\nMAE receiver v1.0 ✅ (admin.js)");
    log("MAE receiver v1.0 carregado");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
