/* RControl Factory — /app/js/admin.github.js — v2 (PADRÃO / SEM CONFLITO)
   - NÃO renderiza outro painel (evita duplicar IDs)
   - Apenas "liga" o painel existente do app.js:
     ghOwner/ghRepo/ghBranch/ghPath/ghToken + btnGhSave/btnGhPull/btnGhPush/btnGhRefresh + ghOut
   - Salva config em localStorage: rcf:ghcfg
   - Pull: RCF_GH_SYNC.pull(cfg)  (e salva bundle local)
   - Push: RCF_GH_SYNC.pushMotherBundle(cfg) ou fallback push(cfg,null)
   - Token: adiciona botão 👁 ao lado do input se não existir
*/
(() => {
  "use strict";

  if (window.RCF_ADMIN_GITHUB && window.RCF_ADMIN_GITHUB.__v2) return;

  const LS_KEY = "rcf:ghcfg";

  const $ = (sel, root = document) => root.querySelector(sel);

  function uiLog(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
    try { console.log("[ADMIN_GH]", level, msg); } catch {}
  }

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
      path: String(cfg.path || "app/import/mother_bundle.json").trim(),
      token: String(cfg.token || "").trim(),
    };
  }

  function saveCfg(cfg) {
    const safe = {
      owner: String(cfg.owner || "").trim(),
      repo: String(cfg.repo || "").trim(),
      branch: String(cfg.branch || "main").trim(),
      path: String(cfg.path || "app/import/mother_bundle.json").trim(),
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

  function setPanelText(text) {
    const out = document.getElementById("ghOut");
    if (out) out.textContent = String(text || "");
  }

  function ensureDeps() {
    if (!window.RCF_GH_SYNC) throw new Error("RCF_GH_SYNC não carregou (js/core/github_sync.js)");
    if (typeof window.RCF_GH_SYNC.pull !== "function") throw new Error("RCF_GH_SYNC.pull ausente");
    if (typeof window.RCF_GH_SYNC.push !== "function" && typeof window.RCF_GH_SYNC.pushMotherBundle !== "function") {
      throw new Error("RCF_GH_SYNC.push/pushMotherBundle ausente");
    }
  }

  function getInputs() {
    return {
      owner: $("#ghOwner")?.value || "",
      repo: $("#ghRepo")?.value || "",
      branch: $("#ghBranch")?.value || "main",
      path: $("#ghPath")?.value || "app/import/mother_bundle.json",
      token: $("#ghToken")?.value || "",
    };
  }

  function hydrateInputs() {
    const cfg = loadCfg();
    if ($("#ghOwner")) $("#ghOwner").value = cfg.owner;
    if ($("#ghRepo")) $("#ghRepo").value = cfg.repo;
    if ($("#ghBranch")) $("#ghBranch").value = cfg.branch || "main";
    if ($("#ghPath")) $("#ghPath").value = cfg.path || "app/import/mother_bundle.json";
    if ($("#ghToken")) $("#ghToken").value = cfg.token;
  }

  function ensureTokenToggle() {
    const token = $("#ghToken");
    if (!token) return;

    // se já existe um toggle, não cria outro
    if (token.__rcf_toggle_added__) return;
    token.__rcf_toggle_added__ = true;

    // coloca token como password por padrão
    try { token.type = "password"; } catch {}

    // cria um botão 👁 ao lado se o layout permitir
    const parent = token.parentElement;
    if (!parent) return;

    // se já tem botão perto, não cria
    if (parent.querySelector("[data-rcf='ghToggleToken']")) return;

    // cria container flex se não for
    try {
      const cs = getComputedStyle(parent);
      if (cs && cs.display !== "flex") {
        parent.style.display = "flex";
        parent.style.gap = "8px";
        parent.style.alignItems = "center";
      }
      token.style.flex = "1";
    } catch {}

    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-rcf", "ghToggleToken");
    btn.textContent = "👁";
    btn.style.cssText =
      "padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.10);" +
      "background:rgba(255,255,255,.06);color:#fff";

    btn.addEventListener("click", () => {
      try {
        token.type = (token.type === "password") ? "text" : "password";
      } catch {}
    }, { passive: true });

    parent.appendChild(btn);
  }

  async function persistBundleLocal(txt) {
    // PADRÃO: salvar raw em localStorage + tentar IDB se existir
    try { localStorage.setItem("rcf:mother_bundle", String(txt || "")); } catch {}
    try {
      // se o Storage V2 FULL estiver ativo (IndexedDB)
      if (window.RCF_STORAGE && typeof window.RCF_STORAGE.put === "function") {
        await window.RCF_STORAGE.put("mother_bundle_local", String(txt || ""));
      }
    } catch {}
  }

  function bindOnce() {
    const btnSave = $("#btnGhSave");
    const btnPull = $("#btnGhPull");
    const btnPush = $("#btnGhPush");
    const btnStatus = $("#btnGhRefresh");

    // painel ainda não existe
    if (!btnSave && !btnPull && !btnPush && !btnStatus) return false;

    // evita bind duplicado
    if (window.RCF_ADMIN_GITHUB?._bound) return true;
    if (!window.RCF_ADMIN_GITHUB) window.RCF_ADMIN_GITHUB = {};
    window.RCF_ADMIN_GITHUB._bound = true;

    ensureTokenToggle();
    hydrateInputs();

    btnSave?.addEventListener("click", () => {
      const c = saveCfg(getInputs());
      setPanelText(
        `✅ Config salva.\nowner=${c.owner}\nrepo=${c.repo}\nbranch=${c.branch}\npath=${c.path}\ntoken=${maskToken(c.token)}`
      );
    });

    btnPull?.addEventListener("click", async () => {
      try {
        ensureDeps();
        setPanelText("⏳ Pull…");
        const cfgNow = saveCfg(getInputs());

        const txt = await window.RCF_GH_SYNC.pull(cfgNow);
        await persistBundleLocal(txt);

        setPanelText(
          `✅ Pull OK.\nTamanho: ${String(txt || "").length} chars\nHead: ${String(txt || "").slice(0, 120).replace(/\s+/g, " ")}…`
        );
        uiLog("ok", "pull ok (bundle salvo local)");
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
        const cfgNow = saveCfg(getInputs());

        if (typeof window.RCF_GH_SYNC.pushMotherBundle === "function") {
          const r = await window.RCF_GH_SYNC.pushMotherBundle(cfgNow);
          setPanelText("✅ Push OK.\n" + String(r || "OK"));
          uiLog("ok", "pushMotherBundle ok");
          return;
        }

        // fallback: push() sem content
        const r2 = await window.RCF_GH_SYNC.push(cfgNow, null);
        setPanelText("✅ Push OK.\n" + String(r2 || "OK"));
        uiLog("ok", "push ok");
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

    uiLog("ok", "admin.github.js v2 bound ✅ (sem UI duplicada)");
    return true;
  }

  function install() {
    try { bindOnce(); } catch {}
    return true;
  }

  window.RCF_ADMIN_GITHUB = { __v2: true, install };

  // tenta ligar várias vezes porque o app.js pode renderizar depois
  try { install(); } catch {}
  setTimeout(() => { try { install(); } catch {} }, 200);
  setTimeout(() => { try { install(); } catch {} }, 800);
  setTimeout(() => { try { install(); } catch {} }, 1600);
})();
