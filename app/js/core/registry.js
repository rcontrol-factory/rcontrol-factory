/* Registry v1 - controla módulos/templates instalados */
(() => {
  "use strict";

  const KEY = "rcf:registry:v1";

  function nowISO(){ return new Date().toISOString(); }

  function loadRegistry(){
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      version: 1,
      updatedAt: nowISO(),
      modules: [],   // {id,name,entry,enabled}
      templates: [], // {id,name,version,entry}
      notes: ""
    };
  }

  function saveRegistry(reg){
    reg.updatedAt = nowISO();
    localStorage.setItem(KEY, JSON.stringify(reg));
    return reg;
  }

  function upsert(list, item, key="id"){
    const idx = list.findIndex(x => x && x[key] === item[key]);
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], item);
    else list.push(item);
    return list;
  }

  const Registry = {
    KEY,
    load: loadRegistry,
    save: saveRegistry,
    upsertModule(mod){
      const reg = loadRegistry();
      reg.modules = upsert(reg.modules, mod, "id");
      return saveRegistry(reg);
    },
    upsertTemplate(tpl){
      const reg = loadRegistry();
      reg.templates = upsert(reg.templates, tpl, "id");
      return saveRegistry(reg);
    }
  };

  // expõe global (padrão do teu core)
  window.RCF_REGISTRY = Registry;
})();
