/* =========================================================
  RControl Factory — app/js/core/github_sync.js (FULL)
  GitHub Contents API helper (SAFE)
  - cfg via localStorage: "RCF_GH_CFG"
    { owner, repo, branch, path, token }
  - API:
    loadCfg(), saveCfg(cfg)
    pullText(), pushText(text, message)
    pullJSON(), pushJSON(obj, message)
========================================================= */

(() => {
  "use strict";

  const KEY = "RCF_GH_CFG";

  function nowISO(){ return new Date().toISOString(); }

  function safeJSONParse(s){
    try { return JSON.parse(String(s||"")); } catch { return null; }
  }

  function b64encodeUtf8(str){
    // base64 correto p/ utf-8
    const bytes = new TextEncoder().encode(String(str ?? ""));
    let bin = "";
    bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin);
  }

  function b64decodeUtf8(b64){
    const bin = atob(String(b64 || ""));
    const bytes = new Uint8Array([...bin].map(ch => ch.charCodeAt(0)));
    return new TextDecoder().decode(bytes);
  }

  function loadCfg(){
    const raw = localStorage.getItem(KEY);
    const j = safeJSONParse(raw);
    return j && typeof j === "object" ? j : { owner:"", repo:"", branch:"main", path:"app/import/mother_bundle.json", token:"" };
  }

  function saveCfg(cfg){
    const c = Object.assign(loadCfg(), cfg || {});
    if (!c.branch) c.branch = "main";
    if (!c.path) c.path = "app/import/mother_bundle.json";
    localStorage.setItem(KEY, JSON.stringify(c));
    return c;
  }

  function assertCfg(c){
    if (!c.owner) throw new Error("owner vazio");
    if (!c.repo) throw new Error("repo vazio");
    if (!c.branch) throw new Error("branch vazio");
    if (!c.path) throw new Error("path vazio");
    if (!c.token) throw new Error("token vazio (PAT)");
  }

  function ghHeaders(token){
    return {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  function contentsUrl(c){
    // Encode path com cuidado (mantém /)
    const path = String(c.path).split("/").map(encodeURIComponent).join("/");
    return `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${path}?ref=${encodeURIComponent(c.branch)}`;
  }

  async function getFile(c){
    assertCfg(c);
    const url = contentsUrl(c);
    const res = await fetch(url, { headers: ghHeaders(c.token) });
    if (res.status === 404) return { ok:true, exists:false, sha:null, content:null };
    if (!res.ok) throw new Error("GitHub GET HTTP " + res.status);
    const j = await res.json();
    const content = j && j.content ? b64decodeUtf8(j.content.replace(/\n/g,"")) : "";
    return { ok:true, exists:true, sha:j.sha, content };
  }

  async function putFile(c, text, message){
    assertCfg(c);

    const prev = await getFile(c);
    const url = `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${String(c.path).split("/").map(encodeURIComponent).join("/")}`;

    const body = {
      message: message || ("RCF sync " + nowISO()),
      content: b64encodeUtf8(String(text ?? "")),
      branch: c.branch
    };
    if (prev.exists && prev.sha) body.sha = prev.sha;

    const res = await fetch(url, {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders(c.token)),
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error("GitHub PUT HTTP " + res.status);
    const j = await res.json();
    return { ok:true, sha: j?.content?.sha || null };
  }

  async function pullText(){
    const c = loadCfg();
    const r = await getFile(c);
    return { ok:true, cfg:c, exists:r.exists, text:r.content || "" };
  }

  async function pushText(text, message){
    const c = loadCfg();
    const r = await putFile(c, text, message);
    return { ok:true, cfg:c, sha:r.sha };
  }

  async function pullJSON(){
    const r = await pullText();
    const j = safeJSONParse(r.text);
    if (!j) throw new Error("JSON inválido no GitHub (arquivo existe mas não é JSON).");
    return { ok:true, cfg:r.cfg, json:j };
  }

  async function pushJSON(obj, message){
    const txt = JSON.stringify(obj, null, 2);
    return pushText(txt, message);
  }

  // expõe no window
  window.RCF_GH_SYNC = {
    loadCfg,
    saveCfg,
    pullText,
    pushText,
    pullJSON,
    pushJSON
  };
})();
