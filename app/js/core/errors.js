/* =========================================================
  RControl Factory — /app/js/core/errors.js (PADRÃO) — v1.0
  - Error bus central (não deixa sumir erro)
  - Guarda últimos erros (localStorage)
  - API: window.RCF_ERRORS
========================================================= */
(() => {
  "use strict";

  if (window.RCF_ERRORS && window.RCF_ERRORS.__v10) return;

  const KEY = "rcf:errors:last";
  const KEY_LIST = "rcf:errors:list";
  const MAX = 60;

  const safeStr = (x) => {
    try { return typeof x === "string" ? x : JSON.stringify(x); }
    catch { return String(x); }
  };

  function nowISO(){ return new Date().toISOString(); }

  function readList(){
    try {
      const arr = JSON.parse(localStorage.getItem(KEY_LIST) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  function writeList(arr){
    try { localStorage.setItem(KEY_LIST, JSON.stringify(arr || [])); } catch {}
  }

  function push(payload){
    const p = payload && typeof payload === "object" ? payload : { message: safeStr(payload) };
    p.ts = p.ts || nowISO();
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}

    const list = readList();
    list.push(p);
    while (list.length > MAX) list.shift();
    writeList(list);

    try { window.RCF_LOGGER?.push?.("err", `[RCF_ERRORS] ${p.kind || "error"}: ${p.message || ""}`); } catch {}
    return p;
  }

  function last(){
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
  }

  function list(){
    return readList();
  }

  function clear(){
    try { localStorage.removeItem(KEY); } catch {}
    try { localStorage.removeItem(KEY_LIST); } catch {}
    return true;
  }

  function wrap(fn, label){
    return function(...args){
      try { return fn.apply(this, args); }
      catch (e) {
        push({
          kind: "exception",
          label: String(label || fn?.name || "fn"),
          message: safeStr(e?.message || e),
          stack: safeStr(e?.stack || "")
        });
        throw e;
      }
    };
  }

  window.RCF_ERRORS = {
    __v10: true,
    keyLast: KEY,
    keyList: KEY_LIST,
    push,
    last,
    list,
    clear,
    wrap
  };

  try { window.RCF_LOGGER?.push?.("ok", "core/errors.js ready ✅ (v1.0)"); } catch {}
})();
