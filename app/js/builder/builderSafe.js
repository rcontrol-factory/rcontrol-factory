/* builderSafe.js — Builder SAFE Mode (mínimo + UI)
   - write nunca salva direto
   - gera FILE_WRITE patch e põe na fila
   - preview mostra intenção/destino/risco/diff
   - apply usa pipeline com rollback
   - UI opcional: painel Builder (sem mexer no core)
*/

(() => {
  "use strict";

  const HELP = [
    "BUILDER SAFE — comandos:",
    "help",
    "list",
    "select <slug>",
    "set file <filename>",
    "write  (entra em modo multi-linha; finalize com /end)",
    "preview",
    "apply",
    "discard",
    "show"
  ].join("\n");

  // storage isolado do Builder (não briga com o core)
  const K_ACTIVE_APP = "rcf:builder:active_app";
  const K_ACTIVE_FILE = "rcf:builder:active_file";
  const K_LOG = "rcf:builder:last_log";

  let writeMode = false;
  let writeBuffer = [];

  // -----------------------
  // Helpers (state)
  // -----------------------
  function readState() {
    try { return window.RCF?.state || null; } catch { return null; }
  }

  function getBuilderActiveApp() {
    try { return localStorage.getItem(K_ACTIVE_APP) || ""; } catch { return ""; }
  }

  function setBuilderActiveApp(slug) {
    try { localStorage.setItem(K_ACTIVE_APP, String(slug || "")); } catch {}
  }

  function getBuilderActiveFile() {
    try { return localStorage.getItem(K_ACTIVE_FILE) || ""; } catch { return ""; }
  }

  function setBuilderActiveFile(filename) {
    try { localStorage.setItem(K_ACTIVE_FILE, String(filename || "")); } catch {}
  }

  // tenta pegar slug ativo do core; se não existir, usa o do builder
  function activeSlug() {
    const st = readState();
    return st?.active?.appSlug || getBuilderActiveApp() || null;
  }

  function activeFile() {
    const st = readState();
    return st?.active?.file || getBuilderActiveFile() || "newFile.js";
  }

  function getActiveAppObj() {
    const st = readState();
    const slug = activeSlug();
    const app = st?.apps?.find?.(a => a.slug === slug);
    return app || null;
  }

  function filesMapOfActiveApp() {
    const app = getActiveAppObj();
    if (!app || !app.files) return {};
    const map = {};
    Object.keys(app.files).forEach(k => {
      map["/" + String(k).replace(/^\/+/, "")] = app.files[k];
    });
    return map;
  }

  // -----------------------
  // Logging (UI + console)
  // -----------------------
  const _ui = {
    outEl: null,     // <pre> log
    statusEl: null,  // <div> header status
    patchEl: null,   // <pre> pending patch
    inputEl: null,   // <input> command
    writeEl: null    // <textarea> write buffer
  };

  function pushLog(text) {
    const msg = String(text ?? "");
    try { window.RCF_LOGGER?.push?.("builder", msg); } catch {}
    try { localStorage.setItem(K_LOG, msg); } catch {}
    if (_ui.outEl) _ui.outEl.textContent = msg;
    return msg;
  }

  function setStatus(text) {
    if (_ui.statusEl) _ui.statusEl.textContent = String(text ?? "");
  }

  function renderPending() {
    const p = window.RCF_PATCH_QUEUE?.peek?.();
    if (!_ui.patchEl) return;

    if (!p) {
      _ui.patchEl.textContent = "(sem patch pendente)";
      return;
    }

    _ui.patchEl.textContent = [
      "PENDING PATCH",
      `id: ${p.id}`,
      `type: ${p.type}`,
      `intent: ${p.intent}`,
      `risk: ${p.risk}`,
      `target: ${p.targetPath}`,
      `overwriteBlocked: ${p.overwriteBlocked}`,
      `duplicates: ${p.duplicates?.length ? p.duplicates.join(", ") : "-"}`,
      "",
      "diffPreview:",
      p.diffPreview || "(sem diff)"
    ].join("\n");
  }

  function logUI(text) {
    return pushLog(text);
  }

  // -----------------------
  // Core builder logic
  // -----------------------
  function ensureDeps() {
    if (!window.RCF_PATCH_QUEUE?.enqueue || !window.RCF_PATCH_QUEUE?.peek) {
      return { ok: false, msg: "RCF_PATCH_QUEUE não disponível. (patchQueue.js não carregou?)" };
    }
    if (!window.RCF_ORGANIZER?.plan) {
      return { ok: false, msg: "RCF_ORGANIZER não disponível. (organizerEngine.js não carregou?)" };
    }
    if (!window.RCF_APPLY_PIPELINE?.applyWithRollback) {
      return { ok: false, msg: "RCF_APPLY_PIPELINE não disponível. (applyPipeline.js não carregou?)" };
    }
    return { ok: true };
  }

  function classifyAndBuildPatch(filename, code) {
    const filesMap = filesMapOfActiveApp();
    const plan = window.RCF_ORGANIZER.plan({ filename, code }, filesMap);

    const patch = {
      type: "FILE_WRITE",
      appSlug: activeSlug(),
      intent: plan.intent,
      risk: plan.risk,
      targetPath: plan.targetPath,
      allowOverwrite: false,
      newText: code,
      diffPreview: plan.diffPreview,
      duplicates: plan.duplicates,
      overwriteBlocked: plan.overwriteBlocked
    };

    return { plan, patch };
  }

  function requireUnlockIfHigh(patch) {
    if (patch.risk !== "HIGH") return { ok: true };

    const pinSaved = (() => {
      try { return JSON.parse(localStorage.getItem("rcf:admin_pin") || "\"\""); }
      catch { return ""; }
    })();

    if (!pinSaved) {
      return { ok: false, msg: "Risco HIGH e não existe PIN salvo. Vá em Settings e defina um PIN." };
    }

    const typed = prompt("RISCO HIGH — digite o PIN para liberar APPLY:");
    if (String(typed || "").trim() !== String(pinSaved)) {
      return { ok: false, msg: "PIN inválido. APPLY bloqueado." };
    }
    return { ok: true };
  }

  async function cmd(raw) {
    const deps = ensureDeps();
    if (!deps.ok) return logUI("❌ " + deps.msg);

    const line = String(raw || "").trim();

    // modo write multi-linha via comando
    if (writeMode) {
      if (line === "/end") {
        writeMode = false;
        const code = writeBuffer.join("\n");
        writeBuffer = [];

        const fname = activeFile();
        const { plan, patch } = classifyAndBuildPatch(fname, code);
        const saved = window.RCF_PATCH_QUEUE.enqueue(patch);

        renderPending();

        return logUI([
          "✅ PATCH GERADO (não aplicado)",
          `id: ${saved.id}`,
          `app: ${patch.appSlug || "(null)"}`,
          `file: ${fname}`,
          `intent: ${plan.intent}`,
          `risk: ${plan.risk}`,
          `target: ${plan.targetPath}`,
          `overwriteBlocked: ${plan.overwriteBlocked}`,
          `duplicates: ${plan.duplicates.length ? plan.duplicates.join(", ") : "-"}`,
          "",
          "diffPreview:",
          plan.diffPreview || "(sem diff)"
        ].join("\n"));
      } else {
        writeBuffer.push(raw); // preserva exato
        setStatus(`WRITE MODE (${writeBuffer.length} linhas) — finalize com /end`);
        return logUI(`...write (${writeBuffer.length} linhas)`);
      }
    }

    if (!line) return logUI(".");

    const parts = line.split(/\s+/);
    const head = parts[0].toLowerCase();

    if (head === "help") return logUI(HELP);

    if (head === "show") {
      const st = readState();
      const p = window.RCF_PATCH_QUEUE.peek();
      return logUI(JSON.stringify({
        stable: !!window.RCF_STABLE,
        view: st?.active?.view,
        app_core: st?.active?.appSlug || null,
        app_builder: getBuilderActiveApp() || null,
        file_core: st?.active?.file || null,
        file_builder: getBuilderActiveFile() || null,
        using_app: activeSlug(),
        using_file: activeFile(),
        pending: p?.id || null
      }, null, 2));
    }

    if (head === "list") {
      const st = readState();
      const apps = st?.apps || [];
      const rows = apps.map(a => `${a.slug} — ${a.name}`);
      return logUI(rows.join("\n") || "(vazio)");
    }

    if (head === "select") {
      const slug = parts[1];
      if (!slug) return logUI("Uso: select <slug>");
      setBuilderActiveApp(slug);
      setStatus(`active app = ${slug}`);
      return logUI(`✅ OK. Builder active app = ${slug}\n(Se o core não trocar sozinho, tudo bem — o Builder usa esse slug.)`);
    }

    if (head === "set" && parts[1]?.toLowerCase() === "file") {
      const fname = line.replace(/^set\s+file\s+/i, "").trim();
      if (!fname) return logUI("Uso: set file <filename>");
      setBuilderActiveFile(fname);
      setStatus(`active file = ${fname}`);
      return logUI(`✅ OK. Builder file = ${fname}`);
    }

    if (head === "write") {
      writeMode = true;
      writeBuffer = [];
      setStatus(`WRITE MODE — arquivo: ${activeFile()}`);
      return logUI("WRITE MODE: cole o código. Finalize com /end");
    }

    if (head === "preview") {
      const p = window.RCF_PATCH_QUEUE.peek();
      if (!p) return logUI("Sem patch pendente.");
      renderPending();
      return logUI("✅ Preview atualizado (veja a área Pending Patch no painel).");
    }

    if (head === "discard") {
      window.RCF_PATCH_QUEUE.pop();
      renderPending();
      return logUI("✅ Patch descartado.");
    }

    if (head === "apply") {
      if (!window.RCF_STABLE) return logUI("❌ RCF_STABLE != TRUE — APPLY bloqueado.");

      const p = window.RCF_PATCH_QUEUE.peek();
      if (!p) return logUI("Sem patch pendente.");

      if (p.overwriteBlocked) {
        return logUI("❌ Overwrite bloqueado (regra SAFE).\n→ Troque o filename (set file ...) ou crie um novo arquivo.\n(allowOverwrite ainda não está habilitado.)");
      }

      const unlock = requireUnlockIfHigh(p);
      if (!unlock.ok) return logUI("❌ " + unlock.msg);

      setStatus("APPLY em andamento…");
      const res = await window.RCF_APPLY_PIPELINE.applyWithRollback(p);

      if (res?.ok) {
        window.RCF_PATCH_QUEUE.pop();
        renderPending();
        setStatus("APPLY OK ✅");
        return logUI("✅ APPLY OK. (patch removido da fila)");
      }

      setStatus("APPLY FAIL ❌");
      return logUI("❌ APPLY FAIL: " + JSON.stringify(res, null, 2));
    }

    return logUI("Comando não reconhecido. Use: help");
  }

  // -----------------------
  // UI Installer (opcional)
  // -----------------------
  function installUI(mount) {
    const el = (typeof mount === "string")
      ? document.querySelector(mount)
      : mount;

    if (!el) return false;

    // layout simples e resistente
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div style="font-weight:700;">Builder — SAFE</div>
          <div id="rcfBuilderStatus" style="opacity:.85;">pronto</div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" data-bcmd="help">Help</button>
          <button type="button" data-bcmd="show">Show</button>
          <button type="button" data-bcmd="preview">Preview</button>
          <button type="button" data-bcmd="apply">Apply</button>
          <button type="button" data-bcmd="discard">Discard</button>
        </div>

        <div style="display:flex;gap:8px;">
          <input id="rcfBuilderCmd" placeholder="Digite um comando (ex: help, list, set file x.js, write…)" style="flex:1;min-width:200px;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.25);color:inherit;" />
          <button type="button" id="rcfBuilderRun">Run</button>
        </div>

        <textarea id="rcfBuilderWrite" placeholder="(Opcional) Cole código aqui e clique: Enfileirar (gera patch)."
          style="width:100%;min-height:120px;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.25);color:inherit;"></textarea>

        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" id="rcfBuilderQueue">Enfileirar</button>
          <button type="button" id="rcfBuilderClearWrite">Limpar texto</button>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;">
          <div style="font-weight:700;opacity:.9;">Pending Patch</div>
          <pre id="rcfBuilderPending" style="margin:0;padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.28);white-space:pre-wrap;word-break:break-word;max-height:220px;overflow:auto;"></pre>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;">
          <div style="font-weight:700;opacity:.9;">Log</div>
          <pre id="rcfBuilderOut" style="margin:0;padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.28);white-space:pre-wrap;word-break:break-word;max-height:220px;overflow:auto;"></pre>
        </div>
      </div>
    `;

    _ui.statusEl = el.querySelector("#rcfBuilderStatus");
    _ui.outEl = el.querySelector("#rcfBuilderOut");
    _ui.patchEl = el.querySelector("#rcfBuilderPending");
    _ui.inputEl = el.querySelector("#rcfBuilderCmd");
    _ui.writeEl = el.querySelector("#rcfBuilderWrite");

    // carrega último log
    try { _ui.outEl.textContent = localStorage.getItem(K_LOG) || "(sem logs)"; } catch {}
    renderPending();
    setStatus("pronto");

    const runBtn = el.querySelector("#rcfBuilderRun");
    const queueBtn = el.querySelector("#rcfBuilderQueue");
    const clearBtn = el.querySelector("#rcfBuilderClearWrite");

    runBtn?.addEventListener("click", async () => {
      const v = _ui.inputEl?.value || "";
      _ui.inputEl.value = "";
      const out = await cmd(v);
      setStatus(writeMode ? "WRITE MODE ativo" : "pronto");
      return out;
    });

    _ui.inputEl?.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        runBtn?.click();
      }
    });

    // Enfileirar: usa textarea + arquivo ativo
    queueBtn?.addEventListener("click", async () => {
      const deps = ensureDeps();
      if (!deps.ok) return logUI("❌ " + deps.msg);

      const code = String(_ui.writeEl?.value || "");
      if (!code.trim()) return logUI("Cole algum código no textarea antes de Enfileirar.");

      const fname = activeFile();
      const { plan, patch } = classifyAndBuildPatch(fname, code);
      const saved = window.RCF_PATCH_QUEUE.enqueue(patch);

      renderPending();
      setStatus("patch enfileirado ✅");

      return logUI([
        "✅ PATCH GERADO (não aplicado)",
        `id: ${saved.id}`,
        `app: ${patch.appSlug || "(null)"}`,
        `file: ${fname}`,
        `intent: ${plan.intent}`,
        `risk: ${plan.risk}`,
        `target: ${plan.targetPath}`,
        "",
        "Use: Preview / Apply / Discard"
      ].join("\n"));
    });

    clearBtn?.addEventListener("click", () => {
      if (_ui.writeEl) _ui.writeEl.value = "";
      setStatus("texto limpo");
    });

    // botões rápidos
    el.querySelectorAll("button[data-bcmd]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const c = btn.getAttribute("data-bcmd");
        await cmd(c);
        setStatus(writeMode ? "WRITE MODE ativo" : "pronto");
      });
    });

    return true;
  }

  // auto-mount: tenta achar um container padrão
  function autoInstall() {
    // você pode criar um container na tela Builder/Admin:
    // <div id="rcfBuilderPanel"></div>
    const ok =
      installUI("#rcfBuilderPanel") ||
      installUI("[data-rcf-builder]");

    return ok;
  }

  // expõe API
  window.RCF_BUILDER_SAFE = { cmd, installUI, autoInstall };

  // tenta instalar sem quebrar nada
  try { autoInstall(); } catch {}
})();
