/* /app/js/core/vfs_overrides.js  (PADRÃO) — v2.0
   - Wrapper robusto pro SW Overrides (PUT/CLEAR + LIST/DEL quando suportado)
   - Timeout + retry/backoff (iPhone)
   - Mantém compat: window.RCF_VFS_OVERRIDES.put/clear
   - Acrescenta: listFiles/deleteFile (pra MAE.clearOverrides não quebrar)
*/
(() => {
  "use strict";

  if (window.RCF_VFS_OVERRIDES && window.RCF_VFS_OVERRIDES.__v20) return;

  const log = (lvl, msg, extra) => {
    try { window.RCF_LOGGER?.push?.(lvl, String(msg)); } catch {}
    try { console.log("[OVR]", lvl, msg, extra || ""); } catch {}
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function withTimeout(promise, ms, label) {
    let t;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms em ${label}`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  }

  async function getSW() {
    // tenta scope raiz primeiro (compat iOS)
    const reg =
      (await navigator.serviceWorker?.getRegistration?.("/").catch(() => null)) ||
      (await navigator.serviceWorker?.getRegistration?.("./").catch(() => null)) ||
      null;

    const sw = reg?.active || navigator.serviceWorker?.controller || null;
    if (!sw) throw new Error("SW não controlando a página ainda. Recarregue 1x.");
    return { sw, reg };
  }

  async function post(msg, { timeoutMs = 6500, label = "post()", tries = 3 } = {}) {
    let lastErr = null;

    for (let a = 1; a <= tries; a++) {
      try {
        const { sw } = await getSW();

        const run = new Promise((resolve, reject) => {
          const ch = new MessageChannel();

          ch.port1.onmessage = (ev) => {
            const d = ev.data || {};
            // convencões: *_ERR, ok, error
            if (d.type && String(d.type).endsWith("_ERR")) {
              reject(new Error(d.error || "ERR"));
              return;
            }
            if (d.ok === false) {
              reject(new Error(d.error || "ERR"));
              return;
            }
            resolve(d);
          };

          // NOTE: o SW precisa responder via port2
          sw.postMessage(msg, [ch.port2]);
        });

        return await withTimeout(Promise.resolve(run), timeoutMs, label);
      } catch (e) {
        lastErr = e;
        // backoff curto (iOS)
        await sleep(250 * a + 250);
      }
    }

    throw (lastErr || new Error("post failed"));
  }

  // -------- API --------
  async function put(path, content, contentType) {
    await post(
      { type: "RCF_OVERRIDE_PUT", path, content, contentType },
      { timeoutMs: 8000, label: "RCF_OVERRIDE_PUT", tries: 4 }
    );
    return true;
  }

  async function clear() {
    // tenta CLEAR direto (mais rápido)
    await post(
      { type: "RCF_OVERRIDE_CLEAR" },
      { timeoutMs: 12000, label: "RCF_OVERRIDE_CLEAR", tries: 4 }
    );
    return true;
  }

  // Opcional: LIST/DEL (se seu SW suportar; se não suportar, a MAE ainda pode usar clear())
  async function listFiles() {
    const d = await post(
      { type: "RCF_OVERRIDE_LIST" },
      { timeoutMs: 8000, label: "RCF_OVERRIDE_LIST", tries: 2 }
    );

    // aceitamos {files:[...]} ou {list:[...]} ou {items:[...]}
    const arr = d.files || d.list || d.items || d.paths || null;
    if (!Array.isArray(arr)) {
      // se SW não suporta, não quebra com "undefined"
      throw new Error("RCF_OVERRIDE_LIST não suportado pelo SW");
    }
    return arr.map((x) => String(x || "")).filter(Boolean);
  }

  async function deleteFile(path) {
    await post(
      { type: "RCF_OVERRIDE_DEL", path },
      { timeoutMs: 8000, label: "RCF_OVERRIDE_DEL", tries: 3 }
    );
    return true;
  }

  // compat aliases
  const api = {
    __v20: true,

    put,
    write: put,

    clear,
    clearAll: clear,

    listFiles,
    deleteFile,
    del: deleteFile,

    // util: info pra logs/diagnostics
    async info() {
      const { reg } = await getSW().catch(() => ({ reg: null }));
      return {
        ok: true,
        v: "v2.0",
        scope: String(reg?.scope || "/"),
        base: String(location?.origin || "")
      };
    }
  };

  window.RCF_VFS_OVERRIDES = api;

  // log de boot
  try {
    const scope = "(unknown)";
    log("ok", "vfs_overrides ready ✅", `scope=${scope} base=${location?.origin || ""}`);
  } catch {
    log("ok", "vfs_overrides ready ✅");
  }
})();
