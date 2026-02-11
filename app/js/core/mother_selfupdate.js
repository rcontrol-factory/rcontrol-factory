/* =========================================================
  RControl Factory — js/core/mother_selfupdate.js (FULL)
  UI da Mãe (Admin) + integra Thompson:
  - Apply /import/mother_bundle.json
  - Dry-run (prévia)
  - Apply bundle colado
  - Rollback (voltar 1)
  - Exportar bundle atual
  - Zerar tudo

  + GitHub Sync PRIVADO (SAFE):
  - Pull/Push do arquivo (default): app/import/mother_bundle.json

  MODO SAFE (condicional):
  - Se bundle mexe em arquivo crítico -> pede confirmação no UI
========================================================= */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const T = () => window.RCF_THOMPSON;

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

  // ---------- GitHub Sync loader ----------
  async function ensureGitHubSyncLoaded(){
    if (window.RCF_GITHUB) return true;

    // injeta script (pra não depender do index.html)
    return new Promise((resolve) => {
      try {
        const s = document.createElement("script");
        s.src = "js/core/github_sync.js?v=" + Date.now();
        s.onload = () => resolve(!!window.RCF_GITHUB);
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
      } catch {
        resolve(false);
      }
    });
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

      <hr style="border:0;border-top:1px solid rgba(255,255,255,.08);margin:14px 0" />

      <h3 style="margin:0 0 8px 0">GitHub Sync (Privado) — SAFE</h3>
      <p class="hint" style="margin-top:0">
        Puxa/Empurra o arquivo do bundle no seu repo privado. Assim você atualiza em um aparelho e puxa no outro.
      </p>

      <div class="row" style="flex-wrap:wrap; gap:10px">
        <input id="ghOwner" placeholder="owner (ex: MateusSantana)" style="flex:1;min-width:160px" />
        <input id="ghRepo" placeholder="repo (ex: FactoryPWA)" style="flex:1;min-width:160px" />
      </div>

      <div class="row" style="flex-wrap:wrap; gap:10px; margin-top:8px">
        <input id="ghBranch" placeholder="branch (ex: main)" style="flex:1;min-width:140px" />
        <input id="ghPath" placeholder="path (ex: app/import/mother_bundle.json)" style="flex:2;min-width:220px" />
      </div>

      <div class="row" style="flex-wrap:wrap; gap:10px; margin-top:8px">
        <input id="ghToken" placeholder="TOKEN (PAT) — contents:read/write" style="flex:1;min-width:260px" />
        <button class="btn" id="btnGhSaveCfg" type="button">Salvar config</button>
      </div>

      <div class="row" style="flex-wrap:wrap; gap:10px; margin-top:8px">
        <button class="btn" id="btnGhPull" type="button">⬇️ Pull (baixar do GitHub)</button>
        <button class="btn ok" id="btnGhPush" type="button">⬆️ Push (enviar p/ GitHub)</button>
      </div>

      <pre class="mono small" id="ghOut" style="margin-top:10px">GitHub: pronto.</pre>

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

  // ---------- GitHub UI ----------
  function ghOut(text){
    const el = $("ghOut");
    if (el) el.textContent = String(text || "");
  }

  function loadGhCfgToUI(){
    const G = window.RCF_GITHUB;
    if (!G) return;
    const cfg = G.getCfg();
    if ($("ghOwner")) $("ghOwner").value = cfg.owner || "";
    if ($("ghRepo")) $("ghRepo").value = cfg.repo || "";
    if ($("ghBranch")) $("ghBranch").value = cfg.branch || "main";
    if ($("ghPath")) $("ghPath").value = cfg.path || "app/import/mother_bundle.json";
    if ($("ghToken")) $("ghToken").value = cfg.token ? "••••••••••" : "";
  }

  function readGhCfgFromUI(){
    // token: se o user colar, salva; se ele deixar "••••", mantém o atual
    const G = window.RCF_GITHUB;
    const cur = G.getCfg();

    const owner = String($("ghOwner")?.value || "").trim();
    const repo  = String($("ghRepo")?.value || "").trim();
    const branch = String($("ghBranch")?.value || "main").trim() || "main";
    const path = String($("ghPath")?.value || "app/import/mother_bundle.json").trim() || "app/import/mother_bundle.json";

    let tokenRaw = String($("ghToken")?.value || "").trim();
    let token = cur.token || "";
    if (tokenRaw && tokenRaw !== "••••••••••") token = tokenRaw;

    return { owner, repo, branch, path, token };
  }

  async function ghSaveCfg(){
    const ok = await ensureGitHubSyncLoaded();
    if (!ok) { ghOut("❌ Não carregou github_sync.js"); return; }

    const G = window.RCF_GITHUB;
    const cfg = readGhCfgFromUI();
    G.setCfg(cfg);
    ghOut("✅ Config salva (local).");
    loadGhCfgToUI();
  }

  async function ghPullToTextarea(){
    const ok = await ensureGitHubSyncLoaded();
    if (!ok) { ghOut("❌ Não carregou github_sync.js"); return; }

    const G = window.RCF_GITHUB;
    const cfg = readGhCfgFromUI();
    G.setCfg(cfg);

    ghOut("⬇️ Pull… (baixando do GitHub)");
    const r = await G.getFile(cfg);
    if (!r.ok) {
      ghOut("❌ Pull falhou: " + r.msg + (r.status ? (" (HTTP " + r.status + ")") : ""));
      return;
    }

    const ta = $("motherBundleTextarea");
    if (ta) ta.value = r.content || "";

    ghOut("✅ Pull OK. Bundle carregado no textarea.\nsha: " + (r.sha || "-"));
  }

  async function ghPushFromTextarea(){
    const ok = await ensureGitHubSyncLoaded();
    if (!ok) { ghOut("❌ Não carregou github_sync.js"); return; }

    const G = window.RCF_GITHUB;
    const cfg = readGhCfgFromUI();
    G.setCfg(cfg);

    const ta = $("motherBundleTextarea");
    const content = ta ? String(ta.value || "") : "";
    if (!content.trim()) { ghOut("❌ Textarea vazio."); return; }

    // SAFE: antes de push, tenta validar bundle via Thompson parse
    try {
      const r = T().parseBundle(content);
      if (!r.ok) { ghOut("❌ Bundle inválido: " + r.error); return; }
    } catch {}

    ghOut("⬆️ Push… (enviando pro GitHub)");
    const msg = "RCF: update mother_bundle.json (via Mãe)";
    const r = await G.putFile(cfg, content, msg);

    if (!r.ok) {
      ghOut("❌ Push falhou: " + r.msg + (r.status ? (" (HTTP " + r.status + ")") : ""));
      return;
    }

    ghOut("✅ Push OK. Atualizado no GitHub.\n(commit via contents API)");
  }

  function bind(){
    ensureCard();

    bindTap($("btnMotherApplyFile"), () => actionApplyFile());
    bindTap($("btnMotherDryRun"), () => actionDryRun());
    bindTap($("btnMotherApplyPasted"), () => actionApplyPasted());
    bindTap($("btnMotherRollback"), () => actionRollback());
    bindTap($("btnMotherExport"), () => actionExport());
    bindTap($("btnMotherResetAll"), () => actionResetAll());

    // GitHub
    bindTap($("btnGhSaveCfg"), () => ghSaveCfg());
    bindTap($("btnGhPull"), () => ghPullToTextarea());
    bindTap($("btnGhPush"), () => ghPushFromTextarea());

    // sinal no adminOut
    const aout = $("adminOut");
    if (aout) aout.textContent = (aout.textContent || "Pronto.") + "\n\nMAE+THOMPSON ✅ carregado (mother_selfupdate.js)";

    refreshHistoryHint();
    status("OK ✅");

    // tenta carregar cfg na UI
    ensureGitHubSyncLoaded().then((ok) => {
      if (ok) { loadGhCfgToUI(); ghOut("GitHub: pronto. (Sync v1)"); }
      else { ghOut("GitHub: github_sync.js ainda não carregou (ok, você pode usar mesmo assim)."); }
    });
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
