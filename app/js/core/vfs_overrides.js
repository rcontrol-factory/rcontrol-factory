/* RControl Factory — /app/js/core/vfs_overrides.js (PADRÃO) — v1.1
   - Canal seguro com SW (MessageChannel)
   - post() com timeout + retry (iOS safe)
   - API: put(path, content, contentType) / clear()
*/
(() => {
  "use strict";

  const DEFAULT_TIMEOUT_MS = 6500; // compat com logs antigos
  const RETRIES = 2;              // total tries = 1 + RETRIES

  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

  async function getSW() {
    // tenta pegar registration do scope raiz
    const reg = await navigator.serviceWorker?.getRegistration?.("/");
    const sw = reg?.active || navigator.serviceWorker?.controller;
    if (!sw) throw new Error("SW não controlando a página ainda.");
    return sw;
  }

  function withTimeout(promise, ms, label){
    let t;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms em ${label}`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  }

  async function postOnce(msg, timeoutMs) {
    const sw = await getSW();

    return await withTimeout(new Promise((resolve, reject) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = (ev) => {
        const d = ev.data || {};
        if (d.type?.endsWith("_ERR")) reject(new Error(d.error || "ERR"));
        else resolve(d);
      };

      try {
        sw.postMessage(msg, [ch.port2]);
      } catch (e) {
        reject(e);
      }
    }), timeoutMs || DEFAULT_TIMEOUT_MS, msg?.type || "post()");
  }

  async function post(msg, timeoutMs) {
    let lastErr = null;
    for (let i = 0; i <= RETRIES; i++){
      try {
        // pequeno backoff (iOS)
        if (i) await sleep(250 * i);
        return await postOnce(msg, timeoutMs);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("post failed");
  }

  const api = {
    async put(path, content, contentType) {
      await post({ type: "RCF_OVERRIDE_PUT", path, content, contentType }, 8000);
      return true;
    },
    async clear() {
      // clear pode ser mais pesado — deixa um pouco mais de tempo
      await post({ type: "RCF_OVERRIDE_CLEAR" }, 12000);
      return true;
    }
  };

  window.RCF_VFS_OVERRIDES = api;

  // log opcional (se logger existir)
  try {
    window.RCF_LOGGER?.push?.("ok", "OK: vfs_overrides ready ✅ scope=/");
  } catch {}
})();
