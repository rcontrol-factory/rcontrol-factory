/* FILE: /app/js/core/ui_bindings.js
   RControl Factory — core/ui_bindings.js (LOGS HARD SCOPE v1.2.7)
   ✅ Mantém tudo do v1.2.6
   ✅ NOVO (DEGRAU 3): Apps Selection FIX
      - botão "Selecionar" agora grava activeSlug e NÃO deixa o Timesheet "travar" o preview
      - persistência em localStorage + state (RCF.state/RCF_STATE)
      - logs claros: ACTIVE set slug=...
========================================================= */

(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  function safeText(v) { return (v === undefined || v === null) ? "" : String(v); }

  function setBoxText(el, text) {
    if (!el) return;
    const t = safeText(text);
    const tag = (el.tagName || "").toUpperCase();
    if (tag === "TEXTAREA" || tag === "INPUT") el.value = t;
    else el.textContent = t;
  }

  function setTopStatus(msg) {
    const el = $("statusText");
    if (el) el.textContent = safeText(msg);
  }

  // ---------- iOS tap guard ----------
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
      try { fn(e); } catch {}
    };
    el.addEventListener("click", handler, { passive: false });
    el.addEventListener("touchend", handler, { passive: false });
  }

  function getCtx() {
    return window.RCF_STATE || (window.RCF_STATE = {
      autoMode: false,
      safeMode: true,
      currentFile: "index.html",
      lastPipelinePass: false,
      lastPipelineAt: 0
    });
  }

  function runCommand(cmd, outEl) {
    const ctx = getCtx();
    const handler = window.RCF_COMMANDS && typeof window.RCF_COMMANDS.handle === "function"
      ? window.RCF_COMMANDS.handle
      : null;

    let res = "";
    if (!handler) {
      res = "ERRO: core/commands.js não carregou (RCF_COMMANDS.handle não existe).";
    } else {
      try { res = handler(String(cmd || "").trim(), ctx); }
      catch (err) { res = "ERRO ao executar comando: " + (err && err.message ? err.message : String(err)); }
    }
    if (outEl) setBoxText(outEl, res);
    return res;
  }

  // ---------- logger ----------
  function tryReadLS(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return "";
      if (raw[0] === "[" || raw[0] === "{") {
        try {
          const v = JSON.parse(raw);
          if (Array.isArray(v)) return v.map(safeText).join("\n");
          if (typeof v === "string") return v;
          return raw;
        } catch {
          return raw;
        }
      }
      return raw;
    } catch {
      return "";
    }
  }

  function readLogsFromLocalStorageFallback() {
    const keys = ["logs", "rcf:logs", "factory:logs", "RCF_LOGS", "rcontrol:logs", "rcf:logs:extra", "rcf:fatal:last"];
    let best = "";
    for (const k of keys) {
      const t = tryReadLS(k);
      if (t && t.length > best.length) best = t;
    }
    return best;
  }

  function loggerGetText() {
    const L = window.RCF_LOGGER;
    if (L) {
      if (typeof L.getText === "function") return safeText(L.getText());
      if (typeof L.dump === "function") return safeText(L.dump());
      if (Array.isArray(L.lines)) return L.lines.map(safeText).join("\n");
      if (Array.isArray(L.buffer)) return L.buffer.map(safeText).join("\n");
    }
    return readLogsFromLocalStorageFallback();
  }

  function loggerClear() {
    const L = window.RCF_LOGGER;
    if (L) {
      if (typeof L.clear === "function") { try { return L.clear(); } catch {} }
      if (Array.isArray(L.lines)) L.lines.length = 0;
      if (Array.isArray(L.buffer)) L.buffer.length = 0;
    }
    try { localStorage.setItem("logs", JSON.stringify([])); } catch {}
    try { localStorage.setItem("rcf:logs", JSON.stringify([])); } catch {}
    try { localStorage.setItem("factory:logs", JSON.stringify([])); } catch {}
    try { localStorage.setItem("rcf:logs:extra", JSON.stringify([])); } catch {}
  }

  function loggerPush(level, msg) {
    const L = window.RCF_LOGGER;
    if (L && typeof L.push === "function") {
      try { L.push(level || "log", msg); } catch {}
    } else {
      try { console.log("[RCF]", msg); } catch {}
    }
  }

  // ---------- patchset ----------
  function patchApplyAll(outEl) {
    const P = window.RCF_PATCHSET;
    let rep = "";
    if (P && typeof P.applyAll === "function") {
      try { rep = P.applyAll(); }
      catch (e) { rep = "ERRO applyAll: " + safeText(e && e.message ? e.message : e); }
    } else {
      rep = "Patchset não disponível (RCF_PATCHSET.applyAll não existe).";
    }
    if (outEl) setBoxText(outEl, rep || "OK ✅");
    return rep;
  }

  function patchClear(outEl) {
    const P = window.RCF_PATCHSET;
    let rep = "";
    if (P && typeof P.clear === "function") {
      try { P.clear(); rep = "Patches descartados ✅"; }
      catch (e) { rep = "ERRO clear: " + safeText(e && e.message ? e.message : e); }
    } else {
      rep = "Patchset não disponível (RCF_PATCHSET.clear não existe).";
    }
    if (outEl) setBoxText(outEl, rep);
    return rep;
  }

  // ---------- diagnostics ----------
  async function runStabilityAndGetText() {
    const D = window.RCF_DIAGNOSTICS;

    if (D && typeof D.installAll === "function" && typeof D.runStabilityCheck === "function") {
      try { D.installAll(); } catch {}
      try {
        const r = await D.runStabilityCheck();
        return safeText(r && (r.text || r.reportText || r.summaryText || "")) || "(sem texto do relatório)";
      } catch (e) {
        return "ERRO: runStabilityCheck falhou: " + safeText(e && e.message ? e.message : e);
      }
    }

    if (D && typeof D.buildReport === "function") {
      try { return await D.buildReport(); } catch (e) {
        return "ERRO: buildReport falhou: " + safeText(e && e.message ? e.message : e);
      }
    }
    if (D && typeof D.run === "function") {
      try { return await D.run(); } catch (e) {
        return "ERRO: diag.run falhou: " + safeText(e && e.message ? e.message : e);
      }
    }

    const info = [];
    info.push("DIAG (fallback) ✅");
    info.push("RCF_DIAGNOSTICS: " + (!!window.RCF_DIAGNOSTICS));
    info.push("RCF_COMMANDS: " + (!!window.RCF_COMMANDS));
    info.push("RCF_PATCHSET: " + (!!window.RCF_PATCHSET));
    info.push("RCF_LOGGER: " + (!!window.RCF_LOGGER));
    const t = loggerGetText();
    info.push("loggerGetText(): " + (t && t.trim().length ? ("OK (" + t.length + " chars)") : "VAZIO"));
    return info.join("\n");
  }

  async function runStabilityAndGetResult() {
    const D = window.RCF_DIAGNOSTICS;
    if (D && typeof D.installAll === "function" && typeof D.runStabilityCheck === "function") {
      try { D.installAll(); } catch {}
      try {
        const r = await D.runStabilityCheck();
        const pass = !!(r && r.summary && r.summary.pass);
        const text = safeText(r && (r.text || "")) || "(sem texto do relatório)";
        return { ok:true, pass, text, summary: r.summary || null, raw: r };
      } catch (e) {
        return { ok:false, pass:false, text: "ERRO: runStabilityCheck falhou: " + safeText(e && e.message ? e.message : e), summary:null, raw:null };
      }
    }
    const text = await runStabilityAndGetText();
    return { ok:true, pass:false, text, summary:null, raw:null, warn:"diagnostics sem summary.pass" };
  }

  // ---------- pipeline (Daily Check-up) ----------
  async function runMaeUpdatePassive() {
    if (!window.RCF_MAE?.updateFromGitHub) throw new Error("RCF_MAE.updateFromGitHub ausente");
    return await window.RCF_MAE.updateFromGitHub({
      onProgress: (p) => {
        try {
          if (p?.step === "apply_progress") setTopStatus(`MAE: aplicando… ${p.done}/${p.total}`);
          if (p?.step === "apply_done") setTopStatus(`MAE: aplicado ${p.done}/${p.total}`);
        } catch {}
      }
    });
  }

  async function applySavedManual() {
    if (!window.RCF_MAE?.applySaved) throw new Error("RCF_MAE.applySaved ausente");
    return await window.RCF_MAE.applySaved({
      onProgress: (p) => {
        try {
          if (p?.step === "apply_progress") setTopStatus(`Apply: ${p.done}/${p.total}`);
          if (p?.step === "apply_done") setTopStatus(`Apply: OK ${p.done}/${p.total}`);
        } catch {}
      }
    });
  }

  async function dailyCheckup(outEl) {
    const ctx = getCtx();
    ctx.lastPipelineAt = Date.now();
    ctx.lastPipelinePass = false;

    const out = outEl || $("adminOut") || $("diagOut");

    try {
      setTopStatus("Daily Check-up: baixando bundle…");
      if (out) setBoxText(out, "Daily Check-up: iniciando…");

      const mae = await runMaeUpdatePassive();

      setTopStatus("Daily Check-up: stability check…");
      const diag = await runStabilityAndGetResult();

      const pass = !!diag.pass;
      ctx.lastPipelinePass = pass;

      const head = [];
      head.push("=========================================================");
      head.push("RCF — DAILY CHECK-UP (RESULT)");
      head.push("=========================================================");
      head.push("MAE update: " + (mae && mae.ok ? "OK" : "OK (sem objeto)"));
      head.push("Bundle saved: " + (mae && mae.saved ? "YES" : "UNKNOWN"));
      head.push("Passive mode: " + (mae && mae.passive ? "YES" : "UNKNOWN"));
      head.push("Stability: " + (pass ? "PASS ✅ (APROVADO)" : "FAIL ❌ (REPROVADO)"));
      head.push("Manual apply: " + (pass ? "LIBERADO ✅ (use 'Apply Saved')" : "BLOQUEADO ❌"));
      head.push("=========================================================");
      head.push("");

      const full = head.join("\n") + safeText(diag.text || "");

      if (out) setBoxText(out, full);
      setTopStatus(pass ? "Daily Check-up: APROVADO ✅" : "Daily Check-up: REPROVADO ❌");
      setTimeout(() => setTopStatus("OK ✅"), 1200);

      return { ok:true, pass, mae, diag };
    } catch (e) {
      const msg = "ERRO Daily Check-up: " + safeText(e && e.message ? e.message : e);
      if (out) setBoxText(out, msg);
      setTopStatus("Daily Check-up: ERRO ❌");
      setTimeout(() => setTopStatus("OK ✅"), 1200);
      return { ok:false, pass:false, error: msg };
    }
  }

  // ---------- logs hard scope ----------
  function isAllowedLogsContainer(el) {
    if (!el || !el.closest) return false;
    return !!el.closest('#view-logs, [data-view="logs"]');
  }

  function enforceLogsScopeNow() {
    const ids = ["logsBox", "logsOut", "logsViewBox", "logsView", "logsPre", "logsArea"];
    for (const id of ids) {
      const el = $(id);
      if (!el) continue;

      const ok = isAllowedLogsContainer(el);
      if (!ok) {
        setBoxText(el, "");
        try {
          el.style.display = "none";
          el.style.height = "0";
          el.style.margin = "0";
          el.style.padding = "0";
        } catch {}
      } else {
        try {
          el.style.display = "";
          el.style.height = "";
          el.style.margin = "";
          el.style.padding = "";
        } catch {}
      }
    }
  }

  // ---------- UI inject (pipeline buttons) ----------
  function findAdminButtonRow() {
    const diagBtn = $("btnAdminDiag");
    if (diagBtn && diagBtn.parentElement) return diagBtn.parentElement;

    const out = $("adminOut");
    if (out) {
      let p = out.parentElement;
      for (let i = 0; i < 6 && p; i++) {
        const btns = p.querySelectorAll("button");
        if (btns && btns.length >= 2) return p;
        p = p.parentElement;
      }
    }
    return null;
  }

  function makeBtn(id, text) {
    const b = document.createElement("button");
    b.type = "button";
    b.id = id;
    b.textContent = text;
    const any = document.querySelector("button");
    try { if (any && any.className) b.className = any.className; } catch {}
    return b;
  }

  function ensurePipelineButtons() {
    const row = findAdminButtonRow();
    if (!row) return false;

    if (!$("btnDailyCheckup")) {
      const b = makeBtn("btnDailyCheckup", "Daily Check-up");
      const ref = $("btnAdminDiag") || row.querySelector("button");
      try { (ref || row).insertAdjacentElement("afterend", b); }
      catch { row.appendChild(b); }
    }

    if (!$("btnApplySavedManual")) {
      const b2 = makeBtn("btnApplySavedManual", "Apply Saved (manual)");
      try { row.appendChild(b2); } catch {}
    }

    return true;
  }

  function updateApplyButtonEnabled() {
    const ctx = getCtx();
    const b = $("btnApplySavedManual");
    if (!b) return;
    const can = !!ctx.lastPipelinePass;
    try {
      b.disabled = !can;
      b.style.opacity = can ? "" : "0.55";
    } catch {}
  }

  // ---------- Generator (NEW) ----------
  function findFirst(ids) {
    for (const id of ids) {
      const el = $(id);
      if (el) return el;
    }
    return null;
  }

  function getGenOutEl() {
    return findFirst(["genOut", "generatorOut", "genBox", "genPreviewBox", "genPre", "previewOut", "outGen"]);
  }

  function ensureTemplatePickerNear(buttonEl) {
    const existing = document.querySelector("#genTemplate, #templatePick, #tplPick, select[data-rcf='template']");
    if (existing) return existing;

    if (!buttonEl || !buttonEl.parentElement) return null;

    const sel = document.createElement("select");
    sel.id = "genTemplate";
    sel.setAttribute("data-rcf", "template");
    try { sel.className = (buttonEl.className || "").replace(/\bbtn\b/g, "").trim(); } catch {}
    sel.style.minWidth = "240px";

    try { buttonEl.insertAdjacentElement("beforebegin", sel); }
    catch { buttonEl.parentElement.appendChild(sel); }

    return sel;
  }

  function fillTemplatePicker(sel) {
    const R = window.RCF_TEMPLATE_REGISTRY;
    if (!sel || !R || typeof R.list !== "function" || typeof R.get !== "function") return false;

    const list = R.list();
    sel.innerHTML = "";
    for (const id of list) {
      const tpl = R.get(id);
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = (tpl && tpl.title) ? (tpl.title + " — " + id) : id;
      sel.appendChild(opt);
    }

    if (list.includes("timesheet-lite")) sel.value = "timesheet-lite";
    else sel.value = list[0] || "pwa-base";

    return true;
  }

  async function generatorBuildZip() {
    const out = getGenOutEl();
    const picker = document.querySelector("#genTemplate, #templatePick, #tplPick, select[data-rcf='template']");
    const tplId = picker ? String(picker.value || "pwa-base") : "pwa-base";

    try {
      setTopStatus("Generator: gerando ZIP…");
      if (out) setBoxText(out, "Gerando ZIP… template=" + tplId);

      const B = window.RCF_BUILDER;
      if (!B || typeof B.buildZip !== "function") throw new Error("RCF_BUILDER.buildZip ausente (builder.js).");

      const spec = {
        name: (tplId === "timesheet-lite") ? "Timesheet Lite" : "Meu App",
        themeColor: "#0b1020"
      };

      const r = await B.buildZip({ templateId: tplId, spec, filename: spec.name });
      if (!r || !r.ok || !r.blob) throw new Error("buildZip não retornou blob.");

      B.downloadBlob(r.blob, r.filename);

      try {
        const V = window.RCF_ZIP_VAULT;
        const importFn = V?.importBlob || V?.importZipBlob || V?.import || V?.saveBlob || null;
        if (typeof importFn === "function") {
          await importFn.call(V, r.blob, r.filename, { templateId: tplId, spec });
        }
      } catch {}

      const msg = "ZIP OK ✅ files=" + (r.filesCount || "?") + " bytes=" + (r.bytes || "?") + " (" + tplId + ")";
      if (out) setBoxText(out, msg);
      setTopStatus("Generator: ZIP OK ✅");
      setTimeout(() => setTopStatus("OK ✅"), 900);
    } catch (e) {
      const msg = "ERR Generator ZIP: " + safeText(e && e.message ? e.message : e);
      if (out) setBoxText(out, msg);
      setTopStatus("Generator: ERRO ❌");
      setTimeout(() => setTopStatus("OK ✅"), 900);
    }
  }

  function generatorPreview() {
    const out = getGenOutEl();
    const picker = document.querySelector("#genTemplate, #templatePick, #tplPick, select[data-rcf='template']");
    const tplId = picker ? String(picker.value || "pwa-base") : "pwa-base";

    try {
      const B = window.RCF_BUILDER;
      if (!B || typeof B.buildPreviewHTML !== "function") throw new Error("RCF_BUILDER.buildPreviewHTML ausente.");

      const spec = {
        name: (tplId === "timesheet-lite") ? "Timesheet Lite" : "Meu App",
        themeColor: "#0b1020"
      };

      const html = B.buildPreviewHTML(tplId, spec);

      if (out) setBoxText(out, "Preview pronto ✅ (index.html) — template=" + tplId + "\n\n" + html.slice(0, 1200) + (html.length > 1200 ? "\n\n...(cortado)" : ""));
      setTopStatus("Preview: OK ✅");
      setTimeout(() => setTopStatus("OK ✅"), 900);
    } catch (e) {
      const msg = "ERR Preview: " + safeText(e && e.message ? e.message : e);
      if (out) setBoxText(out, msg);
      setTopStatus("Preview: ERRO ❌");
      setTimeout(() => setTopStatus("OK ✅"), 900);
    }
  }

  function bindGenerator() {
    const btnPreview = findFirst(["btnGenPreview", "btnPreview", "btnGeneratorPreview"]);
    const btnBuild = findFirst(["btnGenBuildZip", "btnBuildZip", "btnGenZip", "btnGeneratorBuild"]);

    const picker = ensureTemplatePickerNear(btnBuild || btnPreview);
    try { fillTemplatePicker(picker); } catch {}

    if (btnBuild) bindTap(btnBuild, async () => await generatorBuildZip());
    if (btnPreview) bindTap(btnPreview, () => generatorPreview());

    if (btnBuild || btnPreview) {
      loggerPush("log", "Generator bind OK ✅ (ui_bindings v1.2.7)");
    }
  }

  // =========================================================
  // ✅ DEGRAU 3 — APPS SELECTION FIX (delegação)
  // =========================================================
  function looksLikeSlug(s) {
    const x = String(s || "").trim();
    if (!x) return false;
    if (x.length < 3) return false;
    // slug típico: letras/números/hífen/underscore
    return /^[a-z0-9][a-z0-9\-_]{2,}$/i.test(x);
  }

  function findSlugInCard(card) {
    if (!card) return "";

    // 1) data attrs
    const attrs = ["data-app-slug", "data-slug", "data-app", "data-id"];
    for (const a of attrs) {
      try {
        const v = card.getAttribute(a);
        if (v && looksLikeSlug(v)) return String(v).trim();
      } catch {}
    }

    // 2) elementos comuns
    const probes = [
      "[data-app-slug]",
      "[data-slug]",
      ".appSlug",
      ".slug",
      ".muted",
      "small",
      "code",
      "p",
      "div",
      "span"
    ];

    for (const sel of probes) {
      try {
        const els = card.querySelectorAll(sel);
        for (const el of els) {
          const t = String(el?.textContent || "").trim();
          // pega a linha mais “slug-like”
          const lines = t.split("\n").map(s => s.trim()).filter(Boolean);
          for (const line of lines) {
            if (looksLikeSlug(line)) return line;
          }
          if (looksLikeSlug(t)) return t;
        }
      } catch {}
    }

    // 3) fallback: varre todo texto do card e tenta achar algo slug-like
    try {
      const txt = String(card.textContent || "");
      const tokens = txt.split(/\s+/).map(s => s.trim()).filter(Boolean);
      for (const tok of tokens) {
        const clean = tok.replace(/[^\w\-]/g, "");
        if (looksLikeSlug(clean)) return clean;
      }
    } catch {}

    return "";
  }

  function setActiveSlugEverywhere(slug) {
    const s = String(slug || "").trim();
    if (!s) return false;

    // 1) state
    try {
      if (window.RCF?.state) {
        window.RCF.state.active = window.RCF.state.active || {};
        window.RCF.state.active.appSlug = s;
        window.RCF.state.active.slug = s;
      }
    } catch {}

    try {
      const st = getCtx();
      st.active = st.active || {};
      st.active.appSlug = s;
      st.active.slug = s;
    } catch {}

    // 2) localStorage (as chaves que preview_runner já tenta ler)
    const keys = [
      "rcf:active:app",
      "rcf:active:slug",
      "rcf:activeAppSlug",
      "rcf:lastAppSlug"
    ];
    for (const k of keys) {
      try { localStorage.setItem(k, s); } catch {}
    }

    // marca “user selected” (útil pra debugar / futuros guards)
    try { localStorage.setItem("rcf:userSelectedAt", String(Date.now())); } catch {}

    return true;
  }

  function tryRefreshUI() {
    // não inventa arquitetura: só tenta refresh se já existir
    const fns = [
      window.RCF?.render,
      window.RCF?.refresh,
      window.RCF?.ui?.render,
      window.RCF?.ui?.refresh,
      window.RCF_UI?.render,
      window.RCF_UI?.refresh
    ];
    for (const fn of fns) {
      if (typeof fn === "function") {
        try { fn(); return true; } catch {}
      }
    }
    return false;
  }

  function bindAppsSelectionButtons() {
    // v1.2.10: sem delegation global — bind por botão com guard no próprio elemento
    try {
      const candidates = Array.from(document.querySelectorAll("button, a, [role='button']"));
      let bound = 0;

      for (const el of candidates) {
        try {
          if (!el || !el.textContent) continue;

          const txt = String(el.textContent || "").trim().toLowerCase();
          const action = String(el.getAttribute("data-rcf-action") || "").trim().toLowerCase();
          const id = String(el.id || "").trim().toLowerCase();

          const isSelect =
            txt === "selecionar" ||
            txt.includes("selecionar") ||
            action.includes("select") ||
            action.includes("app.select") ||
            id.includes("select");

          if (!isSelect) continue;

          // evita bind duplicado no mesmo elemento
          if (el.dataset && el.dataset.rcfAppsSelectBound === "1") continue;
          if (el.dataset) el.dataset.rcfAppsSelectBound = "1";

          el.addEventListener("click", (ev) => {
            try {
              // dedupe rápido por elemento (iOS pode gerar sequência)
              const now = Date.now();
              const last = Number(el.dataset?.rcfAppsSelectLastTs || "0");
              if (last && (now - last) < 450) return;
              if (el.dataset) el.dataset.rcfAppsSelectLastTs = String(now);

              const card = el.closest ? el.closest("[data-app-card], [data-app], .card, .appCard, li, .item, .row, div") : null;
              const slug = findSlugInCard(card || el.parentElement);

              if (!slug) {
                loggerPush("WARN", "APP SELECT: não consegui achar slug no card.");
                return;
              }

              try { ev.preventDefault(); ev.stopPropagation(); } catch {}

              const ok = setActiveSlugEverywhere(slug);
              if (ok) {
                loggerPush("INFO", "ACTIVE set ✅ slug=" + slug);
                setTopStatus("App ativo: " + slug);
                setTimeout(() => setTopStatus("OK ✅"), 900);
                tryRefreshUI();
              }
            } catch {}
          }, { passive: false });

          bound++;
        } catch {}
      }

      if (bound > 0) loggerPush("log", "Apps select bind OK ✅ (buttons) bound=" + bound);
    } catch {}
  }

  // ---------- existing binds ----------
  function bindAgent() {
    const input = $("agentCmd");
    const out = $("agentOut");
    const btnRun = $("btnAgentRun");
    const btnClear = $("btnAgentClear");
    const btnApprove = $("btnAgentApprove");
    const btnDiscard = $("btnAgentDiscard");

    if (btnRun && input) bindTap(btnRun, () => runCommand(input.value, out));
    if (btnClear && input) bindTap(btnClear, () => { input.value = ""; if (out) setBoxText(out, "Limpo."); });
    if (btnApprove) bindTap(btnApprove, () => patchApplyAll(out));
    if (btnDiscard) bindTap(btnDiscard, () => patchClear(out));

    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runCommand(input.value, out); }
      });
    }
  }

  function bindAdmin() {
    const out = $("adminOut");
    const btnDiag = $("btnAdminDiag");
    const btnClear = $("btnAdminClear");
    const btnApply = $("btnAdminApply");
    const btnDiscard = $("btnAdminDiscard");

    if (btnDiag) bindTap(btnDiag, async () => { const rep = await runStabilityAndGetText(); if (out) setBoxText(out, rep); });
    if (btnClear) bindTap(btnClear, () => { if (out) setBoxText(out, "Limpo."); });
    if (btnApply) bindTap(btnApply, () => patchApplyAll(out));
    if (btnDiscard) bindTap(btnDiscard, () => patchClear(out));

    ensurePipelineButtons();
    updateApplyButtonEnabled();

    const btnPipe = $("btnDailyCheckup");
    const btnApplySaved = $("btnApplySavedManual");

    if (btnPipe) bindTap(btnPipe, async () => {
      const r = await dailyCheckup(out);
      updateApplyButtonEnabled();
      return r;
    });

    if (btnApplySaved) bindTap(btnApplySaved, async () => {
      const ctx = getCtx();
      if (!ctx.lastPipelinePass) {
        if (out) setBoxText(out, "BLOQUEADO ❌: rode 'Daily Check-up' e precisa PASS ✅ antes de aplicar.");
        setTopStatus("Apply Saved: BLOQUEADO ❌");
        setTimeout(() => setTopStatus("OK ✅"), 900);
        return;
      }
      try {
        setTopStatus("Apply Saved: aplicando…");
        const r = await applySavedManual();
        if (out) setBoxText(out, "OK: applySaved ✅ " + safeText(r ? JSON.stringify(r) : ""));
        setTopStatus("Apply Saved: OK ✅");
        setTimeout(() => setTopStatus("OK ✅"), 1200);
      } catch (e) {
        const msg = "ERR applySaved: " + safeText(e && e.message ? e.message : e);
        if (out) setBoxText(out, msg);
        setTopStatus("Apply Saved: ERRO ❌");
        setTimeout(() => setTopStatus("OK ✅"), 1200);
      }
    });
  }

  function bindDiagnosticsView() {
    const out = $("diagOut");
    const btnRun = $("btnDiagRun");
    const btnClear = $("btnDiagClear");

    const run = async () => {
      setTopStatus("Diagnostics: rodando...");
      const rep = await runStabilityAndGetText();
      if (out) setBoxText(out, rep);
      setTopStatus("Diagnostics: pronto ✅");
      setTimeout(() => setTopStatus("OK ✅"), 900);
    };

    if (btnRun) bindTap(btnRun, run);
    if (btnClear) bindTap(btnClear, () => { if (out) setBoxText(out, "Pronto."); setTopStatus("OK ✅"); });
  }

  function bindLogsView() {
    const logsViewBox =
      $("logsOut") || $("logsViewBox") || $("logsView") || $("logsPre") || $("logsArea") || $("logsBox");

    const btnRefresh = $("btnLogsRefresh");
    const btnCopy = $("btnLogsCopy");
    const btnClear = $("btnLogsClear");
    const btnClearLogs = $("btnClearLogs");
    const btnCopyLogs = $("btnCopyLogs");

    const refresh = () => {
      enforceLogsScopeNow();
      const text = loggerGetText();
      const outTxt = text && text.trim().length ? text : "(sem logs ainda)";
      if (logsViewBox && isAllowedLogsContainer(logsViewBox)) setBoxText(logsViewBox, outTxt);
      setTopStatus("Logs atualizados ✅");
      setTimeout(() => setTopStatus("OK ✅"), 900);
    };

    const copy = async () => {
      const text = loggerGetText() || "";
      try { await navigator.clipboard.writeText(text); setTopStatus("Logs copiados ✅"); setTimeout(() => setTopStatus("OK ✅"), 900); }
      catch { alert("iOS bloqueou copiar. Selecione e copie manual."); }
    };

    const clear = () => { loggerClear(); refresh(); };

    if (btnRefresh) bindTap(btnRefresh, refresh);
    if (btnCopy) bindTap(btnCopy, copy);
    if (btnClear) bindTap(btnClear, clear);
    if (btnClearLogs) bindTap(btnClearLogs, clear);
    if (btnCopyLogs) bindTap(btnCopyLogs, copy);

    refresh();
  }

  function init() {
    document.body.addEventListener("touchstart", () => {}, { passive: true });

    bindAgent();
    bindAdmin();
    bindDiagnosticsView();
    bindLogsView();

    // ✅ NEW
    bindGenerator();

    // ✅ DEGRAU 3
    bindAppsSelectionButtons();

    enforceLogsScopeNow();

    try {
      const obs = new MutationObserver(() => {
        enforceLogsScopeNow();
        try { ensurePipelineButtons(); updateApplyButtonEnabled(); } catch {}
        try { bindGenerator(); } catch {}
        // mantém o bind do select vivo mesmo com re-render
        try { bindAppsSelectionButtons(); } catch {}
      });
      obs.observe(document.body, { attributes: true, attributeFilter: ["data-view", "class"] });
    } catch {}

    window.RCF_UI_BINDINGS = {
      __v127: true,
      dailyCheckup: async () => await dailyCheckup($("adminOut") || $("diagOut")),
      applySavedManual: async () => await applySavedManual(),
      generatorBuildZip: async () => await generatorBuildZip(),
      generatorPreview: () => generatorPreview(),
      // expõe helper (útil se você quiser testar no console)
      setActiveAppSlug: (slug) => setActiveSlugEverywhere(slug)
    };

    loggerPush("log", "core/ui_bindings.js carregado ✅ (v1.2.10 HARD LOGS + PIPELINE + GENERATOR + APPS SELECT)");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
