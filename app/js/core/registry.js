/* Registry v1 - controla módulos/templates instalados (compat + storage híbrido) */
(() => {
  "use strict";

  const KEY_FULL = "rcf:registry:v1"; // mantém o mesmo nome EXATO

  function nowISO(){ return new Date().toISOString(); }

  function emptyRegistry(){
    return {
      version: 1,
      updatedAt: nowISO(),
      modules: [],   // {id,name,entry,enabled}
      templates: [], // {id,name,version,entry}
      notes: ""
    };
  }

  function loadRegistry(){
    // 1) tenta via RCF_STORAGE.rawGet (localStorage direto, compat total)
    try {
      const raw = window.RCF_STORAGE?.rawGet?.(KEY_FULL, null);
      if (raw) return JSON.parse(raw);
    } catch {}

    // 2) fallback localStorage direto (igual antes)
    try {
      const raw = localStorage.getItem(KEY_FULL);
      if (raw) return JSON.parse(raw);
    } catch {}

    return emptyRegistry();
  }

  function saveRegistry(reg){
    reg.updatedAt = nowISO();

    // salva no localStorage (compat)
    try {
      if (window.RCF_STORAGE?.rawSet) window.RCF_STORAGE.rawSet(KEY_FULL, JSON.stringify(reg));
      else localStorage.setItem(KEY_FULL, JSON.stringify(reg));
    } catch {}

    return reg;
  }

  function upsert(list, item, key="id"){
    const idx = list.findIndex(x => x && x[key] === item[key]);
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], item);
    else list.push(item);
    return list;
  }

  const Registry = {
    KEY: KEY_FULL,
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

  window.RCF_REGISTRY = Registry;
})();
