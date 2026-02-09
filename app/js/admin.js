// app/js/admin.js
(function () {
  "use strict";

  // ===== Admin lock simples (offline) =====
  const LS_ADMIN = "rcf_admin_v1"; // { pinHash, unlockedUntil }

  function hashPin(pin) {
    // hash leve só pra não ficar PIN em texto puro (não é segurança militar)
    let h = 2166136261;
    const s = String(pin || "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  function getAdminState() {
    try { return JSON.parse(localStorage.getItem(LS_ADMIN) || "{}"); }
    catch { return {}; }
  }

  function setAdminState(v) {
    localStorage.setItem(LS_ADMIN, JSON.stringify(v || {}));
  }

  function isUnlocked() {
    const st = getAdminState();
    return !!(st.unlockedUntil && Date.now() < st.unlockedUntil);
  }

  function requireUnlocked() {
    if (!isUnlocked()) throw new Error("Admin bloqueado. Faça login.");
  }

  function ensurePinSetup() {
    const st = getAdminState();
    if (st.pinHash) return;
    const pin = prompt("Defina um PIN Admin (4-8 dígitos). Guarde ele:");
    if (!pin) return;
    setAdminState({ pinHash: hashPin(pin), unlockedUntil: 0 });
    alert("PIN definido ✅");
  }

  function login() {
    ensurePinSetup();
    const st = getAdminState();
    const pin = prompt("PIN Admin:");
    if (!pin) return false;
    if (hashPin(pin) !== st.pinHash) {
      alert("PIN errado ❌");
      return false;
    }
    st.unlockedUntil = Date.now() + (30 * 60 * 1000); // 30 min
    setAdminState(st);
    alert("Admin liberado ✅ (30 min)");
    return true;
  }

  function logout() {
    const st = getAdminState();
    st.unlockedUntil = 0;
    setAdminState(st);
    alert("Admin bloqueado ✅");
  }

  // ===== Patch format (simples) =====
  // patch = [{ file:"app/index.html", mode:"replace", content:"..." }]
  function applyPatch(patch) {
    requireUnlocked();

    if (!window.RCF || !window.RCF.router) throw new Error("RCF/router não carregou.");
    if (!Array.isArray(patch) || !patch.length) throw new Error("Patch vazio.");

    // A Factory guarda arquivos do “Factory app” no repo (GitHub), mas aqui a gente só consegue:
    // - corrigir estado local (localStorage)
    // - e orientar você a colar/commit no GitHub quando for mudança de arquivo real
    //
    // Então: nessa v1, patch “real de repo” a gente só MOSTRA pra copiar/colar.
    return patch;
  }

  // ===== Regras OFFLINE (auto-correção) =====
  function offlineSuggestFix(text) {
    const t = String(text || "").toLowerCase();

    // 1) “engine/templates/router não carregou” => sugerir ordem de scripts
    if (t.includes("engine") || t.includes("templates") || t.includes("router") || t.includes("não carregou")) {
      return [
        {
          title: "Corrigir ordem de scripts no app/index.html",
          explain: "Coloque ai.js, templates.js, router.js, admin.js ANTES do app.js.",
          files: [
            {
              file: "app/index.html",
              mode: "snippet",
              content:
`<!-- Ordem importa -->
<script src="js/ai.js"></script>
<script src="js/templates.js"></script>
<script src="js/router.js"></script>
<script src="js/admin.js"></script>
<script src="app.js"></script>`
            }
          ]
        }
      ];
    }

    // 2) cache travado => bump cache name no SW
    if (t.includes("cache") || t.includes("safari") || t.includes("não atualiza") || t.includes("pwa")) {
      const v = Date.now().toString().slice(-6);
      return [
        {
          title: "Bump do cache do Service Worker",
          explain: "Troque o nome do CACHE para forçar atualização.",
          files: [
            {
              file: "app/sw.js",
              mode: "snippet",
              content: `const CACHE = "rcontrol-factory-v2-${v}";`
            }
          ]
        }
      ];
    }

    return [
      {
        title: "Sem regra offline pronta",
        explain: "Escreva o erro exato (ou cole o diagnóstico) que eu gero a correção.",
        files: []
      }
    ];
  }

  // ===== UI: “Caixinha de evolução” (Admin Console) =====
  function mountAdminPanel() {
    if (document.getElementById("rcf-admin-panel")) return;

    const panel = document.createElement("div");
    panel.id = "rcf-admin-panel";
    panel.style.cssText = `
      position:fixed; left:12px; right:12px; top:12px; z-index:99999;
      display:none; padding:12px; border-radius:14px;
      background:rgba(10,10,10,.92); color:#eaeaea;
      border:1px solid rgba(255,255,255,.15);
      font:13px/1.35 -apple-system,system-ui,Segoe UI,Roboto,Arial;
    `;

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="font-weight:900">Admin • Evolução da Factory</div>
        <div style="display:flex;gap:8px;">
          <button id="rcf-admin-login" style="padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-weight:900;">Login</button>
          <button id="rcf-admin-logout" style="padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-weight:900;">Lock</button>
          <button id="rcf-admin-close" style="padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-weight:900;">✕</button>
        </div>
      </div>

      <div style="opacity:.85;margin-bottom:8px;">
        Aqui você escreve “o que quer mudar/corrigir” e a Factory sugere um patch. (Offline hoje, IA depois)
      </div>

      <textarea id="rcf-admin-input" rows="3" placeholder="Ex: engine/templates não carregou. / Safari não atualiza. / Quero adicionar Template RQuotas..."
        style="width:100%;resize:none;border-radius:12px;border:1px solid rgba(255,255,255,.12);
               background:rgba(0,0,0,.25);color:#fff;padding:10px 12px;outline:none;"></textarea>

      <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;">
        <button id="rcf-admin-suggest" style="padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);
          background:rgba(0,200,120,.18);color:#eafff6;font-weight:900;">Gerar sugestão</button>

        <button id="rcf-admin-copy" style="padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);
          background:rgba(255,255,255,.06);color:#eaf2ff;font-weight:900;">Copiar patch</button>
      </div>

      <pre id="rcf-admin-out" style="margin-top:10px;white-space:pre-wrap;background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.10);border-radius:12px;padding:10px;max-height:40vh;overflow:auto;"></pre>
    `;

    document.body.appendChild(panel);

    const out = panel.querySelector("#rcf-admin-out");
    const input = panel.querySelector("#rcf-admin-input");
    let lastPatchText = "";

    panel.querySelector("#rcf-admin-close").onclick = () => (panel.style.display = "none");
    panel.querySelector("#rcf-admin-login").onclick = () => login();
    panel.querySelector("#rcf-admin-logout").onclick = () => logout();

    panel.querySelector("#rcf-admin-suggest").onclick = () => {
      const ideas = offlineSuggestFix(input.value);
      lastPatchText = JSON.stringify(ideas, null, 2);
      out.textContent = lastPatchText;
    };

    panel.querySelector("#rcf-admin-copy").onclick = async () => {
      if (!lastPatchText) return alert("Gere uma sugestão primeiro.");
      try {
        await navigator.clipboard.writeText(lastPatchText);
        alert("Patch copiado ✅");
      } catch {
        alert("iOS bloqueou copiar. Copie manualmente do painel.");
      }
    };
  }

  // ===== Botão flutuante “Admin” =====
  function mountAdminButton() {
    if (document.getElementById("rcf-admin-btn")) return;
    const btn = document.createElement("button");
    btn.id = "rcf-admin-btn";
    btn.textContent = "Admin";
    btn.style.cssText = `
      position:fixed; left:12px; bottom:12px; z-index:99999;
      padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.2);
      background:rgba(0,0,0,.55); color:white; font-weight:900;
    `;
    btn.onclick = () => {
      mountAdminPanel();
      const p = document.getElementById("rcf-admin-panel");
      if (p) p.style.display = (p.style.display === "none" ? "block" : "none");
    };
    document.body.appendChild(btn);
  }

  // Expor API (pra futuro AI)
  window.RCF = window.RCF || {};
  window.RCF.admin = {
    login,
    logout,
    isUnlocked,
    offlineSuggestFix,
    applyPatch,
  };

  window.addEventListener("load", () => {
    try {
      mountAdminButton();
    } catch {}
  });
})();
