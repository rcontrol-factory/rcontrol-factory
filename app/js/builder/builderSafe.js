/* builderSafe.js — Builder SAFE Mode (comandos mínimos)
   - write nunca salva direto
   - gera FILE_WRITE patch e põe na fila
   - preview mostra intenção/destino/risco/diff
   - apply usa pipeline com rollback
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

  let writeMode = false;
  let writeBuffer = [];

  function readState() {
    try { return window.RCF?.state || null; } catch { return null; }
  }

  function activeSlug() {
    const st = readState();
    return st?.active?.appSlug || null;
  }

  function filesMapOfActiveApp() {
    const st = readState();
    const slug = activeSlug();
    const app = st?.apps?.find?.(a => a.slug === slug);
    if (!app || !app.files) return {};
    const map = {};
    Object.keys(app.files).forEach(k => { map["/" + k.replace(/^\/+/, "")] = app.files[k]; });
    return map;
  }

  function logUI(text) {
    // você vai plugar na UI depois; por enquanto devolve string
    return String(text || "");
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
    if (patch.risk !== "HIGH") return { ok:true };

    // HIGH exige unlock manual: pede PIN se existir no settings
    const pinSaved = (() => {
      try { return JSON.parse(localStorage.getItem("rcf:admin_pin") || "\"\""); } catch { return ""; }
    })();

    if (!pinSaved) {
      return { ok:false, msg:"Risco HIGH e não existe PIN salvo. Vá em Settings e defina um PIN." };
    }

    const typed = prompt("RISCO HIGH — digite o PIN para liberar APPLY:");
    if (String(typed || "").trim() !== String(pinSaved)) {
      return { ok:false, msg:"PIN inválido. APPLY bloqueado." };
    }
    return { ok:true };
  }

  async function cmd(raw) {
    const line = String(raw || "").trim();

    // modo write multi-linha
    if (writeMode) {
      if (line === "/end") {
        writeMode = false;
        const code = writeBuffer.join("\n");
        writeBuffer = [];

        // pega filename alvo
        const st = readState();
        const fname = st?.active?.file || "newFile.js";

        const { plan, patch } = classifyAndBuildPatch(fname, code);
        const saved = window.RCF_PATCH_QUEUE.enqueue(patch);

        return logUI([
          "✅ PATCH GERADO (não aplicado)",
          `id: ${saved.id}`,
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
        return logUI(`...write (${writeBuffer.length} linhas)`);
      }
    }

    if (!line) return logUI(".");

    const parts = line.split(/\s+/);
    const head = parts[0].toLowerCase();

    if (head === "help") return logUI(HELP);

    if (head === "show") {
      const st = readState();
      return logUI(JSON.stringify({
        stable: !!window.RCF_STABLE,
        view: st?.active?.view,
        app: st?.active?.appSlug,
        file: st?.active?.file,
        pending: window.RCF_PATCH_QUEUE.peek()?.id || null
      }, null, 2));
    }

    if (head === "list") {
      const st = readState();
      const apps = st?.apps || [];
      return logUI(apps.map(a => `${a.slug} — ${a.name}`).join("\n") || "(vazio)");
    }

    if (head === "select") {
      const slug = parts[1];
      if (!slug) return logUI("Uso: select <slug>");
      // usa Agent existente se tiver
      try { window.RCF?.log?.("builder select", slug); } catch {}
      try {
        // chama Agent pela UI já existente (se quiser), mas aqui só orienta
        return logUI(`OK. Agora selecione no Dashboard/Agent: ${slug}`);
      } catch {
        return logUI("Falhou.");
      }
    }

    if (head === "set" && parts[1]?.toLowerCase() === "file") {
      const fname = line.replace(/^set\s+file\s+/i, "").trim();
      if (!fname) return logUI("Uso: set file <filename>");

      // salva no active.file
      try {
        const a = JSON.parse(localStorage.getItem("rcf:active") || "{}");
        a.file = fname;
        localStorage.setItem("rcf:active", JSON.stringify(a));
      } catch {}
      return logUI(`OK. file=${fname}`);
    }

    if (head === "write") {
      writeMode = true;
      writeBuffer = [];
      return logUI("WRITE MODE: cole o código. Finalize com /end");
    }

    if (head === "preview") {
      const p = window.RCF_PATCH_QUEUE.peek();
      if (!p) return logUI("Sem patch pendente.");
      return logUI([
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
      ].join("\n"));
    }

    if (head === "discard") {
      window.RCF_PATCH_QUEUE.pop();
      return logUI("✅ Patch descartado.");
    }

    if (head === "apply") {
      if (!window.RCF_STABLE) return logUI("❌ RCF_STABLE != TRUE — APPLY bloqueado.");

      const p = window.RCF_PATCH_QUEUE.peek();
      if (!p) return logUI("Sem patch pendente.");

      if (p.overwriteBlocked) return logUI("❌ Overwrite bloqueado. (regra SAFE) — crie novo filename ou use unlock + allowOverwrite (ainda não habilitado).");

      const unlock = requireUnlockIfHigh(p);
      if (!unlock.ok) return logUI("❌ " + unlock.msg);

      const res = await window.RCF_APPLY_PIPELINE.applyWithRollback(p);
      if (res.ok) {
        window.RCF_PATCH_QUEUE.pop();
        return logUI("✅ APPLY OK. (patch removido da fila)");
      }
      return logUI("❌ APPLY FAIL: " + JSON.stringify(res, null, 2));
    }

    return logUI("Comando não reconhecido. Use: help");
  }

  window.RCF_BUILDER_SAFE = { cmd };
})();
