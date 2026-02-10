/* core/ui_bindings.js
   - iOS Safari touch/click reliability
   - binds buttons even if IDs differ (by label fallback)
*/

(function () {
  "use strict";

  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.from(document.querySelectorAll(sel)); }
  function txt(el) { return (el?.textContent || "").trim().toLowerCase(); }

  function findButtonByText(wanted) {
    wanted = wanted.toLowerCase();
    const btns = $all("button, a[role='button']");
    return btns.find(b => txt(b) === wanted) || null;
  }

  function bindTap(el, fn) {
    if (!el) return;
    // iOS: use pointer + click fallback
    el.addEventListener("pointerup", (e) => { e.preventDefault(); fn(e); }, { passive: false });
    el.addEventListener("click", (e) => { e.preventDefault(); fn(e); }, { passive: false });
  }

  function safeGetAgentInput() {
    return (
      $("#agentInput") ||
      $("#agentIn") ||
      $("input[name='agent']") ||
      $("textarea[name='agent']") ||
      $("input[type='text']") // fallback
    );
  }

  function safeGetAgentOut() {
    return $("#agentOut") || $("#resultOut") || $("#result") || $("pre");
  }

  function setOut(pre, text) {
    if (!pre) return;
    pre.textContent = text;
  }

  function buildResultText(res) {
    const head = res.title ? (res.title + "\n") : "";
    const body = (res.lines || []).join("\n");
    const footer = "\n\n" +
      `active: ${res.active?.slug || "-"} | file: ${res.active?.file || "-"}` +
      `\nauto=${res.modes?.auto ? "ON" : "OFF"} | safe=${res.modes?.safe ? "ON" : "OFF"}` +
      `\nwriteMode=${res.writeMode?.on ? "ON" : "OFF"}` +
      `\npending=${res.pending ? (res.pending.type + " → " + (res.pending.file || "")) : "none"}`;
    return head + body + footer;
  }

  function updateBadges() {
    // tries to update "Sem app ativo" / OK chips if present
    try {
      const core = window.RCF?.core;
      if (!core) return;

      const active = core.getActiveSlug();
      const pending = core.getPending();

      // find badge container by common texts
      const chips = $all("div,span").filter(el => {
        const t = txt(el);
        return t.includes("sem app ativo") || t.includes("ok") || t.includes("nome/slug");
      });

      // update "Sem app ativo" chip if exists
      const sem = chips.find(el => txt(el).includes("sem app ativo"));
      if (sem) sem.textContent = active ? ("Ativo: " + active) : "Sem app ativo";

      // show a tiny pending mark if we can find approve button
      const approve = findButtonByText("aprovar sugestão");
      if (approve) {
        approve.disabled = !pending;
        approve.style.opacity = pending ? "1" : "0.45";
      }

    } catch {}
  }

  function openView(viewName) {
    // If your app uses data-view switching, we trigger it here
    const btn = $all("[data-view]").find(b => (b.getAttribute("data-view") || "") === viewName);
    if (btn) btn.click();
  }

  function initDock() {
    // bottom dock buttons: data-view="agente/admin/settings..."
    $all(".dockbtn,[data-view]").forEach(btn => {
      bindTap(btn, () => {
        // if your app already handles it, this won't break; it's a tap fix
      });
    });
  }

  function initTools() {
    const core = window.RCF?.core;
    if (!core) return;

    const logsBox = $("#logsBox");
    const btnCopyLogs = $("#btnCopyLogs") || findButtonByText("copiar logs");
    const btnClearLogs = $("#btnClearLogs") || findButtonByText("limpar logs");

    bindTap(btnClearLogs, () => {
      core.clearLogs();
      if (logsBox) logsBox.textContent = "";
      updateBadges();
    });

    bindTap(btnCopyLogs, async () => {
      const logs = core.getLogs();
      const text = logs.map(l => `${l.ts} [${l.level}] ${l.msg} ${l.data ? JSON.stringify(l.data) : ""}`).join("\n");
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // fallback
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
    });

    // If logsBox exists, show logs on load
    if (logsBox) {
      const logs = core.getLogs();
      logsBox.textContent = logs.map(l => `${l.ts} [${l.level}] ${l.msg}`).join("\n");
    }
  }

  function initAgent() {
    const core = window.RCF?.core;
    if (!core) return;

    const input = safeGetAgentInput();
    const out = safeGetAgentOut();

    const btnRun =
      $("#btnAgentRun") || $("#btnRun") || findButtonByText("executar");

    const btnClear =
      $("#btnAgentClear") || $("#btnClear") || findButtonByText("limpar");

    const btnApprove =
      $("#btnAgentApprove") || $("#btnApprove") || findButtonByText("aprovar sugestão");

    const btnDiscard =
      $("#btnAgentDiscard") || $("#btnDiscard") || findButtonByText("descartar sugestão");

    function doRun(text) {
      const res = core.run(text);
      setOut(out, buildResultText(res));
      updateBadges();
      return res;
    }

    bindTap(btnRun, () => {
      const v = (input?.value || "").trim();
      if (!v) return;
      doRun(v);
    });

    bindTap(btnClear, () => {
      if (input) input.value = "";
      setOut(out, "");
      updateBadges();
    });

    bindTap(btnApprove, () => {
      doRun("apply");
    });

    bindTap(btnDiscard, () => {
      doRun("discard");
    });

    // Allow Enter to execute (but keep paste-friendly)
    if (input && input.tagName.toLowerCase() !== "textarea") {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const v = (input.value || "").trim();
          if (v) doRun(v);
        }
      });
    }

    // First paint
    updateBadges();
  }

  function init() {
    initDock();
    initAgent();
    initTools();
    updateBadges();
  }

  // wait DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
