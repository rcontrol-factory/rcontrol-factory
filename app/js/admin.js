/* RControl Factory — app/js/admin.js (FULL) — Mother Receiver v2
   - Dry-run: valida e lista arquivos que serão sobrescritos
   - Apply: salva bundle atual + histórico (últimas 10)
   - Rollback: volta para o bundle anterior
   - Export: copia bundle atual
   - Bridge SW: responde bundle atual via postMessage (MessageChannel)
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

  // ============ storage keys ============
  const KEY_BUNDLE = "rcf:mother_bundle";
  const KEY_AT = "rcf:mother_bundle_at";
  const KEY_HIST = "rcf:mother_bundle_history"; // array

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function stampPlaceholders(str) {
    return String(str || "").replaceAll("{{DATE}}", new Date().toISOString());
  }

  function normalizeBundle(obj) {
    const fixed = { ...obj };
    fixed.meta = fixed.meta && typeof fixed.meta === "object" ? fixed.meta : {};
    fixed.files = fixed.files && typeof fixed.files === "object" ? { ...fixed.files } : {};
    // aplica {{DATE}}
    Object.keys(fixed.files).forEach((k) => {
      fixed.files[k] = stampPlaceholders(fixed.files[k]);
    });
    if (!fixed.meta.version) fixed.meta.version = "v" + Date.now();
    if (!fixed.meta.createdAt) fixed.meta.createdAt = new Date().toISOString();
    return fixed;
  }

  function validateBundle(obj) {
    if (!obj || typeof obj !== "object") return { ok: false, msg: "Bundle não é objeto" };
    if (!obj.files || typeof obj.files !== "object") return { ok: false, msg: "Bundle precisa de 'files' (objeto)" };

    const keys = Object.keys(obj.files);
    if (!keys.length) return { ok: false, msg: "Bundle 'files' está vazio" };

    for (const k of keys) {
      if (!k.startsWith("/")) return { ok: false, msg: `Path inválido: ${k} (precisa começar com /)` };
      if (k === "/sw.js") return { ok: false, msg: "Segurança: não permitir override de /sw.js" };
      if (typeof obj.files[k] !== "string") return { ok: false, msg: `Conteúdo de ${k} precisa ser string` };
    }
    return { ok: true, msg: "OK" };
  }

  function loadBundle() {
    const raw = localStorage.getItem(KEY_BUNDLE);
    if (!raw) return null;
    return safeJsonParse(raw, null);
  }

  function loadHistory() {
    const raw = localStorage.getItem(KEY_HIST);
    const arr = safeJsonParse(raw, []);
    return Array.isArray(arr) ? arr : [];
  }

  function saveHistory(arr) {
    const list = Array.isArray(arr) ? arr.slice(0, 10) : [];
    localStorage.setItem(KEY_HIST, JSON.stringify(list));
  }

  function saveBundle(obj) {
    const fixed = normalizeBundle(obj);
    localStorage.setItem(KEY_BUNDLE, JSON.stringify(fixed));
    localStorage.setItem(KEY_AT, new Date().toISOString());

    // histórico: empilha “antes” se existir
    const prev = loadBundle();
    if (prev) {
      const hist = loadHistory();
      hist.unshift(prev);
      saveHistory(hist);
    }

    return fixed;
  }

  function setBundleDirect(obj) {
    // usado no rollback: não empilha histórico de novo
    const fixed = normalizeBundle(obj);
    localStorage.setItem(KEY_BUNDLE, JSON.stringify(fixed));
    localStorage.setItem(KEY_AT, new Date().toISOString());
    return fixed;
  }

  function clearAllBundles() {
    try { localStorage.removeItem(KEY_BUNDLE); } catch {}
    try { localStorage.removeItem(KEY_AT); } catch {}
    try { localStorage.removeItem(KEY_HIST); } catch {}
  }

  function bundleSummary(b) {
    if (!b || !b.files) return "(sem bundle)";
    const count = Object.keys(b.files).length;
    const ver = b.meta?.version || "-";
    const name = b.meta?.name || "-";
    const at = b.meta?.createdAt || localStorage.getItem(KEY_AT) || "-";
    return `name: ${name}\nversion: ${ver}\ncreatedAt: ${at}\nfiles: ${count}`;
  }

  function dryRunText(b) {
    const keys = Object.keys(b.files || {});
    keys.sort();
    const head = `DRY-RUN ✅\nArquivos que serão sobrescritos: ${keys.length}\n—`;
    const list = keys.map((k) => `• ${k}`).join("\n");
    return head + "\n" + (list || "(vazio)");
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
      <p class="hint">Recebe bundle JSON, faz dry-run, aplica e permite rollback por versão.</p>

      <div class="row" style="flex-wrap:wrap; gap:10px">
        <button class="btn primary" id="btnMotherApplyFile" type="button">Aplicar /import/mother_bundle.json</button>
        <button class="btn" id="btnMotherDryRun" type="button">Dry-run (prévia)</button>
        <button class="btn ok" id="btnMotherApplyPasted" type="button">Aplicar bundle colado</button>
        <button class="btn danger" id="btnMotherRollback" type="button">Rollback (voltar 1)</button>
        <button class="btn" id="btnMotherExport" type="button">Exportar bundle atual</button>
        <button class="btn danger" id="btnMotherNuke" type="button">Zerar tudo</button>
      </div>

      <div class="hint" style="margin:10px 0 6px 0">Cole um bundle JSON aqui:</div>
      <textarea id="motherBundleTextarea" spellcheck="false"
        style="width:100%;min-height:170px;border:1px solid rgba(255,255,255,.10);
               background: rgba(0,0,0,.22);color: rgba(255,255,255,.92);border-radius: 12px;
               padding: 12px;font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
               font-size: 13px;line-height: 1.45;outline: none;"
      >{
  "meta": { "name": "mother-test", "version": "1.0", "createdAt": "{{DATE}}" },
  "files": {
    "/core/TESTE.txt": "OK — override ativo em {{DATE}}"
  }
}</textarea>

      <pre class="mono small" id="motherMaintOut" style="margin-top:10px">Pronto.</pre>
      <pre class="mono small" id="motherHistOut" style="margin-top:10px">Histórico: (vazio)</pre>
    `;

    adminView.appendChild(card);

    // força clique no card inteiro
    card.style.pointerEvents = "auto";
    card.querySelectorAll("*").forEach((el) => {
      if (el && el.style) el.style.pointerEvents = "auto";
    });
  }

  function renderHistory() {
    const out = $("motherHistOut");
    if (!out) return;

    const hist = loadHistory();
    if (!hist.length) {
      out.textContent = "Histórico: (vazio)";
      return;
    }

    const lines = [];
    lines.push("Histórico (últimas versões):");
    hist.slice(0, 10).forEach((b, i) => {
      const count = b?.files ? Object.keys(b.files).length : 0;
      const ver = b?.meta?.version || "-";
      const name = b?.meta?.name || "-";
      const at = b?.meta?.createdAt || "-";
      lines.push(`${i + 1}) ${name} • ${ver} • files=${count} • ${at}`);
    });

    out.textContent = lines.join("\n");
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

    const fixed = saveBundle(json);
    const count = Object.keys(fixed.files).length;
    writeOut("motherMaintOut",
      `✅ APPLY OK\n${bundleSummary(fixed)}\n\n` + dryRunText(fixed)
    );
    setStatus("Bundle salvo ✅");
    renderHistory();
    log("MAE: apply via arquivo (" + count + ")");
  }

  function parsePastedBundle() {
    const ta = $("motherBundleTextarea");
    const raw = ta ? String(ta.value || "") : "";
    const json = JSON.parse(raw);
    return json;
  }

  function dryRun() {
    setStatus("Dry-run…");

    let json;
    try { json = parsePastedBundle(); }
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

    const fixed = normalizeBundle(json);
    writeOut("motherMaintOut", dryRunText(fixed));
    setStatus("Prévia ✅");
  }

  function applyFromPaste() {
    setStatus("Aplicando…");

    let json;
    try { json = parsePastedBundle(); }
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

    const fixed = saveBundle(json);
    const count = Object.keys(fixed.files).length;
    writeOut("motherMaintOut",
      `✅ APPLY OK\n${bundleSummary(fixed)}\n\n` + dryRunText(fixed)
    );
    setStatus("Bundle salvo ✅");
    renderHistory();
    log("MAE: apply via colado (" + count + ")");
  }

  function rollbackOne() {
    setStatus("Rollback…");

    const hist = loadHistory();
    if (!hist.length) {
      writeOut("motherMaintOut", "⚠️ Sem histórico para rollback.");
      setStatus("Sem histórico ⚠️");
      return;
    }

    const prev = hist.shift();
    saveHistory(hist);
    const fixed = setBundleDirect(prev);

    writeOut("motherMaintOut", "✅ ROLLBACK OK\n" + bundleSummary(fixed));
    setStatus("Rollback ✅");
    renderHistory();
    log("MAE: rollback 1");
  }

  async function exportCurrent() {
    const cur = loadBundle();
    if (!cur) {
      writeOut("motherMaintOut", "⚠️ Não existe bundle atual para exportar.");
      return;
    }
    const text = JSON.stringify(cur, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      writeOut("motherMaintOut", "✅ Bundle atual copiado pro clipboard.");
      setStatus("Copiado ✅");
    } catch {
      writeOut("motherMaintOut", "⚠️ iOS bloqueou clipboard. Copie manualmente do box.");
      setStatus("OK ✅");
    }
  }

  function nukeAll() {
    clearAllBundles();
    writeOut("motherMaintOut", "✅ ZERADO. Bundle atual + histórico removidos.");
    setStatus("OK ✅");
    renderHistory();
    log("MAE: nuke");
  }

  // ============ Service Worker bridge ============
  function setupSWBridge() {
    if (!navigator.serviceWorker) return;

    navigator.serviceWorker.addEventListener("message", (event) => {
      const msg = event.data || {};
      if (msg.type === "RCF_GET_MOTHER_BUNDLE") {
        const bundle = loadBundle();
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage(bundle);
        }
      }
    });
  }

  function init() {
    renderMaintenanceCard();

    bindTap($("btnMotherApplyFile"), applyFromFile);
    bindTap($("btnMotherDryRun"), dryRun);
    bindTap($("btnMotherApplyPasted"), applyFromPaste);
    bindTap($("btnMotherRollback"), rollbackOne);
    bindTap($("btnMotherExport"), exportCurrent);
    bindTap($("btnMotherNuke"), nukeAll);

    setupSWBridge();
    renderHistory();

    const cur = loadBundle();
    if (cur) {
      writeOut("motherMaintOut", "Bundle atual ✅\n" + bundleSummary(cur));
      setStatus("Bundle salvo ✅");
    }

    // marca visível
    const prev = $("adminOut") ? $("adminOut").textContent || "Pronto." : "Pronto.";
    writeOut("adminOut", prev + "\n\nMAE v2 ✅ (dry-run + rollback)");
    log("MAE v2 carregado");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
