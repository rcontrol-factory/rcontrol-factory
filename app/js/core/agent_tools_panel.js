/* FILE: /app/js/core/agent_tools_panel.js
   RControl Factory — Agent Tools Panel — v1.0 SAFE
   - ✅ UI no Agent (slot rcfAgentSlotTools)
   - ✅ Gerencia localStorage rcf:boot:extra_modules (sem console)
   - ✅ 1-clique: habilita ScanMap
   - SAFE: try/catch, não quebra tela
*/
(() => {
  "use strict";

  try {
    if (window.RCF_AGENT_TOOLS && window.RCF_AGENT_TOOLS.__v10) return;

    const LS_KEY = "rcf:boot:extra_modules";

    const log = (lvl, msg) => {
      try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
      try { console.log("[AGENT_TOOLS]", lvl, msg); } catch {}
    };

    const $ = (sel, root=document) => root.querySelector(sel);

    function safeParse(raw, fb){ try { return raw ? JSON.parse(raw) : fb; } catch { return fb; } }

    function readExtras(){
      const arr = safeParse(localStorage.getItem(LS_KEY) || "[]", []);
      return Array.isArray(arr) ? arr.map(x => String(x||"").trim()).filter(Boolean) : [];
    }

    function writeExtras(arr){
      const clean = Array.from(new Set((arr||[]).map(x => String(x||"").trim()).filter(Boolean)));
      try { localStorage.setItem(LS_KEY, JSON.stringify(clean)); } catch {}
      return clean;
    }

    function hasExtra(path){
      const list = readExtras();
      return list.includes(path);
    }

    function addExtra(path){
      const list = readExtras();
      if (!list.includes(path)) list.push(path);
      return writeExtras(list);
    }

    function removeExtra(path){
      const list = readExtras().filter(x => x !== path);
      return writeExtras(list);
    }

    function ensureUI(){
      const host = document.getElementById("rcfAgentSlotTools") || document.body;
      if (!host) return null;

      let box = document.getElementById("rcfAgentToolsPanel");
      if (box) return box;

      box = document.createElement("div");
      box.id = "rcfAgentToolsPanel";
      box.style.cssText = [
        "margin-top:10px",
        "border:1px solid rgba(255,255,255,.12)",
        "background:rgba(0,0,0,.22)",
        "border-radius:14px",
        "padding:10px"
      ].join(";");

      box.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="font-weight:900;color:#fff">Agent Tools</div>
          <div id="rcfAgentToolsStatus" style="font-size:12px;opacity:.85;color:#fff">—</div>
          <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
            <button id="btnAT_EnableScanMap" type="button" style="padding:8px 10px;border-radius:999px;border:1px solid rgba(60,255,170,.25);background:rgba(60,255,170,.10);color:#eafff4;font-weight:900">Enable ScanMap</button>
            <button id="btnAT_ShowExtras" type="button" style="padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:#fff;font-weight:800">Open extras list</button>
            <button id="btnAT_Reload" type="button" style="padding:8px 10px;border-radius:999px;border:0;background:#ef4444;color:#fff;font-weight:900">Reload</button>
          </div>
        </div>
        <pre id="rcfAgentToolsOut" style="margin-top:10px;padding:10px;border-radius:12px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.10);color:#fff;white-space:pre-wrap;word-break:break-word;font-size:12px;max-height:220px;overflow:auto">Pronto.</pre>
      `;

      try { host.appendChild(box); } catch { document.body.appendChild(box); }

      $("#btnAT_EnableScanMap", box)?.addEventListener("click", () => {
        try {
          // garante runtime também (se alguém apagar sem querer)
          addExtra("js/core/agent_runtime.js");
          addExtra("js/core/agent_scanmap.js");
          addExtra("js/core/agent_tools_panel.js");

          $("#rcfAgentToolsOut", box).textContent =
            "✅ ScanMap habilitado.\n" +
            "• Extras gravados em rcf:boot:extra_modules\n" +
            "• Agora clique Reload para aplicar.";

          refreshStatus();
        } catch (e) {
          $("#rcfAgentToolsOut", box).textContent = "❌ Falha ao habilitar ScanMap: " + (e?.message || e);
        }
      }, { passive:true });

      $("#btnAT_ShowExtras", box)?.addEventListener("click", () => {
        try {
          const list = readExtras();
          const out =
            "rcf:boot:extra_modules:\n" +
            (list.length ? list.map(x => "• " + x).join("\n") : "(vazio)") +
            "\n\nDetect:\n" +
            `• agent_runtime: ${!!window.RCF_AGENT_RUNTIME ? "OK" : "missing"}\n` +
            `• scanmap: ${!!window.RCF_SCANMAP ? "OK" : "missing"}\n`;
          $("#rcfAgentToolsOut", box).textContent = out;
          refreshStatus();
        } catch (e) {
          $("#rcfAgentToolsOut", box).textContent = "❌ Erro: " + (e?.message || e);
        }
      }, { passive:true });

      $("#btnAT_Reload", box)?.addEventListener("click", () => {
        try { location.reload(); } catch {}
      }, { passive:true });

      return box;
    }

    function refreshStatus(){
      const box = ensureUI();
      if (!box) return;
      const st = $("#rcfAgentToolsStatus", box);
      const list = readExtras();

      const s =
        `extras=${list.length}` +
        ` • runtime=${window.RCF_AGENT_RUNTIME ? "OK" : "—"}` +
        ` • scanmap=${window.RCF_SCANMAP ? "OK" : "—"}`;

      if (st) st.textContent = s;
    }

    function boot(){
      ensureUI();
      refreshStatus();
      setTimeout(refreshStatus, 600);
      setTimeout(refreshStatus, 1800);
      log("OK", "agent_tools_panel.js ready ✅ (v1.0)");
    }

    window.RCF_AGENT_TOOLS = { __v10:true, readExtras, writeExtras };

    if (document.readyState === "loading") {
      window.addEventListener("DOMContentLoaded", boot, { once:true });
    } else {
      boot();
    }

  } catch (e) {
    try { console.error("agent_tools_panel fatal:", e); } catch {}
  }
})();
