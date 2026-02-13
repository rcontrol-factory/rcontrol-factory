/* RControl Factory — /app/js/admin.github.js (SAFE UI) — v1.1
   - UI estável pro GitHub Sync (Privado)
   - Salva config em localStorage: rcf:ghcfg
   - Pull: RCF_GH_SYNC.pull()
   - Push: RCF_GH_SYNC.pushMotherBundle() ✅ gera bundle e cria bundle no GitHub
   - Token oculto (password) com botão 👁
   - ✅ PADRÃO: cfg.path default = "import/mother_bundle.json"
*/
(() => {
  "use strict";

  if (window.RCF_ADMIN_GITHUB && window.RCF_ADMIN_GITHUB.__v1_1) return;

  const LS_KEY = "rcf:ghcfg";

  function uiLog(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
    try { console.log("[ADMIN_GH]", level, msg); } catch {}
  }

  function $(sel, root = document) { return root.querySelector(sel); }

  function safeParseJson(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  }

  function loadCfg() {
    const raw = localStorage.getItem(LS_KEY);
    const cfg = safeParseJson(raw, {});
    return {
      owner: String(cfg.owner || "").trim(),
      repo: String(cfg.repo || "").trim(),
      branch: String(cfg.branch || "main").trim(),
      path: String(cfg.path || "import/mother_bundle.json").trim(),
      token: String(cfg.token || "").trim(),
    };
  }

  function saveCfg(cfg) {
    const safe = {
      owner: String(cfg.owner || "").trim(),
      repo: String(cfg.repo || "").trim(),
      branch: String(cfg.branch || "main").trim(),
      path: String(cfg.path || "import/mother_bundle.json").trim(),
      token: String(cfg.token || "").trim(),
    };
    localStorage.setItem(LS_KEY, JSON.stringify(safe));
    uiLog("ok", "ghcfg saved");
    return safe;
  }

  function maskToken(tok) {
    const t = String(tok || "");
    if (!t) return "";
    if (t.length <= 10) return "********";
    return t.slice(0, 6) + "…" + t.slice(-4);
  }

  function ensureDeps() {
    if (!window.RCF_GH_SYNC) throw new Error("RCF_GH_SYNC não carregou (js/core/github_sync.js)");
    if (typeof window.RCF_GH_SYNC.pull !== "function") throw new Error("RCF_GH_SYNC.pull ausente");
    if (typeof window.RCF_GH_SYNC.push !== "function") throw new Error("RCF_GH_SYNC.push ausente");
  }

  function setPanelText(text) {
    const out = document.getElementById("ghOut");
    if (out) out.textContent = String(text || "");
  }

  function render() {
    const host =
      document.querySelector("#adminView") ||
      document.querySelector("#view-admin") ||
      document.querySelector('[data-view="admin"]') ||
      document.querySelector("#rcfRoot") ||
      document.body;

    if ($("#rcfGitHubPanel", host)) return;

    const cfg = loadCfg();

    const wrap = document.createElement("section");
    wrap.id = "rcfGitHubPanel";
    wrap.style.cssText =
      "margin-top:14px;padding:14px;border-radius:16px;" +
      "background:rgba(255,255,255,.04);" +
      "border:1px solid rgba(255,255,255,.06)";

    wrap.innerHTML = `
      <div style="font-weight:800;font-size:20px;margin-bottom:10px">
        GitHub Sync (Privado) — SAFE
      </div>

      <div style="display:flex;flex-direction:column;gap:10px">
        <input id="ghOwner"  placeholder="owner"  value="${cfg.owner.replace(/"/g, "&quot;")}"
          style="padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.25);color:#fff">

        <input id="ghRepo"   placeholder="repo"   value="${cfg.repo.replace(/"/g, "&quot;")}"
          style="padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.25);color:#fff">

        <input id="ghBranch" placeholder="branch" value="${cfg.branch.replace(/"/g, "&quot;")}"
          style="padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.25);color:#fff">

        <input id="ghPath"   placeholder="path"   value="${cfg.path.replace(/"/g, "&quot;")}"
          style="padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.25);color:#fff">

        <div style="display:flex;gap:8px;align-items:center">
          <input id="ghToken" type="password" placeholder="token (PAT)"
            value="${cfg.token.replace(/"/g, "&quot;")}"
            style="flex:1;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.25);color:#fff">
          <button id="ghToggleToken"
            style="padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.06);color:#fff">👁</button>
        </div>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
        <button id="ghSave"
          style="padding:10px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.06);color:#fff">
          Salvar config
        </button>

        <button id="ghPull"
          style="padding:10px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.06);color:#fff">
          ⬇ Pull
        </button>

        <button id="ghPush"
          style="padding:10px 14px;border-radius:999px;border:1px solid rgba(46,204,113,.35);background:rgba(46,204,113,.18);color:#fff">
          ⬆ Push (gera bundle)
        </button>

        <button id="ghStatus"
          style="padding:10px 14px;border-radius:999px;border:1px solid rgba(241,196,15,.35);background:rgba(241,196,15,.18);color:#fff">
          ⚡ Status
        </button>
      </div>

      <pre id="ghOut"
        style="margin-top:12px;white-space:pre-wrap;padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.30);color:#d7fbe2;min-height:54px">
Pronto.
      </pre>
    `;

    host.appendChild(wrap);

    const btnSave = $("#ghSave", wrap);
    const btnPull = $("#ghPull", wrap);
    const btnPush = $("#ghPush", wrap);
    const btnStatus = $("#ghStatus", wrap);

    const btnToggleToken = $("#ghToggleToken", wrap);
    const inputToken = $("#ghToken", wrap);
    btnToggleToken?.addEventListener("click", () => {
      if (!inputToken) return;
      inputToken.type = inputToken.type === "password" ? "text" : "password";
    });

    function readInputs() {
      return {
        owner: $("#ghOwner", wrap)?.value || "",
        repo: $("#ghRepo", wrap)?.value || "",
        branch: $("#ghBranch", wrap)?.value || "main",
        path: $("#ghPath", wrap)?.value || "import/mother_bundle.json",
        token: $("#ghToken", wrap)?.value || "",
      };
    }

    btnSave?.addEventListener("click", () => {
      const c = saveCfg(readInputs());
      setPanelText(
        `✅ Config salva.\nowner=${c.owner}\nrepo=${c.repo}\nbranch=${c.branch}\npath=${c.path}\ntoken=${maskToken(c.token)}`
      );
    });

    btnPull?.addEventListener("click", async () => {
      try {
        ensureDeps();
        setPanelText("⏳ Pull…");
        const cfgNow = saveCfg(readInputs());
        const txt = await window.RCF_GH_SYNC.pull(cfgNow);
        setPanelText(
          `✅ Pull OK.\nTamanho: ${String(txt || "").length} chars\nHead: ${String(txt || "").slice(0, 120).replace(/\s+/g, " ")}…`
        );
      } catch (e) {
        const m = e?.message || String(e);
        uiLog("err", "gh pull err: " + m);
        setPanelText("❌ Pull ERRO:\n" + m);
      }
    });

    btnPush?.addEventListener("click", async () => {
      try {
        ensureDeps();
        setPanelText("⏳ Push… (gerando mother bundle)");
        const cfgNow = saveCfg(readInputs());

        if (typeof window.RCF_GH_SYNC.pushMotherBundle === "function") {
          const r = await window.RCF_GH_SYNC.pushMotherBundle(cfgNow);
          setPanelText("✅ Push OK.\n" + String(r || "OK"));
          uiLog("ok", "GitHub: pushMotherBundle ok");
          return;
        }

        const r2 = await window.RCF_GH_SYNC.push(cfgNow, null);
        setPanelText("✅ Push OK.\n" + String(r2 || "OK"));
        uiLog("ok", "GitHub: push ok");
      } catch (e) {
        const m = e?.message || String(e);
        uiLog("err", "gh push err: " + m);
        setPanelText("❌ Push ERRO:\n" + m);
      }
    });

    btnStatus?.addEventListener("click", () => {
      try {
        const c = loadCfg();
        const mae = window.RCF_MAE?.status?.() || window.RCF_MOTHER?.status?.() || null;
        setPanelText(
          "STATUS\n" +
          `cfg: owner=${c.owner} repo=${c.repo} branch=${c.branch} path=${c.path} token=${maskToken(c.token)}\n\n` +
          "MAE:\n" + (mae ? JSON.stringify(mae, null, 2) : "(sem RCF_MAE.status)")
        );
      } catch (e) {
        setPanelText("❌ Status erro:\n" + (e?.message || String(e)));
      }
    });

    uiLog("ok", "admin.github.js ready ✅");
  }

  function install() {
    try { render(); } catch {}
    return true;
  }

  window.RCF_ADMIN_GITHUB = { __v1_1: true, install };

  try { install(); } catch {}
  setTimeout(() => { try { install(); } catch {} }, 300);
  setTimeout(() => { try { install(); } catch {} }, 1200);
})();
