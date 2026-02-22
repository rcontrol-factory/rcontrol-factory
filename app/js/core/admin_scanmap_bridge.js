/* FILE: /app/js/core/admin_scanmap_bridge.js
   RControl Factory — Admin ScanMap Bridge — v1.0 SAFE
   Objetivo:
   - ✅ Adiciona botão no Injector: "Scan OFICIAL (Index + ScanMap)"
   - ✅ Roda ScanMap e em seguida dispara o CP1 Scan & Index (botão já existente)
   - ✅ Escreve resumo no #scanOut
   SAFE: try/catch, não quebra tela
*/
(() => {
  "use strict";

  try {
    if (window.RCF_ADMIN_SCAN_BRIDGE && window.RCF_ADMIN_SCAN_BRIDGE.__v10) return;

    const $ = (sel, root=document) => root.querySelector(sel);

    function writeScanOut(text){
      try {
        const pre = $("#scanOut");
        if (pre) pre.textContent = String(text ?? "");
      } catch {}
    }

    function isAdminActive(){
      try {
        const v = document.getElementById("view-admin");
        return !!(v && v.classList.contains("active"));
      } catch {
        return false;
      }
    }

    async function runOfficial(){
      try {
        if (!isAdminActive()) {
          writeScanOut("⚠️ Abra a aba Admin para rodar o Scan OFICIAL.");
          return;
        }

        writeScanOut("⏳ Scan OFICIAL: rodando ScanMap…");

        let summary = "";
        try {
          const map = await window.RCF_SCANMAP?.run?.();
          if (map) {
            summary =
              `ScanMap ✅\n` +
              `scripts=${map.loaded?.scripts?.length || 0} | links=${map.loaded?.links?.length || 0}\n` +
              `overrides=${map.overrides?.paths?.length || 0}\n` +
              `bundle_local=${map.bundle_local?.paths?.length || 0}\n` +
              `fillers=${map.fillers?.all?.length || 0}\n`;
          } else {
            summary = "ScanMap ⚠️ (não disponível ainda)\n";
          }
        } catch (e) {
          summary = "ScanMap ❌ falhou: " + (e?.message || e) + "\n";
        }

        writeScanOut(summary + "\n⏳ Agora disparando CP1 Scan & Index…");

        // dispara o scan oficial do injector (o handler do app.js)
        const btn = document.getElementById("btnScanIndex");
        if (btn) {
          btn.click();
        } else {
          writeScanOut(summary + "\n❌ Não achei #btnScanIndex no Injector.");
        }

      } catch (e) {
        writeScanOut("❌ Scan OFICIAL falhou: " + (e?.message || e));
      }
    }

    function injectButton(){
      try {
        const inj = document.getElementById("admin-injector") || document.querySelector('[data-rcf-slot="admin.injector"]');
        if (!inj) return false;

        if (document.getElementById("btnScanOfficial")) return true;

        // coloca o botão logo perto dos botões do Injector
        const row = inj.querySelector(".row") || inj;
        const wrap = document.createElement("div");
        wrap.style.cssText = "margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;align-items:center";

        wrap.innerHTML = `
          <button class="btn ok" id="btnScanOfficial" type="button">🧩 Scan OFICIAL (Index + ScanMap)</button>
          <div style="font-size:12px;opacity:.75">Roda ScanMap e chama o CP1 Scan & Index.</div>
        `;

        row.parentNode.insertBefore(wrap, row.nextSibling);

        const b = document.getElementById("btnScanOfficial");
        if (b) b.addEventListener("click", () => { runOfficial(); }, { passive:true });

        return true;
      } catch {
        return false;
      }
    }

    function boot(){
      // tenta montar algumas vezes porque o admin pode não estar pronto ainda
      let tries = 0;
      const tick = () => {
        tries++;
        const ok = injectButton();
        if (ok) return;
        if (tries >= 10) return;
        setTimeout(tick, 500);
      };
      tick();
    }

    window.RCF_ADMIN_SCAN_BRIDGE = { __v10:true, runOfficial };

    // monta quando UI ficar pronta
    try {
      window.addEventListener("RCF:UI_READY", () => { boot(); }, { passive:true });
    } catch {}

    // fallback
    setTimeout(() => { try { boot(); } catch {} }, 1800);

  } catch (e) {
    try { console.error("admin_scanmap_bridge fatal:", e); } catch {}
  }
})();
