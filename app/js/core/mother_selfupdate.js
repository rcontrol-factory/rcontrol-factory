/* =========================================================
  RControl Factory — js/core/mother_selfupdate.js (FULL) v2.2
  UI da Mãe (Admin) + integra Thompson:
  - Apply /import/mother_bundle.json
  - Dry-run (prévia)
  - Apply bundle colado
  - Rollback (voltar 1)
  - Exportar bundle atual
  - Zerar tudo

  + NOVO (v2.2):
  - Publish Queue (OFFLINE): enfileirar bundles aplicados
  - Ver fila / Exportar fila / Limpar fila

  MODO SAFE (condicional):
  - Se bundle mexe em arquivo crítico -> pede confirmação no UI
========================================================= */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const T = () => window.RCF_THOMPSON;
  const Q = () => window.RCF_PUBLISH_QUEUE;

  // sinal pra outros scripts não duplicarem a UI da Mãe
  window.RCF_MOTHER_UI = true;

  const TAP_GUARD_MS = 450;
  let _lastTapAt = 0;

  function bindTap(el, fn){
    if (!el) return;
    const handler = (e) => {
      const now = Date.now();
      if (now - _lastTapAt < TAP_GUARD_MS) { try{e.preventDefault();e.stopPropagation();}catch{}; return; }
      _lastTapAt = now;
      try{ e.preventDefault(); e.stopPropagation(); }catch{}
      try{ fn(e); }catch(err){ out("motherMaintOut", "ERRO: " + (err?.message || String(err))); }
    };
    el.style.pointerEvents = "auto";
    el.style.touchAction = "manipulation";
    el.style.webkitTapHighlightColor = "transparent";
    el.addEventListener("touchend", handler, { passive:false, capture:true });
    el.addEventListener("click", handler, { passive:false, capture:true });
  }

  function status(text){
    const el = $("statusText");
    if (el) el.textContent = String(text || "");
  }

  function out(id, text){
    const el = $(id);
    if (el) el.textContent = String(text || "");
  }

  function log(msg){
    try {
      if (window.RCF_LOGGER && typeof window.RCF_LOGGER.push === "function") window.RCF_LOGGER.push("log", msg);
      else if (window.RCF && typeof window.RCF.log === "function") window.RCF.log(msg);
      else console.log("[MAE]", msg);
    } catch {}
  }

  function getModeSafe(){
    try {
      const mode = window.RCF?.state?.cfg?.mode;
      return (mode === "auto") ? "auto" : "safe";
    } catch {
      return "safe";
    }
  }

  function ensureCard(){
    const adminView = $("view-admin");
    if (!adminView) return;
    if ($("motherMaintCard")) return;

    const card = document.createElement("div");
    card.className = "card";
    card.id = "motherMaintCard";
    card.style.pointerEvents = "auto";

    card.innerHTML = `
      <h2 style="margin-top:4px">MAINTENANCE • Self-Update (Mãe)</h2>
      <p class="hint">Aplica overrides por cima do site (MVP). Use Dry-run antes. Se quebrar, Rollback.</p>

      <div class="row" style="flex-wrap:wrap; gap:10px">
        <button class="btn primary" id="btnMotherApplyFile" type="button">Aplicar /import/mother_bundle.json</button>
        <button class="btn" id="btnMotherDryRun" type="button">Dry-run (prévia)</button>
      </div>

      <div class="row" style="flex-wrap:wrap; gap:10px">
        <button class="btn ok" id="btnMotherApplyPasted" type="button">Aplicar bundle colado</button>
        <button class="btn danger" id="btnMotherRollback" type="button">Rollback (voltar 1)</button>
      </div>

      <div class="row" style="flex-wrap:wrap; gap:10px">
        <button class="btn" id="btnMotherExport" type="button">Exportar bundle atual</button>
        <button class="btn danger" id="btnMotherResetAll" type="button">Zerar tudo</button>
      </div>

      <hr style="border:0;border-top:1px solid rgba(255,255,255,.08);margin:12px 0">

      <div class="hint" style="margin:0 0 8px 0">Publish Queue (OFFLINE) — (publicação real via API fica para depois)</div>

      <div class="row" style="flex-wrap:wrap; gap:10px">
        <button class="btn" id="btnQueueEnqueueFromPaste" type="button">Enfileirar bundle colado</button>
        <button class="btn" id="btnQueueView" type="button">Ver fila</button>
        <button class="btn" id="btnQueueExport" type="button">Exportar fila</button>
        <button class="btn danger" id="btnQueueClear" type="button">Limpar fila</button>
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

      <div style="margin-top:10px; padding:10px; border:1px dashed rgba(255,255,255,.15); border-radius:14px">
        <label style="display:flex; gap:10px; align-items:center">
          <input id="motherConfirmCritical" type="checkbox" />
          <span class="hint">Confirmo aplicar mesmo se tiver arquivo crítico (safe mode)</span>
        </label>
      </div>

      <pre class="mono small" id="motherMaintOut" style="margin-top:10px">Pronto.</pre>
      <div class="hint" id="motherHistHint" style="margin-top:8px"></div>
      <div class="hint" id="queueHint" style="margin-top:6px"></div>
    `;

    const firstCard = adminView.querySelector(".card");
    if (firstCard && firstCard.parentNode) firstCard.parentNode.insertBefore(card, firstCard.nextSibling);
    else adminView.appendChild(card);

    card.querySelectorAll("*").forEach(el => { if (el && el.style) el.style.pointerEvents = "auto"; });
  }

  async function loadBundleFromImport(){
    const url = "/import/mother_bundle.json?ts=" + Date.now();
    const res = await fetch(url, { cache:"no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  }

  function parsePasted(){
    const ta = $("motherBundleTextarea");
    const raw = ta ? String(ta.value || "") : "";
    const r = T().parseBundle(raw);
    if (!r.ok) throw new Error(r.error);
    return r.bundle;
  }

  function renderReport(rep){
    const lines = [];
    lines.push("✅ APPLY OK");
    lines.push(`name: ${rep.meta?.name || "-"}`);
    lines.push(`version: ${rep.meta?.version || "-"}`);
    lines.push(`createdAt: ${rep.meta?.createdAt || "-"}`);
    lines.push(`files: ${rep.totalFiles || 0}`);
    lines.push("");
    lines.push("DRY-RUN ✅");
    lines.push("Arquivos que serão sobrescritos: " + ((rep.added?.length||0) + (rep.changed?.length||0)));
    const list = [...(rep.added||[]), ...(rep.changed||[])];
    list.slice(0, 20).forEach(p => lines.push("• " + p));
    if (list.length > 20) lines.push("… + " + (list.length - 20));
    if (rep.critical?.length) {
      lines.push("");
      lines.push("⚠️ CRÍTICOS detectados (safe mode pede confirmação):");
      rep.critical.slice(0, 20).forEach(p => lines.push("• " + p));
      if (rep.critical.length > 20) lines.push("… + " + (rep.critical.length - 20));
    }
    return lines.join("\n");
  }

  function refreshHistoryHint(){
    const h = T().getHistory();
    const el = $("motherHistHint");
    if (!el) return;
    if (!h.length) { el.textContent = "Histórico: (vazio)"; return; }
    const top = h[0];
    el.textContent = `Histórico: ${h.length} snapshot(s). Último: ${top?.at || "-"}`;
  }

  function refreshQueueHint(){
    const el = $("queueHint");
    if (!el) return;
    const qq = Q()?.list?.() || [];
    el.textContent = `Fila: ${qq.length} item(s). (OFFLINE)`;
  }

  function doDryRun(bundle){
    const current = T().loadOverrides();
    const rep = T().dryRun(bundle, current);
    out("motherMaintOut", renderReport(rep));
    refreshHistoryHint();
    refreshQueueHint();
    return rep;
  }

  function checkGuard(bundle){
    const mode = getModeSafe();
    const guard = T().guardApply(bundle, mode);
    if (guard.needsConfirm) {
      const chk = $("motherConfirmCritical");
      const ok = !!(chk && chk.checked);
      if (!ok) {
        throw new Error(
          "SAFE MODE: bundle tem arquivo crítico.\n" +
          "Marque 'Confirmo aplicar...' antes de aplicar.\n" +
          "Críticos:\n- " + guard.criticalFiles.slice(0, 6).join("\n- ")
        );
      }
    }
  }

  function enqueueApplied(bundle, source){
    try {
      if (!Q() || typeof Q().enqueue !== "function") return;
      Q().enqueue(bundle, {
        source: source || "unknown",
        mode: getModeSafe(),
        note: "Applied locally (overrides) — ready to publish later"
      });
      refreshQueueHint();
    } catch {}
  }

  async function actionApplyFile(){
    status("Aplicando…");
    out("motherMaintOut", "Carregando /import/mother_bundle.json …");
    const bundle = await loadBundleFromImport();
    const rep = doDryRun(bundle);
    checkGuard(bundle);

    T().apply(bundle);

    // ✅ Novo: enfileira automaticamente
    enqueueApplied(bundle, "import_file");

    status("Bundle salvo ✅");
    log("MAE apply file ok: " + (bundle?.meta?.name || ""));
    out("motherMaintOut", renderReport(rep));
    refreshHistoryHint();
    refreshQueueHint();
  }

  function actionDryRun(){
    status("Dry-run…");
    const bundle = parsePasted();
    doDryRun(bundle);
    status("Dry-run ✅");
  }

  function actionApplyPasted(){
    status("Aplicando…");
    const bundle = parsePasted();
    const rep = doDryRun(bundle);
    checkGuard(bundle);

    T().apply(bundle);

    // ✅ Novo: enfileira automaticamente
    enqueueApplied(bundle, "pasted");

    status("Bundle salvo ✅");
    log("MAE apply pasted ok: " + (bundle?.meta?.name || ""));
    out("motherMaintOut", renderReport(rep));
    refreshHistoryHint();
    refreshQueueHint();
  }

  function actionRollback(){
    status("Rollback…");
    const r = T().rollback(1);
    if (!r.ok) throw new Error(r.msg);
    status("Rollback ✅");
    out("motherMaintOut", "✅ " + r.msg + "\n\nRecarregue a página se necessário.");
    refreshHistoryHint();
    refreshQueueHint();
    log("MAE rollback ok");
  }

  function actionExport(){
    status("Exportando…");
    const bundle = T().exportCurrent();
    const txt = JSON.stringify(bundle, null, 2);
    try { navigator.clipboard.writeText(txt); } catch {}
    out("motherMaintOut", "✅ Bundle atual exportado (copiado no clipboard).\nfiles: " + Object.keys(bundle.files||{}).length);
    status("Export ok ✅");
    refreshHistoryHint();
    refreshQueueHint();
  }

  function actionResetAll(){
    status("Zerando…");
    T().resetAll();
    out("motherMaintOut", "✅ ZERADO.\nOverrides e histórico removidos.");
    status("Zerado ✅");
    refreshHistoryHint();
    refreshQueueHint();
    log("MAE reset all");
  }

  // ------- Queue actions -------
  function actionQueueEnqueueFromPaste(){
    status("Enfileirando…");
    if (!Q()) throw new Error("Publish Queue não carregou (RCF_PUBLISH_QUEUE).");
    const bundle = parsePasted();
    Q().enqueue(bundle, { source:"manual_enqueue", mode:getModeSafe() });
    out("motherMaintOut", "✅ Enfileirado na fila OFFLINE.\n(Quando ligar API, a gente publica.)");
    status("Fila ✅");
    refreshQueueHint();
  }

  function actionQueueView(){
    if (!Q()) throw new Error("Publish Queue não carregou (RCF_PUBLISH_QUEUE).");
    const q = Q().list();
    if (!q.length) {
      out("motherMaintOut", "Fila vazia.");
      refreshQueueHint();
      return;
    }
    const top = q[0];
    const name = top?.bundle?.meta?.name || "-";
    const ver  = top?.bundle?.meta?.version || "-";
    out("motherMaintOut",
      `Fila: ${q.length} item(s)\n` +
      `Topo: ${name} v${ver}\n` +
      `at: ${top.at}\n` +
      `status: ${top.status}\n` +
      `files: ${Object.keys(top.bundle?.files||{}).length}\n\n` +
      `Dica: "Exportar fila" copia tudo (json).`
    );
    refreshQueueHint();
  }

  function actionQueueExport(){
    status("Exportando fila…");
    if (!Q()) throw new Error("Publish Queue não carregou (RCF_PUBLISH_QUEUE).");
    const dump = Q().exportAll();
    const txt = JSON.stringify(dump, null, 2);
    try { navigator.clipboard.writeText(txt); } catch {}
    out("motherMaintOut", "✅ Fila exportada (tentei copiar no clipboard).\nitems: " + (dump.items?.length || 0));
    status("Export fila ✅");
    refreshQueueHint();
  }

  function actionQueueClear(){
    status("Limpando fila…");
    if (!Q()) throw new Error("Publish Queue não carregou (RCF_PUBLISH_QUEUE).");
    Q().clear();
    out("motherMaintOut", "✅ Fila limpa.");
    status("Fila limpa ✅");
    refreshQueueHint();
  }

  function bind(){
    ensureCard();

    bindTap($("btnMotherApplyFile"), () => actionApplyFile());
    bindTap($("btnMotherDryRun"), () => actionDryRun());
    bindTap($("btnMotherApplyPasted"), () => actionApplyPasted());
    bindTap($("btnMotherRollback"), () => actionRollback());
    bindTap($("btnMotherExport"), () => actionExport());
    bindTap($("btnMotherResetAll"), () => actionResetAll());

    bindTap($("btnQueueEnqueueFromPaste"), () => actionQueueEnqueueFromPaste());
    bindTap($("btnQueueView"), () => actionQueueView());
    bindTap($("btnQueueExport"), () => actionQueueExport());
    bindTap($("btnQueueClear"), () => actionQueueClear());

    const aout = $("adminOut");
    if (aout) aout.textContent = (aout.textContent || "Pronto.") + "\n\nMAE v2.2 ✅ (queue OFFLINE)";

    refreshHistoryHint();
    refreshQueueHint();
    status("OK ✅");
  }

  function init(){
    if (!T()) {
      out("adminOut", "ERRO: Thompson não carregou (RCF_THOMPSON inexistente). Verifique <script src='js/core/thompson.js'> antes deste arquivo.");
      return;
    }
    bind();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
