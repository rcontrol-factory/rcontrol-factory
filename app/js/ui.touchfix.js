/* /app/js/ui.touchfix.js
   RCF — Click/Tap Hardening (iOS Safari)
   Objetivo: garantir que botões do “miolo” (Settings/Admin/Manutenção)
   respondam SEM depender de binds individuais que “morrem”.
*/
(() => {
  "use strict";

  const log = (...a) => {
    try { (window.RCF?.log ? window.RCF.log : console.log)(...a); } catch {}
  };

  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);

  // pega o botão/elemento clicável “de verdade”
  function pickActionTarget(ev) {
    const t = ev.target;
    if (!t || !t.closest) return null;

    // Não interferir em campos editáveis
    if (t.closest("input, textarea, select")) return null;

    // Elementos clicáveis do RCF
    return t.closest(
      "button, a, .btn, .tab, .dockbtn, [data-view], label, .file-item"
    );
  }

  // executa ações por id (fallback quando listeners individuais falham)
  function runById(id) {
    if (!id) return false;

    // ===== SETTINGS / SEGURANÇA =====
    if (id === "btnPinSave") {
      const v = (document.querySelector("#pinInput")?.value || "").trim();
      if (!/^[0-9]{4,8}$/.test(v)) {
        log("PIN inválido (4-8 dígitos).");
        return true;
      }
      try { localStorage.setItem("rcf:adminPin", v); } catch {}
      log("PIN salvo ✅");
      return true;
    }

    if (id === "btnPinRemove") {
      try { localStorage.removeItem("rcf:adminPin"); } catch {}
      log("PIN removido ✅");
      return true;
    }

    // ===== LOGS =====
    if (id === "btnLogsRefresh") {
      try {
        window.RCF?.log?.("Logs atualizados ✅");
        // força refresh se existir helper no app.js
        window.RCF?.refreshLogs?.();
      } catch {}
      return true;
    }

    if (id === "btnLogsClear") {
      try { window.RCF_LOGGER?.clear?.(); } catch {}
      try { window.RCF?.log?.("Logs limpos ✅"); } catch {}
      return true;
    }

    if (id === "btnLogsCopy") {
      const txt = (window.RCF_LOGGER?.dump?.() || "");
      navigator.clipboard?.writeText?.(txt).catch(()=>{});
      log("Logs copiados ✅");
      return true;
    }

    if (id === "btnLogsExport") {
      // export .txt
      const txt = (window.RCF_LOGGER?.dump?.() || "");
      try {
        const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "rcf-logs.txt";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
          a.remove();
        }, 300);
      } catch {}
      log("Export logs ✅");
      return true;
    }

    // ===== ATALHOS =====
    if (id === "btnGoDiagnose") {
      try { window.RCF?.setView?.("diagnostics"); } catch {}
      return true;
    }

    if (id === "btnGoAdmin") {
      try { window.RCF?.setView?.("admin"); } catch {}
      return true;
    }

    // ===== ADMIN (fallback) =====
    if (id === "btnAdminDiag") {
      try {
        const out = document.querySelector("#adminOut");
        if (out && window.RCF?.adminDiagnostics) out.textContent = window.RCF.adminDiagnostics();
      } catch {}
      log("Diag ✅");
      return true;
    }

    if (id === "btnAdminZeroSafe") {
      // “zerar safe”: limpa overrides do SW (se tiver)
      try { window.RCF_VFS?.clearAll?.(); } catch {}
      log("Zerar (safe) ✅");
      return true;
    }

    // ===== MAE / MANUTENÇÃO =====
    if (id === "btnMotherApplyJson") { log("Aplicar mother_bundle.json (hook)"); return true; }
    if (id === "btnMotherDryRun") { log("Dry-run (hook)"); return true; }
    if (id === "btnMotherRollback") { log("Rollback (hook)"); return true; }
    if (id === "btnMotherExport") { log("Export bundle atual (hook)"); return true; }
    if (id === "btnMotherResetAll") { log("Zerar tudo (hook)"); return true; }

    return false;
  }

  // iOS: um toque pode “matar” cliques seguintes quando o preventDefault acontece errado.
  // Aqui a gente faz um “bridge” bem estável: captura touchend e click.
  let guard = 0;

  function handler(ev) {
    const target = pickActionTarget(ev);
    if (!target) return;

    // evita repetição muito rápida
    const t = Date.now();
    if (t - guard < 120) return;
    guard = t;

    // se é touchend, a gente garante que vira ação imediatamente
    if (ev.type === "touchend") {
      try { ev.preventDefault(); ev.stopPropagation(); } catch {}
      const id = target.id || target.getAttribute("id");
      if (runById(id)) return;

      // fallback final: dispara click de verdade
      try { target.click(); } catch {}
      return;
    }

    // click normal: roda fallback se necessário
    const id = target.id || target.getAttribute("id");
    if (runById(id)) {
      try { ev.preventDefault(); ev.stopPropagation(); } catch {}
      return;
    }
  }

  // captura ANTES de qualquer outra coisa
  document.addEventListener("touchend", handler, { capture: true, passive: false });
  document.addEventListener("click", handler, { capture: true, passive: false });

  if (isIOS) log("ui.touchfix loaded ✅ (iOS hardening)");
})();
