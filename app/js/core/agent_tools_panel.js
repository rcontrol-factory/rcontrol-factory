/* FILE: /app/js/core/agent_tools_panel.js
   RControl Factory — Agent/Admin Tools Panel — v1.1 CLEAN (SAFE)
   PATCH A (BOOT CLEANUP):
   - ✅ Normaliza extras para "./js/core/..."
   - ✅ Remove duplicados (js/... vs ./js/...)
   - ✅ Botão "Clean extras (fix)" 1-clique
   - ✅ Mantém Enable ScanMap / Open list / Reload
   SAFE: try/catch, não quebra tela
*/
(() => {
  "use strict";

  try {
    if (window.RCF_AGENT_TOOLS && window.RCF_AGENT_TOOLS.__v11) return;

    const LS_KEY = "rcf:boot:extra_modules";

    const $ = (sel, root=document) => root.querySelector(sel);

    function safeParse(raw, fb){ try { return raw ? JSON.parse(raw) : fb; } catch { return fb; } }

    // ===== PATCH A: normalização oficial =====
    function normExtraPath(p){
      let x = String(p || "").trim();
      if (!x) return "";

      // remove aspas / espaços estranhos
      x = x.replace(/^["']|["']$/g, "").trim();

      // remove leading "./" ou "/" (vamos reconstruir depois)
      x = x.replace(/^[.\/]+/g, "");

      // aceita caminhos antigos "js/core/..." ou "app/js/core/..."
      if (x.startsWith("app/")) x = x.slice(4);
      if (!x.startsWith("js/")) {
        // se veio "core/..." tenta encaixar
        if (x.startsWith("core/")) x = "js/" + x;
      }

      // padrão final: ./js/core/...
      if (x.startsWith("js/core/")) return "./" + x;

      // se ainda não bateu, deixa do jeito mais seguro possível
      if (x.startsWith("js/")) return "./" + x;

      return "./js/core/" + x.replace(/^core\//, "");
    }

    function readExtras(){
      const arr = safeParse(localStorage.getItem(LS_KEY) || "[]", []);
      const list = Array.isArray(arr) ? arr : [];
      return list
        .map(normExtraPath)
        .map(s => String(s || "").trim())
        .filter(Boolean);
    }

    function writeExtras(arr){
      const clean = Array.from(new Set((arr||[])
        .map(normExtraPath)
        .map(s => String(s || "").trim())
        .filter(Boolean)
      ));
      try { localStorage.setItem(LS_KEY, JSON.stringify(clean)); } catch {}
      return clean;
    }

    function addExtra(path){
      const list = readExtras();
      const p = normExtraPath(path);
      if (p && !list.includes(p)) list.push(p);
      return writeExtras(list);
    }

    function removeExtra(path){
      const p = normExtraPath(path);
      const list = readExtras().filter(x => x !== p);
      return writeExtras(list);
    }

    function cleanExtrasOfficial(){
      // lista oficial (PASSO A)
      const must = [
        "./js/core/agent_runtime.js",
        "./js/core/agent_scanmap.js",
        "./js/core/admin_scanmap_bridge.js",
        "./js/core/agent_tools_panel.js"
      ];
      return writeExtras(must);
    }

    function ensureUI(){
      // tenta slot do Agente, se não tiver, tenta Admin integrations, senão body (SAFE)
      const host =
        document.getElementById("rcfAgentSlotTools") ||
        document.getElementById("rcfAdminSlotIntegrations") ||
        document.body;

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
          <div style="font-weight:900;color:#fff">Admin Tools</div>
          <div id="rcfAgentToolsStatus" style="font-size:12px;opacity:.85;color:#fff">—</div>
          <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
            <button id="btnAT_CleanExtras" type="button"
              style="padding:8px 10px;border-radius:999px;border:1px solid rgba(59,130,246,.30);background:rgba(59,130,246,.14);color:#eaf2ff;font-weight:900">
              Clean extras (fix)
            </button>
            <button id="btnAT_EnableScanMap" type="button"
              style="padding:8px 10px;border-radius:999px;border:1px solid rgba(60,255,170,.25);background:rgba(60,255,170,.10);color:#eafff4;font-weight:900">
              Enable Scan Oficial
            </button>
            <button id="btnAT_ShowExtras" type="button"
              style="padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:#fff;font-weight:800">
              Open extras list
            </button>
            <button id="btnAT_Reload" type="button"
              style="padding:8px 10px;border-radius:999px;border:0;background:#ef4444;color:#fff;font-weight:900">
              Reload
            </button>
          </div>
        </div>
        <pre id="rcfAgentToolsOut"
          style="margin-top:10px;padding:10px;border-radius:12px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.10);color:#fff;white-space:pre-wrap;word-break:break-word;font-size:12px;max-height:220px;overflow:auto">Pronto.</pre>
      `;

      try { host.appendChild(box); } catch { try { document.body.appendChild(box); } catch {} }

      $("#btnAT_CleanExtras", box)?.addEventListener("click", () => {
        try {
          const list = cleanExtrasOfficial();
          $("#rcfAgentToolsOut", box).textContent =
            "✅ Extras limpos (padrão oficial).\n\n" +
            "Agora clique Reload.\n\n" +
            "rcf:boot:extra_modules:\n" +
            list.map(x => "• " + x).join("\n");
          refreshStatus();
        } catch (e) {
          $("#rcfAgentToolsOut", box).textContent = "❌ Falha ao limpar extras: " + (e?.message || e);
        }
      }, { passive:true });

      $("#btnAT_EnableScanMap", box)?.addEventListener("click", () => {
        try {
          // garante runtime + scanmap + bridge + painel (padrão)
          addExtra("./js/core/agent_runtime.js");
          addExtra("./js/core/agent_scanmap.js");
          addExtra("./js/core/admin_scanmap_bridge.js");
          addExtra("./js/core/agent_tools_panel.js");

          $("#rcfAgentToolsOut", box).textContent =
            "✅ Scan Oficial habilitado.\n" +
            "• Extras gravados em rcf:boot:extra_modules\n" +
            "• Agora clique Reload para aplicar.\n\n" +
            readExtras().map(x => "• " + x).join("\n");

          refreshStatus();
        } catch (e) {
          $("#rcfAgentToolsOut", box).textContent = "❌ Falha ao habilitar: " + (e?.message || e);
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
            `• scanmap: ${!!window.RCF_SCANMAP ? "OK" : "missing"}\n` +
            `• bridge: ${!!window.RCF_ADMIN_SCANMAP_BRIDGE ? "OK" : "missing"}\n`;
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
        ` • scanmap=${window.RCF_SCANMAP ? "OK" : "—"}` +
        ` • bridge=${window.RCF_ADMIN_SCANMAP_BRIDGE ? "OK" : "—"}`;

      if (st) st.textContent = s;
    }

    function boot(){
      ensureUI();
      refreshStatus();
      setTimeout(refreshStatus, 600);
      setTimeout(refreshStatus, 1800);
      try { window.RCF_LOGGER?.push?.("OK", "agent_tools_panel.js ready ✅ (v1.1 CLEAN)"); } catch {}
    }

    window.RCF_AGENT_TOOLS = {
      __v11:true,
      readExtras,
      writeExtras,
      cleanExtrasOfficial,
      addExtra,
      removeExtra
    };

    if (document.readyState === "loading") {
      window.addEventListener("DOMContentLoaded", boot, { once:true });
    } else {
      boot();
    }

  } catch (e) {
    try { console.error("agent_tools_panel fatal:", e); } catch {}
  }
})();
