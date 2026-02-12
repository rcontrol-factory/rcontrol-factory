(() => {
  "use strict";

  async function post(msg) {
    const reg = await navigator.serviceWorker?.getRegistration?.("/");
    const sw = reg?.active || navigator.serviceWorker?.controller;
    if (!sw) throw new Error("SW não controlando a página ainda.");

    return await new Promise((resolve, reject) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = (ev) => {
        const d = ev.data || {};
        if (d.type?.endsWith("_ERR")) reject(new Error(d.error || "ERR"));
        else resolve(d);
      };
      sw.postMessage(msg, [ch.port2]);
    });
  }

  const api = {
    async put(path, content, contentType) {
      await post({ type: "RCF_OVERRIDE_PUT", path, content, contentType });
      return true;
    },
    async clear() {
      await post({ type: "RCF_OVERRIDE_CLEAR" });
      return true;
    }
  };

  window.RCF_VFS_OVERRIDES = api;
})();
