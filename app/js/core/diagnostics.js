/* FILE: /app/js/core/diagnostics.js
   RCF — /app/js/core/diagnostics.js (V7.2 BOOT TRACE + STABILITY CHECK) — PADRÃO
   Patch mínimo e seguro:
   - ✅ BOOT TRACE: detecta "boot duplo" via localStorage/sessionStorage (somente log, sem timers)
   - ✅ FIX: BOOT_LOCK aceita __RCF_BOOTED__ OU __RCF_INDEX_BOOTED__ (evita FAIL falso no index clean)
   - Mantém: Não dar FAIL falso no CLICK CHECK (depende da view atual)
   - Mantém: Emergency UI só falha se estiver ativa/visível
   - Mantém: SW getRegistration mais robusto
   - Mantém: installCount consistente
   API: window.RCF_DIAGNOSTICS
*/

/* === RCF_RANGE_START file:/app/js/core/diagnostics.js === */
(() => {
  "use strict";

  if (window.RCF_DIAGNOSTICS && window.RCF_DIAGNOSTICS.__v72) return;

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

  // "WARN" = não bloqueia estabilidade (pass=true), mas registra atenção
  function warn(name, details = "") { return { name, pass: true,  details: "WARN: " + details, ts: now() }; }

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

  // -----------------------------
  // 0) BOOT TRACE (mínimo, só log)
  // -----------------------------
  const BOOT_LS_KEY = "rcf:diag:last_boot";
  const BOOT_SS_KEY = "rcf:diag:boot_session";
  const BOOT_DOUBLE_WINDOW_MS = 5 * 60 * 1000; // 5 min

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

  // -----------------------------
  // 1) BOOT CHECK
  // -----------------------------
  function checkBoot() {
    const items = [];

    // ✅ FIX: aceitar locks diferentes (index clean usa __RCF_INDEX_BOOTED__)
    try {
      const lockVal =
        window.__RCF_BOOTED__ ||
        window.__RCF_INDEX_BOOTED__ ||
        window.__RCF_INDEX_BOOTED || // fallback (caso alguém setou sem __)
        null;

      if (lockVal) items.push(ok("BOOT_LOCK", `lock=${String(lockVal)}`));
      else items.push(warn("BOOT_LOCK", "Nenhum lock detectado (__RCF_BOOTED__/__RCF_INDEX_BOOTED__). Se estiver tudo OK, ignore."));
    } catch (e) {
      items.push(warn("BOOT_LOCK", e?.message || String(e)));
    }

    // Emergency UI — só acusa se estiver ativo/visível
    try {
      const reloadBtn = document.getElementById("rcfReloadBtn");
      const clearBtn  = document.getElementById("rcfClearLogsBtn");
      const emergencyActive = (isVisible(reloadBtn) || isVisible(clearBtn));
      if (emergencyActive) items.push(fail("EMERGENCY_UI", "Tela de emergência ATIVA (fallback acionado)"));
      else items.push(ok("EMERGENCY_UI", "Fallback não ativo"));
    } catch (e) {
      items.push(warn("EMERGENCY_UI", e?.message || String(e)));
    }

    // BOOT DOUBLE (somente WARN)
    try {
      const prev = window.__RCF_PREV_BOOT__;
      const cur = window.__RCF_LAST_BOOT__;
      if (prev && cur && typeof prev.ts === "number" && typeof cur.ts === "number") {
        const dt = cur.ts - prev.ts;
        if (dt > 0 && dt <= BOOT_DOUBLE_WINDOW_MS) {
          items.push(warn("BOOT_DOUBLE", `detected dtMs=${dt} nav=${cur.navType}`));
        } else {
          items.push(ok("BOOT_DOUBLE", "no recent double boot"));
        }
      } else {
        items.push(ok("BOOT_DOUBLE", "no prev boot stamp"));
      }
    } catch (e) {
      items.push(warn("BOOT_DOUBLE", e?.message || String(e)));
    }

    return items;
  }

  // -----------------------------
  // 2) CSS CHECK
  // -----------------------------
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

  // -----------------------------
  // 3) UI CHECK
  // -----------------------------
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

  // -----------------------------
  // 4) ENGINE CHECK
  // -----------------------------
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

  // -----------------------------
  // 5) VFS/OVERRIDES CHECK
  // -----------------------------
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

  // -----------------------------
  // 6) SERVICE WORKER CHECK
  // -----------------------------
  async function checkSW() {
    const items = [];

    try {
      if (!("serviceWorker" in navigator)) {
        items.push(warn("SW", "navigator.serviceWorker indisponível"));
        return items;
      }

      let reg = null;
      try {
        reg = await navigator.serviceWorker.getRegistration();
      } catch {}

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

  // -----------------------------
  // 7) CLICK CHECK (não dar FAIL falso)
  // -----------------------------
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

  // -----------------------------
  // RUNNER
  // -----------------------------
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
    run,
    status
  };

  log("ok", "core/diagnostics.js ready ✅ (v7.2 BOOT TRACE)");
})();
/* === RCF_RANGE_END file:/app/js/core/diagnostics.js === */
