/* =========================================================
  RControl Factory — app/js/admin.js (FULL) — ADMIN v4
  - Renderiza MAE (Self-Update) dentro do Admin
  - Thompson: dry-run, apply, rollback, export, reset
  - GitHub Sync: configurar token/owner/repo/branch
  - SAFE (condicional): arquivos críticos exigem checkbox

  Requisito: core/thompson.js + app/js/github_sync.js carregados antes.
========================================================= */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

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
        out("motherMaintOut", "❌ ERRO: " + (err?.message || String(err)));
        setStatus("Falha ❌");
        log("ADMIN error: " + (err?.message || String(err)));
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

  function out(id, text) {
    const el = $(id);
    if (el) el.textContent = String(text || "");
  }

  function log(msg) {
    try {
      if (window.RCF_LOGGER && typeof window.RCF_LOGGER.push === "function") window.RCF_LOGGER.push("log", msg);
      else if (window.RCF && typeof window.RCF.log === "function") window.RCF.log(msg);
      else console.log("[RCF ADMIN]", msg);
    } catch {}
  }

  function getMode() {
    // SAFE por padrão
    try {
      const m = window.RCF?.state?.cfg?.mode;
      return (m === "auto") ? "auto" : "safe";
    } catch {
      return "safe";
    }
  }

  function T() {
    return window.RCF_THOMPSON || null;
  }

  function GH() {
    return window.RCF_GITHUB_SYNC || null;
  }

  function safeParseJSON(raw) {
    try { return JSON.parse(String(raw || "")); } catch { return null; }
  }

  function fmtList(title, arr) {
    const a = Array.isArray(arr) ? arr : [];
    if (!a.length) return title + ": (vazio)";
    return title + ":\n" + a.slice(0, 30).map(x => "• " + x).join("\n") + (a.length > 30 ? ("\n… + " + (a.length - 30)) : "");
  }

  function renderCard() {
    const adminView = $("view-admin");
    if (!adminView) return;

    if ($("motherMaintCard")) return;

    const card = document.createElement("div");
    card.className = "card";
    card.id = "motherMaintCard";
    card.style.pointerEvents = "auto";

    card.innerHTML = `
      <h2 style="margin-top:4px">MAINTENANCE • Self-Update (Mãe)</h2>
      <p class="hint">
        SAFE (condicional): se mexer em arquivo crítico, precisa marcar confirmação.
        Se GitHub estiver conectado, o Thompson faz push automático.
      </p>

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
      <div class="hint" id="motherHistHint" style="margin-top:8px"></div>

      <hr style="border:0;border-top:1px solid rgba(255,255,255,.08);margin:16px 0">

      <h2 style="margin-top:0">GitHub Sync (Privado)</h2>
      <p class="hint">
        Objetivo: parar de copiar/colar e ter sincronização entre dispositivos.
        O token fica só no seu aparelho (localStorage).
      </p>

      <div class="form">
        <div class="row"><input id="ghOwner" placeholder="owner (seu usuário/org) — ex: MateusSantana" /></div>
        <div class="row"><input id="ghRepo"  placeholder="repo — ex: rcontrol-factory-private" /></div>
        <div class="row"><input id="ghBranch" placeholder="branch (opcional) — ex: main" /></div>
        <div class="row"><input id="ghToken" placeholder="token (PAT) — cole aqui" /></div>
        <div class="row">
          <button class="btn ok" id="btnGhSave" type="button">Salvar conexão</button>
          <button class="btn danger" id="btnGhClear" type="button">Desconectar</button>
          <button class="btn" id="btnGhTest" type="button">Testar push (TESTE.txt)</button>
        </div>
      </div>

      <pre class="mono small" id="ghOut">Pronto.</pre>
    `;

    const firstCard = adminView.querySelector(".card");
    if (firstCard && firstCard.parentNode) firstCard.parentNode.insertBefore(card, firstCard.nextSibling);
    else adminView.appendChild(card);

    // Força pointer-events em tudo (mata overlay travando clique)
    card.querySelectorAll("*").forEach(el => {
      try {
        el.style.pointerEvents = "auto";
        el.style.touchAction = "manipulation";
      } catch {}
    });
  }

  function refreshHistoryHint() {
    const el = $("motherHistHint");
    if (!el) return;
    const h = T().getHistory();
    if (!h.length) { el.textContent = "Histórico: (vazio)"; return; }
    el.textContent = `Histórico: ${h.length} snapshot(s). Último: ${h[0]?.at || "-"}`;
  }

  async function loadBundleFromImport() {
    const url = "/import/mother_bundle.json?ts=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  }

  function parsePastedBundle() {
    const ta = $("motherBundleTextarea");
    const raw = ta ? String(ta.value || "") : "";
    const r = T().parseBundle(raw);
    if (!r.ok) throw new Error(r.error);
    return r.bundle;
  }

  function requireSafeConfirmIfNeeded(bundle) {
    const mode = getMode(); // safe|auto
    const guard = T().guardApply(bundle, mode);
    if (guard.needsConfirm) {
      const chk = $("motherConfirmCritical");
      const ok = !!(chk && chk.checked);
      if (!ok) {
        throw new Error(
          "SAFE MODE: bundle tem arquivo crítico.\n" +
          "Marque a confirmação antes de aplicar.\n" +
          "Críticos:\n- " + guard.criticalFiles.slice(0, 8).join("\n- ")
        );
      }
    }
  }

  function renderDryRun(rep) {
    const lines = [];
    lines.push("DRY-RUN ✅");
    lines.push("name: " + (rep.meta?.name || "-"));
    lines.push("version: " + (rep.meta?.version || "-"));
    lines.push("createdAt: " + (rep.meta?.createdAt || "-"));
    lines.push("files: " + (rep.totalFiles || 0));
    lines.push("");
    lines.push(fmtList("ADICIONADOS", rep.added));
    lines.push("");
    lines.push(fmtList("ALTERADOS", rep.changed));
    if (rep.critical && rep.critical.length) {
      lines.push("");
      lines.push("⚠️ CRÍTICOS (SAFE pede confirmação):");
      lines.push(rep.critical.slice(0, 30).map(p => "• " + p).join("\n") + (rep.critical.length > 30 ? ("\n… + " + (rep.critical.length - 30)) : ""));
    }
    return lines.join("\n");
  }

  async function actionDryRun() {
    setStatus("Dry-run…");
    const bundle = parsePastedBundle();
    const rep = T().dryRun(bundle, T().loadOverrides());
    out("motherMaintOut", renderDryRun(rep));
    refreshHistoryHint();
    setStatus("Dry-run ✅");
  }

  async function actionApplyFile() {
    setStatus("Aplicando…");
    out("motherMaintOut", "Carregando /import/mother_bundle.json …");
    const bundle = await loadBundleFromImport();

    const rep = T().dryRun(bundle, T().loadOverrides());
    out("motherMaintOut", renderDryRun(rep));

    requireSafeConfirmIfNeeded(bundle);

    await T().apply(bundle);
    refreshHistoryHint();
    setStatus("Bundle salvo ✅");
    log("MAE: apply file OK");
    out("motherMaintOut", renderDryRun(rep) + "\n\nAPPLY ✅ concluído.\nSe GitHub estiver conectado, foi push automático.");
  }

  async function actionApplyPasted() {
    setStatus("Aplicando…");
    const bundle = parsePastedBundle();

    const rep = T().dryRun(bundle, T().loadOverrides());
    out("motherMaintOut", renderDryRun(rep));

    requireSafeConfirmIfNeeded(bundle);

    await T().apply(bundle);
    refreshHistoryHint();
    setStatus("Bundle salvo ✅");
    log("MAE: apply pasted OK");
    out("motherMaintOut", renderDryRun(rep) + "\n\nAPPLY ✅ concluído.\nSe GitHub estiver conectado, foi push automático.");
  }

  async function actionRollback1() {
    setStatus("Rollback…");
    const r = T().rollback(1);
    if (!r.ok) throw new Error(r.msg);
    refreshHistoryHint();
    setStatus("Rollback ✅");
    out("motherMaintOut", "✅ " + r.msg + "\n\nRecarregue a página se necessário.");
    log("MAE: rollback OK");
  }

  async function actionExport() {
    setStatus("Exportando…");
    const bundle = T().exportCurrent();
    const txt = JSON.stringify(bundle, null, 2);
    const ta = $("motherBundleTextarea");
    if (ta) ta.value = txt;
    try { await navigator.clipboard.writeText(txt); } catch {}
    out("motherMaintOut", "✅ Export OK (copiei pro clipboard e joguei no textarea)\nfiles: " + Object.keys(bundle.files || {}).length);
    setStatus("Export ✅");
    refreshHistoryHint();
  }

  async function actionResetAll() {
    setStatus("Zerando…");
    T().resetAll();
    refreshHistoryHint();
    out("motherMaintOut", "✅ ZERADO.\nOverrides e histórico removidos.");
    setStatus("Zerado ✅");
    log("MAE: reset all");
  }

  // -------------------------
  // GitHub actions
  // -------------------------
  function ghLoadUI() {
    const gh = GH();
    if (!gh) return;

    const c = gh.cfgGet();
    if ($("ghOwner")) $("ghOwner").value = c.owner || "";
    if ($("ghRepo")) $("ghRepo").value = c.repo || "";
    if ($("ghBranch")) $("ghBranch").value = c.branch || "main";
    if ($("ghToken")) $("ghToken").value = c.token ? "••••••••" : "";
    out("ghOut", gh.isConfigured() ? "Conectado ✅ (token oculto)" : "Não conectado.");
  }

  async function ghSave() {
    const gh = GH();
    if (!gh) throw new Error("GitHub Sync não carregou.");

    const owner = ($("ghOwner")?.value || "").trim();
    const repo = ($("ghRepo")?.value || "").trim();
    const branch = ($("ghBranch")?.value || "main").trim();

    let token = ($("ghToken")?.value || "").trim();
    // se o usuário deixou "••••", mantém o token antigo
    if (token.startsWith("••")) token = gh.cfgGet().token || "";

    if (!owner || !repo || !token) throw new Error("Preencha owner, repo e token.");

    gh.cfgSet({ owner, repo, branch, token });
    out("ghOut", "Salvo ✅. Agora o Thompson pode dar push automático.");
    setStatus("GitHub ✅");
    log("GitHub cfg salvo");
  }

  async function ghClear() {
    const gh = GH();
    if (!gh) return;
    gh.clearConfig();
    out("ghOut", "Desconectado ✅");
    setStatus("OK ✅");
    log("GitHub cfg limpo");
    ghLoadUI();
  }

  async function ghTest() {
    const gh = GH();
    if (!gh || !gh.isConfigured()) throw new Error("GitHub não configurado.");
    setStatus("Testando GitHub…");

    const path = "/core/TESTE_GITHUB.txt";
    const content = "RCF GitHub Sync OK — " + new Date().toISOString();

    await gh.putFile(path, content, "RCF test push");
    out("ghOut", "✅ Push OK: " + path);
    setStatus("GitHub OK ✅");
    log("GitHub push teste OK");
  }

  function init() {
    if (!T()) {
      out("adminOut", "ERRO: Thompson não carregou. Verifique <script src='core/thompson.js'> antes do app/js/admin.js");
      return;
    }

    renderCard();

    bindTap($("btnMotherApplyFile"), actionApplyFile);
    bindTap($("btnMotherDryRun"), actionDryRun);
    bindTap($("btnMotherApplyPasted"), actionApplyPasted);
    bindTap($("btnMotherRollback1"), actionRollback1);
    bindTap($("btnMotherExport"), actionExport);
    bindTap($("btnMotherResetAll"), actionResetAll);

    bindTap($("btnGhSave"), ghSave);
    bindTap($("btnGhClear"), ghClear);
    bindTap($("btnGhTest"), ghTest);

    refreshHistoryHint();
    ghLoadUI();

    const adminOut = $("adminOut");
    if (adminOut) {
      const prev = (adminOut.textContent || "Pronto.").trim();
      adminOut.textContent = prev + "\n\nMAE v4 ✅ Thompson OK" + (GH() ? " | GitHubSync OK" : " | GitHubSync ausente");
    }

    setStatus("OK ✅");
    log("ADMIN v4 carregado ✅");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
