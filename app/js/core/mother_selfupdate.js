/* ERCtrl — Mother Self-Update
   Usa window.RCF_GH_SYNC.pull() para baixar mother_bundle.json
   e aplica via Service Worker override cache (RCF_OVERRIDE_PUT).
*/
(() => {
  "use strict";

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function postToSW(msg) {
    return new Promise((resolve, reject) => {
      if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
        return reject(new Error("SW controller ausente (recarregue a pagina)"));
      }
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => {
        const d = e.data || {};
        if (d.type && d.type.endsWith("_ERR")) reject(new Error(d.error || "SW err"));
        else resolve(d);
      };
      navigator.serviceWorker.controller.postMessage(msg, [ch.port2]);
      // fallback: alguns browsers nao respondem - resolve mesmo assim
      setTimeout(() => resolve({ ok: true }), 1200);
    });
  }

  async function applyBundle(bundleText) {
    let bundle;
    try { bundle = JSON.parse(bundleText); } catch { throw new Error("Bundle JSON invalido"); }
    if (!bundle || !Array.isArray(bundle.files)) throw new Error("Bundle sem 'files'");

    for (const f of bundle.files) {
      const path = String(f.path || "").trim();
      const content = String(f.content ?? "");
      const contentType = String(f.contentType || "text/plain; charset=utf-8");
      if (!path.startsWith("/")) throw new Error("path invalido: " + path);

      await postToSW({ type: "RCF_OVERRIDE_PUT", path, content, contentType });
      await sleep(30);
    }
    return bundle.version || "sem-versao";
  }

  async function updateNow() {
    if (!window.RCF_GH_SYNC) throw new Error("RCF_GH_SYNC ausente");
    const txt = await window.RCF_GH_SYNC.pull();
    const ver = await applyBundle(txt);
    try {
      if (window.RCF_LOGGER?.push) window.RCF_LOGGER.push("ok", "SelfUpdate aplicado: " + ver);
    } catch {}
    location.reload();
  }

  window.RCF_MOTHER_UPDATE = { updateNow };
})();
