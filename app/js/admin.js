/* RControl Factory — Admin UI (app/js/admin.js)
   Objetivo: Admin estável no iOS + click/touch fix geral + GH Sync status + Mother actions clicáveis
*/

(function () {
  const W = window;

  // Base RCF defensiva
  W.RCF = W.RCF || {};
  const RCF = W.RCF;

  // Util
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[c]));

  // Estado Admin (local)
  const ADMIN_STATE = {
    confirmCritical: false,
  };

  // IDs fixos (iOS precisa disso)
  const IDS = {
    confirmCritical: "mother_confirm_critical",
    confirmCriticalLabel: "mother_confirm_critical_label",
    bundleTextarea: "mother_bundle_textarea",
    ghOwner: "gh_owner",
    ghRepo: "gh_repo",
    ghBranch: "gh_branch",
    ghPath: "gh_path",
    ghToken: "gh_token",
    ghMsg: "gh_msg",
    motherMsg: "mother_msg",
  };

  function ensureRoot() {
    // tenta usar o root do app.js, mas cai num fallback
    let root = $("#rcf-view-admin") || $("#view-admin");
    if (!root) {
      const app = $("#app") || document.body;
      root = document.createElement("div");
      root.id = "rcf-view-admin";
      root.style.padding = "14px";
      app.appendChild(root);
    }
    // iOS: garante que o root receba toques
    root.style.pointerEvents = "auto";
    root.style.touchAction = "manipulation";
    root.style.webkitTapHighlightColor = "transparent";
    root.classList.add("rcf-admin-root");
    return root;
  }

  function getGHConfig() {
    try {
      return JSON.parse(localStorage.getItem("RCF_GH_CFG") || "null") || {
        owner: "",
        repo: "",
        branch: "main",
        path: "app/import/mother_bundle.json",
        token: "",
      };
    } catch {
      return { owner: "", repo: "", branch: "main", path: "app/import/mother_bundle.json", token: "" };
    }
  }

  function setGHConfig(cfg) {
    localStorage.setItem("RCF_GH_CFG", JSON.stringify(cfg));
  }

  function hasGHModule() {
    return !!(W.RCF_GH_SYNC && typeof W.RCF_GH_SYNC.pushFile === "function" && typeof W.RCF_GH_SYNC.pullFile === "function");
  }

  function hasMotherModule() {
    return !!(W.RCF_MOTHER && typeof W.RCF_MOTHER.applyBundle === "function");
  }

  function msg(id, text, ok = true) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.style.borderColor = ok ? "rgba(34,197,94,.35)" : "rgba(239,68,68,.35)";
  }

  function renderAdmin() {
    const root = ensureRoot();
    const gh = getGHConfig();

    root.innerHTML = `
      <div class="card">
        <h2>Admin</h2>
        <div class="muted">Diagnóstico / manutenção / self-update.</div>
        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
          <button id="btn_diag" class="btn">Diagnosticar</button>
          <button id="btn_reset_safe" class="btn danger">Zerar (safe)</button>
        </div>

        <div class="box" style="margin-top:12px">
          <div><b>Pronto.</b></div>
          <div>MÃE ✅ ${hasMotherModule() ? "carregada" : "NÃO carregou (RCF_MOTHER ausente) ❌"}</div>
          <div>GitHub Sync: ${hasGHModule() ? "OK ✅" : "módulo não carregou (RCF_GH_SYNC ausente) ❌"}</div>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <h2>GitHub Sync (Privado) — SAFE</h2>
        <div class="muted">Puxa/Empurra o bundle no seu repo. Atualiza em um aparelho e puxa no outro.</div>

        <div class="grid" style="margin-top:10px">
          <input id="${IDS.ghOwner}" class="input" placeholder="owner" value="${esc(gh.owner)}" />
          <input id="${IDS.ghRepo}" class="input" placeholder="repo" value="${esc(gh.repo)}" />
          <input id="${IDS.ghBranch}" class="input" placeholder="branch" value="${esc(gh.branch || "main")}" />
          <input id="${IDS.ghPath}" class="input" placeholder="path" value="${esc(gh.path || "app/import/mother_bundle.json")}" />
          <input id="${IDS.ghToken}" class="input" placeholder="TOKEN (PAT)" value="${esc(gh.token)}" />
          <button id="btn_gh_save" class="btn">Salvar config</button>
        </div>

        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
          <button id="btn_gh_pull" class="btn">⬇ Pull</button>
          <button id="btn_gh_push" class="btn ok">⬆ Push</button>
          <button id="btn_gh_update" class="btn warn">⚡ Atualizar agora</button>
        </div>

        <div id="${IDS.ghMsg}" class="box" style="margin-top:10px">GitHub: pronto.</div>
      </div>

      <div class="card rcf-mother-card" style="margin-top:14px">
        <h2>MAINTENANCE • Self-Update (Mãe)</h2>
        <div class="muted">Aplica overrides por cima do site (MVP). Use Dry-run antes. Se quebrar, Rollback.</div>

        <div class="rcf-mother-actions" style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
          <button id="btn_apply_import" class="btn ok">Aplicar /import/mother_bundle.json</button>
          <button id="btn_dry_run" class="btn">Dry-run (prévia)</button>
          <button id="btn_apply_paste" class="btn ok">Aplicar bundle colado</button>
          <button id="btn_rollback" class="btn danger">Rollback (voltar 1)</button>
          <button id="btn_export" class="btn">Exportar bundle atual</button>
          <button id="btn_wipe" class="btn danger">Zerar tudo</button>
        </div>

        <div class="muted" style="margin-top:10px;">Cole um bundle JSON aqui:</div>
        <textarea id="${IDS.bundleTextarea}" class="textarea" rows="10" spellcheck="false"></textarea>

        <div class="checkbox-row rcf-checkline" style="margin-top:12px; display:flex; gap:10px; align-items:center;">
          <input type="checkbox" id="${IDS.confirmCritical}" />
          <label id="${IDS.confirmCriticalLabel}" for="${IDS.confirmCritical}">
            Confirmo aplicar mesmo se tiver arquivo crítico (safe mode)
          </label>
        </div>

        <div id="${IDS.motherMsg}" class="box" style="margin-top:10px">Pronto.</div>
      </div>
    `;

    // preenche textarea com template padrão
    const ta = document.getElementById(IDS.bundleTextarea);
    if (ta && !ta.value) {
      const now = new Date().toISOString();
      ta.value = JSON.stringify({
        meta: { name: "mother-test", version: "1.0", createdAt: now },
        files: { "/core/TESTE.txt": `OK - override ativo em ${now}` }
      }, null, 2);
    }

    wireAdmin(root);
    forceIOSCheckboxFix(root);
    forceIOSButtonClickFix(root);      // <<< o que resolve “botão não clicável”
    hardenPointerEvents(root);         // <<< garante que nada “mate” o toque
  }

  function wireAdmin(root) {
    const ghOwner = document.getElementById(IDS.ghOwner);
    const ghRepo = document.getElementById(IDS.ghRepo);
    const ghBranch = document.getElementById(IDS.ghBranch);
    const ghPath = document.getElementById(IDS.ghPath);
    const ghToken = document.getElementById(IDS.ghToken);

    function readCfg() {
      return {
        owner: (ghOwner?.value || "").trim(),
        repo: (ghRepo?.value || "").trim(),
        branch: (ghBranch?.value || "main").trim() || "main",
        path: (ghPath?.value || "app/import/mother_bundle.json").trim() || "app/import/mother_bundle.json",
        token: (ghToken?.value || "").trim(),
      };
    }

    $("#btn_gh_save", root)?.addEventListener("click", () => {
      const cfg = readCfg();
      setGHConfig(cfg);
      msg(IDS.ghMsg, "Config salva ✅", true);
    });

    $("#btn_gh_pull", root)?.addEventListener("click", async () => {
      if (!hasGHModule()) return msg(IDS.ghMsg, "GitHub Sync: módulo não carregou (RCF_GH_SYNC ausente).", false);
      const cfg = readCfg();
      setGHConfig(cfg);
      try {
        const content = await W.RCF_GH_SYNC.pullFile(cfg);
        const ta = document.getElementById(IDS.bundleTextarea);
        if (ta) ta.value = content || "";
        msg(IDS.ghMsg, "Pull OK ✅ (bundle baixado)", true);
      } catch (e) {
        msg(IDS.ghMsg, "Pull falhou ❌ " + (e?.message || e), false);
      }
    });

    $("#btn_gh_push", root)?.addEventListener("click", async () => {
      if (!hasGHModule()) return msg(IDS.ghMsg, "GitHub Sync: módulo não carregou (RCF_GH_SYNC ausente).", false);
      const cfg = readCfg();
      setGHConfig(cfg);
      const ta = document.getElementById(IDS.bundleTextarea);
      const content = (ta?.value || "").trim();
      if (!content) return msg(IDS.ghMsg, "Bundle inválido: JSON vazio.", false);
      try { JSON.parse(content); } catch { return msg(IDS.ghMsg, "Bundle inválido: JSON inválido.", false); }

      try {
        await W.RCF_GH_SYNC.pushFile(cfg, content);
        msg(IDS.ghMsg, "Push OK ✅ Atualizado no GitHub.", true);
      } catch (e) {
        msg(IDS.ghMsg, "Push falhou ❌ " + (e?.message || e), false);
      }
    });

    $("#btn_gh_update", root)?.addEventListener("click", async () => {
      if (!hasGHModule()) return msg(IDS.ghMsg, "GitHub Sync ausente.", false);
      try {
        $("#btn_gh_pull", root)?.click();
        setTimeout(() => { $("#btn_apply_paste", root)?.click(); }, 350);
      } catch (e) {
        msg(IDS.ghMsg, "Atualizar agora falhou ❌ " + (e?.message || e), false);
      }
    });

    // Checkbox state
    const cb = document.getElementById(IDS.confirmCritical);
    if (cb) {
      cb.checked = !!ADMIN_STATE.confirmCritical;
      cb.addEventListener("change", () => {
        ADMIN_STATE.confirmCritical = cb.checked;
      });
    }

    // Mãe
    $("#btn_apply_import", root)?.addEventListener("click", async () => {
      if (!hasMotherModule()) return msg(IDS.motherMsg, "Mãe: módulo não carregou (RCF_MOTHER ausente).", false);
      try {
        const confirm = document.getElementById(IDS.confirmCritical)?.checked;
        await W.RCF_MOTHER.applyImport({ confirmCritical: !!confirm });
        msg(IDS.motherMsg, "Aplicado ✅ (/import/mother_bundle.json)", true);
      } catch (e) {
        msg(IDS.motherMsg, "Falhou ❌ " + (e?.message || e), false);
      }
    });

    $("#btn_dry_run", root)?.addEventListener("click", async () => {
      if (!hasMotherModule()) return msg(IDS.motherMsg, "Mãe: módulo não carregou.", false);
      try {
        const confirm = document.getElementById(IDS.confirmCritical)?.checked;
        await W.RCF_MOTHER.dryRun?.({ confirmCritical: !!confirm });
        msg(IDS.motherMsg, "Dry-run ✅", true);
      } catch (e) {
        msg(IDS.motherMsg, "Dry-run falhou ❌ " + (e?.message || e), false);
      }
    });

    $("#btn_apply_paste", root)?.addEventListener("click", async () => {
      if (!hasMotherModule()) return msg(IDS.motherMsg, "Mãe: módulo não carregou.", false);
      const ta = document.getElementById(IDS.bundleTextarea);
      const content = (ta?.value || "").trim();
      if (!content) return msg(IDS.motherMsg, "Bundle inválido: JSON vazio.", false);

      let parsed;
      try { parsed = JSON.parse(content); }
      catch { return msg(IDS.motherMsg, "Bundle inválido: JSON inválido.", false); }

      try {
        const confirm = document.getElementById(IDS.confirmCritical)?.checked;
        await W.RCF_MOTHER.applyBundle(parsed, { confirmCritical: !!confirm });
        msg(IDS.motherMsg, "Aplicado ✅ (bundle colado)", true);
      } catch (e) {
        msg(IDS.motherMsg, "Falhou ❌ " + (e?.message || e), false);
      }
    });

    $("#btn_rollback", root)?.addEventListener("click", async () => {
      if (!hasMotherModule()) return msg(IDS.motherMsg, "Mãe: módulo não carregou.", false);
      try {
        await W.RCF_MOTHER.rollback?.();
        msg(IDS.motherMsg, "Rollback ✅", true);
      } catch (e) {
        msg(IDS.motherMsg, "Rollback falhou ❌ " + (e?.message || e), false);
      }
    });

    $("#btn_export", root)?.addEventListener("click", async () => {
      if (!hasMotherModule()) return msg(IDS.motherMsg, "Mãe: módulo não carregou.", false);
      try {
        const out = await W.RCF_MOTHER.exportBundle?.();
        const ta = document.getElementById(IDS.bundleTextarea);
        if (ta && out) ta.value = JSON.stringify(out, null, 2);
        msg(IDS.motherMsg, "Exportado ✅", true);
      } catch (e) {
        msg(IDS.motherMsg, "Export falhou ❌ " + (e?.message || e), false);
      }
    });

    $("#btn_wipe", root)?.addEventListener("click", async () => {
      try {
        localStorage.removeItem("RCF_GH_CFG");
        msg(IDS.motherMsg, "Zerado ✅ (configs locais)", true);
      } catch (e) {
        msg(IDS.motherMsg, "Zerar falhou ❌ " + (e?.message || e), false);
      }
    });
  }

  // iOS FIX: checkbox não “marca” quando o clique cai num overlay ou wrapper
  function forceIOSCheckboxFix(root) {
    const cb = document.getElementById(IDS.confirmCritical);
    const label = document.getElementById(IDS.confirmCriticalLabel);
    if (!cb || !label) return;

    cb.style.pointerEvents = "auto";
    label.style.pointerEvents = "auto";
    label.style.touchAction = "manipulation";

    const toggle = (ev) => {
      if (ev && ev.target === cb) return;
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event("change", { bubbles: true }));
    };

    label.addEventListener("click", toggle, { passive: true });
    label.addEventListener("touchend", toggle, { passive: true });

    root.classList.add("rcf-clickfix");
  }

  // iOS FIX: botões dentro de cards às vezes não recebem click (overlay/scroll).
  // Isso força touchend -> click() de maneira segura.
  function forceIOSButtonClickFix(root) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (!isIOS) return;

    const buttons = root.querySelectorAll("button, .btn");
    buttons.forEach((btn) => {
      if (!btn || btn.__rcfTouchFix) return;
      btn.__rcfTouchFix = true;

      btn.style.pointerEvents = "auto";
      btn.style.touchAction = "manipulation";
      btn.style.webkitTapHighlightColor = "transparent";

      // Se algum overlay estiver por cima mas “deixando passar” parcialmente,
      // o touchend aqui ainda dispara o click do próprio botão.
      btn.addEventListener("touchend", (e) => {
        try {
          // não atrapalhar scroll normal
          // não impedir default, só garantir ação
          btn.click();
        } catch {}
      }, { passive: true });
    });
  }

  // Hardening contra overlay invisível pegando toque:
  // garante pointer-events nos cards da Admin/Mãe
  function hardenPointerEvents(root) {
    const nodes = root.querySelectorAll(".card, .box, .grid, .rcf-mother-card, .rcf-mother-actions");
    nodes.forEach((n) => {
      n.style.pointerEvents = "auto";
      n.style.position = n.style.position || "relative";
      n.style.zIndex = n.style.zIndex || "1";
      n.style.touchAction = "manipulation";
    });
  }

  function boot() {
    try { renderAdmin(); } catch (e) { console.warn("Admin render falhou:", e); }
  }

  W.RCF_ADMIN = { render: renderAdmin, boot };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
// ===== iOS HARD FIX: força ações dos botões "Mãe" mesmo com ClickGuard/overlay =====
(function () {
  function safeLog(msg) {
    try { window.RCF_LOGGER?.push?.("admin", msg); } catch {}
    try { console.log("[ADMIN-FIX]", msg); } catch {}
  }

  async function runActionByText(txt) {
    const t = (txt || "").trim().toLowerCase();

    // tenta achar API da mãe em qualquer nome
    const MAE = window.RCF_MOTHER || window.RCF_MAE;
    if (!MAE) { safeLog("RCF_MOTHER/RCF_MAE ausente"); return; }

    if (t.includes("carregar")) {
      safeLog("tap: Carregar Mãe");
      return (MAE.loadMother?.() || MAE.carregarMae?.() || MAE.updateFromGitHub?.());
    }

    if (t.includes("rodar") || t.includes("check")) {
      safeLog("tap: Rodar Check");
      const s = (MAE.runCheck?.() || MAE.rodarCheck?.() || MAE.status?.());
      try { alert("CHECK: " + JSON.stringify(s, null, 2)); } catch {}
      return s;
    }

    if (t.includes("update") && t.includes("github")) {
      safeLog("tap: Update From GitHub");
      return (MAE.updateFromGitHub?.() || MAE.loadMother?.());
    }

    if (t.includes("clear") || t.includes("overrides")) {
      safeLog("tap: Clear Overrides");
      return (MAE.clearOverrides?.() || MAE.clear?.());
    }
  }

  function handler(ev) {
    const el = ev.target?.closest?.("button");
    if (!el) return;

    // Só age dentro do Admin/Maintenance (pra não quebrar o resto)
    const adminRoot = el.closest("#rcf-view-admin, #view-admin, [data-view='admin'], .admin");
    if (!adminRoot) return;

    const text = el.textContent || "";

    // só os 4 botões da mãe
    const isMotherBtn =
      text.toLowerCase().includes("carregar") ||
      text.toLowerCase().includes("rodar") ||
      (text.toLowerCase().includes("update") && text.toLowerCase().includes("github")) ||
      text.toLowerCase().includes("overrides") ||
      text.toLowerCase().includes("clear");

    if (!isMotherBtn) return;

    // mata propagação (se ClickGuard estiver brigando)
    try { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation(); } catch {}

    runActionByText(text);
  }

  // captura no topo (antes de outros listeners)
  document.addEventListener("touchend", handler, true);
  document.addEventListener("click", handler, true);

  // iOS: garante que a área é clicável
  const css = document.createElement("style");
  css.textContent = `
    #rcf-view-admin button, #view-admin button { pointer-events:auto !important; touch-action:manipulation !important; }
    #rcf-view-admin, #view-admin { pointer-events:auto !important; }
  `;
  document.head.appendChild(css);

  safeLog("iOS HARD FIX instalado");
})();
