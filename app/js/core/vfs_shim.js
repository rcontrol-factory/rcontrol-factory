/* =========================================================
   RControl Factory — VFS SHIM (bridge seguro) — v1.2 (PADRÃO)
   - Faz módulos antigos enxergarem o VFS correto
   - Runtime preferido: window.RCF_VFS_OVERRIDES
   - Compat legado: window.RCF_VFS.{put,clearAll,clearOverrides}

   FIX v1.2 (anti-timeout iOS / bridge intermitente):
   - Bridge pode usar OVERRIDES OU (fallback) RCF_VFS já existente
   - Retry mais inteligente (mais tempo + backoff leve)
   - Re-tenta em controllerchange / load
   - Não “grita timeout” cedo demais; só avisa se realmente não conseguiu
   - Não sobrescreve implementações existentes; só garante aliases
========================================================= */

(() => {
  "use strict";

  const TAG = "[VFS-SHIM]";
  const VERSION = "v1.2";

  // evita rodar 2x
  if (window.__RCF_VFS_SHIM__ === VERSION) return;
  window.__RCF_VFS_SHIM__ = VERSION;

  const log = (lvl, msg) => {
    try {
      if (window.RCF_LOGGER?.push) window.RCF_LOGGER.push(lvl, msg);
      else console.log(TAG, lvl, msg);
    } catch {}
  };

  function pickRuntime() {
    const overrides = window.RCF_VFS_OVERRIDES;
    if (overrides && typeof overrides.put === "function") {
      return { kind: "OVERRIDES", api: overrides };
    }

    const legacy = window.RCF_VFS;
    if (legacy && typeof legacy.put === "function") {
      return { kind: "VFS", api: legacy };
    }

    return null;
  }

  function ensureBridge() {
    const runtime = pickRuntime();
    if (!runtime) return false;

    const api = runtime.api;

    // Garante objeto RCF_VFS
    window.RCF_VFS = window.RCF_VFS || {};

    // 1) put (não sobrescreve se já existir)
    if (typeof window.RCF_VFS.put !== "function") {
      window.RCF_VFS.put = async (path, content, contentType) => {
        return api.put(path, content, contentType);
      };
    }

    // 2) clearOverrides (alias seguro)
    if (typeof window.RCF_VFS.clearOverrides !== "function") {
      window.RCF_VFS.clearOverrides = async () => {
        if (typeof api.clearOverrides === "function") return api.clearOverrides();
        if (typeof api.clear === "function") return api.clear();
        // alguns runtimes antigos usam clearAll
        if (typeof api.clearAll === "function") return api.clearAll();
        throw new Error("VFS sem clear/clearOverrides/clearAll.");
      };
    }

    // 3) clearAll (Injector legado usa isso)
    if (typeof window.RCF_VFS.clearAll !== "function") {
      window.RCF_VFS.clearAll = async () => {
        // prioriza clearOverrides
        if (typeof api.clearOverrides === "function") return api.clearOverrides();
        if (typeof api.clear === "function") return api.clear();
        // fallback via alias garantido
        if (typeof window.RCF_VFS.clearOverrides === "function") return window.RCF_VFS.clearOverrides();
        throw new Error("Não foi possível limpar overrides (clearAll).");
      };
    }

    // marca ok (pra debug)
    window.RCF_VFS.__shim = { ok: true, v: VERSION, runtime: runtime.kind };

    log("ok", `VFS bridge OK ✅ (${VERSION}) runtime=${runtime.kind}`);
    return true;
  }

  // tenta já
  if (ensureBridge()) return;

  // retry com mais tolerância (iOS às vezes demora controller/ordem de scripts)
  let done = false;
  let tries = 0;
  const MAX_TRIES = 140;          // ~28s @ 200ms (mas com backoff leve)
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
      log("warn", "VFS bridge não instalou (timeout).");
      return;
    }

    // backoff leve até 600ms (não congestiona iPhone)
    if (tries % 10 === 0) delay = Math.min(600, delay + 100);

    setTimeout(tick, delay);
  };

  setTimeout(tick, delay);

  // re-tenta em eventos que mudam o controller / timing
  try {
    window.addEventListener("load", () => { if (!done) setTimeout(tick, 50); }, { once: true });
  } catch {}

  try {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!done) setTimeout(tick, 50);
      });
    }
  } catch {}
})();
