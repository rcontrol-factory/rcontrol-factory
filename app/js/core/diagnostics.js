/* FILE: /app/js/core/diagnostics.js
   RCF — /app/js/core/diagnostics.js (V7.3 SNAPSHOT CONSOLIDATION) — PADRÃO
   Base preservada do V7.2 BOOT TRACE + STABILITY CHECK
   Patch mínimo e seguro:
   - mantém run/status existentes
   - adiciona collect()/print() para snapshot consolidado
   - normaliza dados ausentes como "dado ausente"
   - lê runtime/front/moduleRegistry/factoryState/doctor/logger sem quebrar a Factory
   API: window.RCF_DIAGNOSTICS
*/

/* === RCF_RANGE_START file:/app/js/core/diagnostics.js === */
(() => {
  "use strict";

  if (window.RCF_DIAGNOSTICS && window.RCF_DIAGNOSTICS.__v73) return;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const now = () => new Date().toISOString();

  function log(level, msg, obj) {
    try {
      if (obj !== undefined) window.RCF_LOGGER?.push?.(level, String(msg) + " " + JSON.stringify(obj));
      else window.RCF_LOGGER?.push?.(level, msg);
    } catch {}
    try {
      if (obj !== undefined) console.log("[RCF_DIAG]", level, msg, obj);
      else console.log("[RCF_DIAG]", level, msg);
    } catch {}
  }

  function ok(name, details = "")   { return { name, pass: true,  details, ts: now() }; }
  function fail(name, details = "") { return { name, pass: false, details, ts: now() }; }
  function warn(name, details = "") { return { name, pass: true,  details: "WARN: " + details, ts: now() }; }

  function safeValue(v) {
    return (v === undefined || v === null) ? "dado ausente" : v;
  }

  function safeCall(fn, fallback = "dado ausente") {
    try {
      const out = fn();
      return (out === undefined || out === null) ? fallback : out;
    } catch {
      return fallback;
    }
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function setStatusStable(isStable) {
    window.RCF_STABLE = !!isStable;
    try {
      const pill =
        document.getElementById("statusText") ||
        document.getElementById("rcfStatusText") ||
        document.querySelector("[data-rcf-status]");
      if (pill) pill.textContent = isStable ? "STABLE ✅" : "UNSTABLE ❌";
    } catch {}
  }

  function isVisible(el) {
    try {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (!r || (r.width === 0 && r.height === 0)) return false;
      const st = getComputedStyle(el);
      if (!st) return false;
      return st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0";
    } catch {
      return false;
    }
  }

  const BOOT_LS_KEY = "rcf:diag:last_boot";
  const BOOT_SS_KEY = "rcf:diag:boot_session";
  const BOOT_DOUBLE_WINDOW_MS = 5 * 60 * 1000;

  function safeParse(raw, fb) { try { return raw ? JSON.parse(raw) : fb; } catch { return fb; } }
  function safeStringify(obj) { try { return JSON.stringify(obj); } catch { return ""; } }

  function getNavType() {
    try {
      const nav = performance.getEntriesByType?.("navigation");
      if (nav && nav[0] && nav[0].type) return String(nav[0].type);
    } catch {}
    try {
      const t = performance.navigation?.type;
      if (t === 1) return "reload";
      if (t === 2) return "back_forward";
      if (t === 0) return "navigate";
    } catch {}
    return "unknown";
  }

  function bootStamp() {
    const ts = Date.now();
    let sess = "";
    try {
      sess = String(sessionStorage.getItem(BOOT_SS_KEY) || "");
      if (!sess) {
        sess = "sess_" + ts + "_" + Math.floor(Math.random() * 1e6);
        sessionStorage.setItem(BOOT_SS_KEY, sess);
      }
    } catch {
      sess = "sess_" + ts;
    }

    const cur = {
      ts,
      iso: now(),
      session: sess,
      url: String(location.href || ""),
      referrer: String(document.referrer || ""),
      vis: String(document.visibilityState || ""),
      navType: getNavType(),
      timeOrigin: (() => { try { return Number(performance.timeOrigin || 0); } catch { return 0; } })()
    };

    const prev = safeParse(localStorage.getItem(BOOT_LS_KEY) || "", null);

    try { localStorage.setItem(BOOT_LS_KEY, safeStringify(cur)); } catch {}

    try {
      if (prev && typeof prev.ts === "number") {
        const dt = cur.ts - prev.ts;
        if (dt > 0 && dt <= BOOT_DOUBLE_WINDOW_MS) {
          log("warn", "BOOT_DOUBLE_DETECTED ⚠️ (reboot/reload na mesma janela)", { dtMs: dt, prev, cur });
        } else {
          log("ok", "BOOT_STAMP ok", { navType: cur.navType, vis: cur.vis });
        }
      } else {
        log("ok", "BOOT_STAMP first", { navType: cur.navType, vis: cur.vis });
      }
    } catch {}

    window.__RCF_LAST_BOOT__ = cur;
    window.__RCF_PREV_BOOT__ = prev || null;
    return { cur, prev };
  }

  bootStamp();

  function checkBoot() {
    const items = [];
    try {
      const lockVal =
        window.__RCF_BOOTED__ ||
        window.__RCF_INDEX_BOOTED__ ||
        window.__RCF_INDEX_BOOTED ||
        null;

      if (lockVal) items.push(ok("BOOT_LOCK", `lock=${String(lockVal)}`));
      else items.push(warn("BOOT_LOCK", "Nenhum lock detectado (__RCF_BOOTED__/__RCF_INDEX_BOOTED__). Se estiver tudo OK, ignore."));
    } catch (e) {
      items.push(warn("BOOT_LOCK", e?.message || String(e)));
    }

    try {
      const reloadBtn = document.getElementById("rcfReloadBtn");
      const clearBtn  = document.getElementById("rcfClearLogsBtn");
      const emergencyActive = (isVisible(reloadBtn) || isVisible(clearBtn));
      if (emergencyActive) items.push(fail("EMERGENCY_UI", "Tela de emergência ATIVA (fallback acionado)"));
      else items.push(ok("EMERGENCY_UI", "Fallback não ativo"));
    } catch (e) {
      items.push(warn("EMERGENCY_UI", e?.message || String(e)));
    }

    try {
      const prev = window.__RCF_PREV_BOOT__;
      const cur = window.__RCF_LAST_BOOT__;
      if (prev && cur && typeof prev.ts === "number" && typeof cur.ts === "number") {
        const dt = cur.ts - prev.ts;
        if (dt > 0 && dt <= BOOT_DOUBLE_WINDOW_MS) items.push(warn("BOOT_DOUBLE", `detected dtMs=${dt} nav=${cur.navType}`));
        else items.push(ok("BOOT_DOUBLE", "no recent double boot"));
      } else {
        items.push(ok("BOOT_DOUBLE", "no prev boot stamp"));
      }
    } catch (e) {
      items.push(warn("BOOT_DOUBLE", e?.message || String(e)));
    }

    return items;
  }

  function checkCSS() {
    const items = [];
    try {
      const body = document.body;
      if (!body) return [fail("CSS_BODY", "document.body ausente")];
      const st = getComputedStyle(body);
      if (!st) return [fail("CSS_STYLE", "getComputedStyle(body) falhou")];
      items.push(ok("CSS_STYLE", `font=${st.fontFamily || "-"} bg=${st.backgroundColor || "-"}`));
    } catch (e) {
      items.push(fail("CSS_STYLE", e?.message || String(e)));
    }
    return items;
  }

  function checkUI() {
    const items = [];
    try {
      const appRoot =
        document.getElementById("app") ||
        document.getElementById("rcfApp") ||
        document.querySelector("[data-rcf-root]") ||
        document.body;

      if (appRoot) items.push(ok("UI_ROOT", "root encontrado"));
      else items.push(fail("UI_ROOT", "root não encontrado"));
    } catch (e) {
      items.push(fail("UI_ROOT", e?.message || String(e)));
    }

    try {
      const btnGen = $("#btnGoGenerator") || $("#btnGenerator") || $('[data-view="generator"]');
      const btnAdm = $("#btnGoAdmin") || $("#btnAdmin") || $('[data-view="admin"]');
      if (btnGen || btnAdm) items.push(ok("UI_BUTTONS", "botões principais detectados"));
      else items.push(warn("UI_BUTTONS", "botões não detectados (pode depender da view/layout)"));
    } catch (e) {
      items.push(warn("UI_BUTTONS", e?.message || String(e)));
    }

    return items;
  }

  function checkEngine() {
    const items = [];
    try {
      if (window.RCF_ENGINE && typeof window.RCF_ENGINE.init === "function") items.push(ok("ENGINE_PRESENT", "RCF_ENGINE presente"));
      else items.push(warn("ENGINE_PRESENT", "RCF_ENGINE ausente (pode carregar depois)"));
    } catch (e) {
      items.push(warn("ENGINE_PRESENT", e?.message || String(e)));
    }

    try {
      if (window.RCF_BUILDER && typeof window.RCF_BUILDER.build === "function") items.push(ok("BUILDER_PRESENT", "RCF_BUILDER presente"));
      else items.push(warn("BUILDER_PRESENT", "RCF_BUILDER ausente (pode carregar depois)"));
    } catch (e) {
      items.push(warn("BUILDER_PRESENT", e?.message || String(e)));
    }

    return items;
  }

  function checkVFS() {
    const items = [];
    try {
      const ov = window.RCF_VFS_OVERRIDES;
      const vfs = window.RCF_VFS;
      if (ov && typeof ov.put === "function") items.push(ok("VFS_OVERRIDES", "RCF_VFS_OVERRIDES.put ok"));
      else items.push(warn("VFS_OVERRIDES", "RCF_VFS_OVERRIDES.put ausente"));

      if (vfs && typeof vfs.put === "function") items.push(ok("VFS", "RCF_VFS.put ok"));
      else items.push(warn("VFS", "RCF_VFS.put ausente"));
    } catch (e) {
      items.push(fail("VFS", e?.message || String(e)));
    }
    return items;
  }

  async function checkSW() {
    const items = [];
    try {
      if (!("serviceWorker" in navigator)) {
        items.push(warn("SW", "navigator.serviceWorker indisponível"));
        return items;
      }

      let reg = null;
      try { reg = await navigator.serviceWorker.getRegistration(); } catch {}
      if (!reg) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          reg = (regs && regs[0]) ? regs[0] : null;
        } catch {}
      }

      if (reg) items.push(ok("SW_REG", `scope=${reg.scope || "-"}`));
      else items.push(warn("SW_REG", "Sem registration (pode ser normal no iOS/primeiro load)"));
    } catch (e) {
      items.push(warn("SW_REG", e?.message || String(e)));
    }
    return items;
  }

  function checkClickBindings() {
    const items = [];
    try {
      const anyButton = $$("button").length > 0;
      if (!anyButton) {
        items.push(warn("CLICK_CHECK", "Sem <button> no DOM (depende da view atual)"));
        return items;
      }

      const known =
        $("#btnGoGenerator") || $("#btnGenerator") || $("#btnGoAdmin") || $("#btnAdmin") ||
        $("#btnGoDashboard") || $("#btnDashboard") || $("#btnGoAgent") || $("#btnAgent");

      if (!known) {
        items.push(warn("CLICK_CHECK", "Sem botões conhecidos (depende do layout/view)"));
        return items;
      }

      if (known.disabled) items.push(warn("CLICK_CHECK", "Botão conhecido está disabled"));
      else items.push(ok("CLICK_CHECK", "Botão conhecido detectado e habilitado"));
    } catch (e) {
      items.push(warn("CLICK_CHECK", e?.message || String(e)));
    }
    return items;
  }

  function readRuntimeLayer() {
    const runtime =
      window.runtimeLayer ||
      window.RCF_FACTORY_AI_RUNTIME ||
      window.__RCF_RUNTIME_LAYER__ ||
      {};

    return {
      connectionConfigured: safeValue(runtime.connectionConfigured),
      connectionAttempted: safeValue(runtime.connectionAttempted),
      connectionStatus: safeValue(runtime.connectionStatus),
      lastOk: safeValue(runtime.lastOk),
      connectionModel: safeValue(runtime.model || runtime.connectionModel),
      connectionProvider: safeValue(runtime.provider || runtime.connectionProvider),
      connectionUpstreamStatus: safeValue(runtime.upstreamStatus || runtime.connectionUpstreamStatus)
    };
  }

  function readFrontTelemetry() {
    const front =
      window.frontTelemetry ||
      window.__RCF_FRONT_TELEMETRY__ ||
      {};

    return {
      lastEndpoint: safeValue(front.lastEndpoint),
      lastResponseOk: safeValue(front.lastResponseOk),
      lastRouting: safeValue(front.lastRouting),
      lastResponseAt: safeValue(front.lastResponseAt)
    };
  }

  function readModuleRegistrySnapshot() {
    const reg =
      window.RCF_MODULE_REGISTRY ||
      window.moduleRegistry ||
      {};

    const summary = safeCall(() => reg.summary(), null);
    if (summary && typeof summary === "object") {
      const active = asArray(summary.active);
      return {
        activeCount: safeValue(summary.activeCount ?? active.length),
        activeList: active,
        version: safeValue(summary.version)
      };
    }

    const activeList = asArray(reg.activeList || reg.active);
    return {
      activeCount: activeList.length,
      activeList,
      version: safeValue(reg.version)
    };
  }

  function readFactoryStateSnapshot() {
    const stateApi =
      window.RCF_FACTORY_STATE ||
      window.factoryState ||
      {};

    const statusObj = safeCall(() => stateApi.status(), null);
    if (statusObj && typeof statusObj === "object") {
      const activeModules = asArray(statusObj.activeModules || statusObj.active);
      return {
        activeModulesCount: safeValue(statusObj.activeModulesCount ?? activeModules.length),
        activeModules,
        bootStatus: safeValue(statusObj.bootStatus),
        activeView: safeValue(statusObj.activeView)
      };
    }

    const state = safeCall(() => stateApi.getState(), null) || stateApi;
    const activeModules = asArray(state.activeModules || state.active);
    return {
      activeModulesCount: activeModules.length,
      activeModules,
      bootStatus: safeValue(state.bootStatus),
      activeView: safeValue(state.activeView)
    };
  }

  function readDoctorSnapshot() {
    const doctor =
      window.RCF_DOCTOR_SCAN ||
      window.RCF_DOCTOR ||
      window.doctor ||
      {};

    return {
      ready: safeValue(doctor.ready),
      version: safeValue(doctor.version),
      lastRun: safeValue(
        doctor.lastRun ||
        window.__RCF_DOCTOR_LAST_RUN__ ||
        safeCall(() => JSON.parse(localStorage.getItem("rcf:doctor_last_run")), null)
      )
    };
  }

  function readLoggerSnapshot() {
    const logger =
      window.RCF_LOGGER ||
      window.logger ||
      {};

    return {
      ready: safeValue(logger.ready),
      loggerItemsCount: safeValue(logger.itemsCount || safeCall(() => asArray(window.__RCF_LOGS__).length, null))
    };
  }

  function collect() {
    return {
      ts: now(),
      diagnosticsVersion: "v7.3",
      runtimeLayer: readRuntimeLayer(),
      frontTelemetry: readFrontTelemetry(),
      moduleRegistry: readModuleRegistrySnapshot(),
      factoryState: readFactoryStateSnapshot(),
      doctor: readDoctorSnapshot(),
      logger: readLoggerSnapshot()
    };
  }

  function print() {
    const snapshot = collect();
    try { console.log("FACTORY AI DIAGNOSTICS"); } catch {}
    try { console.log(JSON.stringify(snapshot, null, 2)); } catch {}
    return snapshot;
  }

  async function run() {
    const out = [];
    out.push(...checkBoot());
    out.push(...checkCSS());
    out.push(...checkUI());
    out.push(...checkEngine());
    out.push(...checkVFS());
    out.push(...checkClickBindings());

    const swItems = await checkSW();
    out.push(...swItems);

    const stable = out.every(x => x && x.pass === true);
    setStatusStable(stable);

    const passCount = out.filter(x => x.pass).length;
    const failCount = out.length - passCount;

    log(stable ? "ok" : "warn", `Diagnostics done. stable=${stable} pass=${passCount} fail=${failCount}`);

    return {
      ok: stable,
      stable,
      passCount,
      failCount,
      items: out,
      snapshot: collect(),
      ts: now()
    };
  }

  function status() {
    return {
      ok: !!window.RCF_STABLE,
      stable: !!window.RCF_STABLE,
      ts: now(),
      installCount: Number(window.__RCF_INSTALL_COUNT__ || 0),
      lastBoot: window.__RCF_LAST_BOOT__ || null,
      prevBoot: window.__RCF_PREV_BOOT__ || null
    };
  }

  try {
    const n = Number(window.__RCF_INSTALL_COUNT__ || 0);
    window.__RCF_INSTALL_COUNT__ = (Number.isFinite(n) ? n : 0) + 1;
  } catch {}

  window.RCF_DIAGNOSTICS = {
    __v72: true,
    __v73: true,
    run,
    status,
    collect,
    print
  };

  log("ok", "core/diagnostics.js ready ✅ (v7.3 SNAPSHOT CONSOLIDATION)");
})();
/* === RCF_RANGE_END file:/app/js/core/diagnostics.js === */

// --- Doctor AI-ready hook (non-breaking patch) ---
window.RCF_runDoctorAI = async function(report){
  try{
    await fetch("/api/admin-ai",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        action:"factory_diagnosis",
        payload:report
      })
    });
  }catch(e){
    // endpoint optional
  }
};
