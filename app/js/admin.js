/* RControl Factory — Admin UI (STABLE FIXED VERSION) */

(function () {
  const W = window;

  W.RCF = W.RCF || {};
  const RCF = W.RCF;

  const $ = (sel, root = document) => root.querySelector(sel);

  const IDS = {
    ghOwner: "gh_owner",
    ghRepo: "gh_repo",
    ghBranch: "gh_branch",
    ghPath: "gh_path",
    ghToken: "gh_token",
    ghMsg: "gh_msg",
    motherMsg: "mother_msg",
  };

  function ensureRoot() {
    let root = $("#rcf-view-admin") || $("#view-admin");
    if (!root) {
      const app = $("#app") || document.body;
      root = document.createElement("div");
      root.id = "rcf-view-admin";
      root.style.padding = "14px";
      app.appendChild(root);
    }

    root.style.pointerEvents = "auto";
    root.style.touchAction = "manipulation";
    return root;
  }

  function getGHConfig() {
    try {
      return JSON.parse(localStorage.getItem("RCF_GH_CFG") || "null") || {
        owner: "",
        repo: "",
        branch: "main",
        path: "app/import/mother_bundle.json",
        token: "",
      };
    } catch {
      return {
        owner: "",
        repo: "",
        branch: "main",
        path: "app/import/mother_bundle.json",
        token: "",
      };
    }
  }

  function setGHConfig(cfg) {
    localStorage.setItem("RCF_GH_CFG", JSON.stringify(cfg));
  }

  function hasGHModule() {
    return !!(W.RCF_GH_SYNC &&
      typeof W.RCF_GH_SYNC.pullFile === "function" &&
      typeof W.RCF_GH_SYNC.pushFile === "function");
  }

  function hasMotherModule() {
    return !!(W.RCF_MOTHER &&
      typeof W.RCF_MOTHER.updateFromGitHub === "function");
  }

  function msg(id, text, ok = true) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.style.borderColor = ok ? "rgba(34,197,94,.35)" : "rgba(239,68,68,.35)";
  }

  function renderAdmin() {
    const root = ensureRoot();
    const gh = getGHConfig();

    root.innerHTML = `
      <div class="card">
        <h2>GitHub Sync</h2>

        <div class="grid">
          <input id="${IDS.ghOwner}" class="input" placeholder="owner" value="${gh.owner}" />
          <input id="${IDS.ghRepo}" class="input" placeholder="repo" value="${gh.repo}" />
          <input id="${IDS.ghBranch}" class="input" placeholder="branch" value="${gh.branch}" />
          <input id="${IDS.ghPath}" class="input" placeholder="path" value="${gh.path}" />
          <input id="${IDS.ghToken}" class="input" placeholder="TOKEN" value="${gh.token}" />
          <button id="btn_gh_save" class="btn">Salvar config</button>
        </div>

        <div style="margin-top:10px; display:flex; gap:10px;">
          <button id="btn_gh_pull" class="btn">⬇ Pull</button>
          <button id="btn_gh_push" class="btn ok">⬆ Push</button>
        </div>

        <div id="${IDS.ghMsg}" class="box" style="margin-top:10px">Pronto.</div>
      </div>

      <div class="card" style="margin-top:14px">
        <h2>Mãe</h2>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button id="btn_mother_update" class="btn ok">Update From GitHub</button>
          <button id="btn_mother_clear" class="btn danger">Clear Overrides</button>
          <button id="btn_mother_check" class="btn">Check</button>
        </div>

        <div id="${IDS.motherMsg}" class="box" style="margin-top:10px">Pronto.</div>
      </div>
    `;

    wireEvents(root);
    iosFix(root);
  }

  function wireEvents(root) {
    const ghOwner = document.getElementById(IDS.ghOwner);
    const ghRepo = document.getElementById(IDS.ghRepo);
    const ghBranch = document.getElementById(IDS.ghBranch);
    const ghPath = document.getElementById(IDS.ghPath);
    const ghToken = document.getElementById(IDS.ghToken);

    function readCfg() {
      return {
        owner: ghOwner.value.trim(),
        repo: ghRepo.value.trim(),
        branch: ghBranch.value.trim() || "main",
        path: ghPath.value.trim() || "app/import/mother_bundle.json",
        token: ghToken.value.trim(),
      };
    }

    $("#btn_gh_save", root)?.addEventListener("click", () => {
      setGHConfig(readCfg());
      msg(IDS.ghMsg, "Config salva ✅", true);
    });

    $("#btn_gh_pull", root)?.addEventListener("click", async () => {
      if (!hasGHModule()) return msg(IDS.ghMsg, "GitHub Sync ausente ❌", false);
      try {
        const content = await W.RCF_GH_SYNC.pullFile(readCfg());
        msg(IDS.ghMsg, "Pull OK ✅", true);
      } catch (e) {
        msg(IDS.ghMsg, "Pull falhou ❌ " + e.message, false);
      }
    });

    $("#btn_gh_push", root)?.addEventListener("click", async () => {
      if (!hasGHModule()) return msg(IDS.ghMsg, "GitHub Sync ausente ❌", false);
      try {
        await W.RCF_GH_SYNC.pushFile(readCfg(), "{}");
        msg(IDS.ghMsg, "Push OK ✅", true);
      } catch (e) {
        msg(IDS.ghMsg, "Push falhou ❌ " + e.message, false);
      }
    });

    $("#btn_mother_update", root)?.addEventListener("click", async () => {
      if (!hasMotherModule()) return msg(IDS.motherMsg, "Mãe ausente ❌", false);
      try {
        await W.RCF_MOTHER.updateFromGitHub();
        msg(IDS.motherMsg, "Update OK ✅", true);
      } catch (e) {
        msg(IDS.motherMsg, "Falhou ❌ " + e.message, false);
      }
    });

    $("#btn_mother_clear", root)?.addEventListener("click", async () => {
      if (!hasMotherModule()) return msg(IDS.motherMsg, "Mãe ausente ❌", false);
      try {
        await W.RCF_MOTHER.clearOverrides();
        msg(IDS.motherMsg, "Overrides limpos ✅", true);
      } catch (e) {
        msg(IDS.motherMsg, "Falhou ❌ " + e.message, false);
      }
    });

    $("#btn_mother_check", root)?.addEventListener("click", () => {
      const s = W.RCF_MOTHER?.status?.();
      alert("CHECK:\n\n" + JSON.stringify(s, null, 2));
    });
  }

  function iosFix(root) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (!isIOS) return;

    const buttons = root.querySelectorAll("button");
    buttons.forEach(btn => {
      btn.style.pointerEvents = "auto";
      btn.style.touchAction = "manipulation";
    });
  }

  function boot() {
    renderAdmin();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

})();
