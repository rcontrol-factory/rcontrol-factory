/* =========================================================
   RControl Factory — VFS SHIM (bridge seguro) — v1.2a (PADRÃO)
   - Faz módulos antigos enxergarem o VFS correto
   - Runtime preferido: window.RCF_VFS_OVERRIDES
   - Compat legado: window.RCF_VFS.{put,clearAll,clearOverrides}

   FIX v1.2a:
   - Log de versão ao carregar (pra confirmar que está ativo)
   - Retry mais longo (anti iOS timing)
   - Em "timeout" mostra diagnóstico do que estava faltando (probe)
   - Não sobrescreve implementações existentes; só garante aliases
========================================================= */

(() => {
  "use strict";

  const TAG = "[VFS-SHIM]";
  const VERSION = "v1.2a";

  // anti double-load
  if (window.__RCF_VFS_SHIM_VER__ === VERSION) return;
  window.__RCF_VFS_SHIM_VER__ = VERSION;

  const log = (lvl, msg, obj) => {
    try {
      const line = obj !== undefined ? `${msg} ${JSON.stringify(obj)}` : String(msg);
      if (window.RCF_LOGGER?.push) window.RCF_LOGGER.push(lvl, line);
      else console.log(TAG, lvl, line);
    } catch {}
  };

  // ✅ PROVA que esse arquivo carregou
  log("info", `loaded ${VERSION}`);

  function runtimeProbe() {
    const overrides = window.RCF_VFS_OVERRIDES;
    const legacy = window.RCF_VFS;

    return {
      has_overrides: !!overrides,
      overrides_put: typeof overrides?.put,
      overrides_clearOverrides: typeof overrides?.clearOverrides,
      overrides_clear: typeof overrides?.clear,
      has_legacy: !!legacy,
      legacy_put: typeof legacy?.put,
      legacy_clearOverrides: typeof legacy?.clearOverrides,
      legacy_clearAll: typeof legacy?.clearAll,
      sw_controller: !!navigator.serviceWorker?.controller,
      base: (document.baseURI || location.href || "").split("#")[0],
    };
  }

  function pickRuntime() {
    const overrides = window.RCF_VFS_OVERRIDES;
    if (overrides && typeof overrides.put === "function") return { kind: "OVERRIDES", api: overrides };

    const legacy = window.RCF_VFS;
    if (legacy && typeof legacy.put === "function") return { kind: "VFS", api: legacy };

    return null;
  }

  function ensureBridge() {
    const runtime = pickRuntime();
    if (!runtime) return false;

    const api = runtime.api;

    // garante objeto legado
    window.RCF_VFS = window.RCF_VFS || {};

    // put
    if (typeof window.RCF_VFS.put !== "function") {
      window.RCF_VFS.put = async (path, content, contentType) => api.put(path, content, contentType);
    }

    // clearOverrides
    if (typeof window.RCF_VFS.clearOverrides !== "function") {
      window.RCF_VFS.clearOverrides = async () => {
        if (typeof api.clearOverrides === "function") return api.clearOverrides();
        if (typeof api.clear === "function") return api.clear();
        if (typeof api.clearAll === "function") return api.clearAll();
        throw new Error("VFS sem clear/clearOverrides/clearAll.");
      };
    }

    // clearAll (Injector legado usa isso)
    if (typeof window.RCF_VFS.clearAll !== "function") {
      window.RCF_VFS.clearAll = async () => {
        if (typeof api.clearOverrides === "function") return api.clearOverrides();
        if (typeof api.clear === "function") return api.clear();
        if (typeof window.RCF_VFS.clearOverrides === "function") return window.RCF_VFS.clearOverrides();
        throw new Error("Não foi possível limpar overrides (clearAll).");
      };
    }

    window.RCF_VFS.__shim = { ok: true, v: VERSION, runtime: runtime.kind, at: Date.now() };
    log("ok", `VFS bridge OK ✅ (${VERSION}) runtime=${runtime.kind}`);
    return true;
  }

  // tenta já
  if (ensureBridge()) return;

  // tenta por mais tempo (iOS timing / controllerchange)
  let done = false;
  let tries = 0;

  const MAX_TRIES = 160; // ~30-60s dependendo do delay
  let delay = 200;

  const tick = () => {
    if (done) return;
    tries++;

    if (ensureBridge()) {
      done = true;
      return;
    }

    if (tries >= MAX_TRIES) {
      done = true;
      log("warn", "VFS bridge NÃO instalou (timeout). probe=", runtimeProbe());
      return;
    }

    // backoff leve
    if (tries % 12 === 0) delay = Math.min(600, delay + 100);
    setTimeout(tick, delay);
  };

  setTimeout(tick, delay);

  try {
    window.addEventListener("load", () => { if (!done) setTimeout(tick, 50); }, { once: true });
  } catch {}

  try {
    navigator.serviceWorker?.addEventListener?.("controllerchange", () => {
      if (!done) setTimeout(tick, 50);
    });
  } catch {}
})();
