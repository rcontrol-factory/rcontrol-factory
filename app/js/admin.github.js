/* RControl Factory — /app/js/admin.github.js (PADRÃO) — v1.3
   - Painel GitHub fica APENAS na tela Settings (settingsMount)
   - Normaliza path para app/import/mother_bundle.json (padrão da Mãe /app)
   - Integra com window.RCF_GH_SYNC e window.RCF_MAE
*/
(() => {
  "use strict";

  if (window.RCF_ADMIN_GITHUB && window.RCF_ADMIN_GITHUB.__v13) return;

  const MOUNT_ID = "settingsMount";   // ✅ só aqui
  const CARD_ID  = "rcfGitHubCard";
  const OUT_ID   = "rcfGitHubOut";

  const DEFAULT_PATH = "app/import/mother_bundle.json";

  const log = (lvl, msg) => {
    try { window.RCF_LOGGER?.push?.(lvl, String(msg)); } catch {}
    try { console.log("[GH-ADMIN]", lvl, msg); } catch {}
  };

  function $(id){ return document.getElementById(id); }

  function safeParse(raw, fallback){
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  }

  function loadCfg(){
    // preferir GH_SYNC.loadConfig se existir
    try {
      if (window.RCF_GH_SYNC?.loadConfig) return window.RCF_GH_SYNC.loadConfig() || {};
    } catch {}
    return safeParse(localStorage.getItem("rcf:ghcfg"), {}) || {};
  }

  function normalizePath(input){
    let p = String(input || "").trim();

    if (!p) return DEFAULT_PATH;

    // remove / inicial
    p = p.replace(/^\/+/, "");

    // atalhos comuns:
    // "mother_bundle.json" -> "app/import/mother_bundle.json"
    if (!p.includes("/")) p = `app/import/${p}`;

    // "import/..." -> "app/import/..."
    if (p.startsWith("import/")) p = "app/" + p;

    // se veio "app/mother_bundle.json" (errado), empurra pra import/
    if (p.startsWith("app/") && !p.startsWith("app/import/")) {
      // se tiver "app/" mas não "app/import/"
      const rest = p.slice("app/".length);
      if (!rest.startsWith("import/")) p = "app/import/" + rest.replace(/^\/+/, "");
    }

    // colapsa barras duplicadas
    p = p.replace(/\/{2,}/g, "/");

    return p || DEFAULT_PATH;
  }

  function setOut(t){
    const out = $(OUT_ID);
    if (out) out.textContent = String(t || "");
  }

  function renderCard(mount){
    if (!mount) return;
    if ($(CARD_ID)) return; // já existe

    const cfg = loadCfg();
    const normPath = normalizePath(cfg.path || DEFAULT_PATH);

    const card = document.createElement("div");
    card.id = CARD_ID;
    card.className = "card";
    card.style.marginTop = "12px";
    card.innerHTML = `
      <h3>GitHub (Sync)</h3>
      <p class="hint">
        Painel do GitHub fica apenas aqui em <b>Settings</b>.<br/>
        Bundle padrão: <code>${DEFAULT_PATH}</code>
      </p>

      <div class="row" style="gap:10px; flex-wrap:wrap">
        <label style="flex:1; min-width:160px">
          <div class="hint">Owner</div>
          <input id="ghOwner" class="input" placeholder="rcontrol-factory" />
        </label>

        <label style="flex:1; min-width:160px">
          <div class="hint">Repo</div>
          <input id="ghRepo" class="input" placeholder="rcontrol-factory" />
        </label>

        <label style="width:120px">
          <div class="hint">Branch</div>
          <input id="ghBranch" class="input" placeholder="main" />
        </label>
      </div>

      <label style="display:block; margin-top:10px">
        <div class="hint">Path (Contents API)</div>
        <input id="ghPath" class="input" placeholder="${DEFAULT_PATH}" />
        <div class="hint" style="margin-top:6px">
          Se você digitar <code>import/mother_bundle.json</code>, eu salvo como <code>${DEFAULT_PATH}</code>.
        </div>
      </label>

      <label style="display:block; margin-top:10px">
        <div class="hint">Token (PAT)</div>
        <input id="ghToken" class="input" placeholder="ghp_..." />
      </label>

      <div class="row" style="margin-top:12px; gap:10px; flex-wrap:wrap">
        <button id="btnGhSave" class="btn" type="button">Salvar cfg</button>
        <button id="btnGhTest" class="btn" type="button">Testar token</button>
        <button id="btnGhPull" class="btn" type="button">Pull bundle</button>
        <button id="btnGhPushMother" class="btn primary" type="button">Push Mother Bundle</button>
        <button id="btnMaeUpdate" class="btn" type="button">MAE update</button>
      </div>

      <pre id="${OUT_ID}" class="mono small" style="margin-top:10px">Pronto.</pre>
    `;

    mount.appendChild(card);

    // preencher inputs
    const owner  = $("ghOwner");
    const repo   = $("ghRepo");
    const branch = $("ghBranch");
    const path   = $("ghPath");
    const token  = $("ghToken");

    if (owner)  owner.value  = String(cfg.owner || "");
    if (repo)   repo.value   = String(cfg.repo || "");
    if (branch) branch.value = String(cfg.branch || "main");
    if (path)   path.value   = normPath;
    if (token)  token.value  = String(cfg.token || "");

    // handlers
    $("btnGhSave")?.addEventListener("click", () => {
      try {
        const rawPath = String(path?.value || "");
        const fixedPath = normalizePath(rawPath);

        if (rawPath.trim() !== fixedPath.trim()) {
          log("info", `path normalized: ${rawPath.trim() || "(empty)"} -> ${fixedPath}`);
        }

        const cfg2 = {
          owner:  String(owner?.value || "").trim(),
          repo:   String(repo?.value || "").trim(),
          branch: String(branch?.value || "main").trim(),
          path:   fixedPath,
          token:  String(token?.value || "").trim(),
        };

        if (!window.RCF_GH_SYNC?.saveConfig) throw new Error("RCF_GH_SYNC.saveConfig ausente");
        window.RCF_GH_SYNC.saveConfig(cfg2);

        setOut("OK: ghcfg saved");
        log("ok", "ghcfg saved");
      } catch (e) {
        setOut("ERR: " + (e?.message || e));
        log("err", "ghcfg save err: " + (e?.message || e));
      }
    });

    $("btnGhTest")?.addEventListener("click", async () => {
      try {
        if (!window.RCF_GH_SYNC?.test) throw new Error("RCF_GH_SYNC.test ausente");
        setOut("Testando token...");
        const cfgNow = loadCfg();
        const msg = await window.RCF_GH_SYNC.test(cfgNow);
        setOut(msg);
        log("ok", msg);
      } catch (e) {
        setOut("ERR: " + (e?.message || e));
        log("err", "gh test err: " + (e?.message || e));
      }
    });

    $("btnGhPull")?.addEventListener("click", async () => {
      try {
        if (!window.RCF_GH_SYNC?.pull) throw new Error("RCF_GH_SYNC.pull ausente");
        setOut("Pull iniciando...");
        const cfgNow = loadCfg();
        const txt = await window.RCF_GH_SYNC.pull(cfgNow);
        setOut("OK: pull ok (bytes=" + String(txt || "").length + ")");
        log("ok", "gh pull ok");
      } catch (e) {
        setOut("ERR: gh pull err: " + (e?.message || e));
        log("err", "gh pull err: " + (e?.message || e));
      }
    });

    $("btnGhPushMother")?.addEventListener("click", async () => {
      try {
        if (!window.RCF_GH_SYNC?.pushMotherBundle) throw new Error("RCF_GH_SYNC.pushMotherBundle ausente");
        setOut("Push Mother Bundle iniciando...");
        const cfgNow = loadCfg();
        await window.RCF_GH_SYNC.pushMotherBundle(cfgNow);
        setOut("OK: GitHub: pushMotherBundle ok");
        log("ok", "GitHub: pushMotherBundle ok");
      } catch (e) {
        setOut("ERR: pushMotherBundle err: " + (e?.message || e));
        log("err", "pushMotherBundle err: " + (e?.message || e));
      }
    });

    $("btnMaeUpdate")?.addEventListener("click", async () => {
      try {
        if (!window.RCF_MAE?.updateFromGitHub) throw new Error("RCF_MAE.updateFromGitHub ausente");
        setOut("MAE update iniciando...");
        const res = await window.RCF_MAE.updateFromGitHub({
          onProgress: (p) => {
            // mostra algo leve
            if (p?.step === "apply_progress") setOut(`Aplicando... ${p.done}/${p.total}`);
          }
        });
        setOut("OK: mae update ok " + JSON.stringify(res));
        log("ok", "mae update ok");
      } catch (e) {
        setOut("ERR: mae update err: " + (e?.message || e));
        log("err", "mae update err: " + (e?.message || e));
      }
    });

    log("ok", "admin.github.js ready ✅");
  }

  function unmountCard(){
    const el = $(CARD_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // ✅ mantém o card somente se settingsMount existir
  function tick(){
    const mount = $(MOUNT_ID);
    if (mount) renderCard(mount);
    else unmountCard();
  }

  // boot
  window.addEventListener("load", () => {
    try { tick(); } catch {}
    // polling leve (troca de views pode recriar DOM)
    setInterval(() => { try { tick(); } catch {} }, 500);
  });

  window.RCF_ADMIN_GITHUB = { __v13: true, tick };
})();
