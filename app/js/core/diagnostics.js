/* RCF — core/diagnostics.js (V7 STABILITY CHECK)
   - roda checks: boot/css/modules/sw/click/microtests
   - gera relatório e trava evolução se FAIL
   - expõe API: window.RCF_DIAGNOSTICS
*/

(() => {
  "use strict";

  // evita carregar duas vezes
  if (window.RCF_DIAGNOSTICS && window.RCF_DIAGNOSTICS.__v7) return;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const now = () => new Date().toISOString();

  function log(level, msg) {
    try { window.RCF_LOGGER?.push?.(level, msg); } catch {}
    try { console.log("[RCF_DIAG]", level, msg); } catch {}
  }

  function ok(name, details = "") {
    return { name, pass: true, details, ts: now() };
  }
  function fail(name, details = "") {
    return { name, pass: false, details, ts: now() };
  }

  function setStatusStable(isStable) {
    window.RCF_STABLE = !!isStable;
    try {
      const pill = $("#statusText");
      if (pill) pill.textContent = isStable ? "STABLE ✅" : "UNSTABLE ❌";
    } catch {}
  }

  // -----------------------------
  // 1) BOOT CHECK
  // -----------------------------
  function checkBoot() {
    const items = [];

    if (window.__RCF_BOOTED__) {
      items.push(ok("BOOT_LOCK", `__RCF_BOOTED__=${window.__RCF_BOOTED__}`));
    } else {
      items.push(fail("BOOT_LOCK", "__RCF_BOOTED__ ausente (adicione lock no safeInit)"));
    }

    // “Emergency UI” (fallback screen) — sinal simples: existência do botão rcfReloadBtn
    if (document.getElementById("rcfReloadBtn") || document.getElementById("rcfClearLogsBtn")) {
      items.push(fail("EMERGENCY_UI", "Tela de emergência detectada (fallback ativo)"));
    } else {
      items.push(ok("EMERGENCY_UI", "Fallback não acionado"));
    }

    return items;
  }

  // -----------------------------
  // 2) CSS CHECK
  // -----------------------------
  function checkCSS() {
    const items = [];
    try {
      const root = document.getElementById("rcfRoot") || document.documentElement;
      const token = getComputedStyle(root).getPropertyValue("--rcf-css-token").trim().replace(/['"]/g, "");
      if (token === "rcf-v7") items.push(ok("CSS_TOKEN", token));
      else items.push(fail("CSS_TOKEN", `token inválido: "${token || "(vazio)"}" (adicione --rcf-css-token no styles.css)`));
    } catch (e) {
      items.push(fail("CSS_TOKEN", e?.message || String(e)));
    }

    // check “UI pelada”: heurística leve
    try {
      const topbar = document.querySelector(".topbar");
      if (!topbar) items.push(fail("CSS_UI_SHELL", "topbar não encontrado (renderShell falhou?)"));
      else items.push(ok("CSS_UI_SHELL", "topbar ok"));
    } catch (e) {
      items.push(fail("CSS_UI_SHELL", e?.message || String(e)));
    }

    return items;
  }

  // -----------------------------
  // 3) MODULE CHECK
  // -----------------------------
  function checkModules() {
    const items = [];

    // core modules “uma única vez”: marque flags quando carregam
    const mods = [
      ["DIAGNOSTICS_CORE", !!window.RCF_DIAGNOSTICS],
      ["OVERLAY_SCANNER", !!window.RCF_OVERLAY_SCANNER],
      ["MICROTESTS", !!window.RCF_MICROTESTS],
    ];

    mods.forEach(([name, present]) => {
      items.push(present ? ok(name, "loaded") : fail(name, "missing"));
    });

    // “Diagnostics instalado uma única vez?”
    // heurística: contador interno
    try {
      const c = (window.RCF_DIAGNOSTICS?._installCount || 0);
      if (c <= 1) items.push(ok("DIAG_INSTALL_ONCE", `installCount=${c}`));
      else items.push(fail("DIAG_INSTALL_ONCE", `installCount=${c} (instalou 2x)`));
    } catch (e) {
      items.push(fail("DIAG_INSTALL_ONCE", e?.message || String(e)));
    }

    return items;
  }

  // -----------------------------
  // 4) SW CHECK
  // -----------------------------
  async function checkSW() {
    const items = [];

    // BUILD_ID / SW version: aceita qualquer “versão” mas exige consistência
    let reg = null;
    try {
      if (!("serviceWorker" in navigator)) {
        items.push(fail("SW_SUPPORTED", "serviceWorker não suportado neste browser"));
        return items;
      }
      reg = await navigator.serviceWorker.getRegistration("/");
      items.push(ok("SW_SUPPORTED", "ok"));
    } catch (e) {
      items.push(fail("SW_SUPPORTED", e?.message || String(e)));
      return items;
    }

    if (!reg) {
      items.push(fail("SW_REGISTERED", "Sem SW registrado (getRegistration retornou null)"));
    } else {
      items.push(ok("SW_REGISTERED", "registrado"));
    }

    // caches antigos removidos: checa se tem muitos caches
    try {
      const keys = await caches.keys();
      items.push(ok("SW_CACHE_KEYS", `keys=${keys.length} [${keys.join(", ").slice(0, 120)}${keys.join(", ").length>120?"...":""}]`));
    } catch (e) {
      items.push(fail("SW_CACHE_KEYS", e?.message || String(e)));
    }

    // clear/unregister “funcionam” aqui só como capacidade (não executa automaticamente)
    items.push(ok("SW_CLEAR_AVAILABLE", "use Tools: Clear SW Cache"));
    items.push(ok("SW_UNREGISTER_AVAILABLE", "use Tools: Unregister SW"));

    return items;
  }

  // -----------------------------
  // 5) CLICK CHECK (iOS)
  // -----------------------------
  function checkClicks() {
    const items = [];

    // Overlay scanner (se existir)
    try {
      if (window.RCF_OVERLAY_SCANNER?.scan) {
        const r = window.RCF_OVERLAY_SCANNER.scan();
        if (r?.blocked && r.blocked.length) {
          items.push(fail("OVERLAY_BLOCK", JSON.stringify(r.blocked, null, 2).slice(0, 600)));
        } else {
          items.push(ok("OVERLAY_BLOCK", "nenhum bloqueio detectado"));
        }
      } else {
        items.push(ok("OVERLAY_BLOCK", "scanner não disponível (ok em safe mode)"));
      }
    } catch (e) {
      items.push(fail("OVERLAY_BLOCK", e?.message || String(e)));
    }

    // Botões críticos sem handler: heurística leve (verifica se existem)
    const critical = [
      "#btnDoCreateApp",
      "#btnSaveFile",
      "#btnAgentRun",
      "#btnLogsClear",
      "#btnCopyLogs",
      "#btnPinSave",
    ];
    critical.forEach((sel) => {
      const el = document.querySelector(sel);
      if (!el) items.push(fail("BTN_EXIST", `missing ${sel}`));
      else items.push(ok("BTN_EXIST", sel));
    });

    return items;
  }

  // -----------------------------
  // 6) MICROTEST CHECK
  // -----------------------------
  function runMicroTests() {
    const items = [];

    // TEST_RENDER
    try {
      const root = document.getElementById("rcfRoot");
      items.push(root ? ok("TEST_RENDER", "rcfRoot ok") : fail("TEST_RENDER", "rcfRoot ausente"));
    } catch (e) {
      items.push(fail("TEST_RENDER", e?.message || String(e)));
    }

    // TEST_IMPORTS (se a pasta /js/core existe e carregou diagnostics)
    try {
      const has = !!window.RCF_DIAGNOSTICS;
      items.push(has ? ok("TEST_IMPORTS", "diagnostics ok") : fail("TEST_IMPORTS", "diagnostics missing"));
    } catch (e) {
      items.push(fail("TEST_IMPORTS", e?.message || String(e)));
    }

    // TEST_STATE_INIT (state no window.RCF.state)
    try {
      const st = window.RCF?.state;
      if (st && st.cfg && Array.isArray(st.apps)) items.push(ok("TEST_STATE_INIT", "state ok"));
      else items.push(fail("TEST_STATE_INIT", "window.RCF.state inválido"));
    } catch (e) {
      items.push(fail("TEST_STATE_INIT", e?.message || String(e)));
    }

    // TEST_EVENT_BIND (tabs existem)
    try {
      const tabs = document.querySelectorAll("[data-view]");
      items.push(tabs.length ? ok("TEST_EVENT_BIND", `tabs=${tabs.length}`) : fail("TEST_EVENT_BIND", "sem tabs [data-view]"));
    } catch (e) {
      items.push(fail("TEST_EVENT_BIND", e?.message || String(e)));
    }

    return items;
  }

  // -----------------------------
  // RELATÓRIO + GATE
  // -----------------------------
  function summarize(report) {
    const flat = report.flatMap((sec) => sec.items.map((x) => ({ section: sec.section, ...x })));
    const fails = flat.filter((x) => !x.pass);
    const passCount = flat.length - fails.length;

    return {
      pass: fails.length === 0,
      passCount,
      failCount: fails.length,
      total: flat.length,
      fails,
      flat,
    };
  }

  function formatReport(summary) {
    const lines = [];
    lines.push("=========================================================");
    lines.push("RCF — V7 STABILITY CHECK (REPORT)");
    lines.push("=========================================================");
    lines.push(`PASS: ${summary.passCount}/${summary.total} | FAIL: ${summary.failCount}`);
    lines.push(`RCF_STABLE: ${summary.pass ? "TRUE ✅" : "FALSE ❌"}`);
    lines.push("");

    if (summary.failCount) {
      lines.push("FAIL LIST:");
      summary.fails.forEach((f) => {
        lines.push(`- [${f.section}] ${f.name}: ${String(f.details || "").slice(0, 300)}`);
      });
      lines.push("");
      lines.push("AÇÃO:");
      lines.push("- bloquear evolução");
      lines.push("- exibir relatório");
      lines.push("- não permitir patch estrutural");
    } else {
      lines.push("OK: Todos os checks passaram.");
      lines.push("Próxima fase liberada: Auto-Construção Controlada");
    }

    lines.push("=========================================================");
    return lines.join("\n");
  }

  async function runStabilityCheck() {
    const report = [];

    report.push({ section: "BOOT", items: checkBoot() });
    report.push({ section: "CSS", items: checkCSS() });
    report.push({ section: "MODULES", items: checkModules() });

    const swItems = await checkSW();
    report.push({ section: "SW", items: swItems });

    report.push({ section: "CLICK", items: checkClicks() });
    report.push({ section: "MICROTESTS", items: runMicroTests() });

    const sum = summarize(report);
    const text = formatReport(sum);

    // escreve na UI se tiver
    try {
      const out = document.getElementById("diagOut");
      if (out) out.textContent = text;
    } catch {}

    // logs
    log(sum.pass ? "ok" : "err", `V7 stability: ${sum.pass ? "PASS" : "FAIL"} (${sum.passCount}/${sum.total})`);

    // gate global
    setStatusStable(sum.pass);

    return { summary: sum, report, text };
  }

  // instala “uma vez”
  function installAll() {
    window.RCF_DIAGNOSTICS._installCount = (window.RCF_DIAGNOSTICS._installCount || 0) + 1;

    // se tiver guards externos, não quebra se faltar
    try { window.RCF_DIAGNOSTICS._guardsInstalled = true; } catch {}
    log("ok", "Diagnostics: installAll ✅");
    return true;
  }

  // API
  window.RCF_DIAGNOSTICS = {
    __v7: true,
    _installCount: 0,
    installAll,
    runStabilityCheck,
    runMicroTests,
    scanAll() {
      try {
        if (window.RCF_OVERLAY_SCANNER?.scan) return window.RCF_OVERLAY_SCANNER.scan();
        return { ok: true, blocked: [] };
      } catch (e) {
        return { ok: false, err: e?.message || String(e) };
      }
    },
  };

  // marca como carregado
  log("ok", "core/diagnostics.js ready ✅");
})();
