/* =========================================================
  RControl Factory — app/js/admin.js (FULL)
  - Recria UI do Admin (cards extras)
  - Mantém ações de diagnóstico/reset (se existirem no core)
  - Recoloca:
    A) GitHub Sync (Privado) — SAFE (Pull/Push/Atualizar agora)
    B) Publish Queue (OFFLINE)
  - iOS: bind touchend + click
========================================================= */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const qs = (sel, root = document) => root.querySelector(sel);

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
      try { fn(e); } catch (err) { console.error(err); }
    };
    el.style.pointerEvents = "auto";
    el.style.touchAction = "manipulation";
    el.style.webkitTapHighlightColor = "transparent";
    el.addEventListener("touchend", handler, { passive: false, capture: true });
    el.addEventListener("click", handler, { passive: false, capture: true });
  }

  function setAdminOut(text) {
    const el = $("adminOut");
    if (el) el.textContent = String(text || "");
  }

  function appendAdminOut(text) {
    const el = $("adminOut");
    if (!el) return;
    el.textContent = (el.textContent ? el.textContent + "\n" : "") + String(text || "");
  }

  function ensureAdminView() {
    const v = $("view-admin");
    if (!v) throw new Error("view-admin não existe (index.html).");
    return v;
  }

  // -------------------------
  // Publish Queue (offline)
  // -------------------------
  const QKEY = "RCF_PUBLISH_QUEUE_V1";

  function qLoad() {
    try {
      const raw = localStorage.getItem(QKEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function qSave(arr) {
    localStorage.setItem(QKEY, JSON.stringify(arr || []));
  }

  function qEnqueue(bundle) {
    const q = qLoad();
    q.unshift({
      at: new Date().toISOString(),
      meta: bundle?.meta || {},
      bundle
    });
    qSave(q);
    return q;
  }

  function qClear() {
    qSave([]);
  }

  function qExport() {
    const q = qLoad();
    return JSON.stringify(q, null, 2);
  }

  function qSummary() {
    const q = qLoad();
    if (!q.length) return "Fila: 0 item.";
    const top = q[0];
    const name = top?.meta?.name || "-";
    const ver = top?.meta?.version || "-";
    return `Fila: ${q.length} item(s). Último: ${name} v${ver} (${top.at})`;
  }

  // -------------------------
  // GitHub Sync UI
  // -------------------------
  function ghAvailable() {
    return !!(window.RCF_GH_SYNC && typeof window.RCF_GH_SYNC.loadCfg === "function");
  }

  function thAvailable() {
    return !!(window.RCF_THOMPSON && typeof window.RCF_THOMPSON.apply === "function");
  }

  function parseBundleFromTextarea(textareaId) {
    if (!thAvailable()) throw new Error("Thompson não carregou (RCF_THOMPSON ausente).");
    const raw = $(textareaId)?.value || "";
    const r = window.RCF_THOMPSON.parseBundle(raw);
    if (!r.ok) throw new Error(r.error || "Bundle inválido.");
    return r.bundle;
  }

  // -------------------------
  // Render Cards
  // -------------------------
  function cardHTML(title, subtitle) {
    return `
      <div class="card" style="pointer-events:auto">
        <h2>${title}</h2>
        <p class="hint">${subtitle || ""}</p>
      </div>
    `;
  }

  function ensureGitHubCard(adminView) {
    if ($("rcfGitHubCard")) return;

    const wrap = document.createElement("div");
    wrap.id = "rcfGitHubCard";
    wrap.className = "card";
    wrap.style.pointerEvents = "auto";

    wrap.innerHTML = `
      <h2>GitHub Sync (Privado) — SAFE</h2>
      <p class="hint">Puxa/Empurra o bundle no seu repo. Assim você atualiza em um aparelho e puxa no outro.</p>

      <div class="row" style="gap:10px; flex-wrap:wrap">
        <input id="ghOwner" class="input" placeholder="owner (ex: rcontrol-factory)" />
        <input id="ghRepo" class="input" placeholder="repo (ex: rcontrol-factory)" />
      </div>
      <div class="row" style="gap:10px; flex-wrap:wrap">
        <input id="ghBranch" class="input" placeholder="branch (ex: main)" />
        <input id="ghPath" class="input" placeholder="path (ex: app/import/mother_bundle.json)" />
      </div>
      <div class="row" style="gap:10px; flex-wrap:wrap">
        <input id="ghToken" class="input" placeholder="TOKEN (PAT) — contents:read/write" />
        <button id="ghSave" class="btn" type="button">Salvar config</button>
      </div>

      <div class="row" style="gap:10px; flex-wrap:wrap">
        <button id="ghPull" class="btn" type="button">⬇ Pull (baixar do GitHub)</button>
        <button id="ghPush" class="btn ok" type="button">⬆ Push (enviar p/ GitHub)</button>
        <button id="ghUpdateNow" class="btn primary" type="button">⚡ Atualizar agora</button>
      </div>

      <pre id="ghOut" class="mono small">GitHub: pronto. (Sync v1)</pre>
    `;

    // inserir depois do primeiro card do Admin (pra ficar perto da Mãe)
    const firstCard = adminView.querySelector(".card");
    if (firstCard && firstCard.parentNode) firstCard.parentNode.insertBefore(wrap, firstCard.nextSibling);
    else adminView.appendChild(wrap);

    // preencher inputs com cfg
    if (ghAvailable()) {
      const cfg = window.RCF_GH_SYNC.loadCfg();
      if ($("ghOwner")) $("ghOwner").value = cfg.owner || "";
      if ($("ghRepo")) $("ghRepo").value = cfg.repo || "";
      if ($("ghBranch")) $("ghBranch").value = cfg.branch || "main";
      if ($("ghPath")) $("ghPath").value = cfg.path || "app/import/mother_bundle.json";
      if ($("ghToken")) $("ghToken").value = cfg.token || "";
    } else {
      $("ghOut").textContent = "❌ GitHub Sync: módulo não carregou (RCF_GH_SYNC ausente). Verifique index.html: js/core/github_sync.js";
    }

    // binds
    bindTap($("ghSave"), () => {
      if (!ghAvailable()) throw new Error("RCF_GH_SYNC ausente.");
      const cfg = {
        owner: $("ghOwner")?.value?.trim() || "",
        repo: $("ghRepo")?.value?.trim() || "",
        branch: $("ghBranch")?.value?.trim() || "main",
        path: $("ghPath")?.value?.trim() || "app/import/mother_bundle.json",
        token: $("ghToken")?.value?.trim() || "",
      };
      window.RCF_GH_SYNC.saveCfg(cfg);
      $("ghOut").textContent = "✅ Config salva em localStorage (RCF_GH_CFG).";
    });

    bindTap($("ghPull"), async () => {
      if (!ghAvailable()) throw new Error("RCF_GH_SYNC ausente.");
      $("ghOut").textContent = "Pull…";
      const r = await window.RCF_GH_SYNC.pullText();
      const txt = r.text || "";
      // joga dentro do textarea da Mãe se existir
      const ta = $("motherBundleTextarea");
      if (ta) ta.value = txt;
      $("ghOut").textContent = "✅ Pull OK. Bundle baixado do GitHub.";
    });

    bindTap($("ghPush"), async () => {
      if (!ghAvailable()) throw new Error("RCF_GH_SYNC ausente.");
      const ta = $("motherBundleTextarea");
      const txt = ta ? (ta.value || "") : "";
      // valida JSON antes de mandar
      try { JSON.parse(txt); } catch { throw new Error("Bundle inválido: JSON inválido ou vazio."); }

      $("ghOut").textContent = "Push…";
      await window.RCF_GH_SYNC.pushText(txt, "RCF: update mother_bundle.json");
      $("ghOut").textContent = "✅ Push OK. Atualizado no GitHub. (commit via contents API)";
    });

    // Atualizar agora: Pull e já aplica como bundle colado (se Thompson + Mãe existirem)
    bindTap($("ghUpdateNow"), async () => {
      if (!ghAvailable()) throw new Error("RCF_GH_SYNC ausente.");
      if (!thAvailable()) throw new Error("Thompson não carregou (RCF_THOMPSON ausente).");

      $("ghOut").textContent = "Atualizar agora… (pull + apply)";
      const r = await window.RCF_GH_SYNC.pullText();
      const txt = r.text || "";

      // valida + aplica
      const ta = $("motherBundleTextarea");
      if (ta) ta.value = txt;

      // parse bundle
      const bundle = parseBundleFromTextarea("motherBundleTextarea");

      // SAFE: se tiver confirmação crítica, respeita checkbox da Mãe
      const mode = (window.RCF?.state?.cfg?.mode === "auto") ? "auto" : "safe";
      const guard = window.RCF_THOMPSON.guardApply(bundle, mode);
      if (guard.needsConfirm) {
        const chk = $("motherConfirmCritical");
        if (!chk || !chk.checked) {
          $("ghOut").textContent =
            "⚠️ SAFE MODE: tem arquivo crítico. Marque 'Confirmo aplicar...' e clique de novo.";
          return;
        }
      }

      window.RCF_THOMPSON.apply(bundle);
      $("ghOut").textContent = "✅ Atualizado agora: pull + apply OK. Recarregue a página se necessário.";
    });
  }

  function ensurePublishQueueCard(adminView) {
    if ($("rcfQueueCard")) return;

    const wrap = document.createElement("div");
    wrap.id = "rcfQueueCard";
    wrap.className = "card";
    wrap.style.pointerEvents = "auto";

    wrap.innerHTML = `
      <h2>Publish Queue (OFFLINE)</h2>
      <p class="hint">Fila local para bundles (publicação real via API fica pra depois).</p>

      <div class="row" style="gap:10px; flex-wrap:wrap">
        <button id="qEnqueue" class="btn" type="button">Enfileirar bundle colado</button>
        <button id="qView" class="btn" type="button">Ver fila</button>
        <button id="qExport" class="btn" type="button">Exportar fila</button>
        <button id="qClear" class="btn danger" type="button">Limpar fila</button>
      </div>

      <pre id="qOut" class="mono small">${qSummary()}</pre>
    `;

    adminView.appendChild(wrap);

    bindTap($("qEnqueue"), () => {
      const bundle = parseBundleFromTextarea("motherBundleTextarea"); // usa textarea da Mãe
      qEnqueue(bundle);
      $("qOut").textContent = "✅ Enfileirado.\n" + qSummary();
    });

    bindTap($("qView"), () => {
      const q = qLoad();
      if (!q.length) { $("qOut").textContent = "Fila: 0 item."; return; }
      const lines = [];
      lines.push(qSummary());
      lines.push("");
      q.slice(0, 10).forEach((it, i) => {
        lines.push(`${i+1}) ${it.meta?.name || "-"} v${it.meta?.version || "-"} — ${it.at}`);
      });
      if (q.length > 10) lines.push(`… +${q.length - 10}`);
      $("qOut").textContent = lines.join("\n");
    });

    bindTap($("qExport"), () => {
      const txt = qExport();
      try { navigator.clipboard.writeText(txt); } catch {}
      $("qOut").textContent = "✅ Fila exportada (copiada no clipboard).\n" + qSummary();
    });

    bindTap($("qClear"), () => {
      qClear();
      $("qOut").textContent = "✅ Fila limpa.\nFila: 0 item.";
    });
  }

  // -------------------------
  // Admin base actions
  // -------------------------
  function bindBaseButtons() {
    // Se existirem handlers no core, tenta chamar. Se não, só mostra msg.
    bindTap($("btnDiagnose"), () => {
      try {
        if (window.RCF && typeof window.RCF.collectDiagnostics === "function") {
          const d = window.RCF.collectDiagnostics();
          setAdminOut("✅ Diagnóstico coletado.\n" + JSON.stringify(d, null, 2));
        } else {
          appendAdminOut("✅ Diagnosticar: (modo simples) — core não expôs collectDiagnostics().");
        }
      } catch (e) {
        appendAdminOut("❌ Diagnóstico erro: " + (e?.message || e));
      }
    });

    bindTap($("btnResetSafe"), () => {
      try {
        if (window.RCF_THOMPSON && typeof window.RCF_THOMPSON.resetAll === "function") {
          window.RCF_THOMPSON.resetAll();
          appendAdminOut("✅ Zerar (safe): overrides/histórico removidos.");
        } else {
          appendAdminOut("✅ Zerar (safe): (modo simples) — Thompson não expôs resetAll().");
        }
      } catch (e) {
        appendAdminOut("❌ Reset erro: " + (e?.message || e));
      }
    });
  }

  function init() {
    const adminView = ensureAdminView();

    // marca que admin.js carregou
    appendAdminOut("MAE UI carregada ✅ (app/js/admin.js)");

    bindBaseButtons();

    // recria os blocos que você falou que sumiram
    ensureGitHubCard(adminView);
    ensurePublishQueueCard(adminView);

    // status no topo (se existir)
    const st = $("statusText");
    if (st) st.textContent = "OK ✅";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
