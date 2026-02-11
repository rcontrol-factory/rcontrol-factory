/* RControl Factory — Admin UI (app/js/admin.js) */
/* Objetivo: Admin estável no iOS + checkbox/touch fix + GH Sync status */

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
      // fallback: injeta um container se a Factory não criou
      const app = $("#app") || document.body;
      root = document.createElement("div");
      root.id = "rcf-view-admin";
      root.style.padding = "14px";
      app.appendChild(root);
    }
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
    // módulo deve existir vindo de /app/js/core/github_sync.js
    return !!(W.RCF_GH_SYNC && typeof W.RCF_GH_SYNC.pushFile === "function" && typeof W.RCF_GH_SYNC.pullFile === "function");
  }

  function hasMotherModule() {
    // módulo mãe vindo de /app/js/core/mother_selfupdate.js
    return !!(W.RCF_MOTHER && typeof W.RCF_MOTHER.applyBundle === "function");
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
          <div>MAE+THOMPSON ✅ carregado (mother_selfupdate.js)</div>
          <div>MAE UI carregada ✅ (app/js/admin.js)</div>
          <div>GitHub Sync: ${hasGHModule() ? "OK ✅" : "módulo não carregou (RCF_GH_SYNC ausente) ❌"}</div>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <h2>GitHub Sync (Privado) — SAFE</h2>
        <div class="muted">Puxa/Empurra o bundle no seu repo. Atualiza em um aparelho e puxa no outro.</div>

        <div class="grid" style="margin-top:10px">
          <input id="${IDS.ghOwner}" class="input" placeholder="owner (ex: rcontrol-factory)" value="${esc(gh.owner)}" />
          <input id="${IDS.ghRepo}" class="input" placeholder="repo (ex: rcontrol-factory)" value="${esc(gh.repo)}" />
          <input id="${IDS.ghBranch}" class="input" placeholder="branch (ex: main)" value="${esc(gh.branch || "main")}" />
          <input id="${IDS.ghPath}" class="input" placeholder="path (ex: app/import/mother_bundle.json)" value="${esc(gh.path || "app/import/mother_bundle.json")}" />
          <input id="${IDS.ghToken}" class="input" placeholder="TOKEN (PAT) — contents:read/write" value="${esc(gh.token)}" />
          <button id="btn_gh_save" class="btn">Salvar config</button>
        </div>

        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
          <button id="btn_gh_pull" class="btn">⬇ Pull (baixar do GitHub)</button>
          <button id="btn_gh_push" class="btn ok">⬆ Push (enviar p/ GitHub)</button>
          <button id="btn_gh_update" class="btn warn">⚡ Atualizar agora</button>
        </div>

        <div id="${IDS.ghMsg}" class="box" style="margin-top:10px">GitHub: pronto. (Sync v1)</div>
      </div>

      <div class="card" style="margin-top:14px">
        <h2>MAINTENANCE • Self-Update (Mãe)</h2>
        <div class="muted">Aplica overrides por cima do site (MVP). Use Dry-run antes. Se quebrar, Rollback.</div>

        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
          <button id="btn_apply_import" class="btn ok">Aplicar /import/mother_bundle.json</button>
          <button id="btn_dry_run" class="btn">Dry-run (prévia)</button>
          <button id="btn_apply_paste" class="btn ok">Aplicar bundle colado</button>
          <button id="btn_rollback" class="btn danger">Rollback (voltar 1)</button>
          <button id="btn_export" class="btn">Exportar bundle atual</button>
          <button id="btn_wipe" class="btn danger">Zerar tudo</button>
        </div>

        <div class="muted" style="margin-top:10px;">Cole um bundle JSON aqui:</div>
        <textarea id="${IDS.bundleTextarea}" class="textarea" rows="10" spellcheck="false">{
  "meta": { "name":"mother-test", "version":"1.0", "createdAt":"{{DATE}}" },
  "files": {
    "/core/TESTE.txt": "OK - override ativo em {{DATE}}"
  }
}</textarea>

        <div class="checkbox-row" style="margin-top:12px; display:flex; gap:10px; align-items:center;">
          <input type="checkbox" id="${IDS.confirmCritical}" />
          <label id="${IDS.confirmCriticalLabel}" for="${IDS.confirmCritical}">
            Confirmo aplicar mesmo se tiver arquivo crítico (safe mode)
          </label>
        </div>

        <div id="${IDS.motherMsg}" class="box" style="margin-top:10px">Pronto.</div>
        <div class="muted" style="margin-top:6px;">Histórico: (vazio)</div>
      </div>
    `;

    wireAdmin(root);
    forceIOSCheckboxFix(root);
  }

  function msg(id, text, ok = true) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.style.borderColor = ok ? "rgba(34,197,94,.35)" : "rgba(239,68,68,.35)";
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
      if (!hasGHModule()) return msg(IDS.ghMsg, "GitHub Sync: módulo não carregou (verifique index.html carregando /app/js/core/github_sync.js).", false);
      const cfg = readCfg();
      setGHConfig(cfg);
      try {
        const content = await W.RCF_GH_SYNC.pullFile(cfg);
        // joga no textarea
        const ta = document.getElementById(IDS.bundleTextarea);
        if (ta) ta.value = content || "";
        msg(IDS.ghMsg, "Pull OK ✅ (bundle baixado)", true);
      } catch (e) {
        msg(IDS.ghMsg, "Pull falhou ❌ " + (e?.message || e), false);
      }
    });

    $("#btn_gh_push", root)?.addEventListener("click", async () => {
      if (!hasGHModule()) return msg(IDS.ghMsg, "GitHub Sync: módulo não carregou (verifique index.html carregando /app/js/core/github_sync.js).", false);
      const cfg = readCfg();
      setGHConfig(cfg);
      const ta = document.getElementById(IDS.bundleTextarea);
      const content = (ta?.value || "").trim();
      if (!content) return msg(IDS.ghMsg, "Bundle inválido: JSON vazio.", false);
      try {
        // valida JSON
        JSON.parse(content);
      } catch {
        return msg(IDS.ghMsg, "Bundle inválido: JSON inválido.", false);
      }
      try {
        await W.RCF_GH_SYNC.pushFile(cfg, content);
        msg(IDS.ghMsg, "Push OK ✅ Atualizado no GitHub. (contents API)", true);
      } catch (e) {
        msg(IDS.ghMsg, "Push falhou ❌ " + (e?.message || e), false);
      }
    });

    $("#btn_gh_update", root)?.addEventListener("click", async () => {
      // “Atualizar agora” = pull + aplicar import
      if (!hasGHModule()) return msg(IDS.ghMsg, "GitHub Sync ausente. Corrija o carregamento do módulo.", false);
      try {
        $("#btn_gh_pull", root)?.click();
        setTimeout(() => { $("#btn_apply_paste", root)?.click(); }, 300);
      } catch (e) {
        msg(IDS.ghMsg, "Atualizar agora falhou ❌ " + (e?.message || e), false);
      }
    });

    // Mãe
    $("#btn_apply_import", root)?.addEventListener("click", async () => {
      if (!hasMotherModule()) return msg(IDS.motherMsg, "Mãe: módulo não carregou (verifique /app/js/core/mother_selfupdate.js).", false);
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
        msg(IDS.motherMsg, "Dry-run ✅ (prévia)", true);
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
        msg(IDS.motherMsg, "Rollback ✅ (voltar 1)", true);
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
        msg(IDS.motherMsg, "Exportado ✅ (bundle atual)", true);
      } catch (e) {
        msg(IDS.motherMsg, "Export falhou ❌ " + (e?.message || e), false);
      }
    });

    $("#btn_wipe", root)?.addEventListener("click", async () => {
      // safe wipe local UI (não destrói repo)
      try {
        localStorage.removeItem("RCF_GH_CFG");
        msg(IDS.motherMsg, "Zerado ✅ (configs locais)", true);
      } catch (e) {
        msg(IDS.motherMsg, "Zerar falhou ❌ " + (e?.message || e), false);
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
  }

  // iOS FIX: checkbox não “marca” quando o clique cai num overlay ou num wrapper
  function forceIOSCheckboxFix(root) {
    const cb = document.getElementById(IDS.confirmCritical);
    const label = document.getElementById(IDS.confirmCriticalLabel);
    if (!cb || !label) return;

    // garante que nada bloqueia o toque
    cb.style.pointerEvents = "auto";
    label.style.pointerEvents = "auto";

    // reforço: touchend/click alterna (quando iOS falha em marcar)
    const toggle = (ev) => {
      // se o clique foi exatamente no checkbox, deixa normal
      if (ev && ev.target === cb) return;
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event("change", { bubbles: true }));
    };

    label.addEventListener("click", toggle, { passive: true });
    label.addEventListener("touchend", toggle, { passive: true });

    // se existir qualquer overlay invisível acima, isso ajuda
    root.classList.add("rcf-clickfix");
  }

  // Auto-monta quando abrir Admin (ou quando o app recarregar)
  function boot() {
    try { renderAdmin(); } catch (e) { console.warn("Admin render falhou:", e); }
  }

  // expõe um hook simples
  W.RCF_ADMIN = { render: renderAdmin, boot };

  // boot imediato
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
