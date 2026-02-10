/* =========================================================
  RControl Factory — admin.js (FULL) v2.1
  MAE (Mother) Self-Update:
  - Carrega bundle /import/mother_bundle.json
  - Cola bundle manual
  - DRY-RUN (prévia) com POLICY (FREE/COND/BLOCKED)
  - APPLY SAFE: aplica somente arquivos FREE
  - APPLY CONDITIONAL: pede confirmação para CONDITIONAL
  - ROLLBACK: volta 1 (histórico)
  - EXPORT: copia bundle atual
  - ZERAR TUDO: limpa overrides + histórico
  - iOS SAFE: bindTap touchend + click (capture) e anti double-tap
========================================================= */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---------- iOS safe tap ----------
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
        writeOut("motherMaintOut", "ERRO no clique: " + (err?.message || String(err)));
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

  // ---------- storage keys (overrides) ----------
  const KEY_OVERRIDES = "rcf:mother_overrides_v2";
  const KEY_OVERRIDES_AT = "rcf:mother_overrides_at_v2";
  const KEY_HISTORY = "rcf:mother_overrides_history_v2";

  function safeParseJSON(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function deepClone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; }
  }

  function getOverrides() {
    return safeParseJSON(localStorage.getItem(KEY_OVERRIDES) || "null", null);
  }

  function setOverrides(bundleObj) {
    localStorage.setItem(KEY_OVERRIDES, JSON.stringify(bundleObj));
    localStorage.setItem(KEY_OVERRIDES_AT, new Date().toISOString());
  }

  function pushHistory(prevBundle) {
    const h = safeParseJSON(localStorage.getItem(KEY_HISTORY) || "[]", []);
    h.unshift({
      at: new Date().toISOString(),
      bundle: prevBundle || null
    });
    // limita histórico
    while (h.length > 10) h.pop();
    localStorage.setItem(KEY_HISTORY, JSON.stringify(h));
  }

  function popHistory() {
    const h = safeParseJSON(localStorage.getItem(KEY_HISTORY) || "[]", []);
    const item = h.shift() || null;
    localStorage.setItem(KEY_HISTORY, JSON.stringify(h));
    return item;
  }

  function clearAll() {
    try { localStorage.removeItem(KEY_OVERRIDES); } catch {}
    try { localStorage.removeItem(KEY_OVERRIDES_AT); } catch {}
    try { localStorage.removeItem(KEY_HISTORY); } catch {}
  }

  // ---------- bundle helpers ----------
  function normalizeBundle(obj) {
    const out = deepClone(obj || {});
    out.meta = out.meta || {};
    out.meta.name = out.meta.name || "mother-bundle";
    out.meta.version = out.meta.version || "1.0";
    out.meta.createdAt = out.meta.createdAt || "{{DATE}}";
    out.files = out.files && typeof out.files === "object" ? out.files : {};
    return out;
  }

  function policyClassify(path) {
    const P = window.RCF_POLICY;
    if (!P || typeof P.classify !== "function") {
      // fallback: sem policy => tudo condicional (mais seguro)
      return { ok: true, path: String(path || ""), mode: "CONDITIONAL", reason: "Sem RCF_POLICY carregado" };
    }
    return P.classify(path);
  }

  function dryRun(bundleObj) {
    const b = normalizeBundle(bundleObj);
    const files = b.files || {};
    const keys = Object.keys(files);

    const plan = {
      ok: true,
      name: b.meta?.name || "bundle",
      version: b.meta?.version || "?",
      createdAt: b.meta?.createdAt || "?",
      total: keys.length,
      free: [],
      conditional: [],
      blocked: [],
      invalid: []
    };

    for (const k of keys) {
      const c = policyClassify(k);
      if (!c.ok || !c.path) {
        plan.invalid.push({ path: k, reason: c.reason || "inválido" });
        continue;
      }
      if (c.mode === "FREE") plan.free.push(c.path);
      else if (c.mode === "CONDITIONAL") plan.conditional.push(c.path);
      else plan.blocked.push(c.path);
    }

    return plan;
  }

  function planText(plan) {
    const P = window.RCF_POLICY;
    const explain = (m) => (P && P.explainMode) ? P.explainMode(m) : m;

    const lines = [];
    lines.push("✅ DRY-RUN ✅");
    lines.push(`name: ${plan.name}`);
    lines.push(`version: ${plan.version}`);
    lines.push(`createdAt: ${plan.createdAt}`);
    lines.push(`files total: ${plan.total}`);
    lines.push("");

    lines.push(`${explain("FREE")}: ${plan.free.length}`);
    for (const p of plan.free) lines.push("  • " + p);

    lines.push("");
    lines.push(`${explain("CONDITIONAL")}: ${plan.conditional.length}`);
    for (const p of plan.conditional) lines.push("  • " + p);

    lines.push("");
    lines.push(`${explain("BLOCKED")}: ${plan.blocked.length}`);
    for (const p of plan.blocked) lines.push("  • " + p);

    if (plan.invalid.length) {
      lines.push("");
      lines.push("INVÁLIDOS: " + plan.invalid.length);
      for (const it of plan.invalid) lines.push("  • " + it.path + " — " + it.reason);
    }

    return lines.join("\n");
  }

  function buildAppliedBundle(bundleObj, mode) {
    // mode: "SAFE" => só FREE
    // mode: "ALL"  => FREE + CONDITIONAL (bloqueado e inválido fora)
    const b = normalizeBundle(bundleObj);
    const plan = dryRun(b);

    const allow = new Set();
    for (const p of plan.free) allow.add(p);
    if (mode === "ALL") for (const p of plan.conditional) allow.add(p);

    const out = {
      meta: b.meta || {},
      files: {}
    };

    // re-mapeia mantendo só os permitidos
    for (const [k, v] of Object.entries(b.files || {})) {
      const c = policyClassify(k);
      if (c.ok && c.path && allow.has(c.path)) {
        out.files[c.path] = String(v ?? "");
      }
    }

    // marca meta
    out.meta = out.meta || {};
    out.meta.appliedAt = new Date().toISOString();
    out.meta.policy = (window.RCF_POLICY && window.RCF_POLICY.load) ? window.RCF_POLICY.load() : { version: "none" };

    return { applied: out, plan };
  }

  // ---------- UI render ----------
  function renderMaintenance() {
    const adminView = $("view-admin");
    if (!adminView) return;

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
      <p class="hint">Aplica overrides por cima do site (MVP). Protegido por POLICY: Livre / Condicional / Bloqueado.</p>

      <div class="row" style="flex-wrap:wrap; gap:10px; pointer-events:auto">
        <button class="btn primary" id="btnMotherApplyFile" type="button">Aplicar /import/mother_bundle.json</button>
        <button class="btn" id="btnMotherDryRun" type="button">Dry-run (prévia)</button>
        <button class="btn danger" id="btnMotherRollback" type="button">Rollback (voltar 1)</button>
      </div>

      <div class="row" style="flex-wrap:wrap; gap:10px; pointer-events:auto">
        <button class="btn ok" id="btnMotherApplyPastedSafe" type="button">Aplicar bundle colado (SAFE)</button>
        <button class="btn ok" id="btnMotherApplyPastedAll" type="button">Aplicar bundle colado (CONDICIONAL)</button>
        <button class="btn" id="btnMotherExport" type="button">Exportar bundle atual</button>
        <button class="btn danger" id="btnMotherClearAll" type="button">Zerar tudo</button>
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

      <div class="hint" style="margin-top:10px; opacity:.9">
        POLICY atual:
        <span id="motherPolicyInfo"></span>
      </div>
    `;

    // coloca logo depois do primeiro card do admin
    const firstCard = adminView.querySelector(".card");
    if (firstCard && firstCard.parentNode) firstCard.parentNode.insertBefore(card, firstCard.nextSibling);
    else adminView.appendChild(card);
  }

  function refreshPolicyInfo() {
    const el = $("motherPolicyInfo");
    if (!el) return;
    const P = window.RCF_POLICY && window.RCF_POLICY.load ? window.RCF_POLICY.load() : null;
    if (!P) { el.textContent = "(sem policy carregada)"; return; }
    el.textContent = `v${P.version || "?"} • updatedAt: ${P.updatedAt || "-"}`;
  }

  // ---------- actions ----------
  async function fetchBundleFile() {
    const url = "/import/mother_bundle.json?ts=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  }

  function readTextareaBundle() {
    const ta = $("motherBundleTextarea");
    const raw = ta ? String(ta.value || "") : "";
    const json = JSON.parse(raw);
    return json;
  }

  function doDryRun(bundleObj) {
    const plan = dryRun(bundleObj);
    writeOut("motherMaintOut",
      "✅ APPLY OK (prévia)\n" +
      `name: ${plan.name}\nversion: ${plan.version}\ncreatedAt: ${plan.createdAt}\nfiles: ${plan.total}\n\n` +
      planText(plan)
    );
    setStatus("DRY-RUN ✅");
    log("MAE: dry-run ok");
  }

  function applyBundle(bundleObj, mode) {
    // mode: "SAFE" or "ALL"
    const prev = getOverrides();
    pushHistory(prev);

    const built = buildAppliedBundle(bundleObj, mode);
    const applied = built.applied;
    const plan = built.plan;

    setOverrides(applied);

    const modeLabel = (mode === "SAFE") ? "SAFE (somente LIVRE)" : "CONDICIONAL (LIVRE + CONDICIONAL)";
    writeOut("motherMaintOut",
      "✅ APPLY OK\n" +
      `name: ${applied.meta?.name || "bundle"}\n` +
      `version: ${applied.meta?.version || "?"}\n` +
      `createdAt: ${applied.meta?.createdAt || "?"}\n` +
      `appliedAt: ${applied.meta?.appliedAt || "?"}\n` +
      `modo: ${modeLabel}\n` +
      `files aplicados: ${Object.keys(applied.files || {}).length}\n\n` +
      planText(plan)
    );

    setStatus("Bundle salvo ✅");
    log("MAE: bundle aplicado " + modeLabel);
  }

  async function onApplyFile() {
    setStatus("Carregando…");
    writeOut("motherMaintOut", "Carregando /import/mother_bundle.json …");

    let json;
    try {
      json = await fetchBundleFile();
    } catch (e) {
      writeOut("motherMaintOut", "❌ Falha ao carregar bundle do arquivo.\n" + (e?.message || String(e)));
      setStatus("Falha ❌");
      return;
    }

    // regra: arquivo é sempre SAFE por padrão
    const plan = dryRun(json);
    const warnConditional = plan.conditional.length > 0;
    const warnBlocked = plan.blocked.length > 0 || plan.invalid.length > 0;

    if (warnBlocked) {
      writeOut("motherMaintOut",
        "⚠️ O bundle do arquivo contém itens BLOQUEADOS/INVÁLIDOS.\n" +
        "Vou aplicar SOMENTE os LIVRES (SAFE).\n\n" +
        planText(plan)
      );
    }

    applyBundle(json, "SAFE");
  }

  function onDryRun() {
    try {
      const json = readTextareaBundle();
      doDryRun(json);
    } catch (e) {
      writeOut("motherMaintOut", "❌ JSON inválido.\n" + (e?.message || String(e)));
      setStatus("JSON inválido ❌");
    }
  }

  function onApplyPastedSafe() {
    setStatus("Aplicando SAFE…");
    let json;
    try { json = readTextareaBundle(); }
    catch (e) {
      writeOut("motherMaintOut", "❌ JSON inválido.\n" + (e?.message || String(e)));
      setStatus("JSON inválido ❌");
      return;
    }
    applyBundle(json, "SAFE");
  }

  function onApplyPastedAll() {
    setStatus("Condicional…");
    let json;
    try { json = readTextareaBundle(); }
    catch (e) {
      writeOut("motherMaintOut", "❌ JSON inválido.\n" + (e?.message || String(e)));
      setStatus("JSON inválido ❌");
      return;
    }

    const plan = dryRun(json);

    if (plan.blocked.length || plan.invalid.length) {
      writeOut("motherMaintOut",
        "⛔ Este bundle contém itens BLOQUEADOS/INVÁLIDOS.\n" +
        "Eles NÃO serão aplicados.\n\n" +
        planText(plan)
      );
    }

    // pede confirmação se tiver condicional
    if (plan.conditional.length) {
      const msg =
        "CONFIRMA aplicar itens CONDICIONAIS?\n\n" +
        "CONDICIONAIS:\n- " + plan.conditional.join("\n- ") + "\n\n" +
        "Dica: se der ruim, use ROLLBACK (voltar 1).";

      const ok = confirm(msg);
      if (!ok) {
        setStatus("Cancelado ✅");
        writeOut("motherMaintOut", "Cancelado. Nada aplicado.");
        return;
      }
    } else {
      // se não tem condicional, vira SAFE na prática
      const ok2 = confirm("Não há itens CONDICIONAIS. Aplicar mesmo assim?");
      if (!ok2) {
        setStatus("Cancelado ✅");
        writeOut("motherMaintOut", "Cancelado. Nada aplicado.");
        return;
      }
    }

    applyBundle(json, "ALL");
  }

  function onRollback() {
    const item = popHistory();
    if (!item) {
      writeOut("motherMaintOut", "Sem histórico para rollback.");
      setStatus("OK ✅");
      return;
    }

    // restaura bundle anterior (pode ser null)
    if (item.bundle) setOverrides(item.bundle);
    else {
      try { localStorage.removeItem(KEY_OVERRIDES); } catch {}
      try { localStorage.removeItem(KEY_OVERRIDES_AT); } catch {}
    }

    writeOut("motherMaintOut", "✅ Rollback OK (voltar 1)\nrestaurado: " + (item.at || "-"));
    setStatus("Rollback ✅");
    log("MAE: rollback 1");
  }

  async function onExport() {
    const cur = getOverrides();
    if (!cur) {
      writeOut("motherMaintOut", "Não existe bundle atual salvo.");
      setStatus("OK ✅");
      return;
    }
    const txt = JSON.stringify(cur, null, 2);
    try {
      await navigator.clipboard.writeText(txt);
      writeOut("motherMaintOut", "✅ Export OK: bundle atual copiado para clipboard.");
      setStatus("Exportado ✅");
    } catch {
      writeOut("motherMaintOut", "⚠️ iOS bloqueou clipboard. Selecione e copie manual:\n\n" + txt);
      setStatus("Manual ✅");
    }
  }

  function onClearAll() {
    const ok = confirm("Zerar TUDO? Isso apaga bundle atual + histórico.");
    if (!ok) return;
    clearAll();
    writeOut("motherMaintOut", "✅ Zerado. Sem overrides e sem histórico.");
    setStatus("Zerado ✅");
    log("MAE: zerar tudo");
  }

  function init() {
    renderMaintenance();
    refreshPolicyInfo();

    // força pointer-events em todo o card
    const card = $("motherMaintCard");
    if (card) {
      card.style.pointerEvents = "auto";
      card.querySelectorAll("*").forEach((el) => {
        try { el.style.pointerEvents = "auto"; } catch {}
      });
    }

    bindTap($("btnMotherApplyFile"), onApplyFile);
    bindTap($("btnMotherDryRun"), onDryRun);
    bindTap($("btnMotherApplyPastedSafe"), onApplyPastedSafe);
    bindTap($("btnMotherApplyPastedAll"), onApplyPastedAll);
    bindTap($("btnMotherRollback"), onRollback);
    bindTap($("btnMotherExport"), onExport);
    bindTap($("btnMotherClearAll"), onClearAll);

    // status inicial
    const cur = getOverrides();
    if (cur) {
      writeOut("motherMaintOut", "Bundle atual já existe ✅\nSalvo em: " + (localStorage.getItem(KEY_OVERRIDES_AT) || "-"));
      setStatus("Bundle salvo ✅");
    } else {
      setStatus("OK ✅");
    }

    // marcador no adminOut pra você bater o olho
    const adminOut = $("adminOut");
    if (adminOut) {
      const base = String(adminOut.textContent || "Pronto.");
      adminOut.textContent = base + "\n\nMAE v2.1 ✅ render OK";
    }

    log("MAE v2.1 init OK");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
