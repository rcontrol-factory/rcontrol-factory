/* =========================================================
  RControl Factory — app/js/core/mother_selfupdate.js (FULL)
  UI da Mãe (Admin) + Thompson:
  - Apply /import/mother_bundle.json
  - Dry-run
  - Apply bundle colado
  - Rollback (voltar 1)
  - Exportar bundle atual
  - Zerar tudo

  SAFE MODE (condicional):
  - Se bundle mexe em arquivo crítico -> pede confirmação no UI

  iOS FIX:
  - checkbox aparece marcado (appearance reset)
========================================================= */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const T = () => window.RCF_THOMPSON;

  const TAP_GUARD_MS = 450;
  let _lastTapAt = 0;

  function injectCheckboxFixOnce(){
    if (document.getElementById("rcfCheckboxFixStyle")) return;
    const st = document.createElement("style");
    st.id = "rcfCheckboxFixStyle";
    st.textContent = `
      /* iOS: alguns temas/CSS zeram o visual do checkbox */
      .rcf-checkbox {
        -webkit-appearance: checkbox !important;
        appearance: auto !important;
        width: 20px !important;
        height: 20px !important;
        accent-color: #22c55e;
      }
      .rcf-checkbox:focus { outline: 2px solid rgba(34,197,94,.35); outline-offset: 2px; }
      label.rcf-checklabel { cursor: pointer; user-select: none; }
    `;
    document.head.appendChild(st);
  }

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

    injectCheckboxFixOnce();

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
        <label class="rcf-checklabel" style="display:flex; gap:10px; align-items:center">
          <input id="motherConfirmCritical" class="rcf-checkbox" type="checkbox" />
          <span class="hint">Confirmo aplicar mesmo se tiver arquivo crítico (safe mode)</span>
        </label>
      </div>

      <pre class="mono small" id="motherMaintOut" style="margin-top:10px">Pronto.</pre>
      <div class="hint" id="motherHistHint" style="margin-top:8px"></div>
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

  function doDryRun(bundle){
    const current = T().loadOverrides();
    const rep = T().dryRun(bundle, current);
    out("motherMaintOut", renderReport(rep));
    refreshHistoryHint();
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

  async function actionApplyFile(){
    status("Aplicando…");
    out("motherMaintOut", "Carregando /import/mother_bundle.json …");
    const bundle = await loadBundleFromImport();
    const rep = doDryRun(bundle);
    checkGuard(bundle);

    const r = T().apply(bundle);
    status("Bundle salvo ✅");
    log("MAE apply file ok: " + (r.meta?.name || ""));
    out("motherMaintOut", renderReport(rep));
    refreshHistoryHint();
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

    const r = T().apply(bundle);
    status("Bundle salvo ✅");
    log("MAE apply pasted ok: " + (r.meta?.name || ""));
    out("motherMaintOut", renderReport(rep));
    refreshHistoryHint();
  }

  function actionRollback(){
    status("Rollback…");
    const r = T().rollback(1);
    if (!r.ok) throw new Error(r.msg);
    status("Rollback ✅");
    out("motherMaintOut", "✅ " + r.msg + "\n\nRecarregue a página se necessário.");
    refreshHistoryHint();
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
  }

  function actionResetAll(){
    status("Zerando…");
    T().resetAll();
    out("motherMaintOut", "✅ ZERADO.\nOverrides e histórico removidos.");
    status("Zerado ✅");
    refreshHistoryHint();
    log("MAE reset all");
  }

  function bind(){
    ensureCard();

    bindTap($("btnMotherApplyFile"), () => actionApplyFile());
    bindTap($("btnMotherDryRun"), () => actionDryRun());
    bindTap($("btnMotherApplyPasted"), () => actionApplyPasted());
    bindTap($("btnMotherRollback"), () => actionRollback());
    bindTap($("btnMotherExport"), () => actionExport());
    bindTap($("btnMotherResetAll"), () => actionResetAll());

    const aout = $("adminOut");
    if (aout) aout.textContent = (aout.textContent || "Pronto.") + "\n\nMAE+THOMPSON ✅ carregado (mother_selfupdate.js)";

    refreshHistoryHint();
    status("OK ✅");
  }

  function init(){
    if (!T()) {
      out("adminOut", "ERRO: Thompson não carregou (RCF_THOMPSON inexistente). Verifique index.html: <script src='js/core/thompson.js'> antes deste arquivo.");
      return;
    }
    bind();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
/* =========================================================
   RCF • AUTO-INJECT (GitHub) — SAFE ADDON
   - Lê app/import/mother_index.json no GitHub
   - Se tiver versão nova: puxa bundle e aplica
   - Se não achar funções internas, ele só avisa no console
========================================================= */
(function(){
  const LS_CFG  = "RCF_GH_CFG";                 // { owner, repo, branch, path, token }
  const LS_VER  = "RCF_MOTHER_APPLIED_VERSION"; // versão aplicada
  const LS_AUTO = "RCF_MOTHER_AUTO";            // "1" liga auto-apply

  function jparse(s){ try { return JSON.parse(s); } catch { return null; } }
  function cfg(){
    const c = jparse(localStorage.getItem(LS_CFG)||"");
    if (!c || !c.owner || !c.repo || !c.branch || !c.token) return null;
    return c;
  }
  function localVer(){ return String(localStorage.getItem(LS_VER)||"0"); }
  function setLocalVer(v){ localStorage.setItem(LS_VER, String(v)); }

  async function ghGetText(c, path){
    const url = `https://api.github.com/repos/${c.owner}/${c.repo}/contents/${path}?ref=${c.branch}`;
    const r = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${c.token}`,
        "Accept": "application/vnd.github+json"
      }
    });
    if (!r.ok) throw new Error("GitHub GET falhou: " + r.status);
    const data = await r.json();
    const b64 = (data.content||"").replace(/\n/g,"");
    const txt = decodeURIComponent(escape(atob(b64)));
    return txt;
  }

  function findApply(){
    const M = window.RCF_MOTHER || window.MOTHER || null;
    const apply =
      (M && (M.applyBundleText || M.applyBundleFromText || M.applyPastedBundle || M.applyText)) ||
      null;
    return { M, apply };
  }

  async function check(){
    const c = cfg();
    if (!c) return null;

    const idxTxt = await ghGetText(c, "app/import/mother_index.json");
    const idx = jparse(idxTxt);
    if (!idx?.latest?.version || !idx?.latest?.bundlePath) return null;

    const remoteVer = String(idx.latest.version);
    const hasUpdate = Number(remoteVer) > Number(localVer());
    return { remoteVer, hasUpdate, bundlePath: idx.latest.bundlePath };
  }

  async function pullAndApply(bundlePath, remoteVer){
    const c = cfg();
    const { apply } = findApply();

    const raw = await ghGetText(c, bundlePath);

    if (!apply) {
      console.warn("[RCF] AutoInject: não achei função apply no Mother. Bundle puxado, mas não aplicado.");
      return false;
    }

    apply(raw);                 // aplica usando sua engine atual
    setLocalVer(remoteVer);     // marca versão aplicada
    console.log("[RCF] AutoInject OK:", remoteVer);
    return true;
  }

  async function boot(){
    try {
      const info = await check();
      if (!info || !info.hasUpdate) return;

      const auto = (localStorage.getItem(LS_AUTO) || "1") === "1";
      if (!auto) {
        console.log("[RCF] Update disponível (auto desligado):", info.remoteVer);
        return;
      }

      await pullAndApply(info.bundlePath, info.remoteVer);
    } catch (e) {
      console.warn("[RCF] AutoInject falhou:", e);
    }
  }

  // roda após carregar tudo
  window.addEventListener("load", () => setTimeout(boot, 700));
})();
