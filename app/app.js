/* =========================================================
 RCONTROL FACTORY — app.js (CORE BOOTSTRAP)
 Offline-first | iOS Safari safe | Replit-like Agent
========================================================= */

(function () {
  'use strict';

  /* ===============================
     STATE
  =============================== */
  const STATE = {
    view: 'agent', // agent | admin | diag | logs
    currentApp: null,
    currentFile: null,
    autoMode: false,
    safeMode: true
  };

  /* ===============================
     HELPERS
  =============================== */
  function qs(sel) {
    return document.querySelector(sel);
  }

  function qsa(sel) {
    return Array.from(document.querySelectorAll(sel));
  }

  function log(msg) {
    console.log('[RCF]', msg);
    if (window.RCF_LOGGER) {
      window.RCF_LOGGER.push(msg);
    }
  }

  function show(el) {
    if (el) el.style.display = '';
  }

  function hide(el) {
    if (el) el.style.display = 'none';
  }

  /* ===============================
     VIEW SWITCHER
  =============================== */
  function switchView(view) {
    STATE.view = view;

    qsa('[data-view]').forEach(el => {
      el.style.display = el.dataset.view === view ? '' : 'none';
    });

    qsa('.dockbtn').forEach(btn => {
      btn.classList.toggle(
        'active',
        btn.dataset.view === view
      );
    });

    log('View switched to: ' + view);
  }

  /* ===============================
     INIT UI
  =============================== */
  function initUI() {
    // Dock buttons
    qsa('.dockbtn').forEach(btn => {
      btn.addEventListener('click', () => {
        switchView(btn.dataset.view);
      });
    });

    // Default view
    switchView('agent');

    // Buttons safety (iOS)
    document.body.addEventListener('touchstart', () => {}, { passive: true });

    log('UI initialized');
  }

  /* ===============================
     AGENT COMMAND PIPE
  =============================== */
  function runAgentCommand(input) {
    if (!window.RCF_COMMANDS) {
      log('Commands core not loaded');
      return;
    }

    const result = window.RCF_COMMANDS.handle(input, STATE);

    const out = qs('#agentOut');
    if (out && result) {
      out.textContent = result;
    }
  }

  function bindAgent() {
    const input = qs('#agentInput');
    const btnRun = qs('#btnAgentRun');
    const btnClear = qs('#btnAgentClear');

    if (!input || !btnRun) return;

    btnRun.addEventListener('click', () => {
      runAgentCommand(input.value.trim());
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        runAgentCommand(input.value.trim());
      }
    });

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        input.value = '';
      });
    }

    log('Agent bindings ready');
  }

  /* ===============================
     ADMIN SELF-HEAL
  =============================== */
  function bindAdmin() {
    const btnApply = qs('#btnAdminApply');
    const btnClear = qs('#btnAdminClear');

    if (btnApply) {
      btnApply.addEventListener('click', () => {
        if (window.RCF_PATCHSET) {
          window.RCF_PATCHSET.applyAll();
        }
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        const out = qs('#adminOut');
        if (out) out.textContent = '';
      });
    }

    log('Admin bindings ready');
  }

  /* ===============================
     DIAG + LOGS
  =============================== */
  function bindDiagLogs() {
    const btnClearLogs = qs('#btnClearLogs');
    const btnCopyLogs = qs('#btnCopyLogs');

    if (btnClearLogs) {
      btnClearLogs.addEventListener('click', () => {
        if (window.RCF_LOGGER) {
          window.RCF_LOGGER.clear();
        }
      });
    }

    if (btnCopyLogs) {
      btnCopyLogs.addEventListener('click', async () => {
        if (!window.RCF_LOGGER) return;
        try {
          await navigator.clipboard.writeText(
            window.RCF_LOGGER.dump()
          );
          alert('Logs copiados');
        } catch (e) {
          alert('Falha ao copiar logs');
        }
      });
    }

    log('Diag/Logs bindings ready');
  }

  /* ===============================
     BOOTSTRAP
  =============================== */
  function boot() {
    log('Booting RControl Factory');

    initUI();
    bindAgent();
    bindAdmin();
    bindDiagLogs();

    // Expose state (debug)
    window.RCF_STATE = STATE;

    log('Factory ready');
  }

  /* ===============================
     DOM READY
  =============================== */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
