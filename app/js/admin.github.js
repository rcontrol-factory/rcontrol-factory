/* =========================================================
  app/js/admin.github.js (FULL)
  - UI Admin: GitHub Sync (SAFE)
  - Toggle Auto-sync on Save (low-risk)
  - Botões: Sync arquivo atual / Ver fila / Limpar fila
========================================================= */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const TAP_GUARD_MS = 450;
  let _lastTapAt = 0;

  function bindTap(el, fn) {
    if (!el) return;
    const handler = async (e) => {
      const now = Date.now();
      if (now - _lastTapAt < TAP_GUARD_MS) { try { e.preventDefault(); e.stopPropagation(); } catch {} ; return; }
      _lastTapAt = now;
      try { e.preventDefault(); e.stopPropagation(); } catch {}
      await fn(e);
    };
    try {
      el.style.pointerEvents = "auto";
      el.style.touchAction = "manipulation";
      el.style.webkitTapHighlightColor = "transparent";
    } catch {}
    el.addEventListener("touchend", handler, { passive: false, capture: true });
    el.addEventListener("click", handler, { passive: false, capture: true });
  }

  function out(id, txt) {
    const el = $(id);
    if (el) el.textContent = String(txt || "");
  }

  function status(txt) {
    const el = $("statusText");
    if (el) el.textContent = String(txt || "");
  }

  function ensureCard() {
    const adminView = $("view-admin");
    if (!adminView) return;

    if ($("ghSyncCard")) return;

    const card = document.createElement("div");
    card.className = "card";
    card.id = "ghSyncCard";
    card.style.pointerEvents = "auto";

    card.innerHTML = `
      <h2 style="margin-top:4px">GitHub Sync (privado)</h2>
      <p class="hint">Treino: se o endpoint /api/push não existir ainda, ele fila (queue) e mostra aqui.</p>

      <div style="margin-top:10px; padding:10px; border:1px dashed rgba(255,255,255,.15); border-radius:14px">
        <label style="display:flex; gap:10px; align-items:center">
          <input id="ghAuto" type="checkbox" />
          <span class="hint">Auto-sync ao salvar arquivo (somente low-risk)</span>
        </label>

        <div style="height:10px"></div>

        <label style="display:flex; gap:10px; align-items:center">
          <input id="ghAllowCritical" type="checkbox" />
          <span class="hint">Permitir CRÍTICOS (SAFE) — usar com cuidado</span>
        </label>

        <div style="height:10px"></div>

        <div class="hint">basePath no repo (onde salvar):</div>
        <input id="ghBasePath" placeholder="ex: factory/app" style="width:100%; margin-top:6px" />
      </div>

      <div class="row" style="flex-wrap:wrap; gap:10px; margin-top:10px">
        <button class="btn ok" id="btnGhSyncCurrent" type="button">Sync arquivo atual</button>
        <button class="btn" id="btnGhShowQueue" type="button">Ver fila</button>
        <button class="btn danger" id="btnGhClearQueue" type="button">Limpar fila</button>
      </div>

      <pre class="mono small" id="ghOut" style="margin-top:10px">Pronto.</pre>
    `;

    // coloca depois do card da Mãe (se existir), senão no fim
    const motherCard = $("motherMaintCard");
    if (motherCard && motherCard.parentNode) motherCard.parentNode.insertBefore(card, motherCard.nextSibling);
    else adminView.appendChild(card);
  }

  function loadCfgToUI() {
    const gh = window.RCF_GH;
    if (!gh) return;

    const cfg = gh.cfgGet();
    const a = $("ghAuto");
    const c = $("ghAllowCritical");
    const bp = $("ghBasePath");

    if (a) a.checked = !!cfg.enabled;
    if (c) c.checked = !!cfg.allowCritical;
    if (bp) bp.value = cfg.basePath || "factory/app";
  }

  function saveUIToCfg() {
    const gh = window.RCF_GH;
    if (!gh) return;

    const a = $("ghAuto");
    const c = $("ghAllowCritical");
    const bp = $("ghBasePath");

    gh.cfgSet({
      enabled: !!(a && a.checked),
      allowCritical: !!(c && c.checked),
      basePath: String((bp && bp.value) || "factory/app").trim() || "factory/app"
    });
  }

  async function syncCurrent() {
    const gh = window.RCF_GH;
    if (!gh) { out("ghOut", "ERRO: core/github_sync.js não carregou."); return; }

    saveUIToCfg();

    status("Sync…");
    const r = await gh.pushCurrentFile();
    if (r.ok) {
      out("ghOut",
        "✅ Sync OK\n" +
        "path: " + r.job.repoPath + "\n" +
        "bytes: " + r.job.bytes + "\n" +
        "msg: " + r.job.message
      );
      status("Sync ✅");
    } else {
      out("ghOut",
        "⚠️ Não sincronizou (endpoint pode não existir ainda)\n" +
        "Fila criada ✅\n" +
        "erro: " + r.error + "\n" +
        "path: " + r.job.repoPath
      );
      status("Queue ✅");
    }
  }

  function showQueue() {
    const gh = window.RCF_GH;
    if (!gh) { out("ghOut", "ERRO: core/github_sync.js não carregou."); return; }

    const q = gh.qGet();
    if (!q.length) { out("ghOut", "Queue: (vazia)"); return; }

    const lines = [];
    lines.push("QUEUE (" + q.length + ")");
    lines.push("");
    q.slice(0, 15).forEach((j, i) => {
      lines.push((i+1) + ") " + (j.at || "-") + " — " + (j.repoPath || "-"));
      lines.push("   " + (j.error || "queued"));
    });
    if (q.length > 15) lines.push("\n… +" + (q.length - 15));
    out("ghOut", lines.join("\n"));
  }

  function clearQueue() {
    const gh = window.RCF_GH;
    if (!gh) { out("ghOut", "ERRO: core/github_sync.js não carregou."); return; }

    gh.qSet([]);
    out("ghOut", "✅ Queue limpa.");
    status("OK ✅");
  }

  function hookSaveButton() {
    // Auto-sync no save sem mexer no app.js
    const btn = $("btnSaveFile");
    if (!btn) return;

    btn.addEventListener("click", async () => {
      try {
        const gh = window.RCF_GH;
        if (!gh) return;

        const cfg = gh.cfgGet();
        if (!cfg.enabled) return;

        // tenta sync low-risk (se for crítico, ele bloqueia e fila)
        const r = await gh.pushCurrentFile();
        if (!r.ok) {
          // não spammar UI, só status
          status("Queue ✅");
        } else {
          status("Sync ✅");
          setTimeout(() => status("OK ✅"), 600);
        }
      } catch {}
    }, { capture: false });
  }

  function init() {
    ensureCard();

    if (!window.RCF_GH) {
      out("ghOut", "ERRO: window.RCF_GH não existe. Verifique se <script src='core/github_sync.js'> está antes.");
      return;
    }

    loadCfgToUI();

    // binds
    bindTap($("btnGhSyncCurrent"), syncCurrent);
    bindTap($("btnGhShowQueue"), () => { saveUIToCfg(); showQueue(); });
    bindTap($("btnGhClearQueue"), () => { clearQueue(); });

    // salvar cfg quando mexer nos checkboxes/inputs
    const auto = $("ghAuto");
    const crit = $("ghAllowCritical");
    const bp = $("ghBasePath");
    [auto, crit, bp].forEach(el => {
      if (!el) return;
      el.addEventListener("change", () => { try { saveUIToCfg(); } catch {} });
      el.addEventListener("input", () => { try { saveUIToCfg(); } catch {} });
    });

    hookSaveButton();

    out("ghOut", "GitHub Sync UI carregado ✅\nDica: ative Auto-sync e teste Sync arquivo atual.");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
