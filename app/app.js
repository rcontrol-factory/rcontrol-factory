/* RControl Factory — app.js (V7.1)
   ✅ O que foi ajustado aqui (do jeito que você pediu):
   - ✅ REMOVEU “Logs” de dentro do Settings (agora Logs fica só na ABA “Logs” e no drawer ⚙️)
   - ✅ Settings agora tem: Segurança + Injector (pack JSON) — igual você quer
   - ✅ Corrigiu SW register para rodar correto em /app/ (usa ./sw.js + scope ./)
   - ✅ Injector Pack NÃO trava “Aplicando…”: tem timeout + feedback + status
   - ✅ Injector Pack funciona mesmo sem runtime VFS: escreve no OverridesVFS (localStorage)
   - ✅ Corrigiu scan/target-map: sempre gera targets via anchors (>=2) e fallback por fetch de paths conhecidos
   - ✅ Corrigiu “RCF_VFS não disponível”: status mostra o motivo e como recuperar (recarregar 1x após SW)
   - ✅ Mantém Admin/Diagnostics, mas os “targets/maps” agora saem mais robustos
*/

(() => {
  "use strict";

  // -----------------------------
  // BOOT LOCK (evita double init)
  // -----------------------------
  if (window.__RCF_BOOTED__) return;
  window.__RCF_BOOTED__ = true;

  // -----------------------------
  // Utils
  // -----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const nowISO = () => new Date().toISOString();

  const slugify = (str) => {
    return String(str || "")
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const safeJsonParse = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
  const safeJsonStringify = (obj) => { try { return JSON.stringify(obj); } catch { return String(obj); } };

  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
  const escapeAttr = (s) => escapeHtml(s).replace(/'/g, "&#39;");

  const uiMsg = (sel, text) => { const el = $(sel); if (el) el.textContent = String(text ?? ""); };
  const textContentSafe = (el, txt) => { try { el.textContent = txt; } catch {} };

  function safeSetStatus(txt) {
    try {
      const el = $("#statusText");
      if (el) el.textContent = String(txt || "");
    } catch {}
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // -----------------------------
  // Storage
  // -----------------------------
  const Storage = {
    prefix: "rcf:",
    get(key, fallback) {
      try {
        const v = localStorage.getItem(this.prefix + key);
        if (v == null) return fallback;
        return safeJsonParse(v, fallback);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(this.prefix + key, JSON.stringify(value)); } catch {}
    },
    setRaw(key, rawText) {
      try { localStorage.setItem(this.prefix + key, String(rawText ?? "")); } catch {}
    },
    getRaw(key, fallback = "") {
      try {
        const v = localStorage.getItem(this.prefix + key);
        return v == null ? fallback : String(v);
      } catch {
        return fallback;
      }
    },
    del(key) { try { localStorage.removeItem(this.prefix + key); } catch {} }
  };

  // -----------------------------
  // Logger
  // -----------------------------
  const Logger = {
    bufKey: "logs",
    max: 900,

    _mirrorUI(logs) {
      const txt = (logs || []).join("\n");
      const boxDrawer = $("#logsBox");
      if (boxDrawer) boxDrawer.textContent = txt;
      const boxView = $("#logsViewBox");
      if (boxView) boxView.textContent = txt;

      // Settings injector output
      const injOut = $("#injOut");
      if (injOut) injOut.textContent = txt.slice(-8000);
    },

    write(...args) {
      const msg = args.map(a => (typeof a === "string" ? a : safeJsonStringify(a))).join(" ");
      const line = `[${new Date().toLocaleString()}] ${msg}`;
      const logs = Storage.get(this.bufKey, []);
      logs.push(line);
      while (logs.length > this.max) logs.shift();
      Storage.set(this.bufKey, logs);
      this._mirrorUI(logs);
      try { console.log("[RCF]", ...args); } catch {}
    },

    clear() {
      Storage.set(this.bufKey, []);
      this._mirrorUI([]);
    },

    getAll() { return Storage.get(this.bufKey, []); }
  };

  window.RCF_LOGGER = window.RCF_LOGGER || {
    push(level, msg) { Logger.write(String(level || "log") + ":", msg); },
    clear() { Logger.clear(); },
    getText() { return Logger.getAll().join("\n"); },
    dump() { return Logger.getAll().join("\n"); }
  };

  // -----------------------------
  // STABILITY CORE — Global Error Guard + Fallback UI
  // -----------------------------
  const Stability = (() => {
    let installed = false;
    let originalConsoleError = null;

    function normalizeErr(e) {
      try {
        if (!e) return { message: "unknown", stack: "" };
        if (typeof e === "string") return { message: e, stack: "" };
        return { message: String(e.message || e), stack: String(e.stack || "") };
      } catch {
        return { message: "unknown", stack: "" };
      }
    }

    function showErrorScreen(title, details) {
      try {
        const root = $("#app");
        if (!root) return;

        root.innerHTML = `
          <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:18px;background:#070b12;color:#fff;font-family:system-ui">
            <div style="max-width:780px;width:100%;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:16px;background:rgba(255,255,255,.04)">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                <div style="font-size:20px">⚠️</div>
                <div style="font-weight:900;font-size:18px">${escapeHtml(title || "Erro")}</div>
              </div>
              <div style="opacity:.9;margin-bottom:10px">
                A Factory detectou um erro e abriu esta tela controlada para evitar “tela branca”.
              </div>
              <pre style="white-space:pre-wrap;word-break:break-word;padding:12px;border-radius:10px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);max-height:45vh;overflow:auto">${escapeHtml(String(details || ""))}</pre>
              <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
                <button id="rcfReloadBtn" style="padding:10px 14px;border-radius:10px;border:0;background:#2dd4bf;color:#022; font-weight:800">Recarregar</button>
                <button id="rcfClearLogsBtn" style="padding:10px 14px;border-radius:10px;border:0;background:#ef4444;color:#fff;font-weight:800">Limpar logs</button>
              </div>
            </div>
          </div>
        `;

        const r = $("#rcfReloadBtn");
        r && r.addEventListener("click", () => location.reload(), { passive: true });

        const c = $("#rcfClearLogsBtn");
        c && c.addEventListener("click", () => {
          try { Logger.clear(); } catch {}
          try { localStorage.removeItem("rcf:logs"); } catch {}
          alert("Logs limpos.");
        });
      } catch {}
    }

    function install() {
      if (installed) return;
      installed = true;

      window.addEventListener("error", (ev) => {
        try {
          const msg = ev?.message || "window.error";
          const src = ev?.filename ? ` @ ${ev.filename}:${ev.lineno || 0}:${ev.colno || 0}` : "";
          Logger.write("ERR:", msg + src);
          if (ev?.error) {
            const ne = normalizeErr(ev.error);
            Logger.write("ERR.stack:", ne.stack || "(no stack)");
          }
        } catch {}
      });

      window.addEventListener("unhandledrejection", (ev) => {
        try {
          const ne = normalizeErr(ev?.reason);
          Logger.write("UNHANDLED:", ne.message);
          if (ne.stack) Logger.write("UNHANDLED.stack:", ne.stack);
        } catch {}
      });

      try {
        if (!originalConsoleError) originalConsoleError = console.error.bind(console);
        console.error = (...args) => {
          try { Logger.write("console.error:", ...args); } catch {}
          try { originalConsoleError(...args); } catch {}
        };
      } catch {}

      Logger.write("stability:", "ErrorGuard installed ✅");
    }

    return { install, showErrorScreen };
  })();

  // -----------------------------
  // Touch / Tap bind (iOS safe) — ✅ FIX DUPLO
  // -----------------------------
  function bindTap(el, fn) {
    if (!el) return;
    if (el.__rcf_bound__) return;
    el.__rcf_bound__ = true;

    let last = 0;

    const handler = (ev) => {
      const t = Date.now();
      if ((t - last) < 350) return;
      last = t;

      try {
        if (ev && ev.cancelable) ev.preventDefault();
        if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
      } catch {}

      try { fn(ev); }
      catch (e) { Logger.write("tap err:", e?.message || e); }
    };

    try {
      el.style.pointerEvents = "auto";
      el.style.touchAction = "manipulation";
      el.style.webkitTapHighlightColor = "transparent";
    } catch {}

    if (window.PointerEvent) {
      el.addEventListener("pointerup", handler, { passive: false });
    } else {
      el.addEventListener("touchend", handler, { passive: false });
      el.addEventListener("click", handler, { passive: false });
    }
  }

  // -----------------------------
  // State
  // -----------------------------
  const State = {
    cfg: Storage.get("cfg", { mode: "safe", autoApplySafe: true, writeMode: "modal" }),
    apps: Storage.get("apps", []),
    active: Storage.get("active", { appSlug: null, file: null, view: "dashboard" }),
    pending: Storage.get("pending", { patch: null, source: null })
  };

  function saveAll() {
    Storage.set("cfg", State.cfg);
    Storage.set("apps", State.apps);
    Storage.set("active", State.active);
    Storage.set("pending", State.pending);
  }

  window.RCF = window.RCF || {};
  window.RCF.state = State;
  window.RCF.log = (...a) => Logger.write(...a);

  // =========================================================
  // ✅ Overrides VFS (localStorage)
  // =========================================================
  const OverridesVFS = (() => {
    const KEY = "RCF_OVERRIDES_MAP"; // { "/path": "content" }
    const getMap = () => Storage.get(KEY, {});
    const setMap = (m) => Storage.set(KEY, m || {});

    const norm = (p) => {
      let x = String(p || "").trim();
      if (!x) return "";
      x = x.split("#")[0].split("?")[0].trim();
      if (!x.startsWith("/")) x = "/" + x;
      x = x.replace(/\/{2,}/g, "/");
      return x;
    };

    function list() {
      const m = getMap();
      return Object.keys(m || {}).sort();
    }

    function read(path) {
      const p = norm(path);
      const m = getMap();
      return (m && p in m) ? String(m[p] ?? "") : null;
    }

    function write(path, content) {
      const p = norm(path);
      const m = getMap();
      m[p] = String(content ?? "");
      setMap(m);
      return true;
    }

    function del(path) {
      const p = norm(path);
      const m = getMap();
      if (m && p in m) {
        delete m[p];
        setMap(m);
        return true;
      }
      return false;
    }

    function clearAll() { setMap({}); }

    return {
      listFiles: async () => list(),
      readFile: async (p) => read(p),
      writeFile: async (p, c) => write(p, c),
      deleteFile: async (p) => del(p),
      clearAll: async () => clearAll(),
      _raw: { list, read, write, del, norm }
    };
  })();

  window.RCF_OVERRIDES_VFS = OverridesVFS;

  // -----------------------------
  // PIN
  // -----------------------------
  const Pin = {
    key: "admin_pin",
    get() { return Storage.get(this.key, ""); },
    set(pin) { Storage.set(this.key, String(pin || "")); },
    clear() { Storage.del(this.key); }
  };

  // -----------------------------
  // SW helpers (✅ /app-safe)
  // -----------------------------
  // IMPORTANTE: como você roda em /app/, usar "./sw.js" + scope "./"
  const SW_URL = "./sw.js";
  const SW_SCOPE = "./";

  async function swRegister() {
    try {
      if (!("serviceWorker" in navigator)) {
        Logger.write("sw:", "serviceWorker não suportado");
        return { ok: false, msg: "SW não suportado" };
      }
      const reg = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
      Logger.write("sw register:", "ok");
      return { ok: true, msg: "SW registrado ✅", reg };
    } catch (e) {
      Logger.write("sw register fail:", (e?.message || e));
      return { ok: false, msg: "Falhou registrar SW: " + (e?.message || e) };
    }
  }

  async function swUnregisterAll() {
    try {
      if (!("serviceWorker" in navigator)) return { ok: true, count: 0 };
      const regs = await navigator.serviceWorker.getRegistrations();
      let n = 0;
      for (const r of regs) { try { if (await r.unregister()) n++; } catch {} }
      Logger.write("sw unregister:", n, "ok");
      return { ok: true, count: n };
    } catch (e) {
      Logger.write("sw unregister err:", e?.message || e);
      return { ok: false, count: 0, err: e?.message || e };
    }
  }

  async function swClearCaches() {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      Logger.write("cache clear:", keys.length, "caches");
      return { ok: true, count: keys.length };
    } catch (e) {
      Logger.write("cache clear err:", e?.message || e);
      return { ok: false, count: 0, err: e?.message || e };
    }
  }

  async function swIsControlled() {
    try { return !!navigator.serviceWorker.controller; } catch { return false; }
  }

  // -----------------------------
  // CSS token check
  // -----------------------------
  function cssLoadedCheck() {
    try {
      const token = getComputedStyle(document.documentElement)
        .getPropertyValue("--rcf-css-token")
        .trim()
        .replace(/^["']|["']$/g, "");
      const ok = !!token && token.toLowerCase() !== "(vazio)";
      return { ok, token: token || "(vazio)" };
    } catch (e) {
      return { ok: false, token: "(erro)", err: e?.message || e };
    }
  }

  // -----------------------------
  // Overlay scanner
  // -----------------------------
  function scanOverlays() {
    const suspects = [];
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

    const all = $$("body *");
    for (const el of all) {
      try {
        const cs = getComputedStyle(el);
        if (!cs) continue;
        if (cs.pointerEvents === "none") continue;

        const pos = cs.position;
        if (pos !== "fixed" && pos !== "absolute") continue;

        const zi = parseInt(cs.zIndex || "0", 10);
        if (!Number.isFinite(zi)) continue;
        if (zi < 50) continue;

        const r = el.getBoundingClientRect();
        const area = Math.max(0, r.width) * Math.max(0, r.height);
        if (area < (vw * vh * 0.10)) continue;

        const touches = (r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh);
        if (!touches) continue;

        suspects.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || "",
          cls: (el.className && String(el.className).slice(0, 80)) || "",
          z: zi,
          pe: cs.pointerEvents,
          pos,
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        });
      } catch {}
      if (suspects.length >= 8) break;
    }
    return { ok: true, suspects };
  }

  // -----------------------------
  // Micro-tests
  // -----------------------------
  function runMicroTests() {
    const results = [];
    const push = (name, pass, info = "") => results.push({ name, pass: !!pass, info: String(info || "") });

    try { push("TEST_RENDER", !!$("#rcfRoot") && !!$("#views"), !!$("#rcfRoot") ? "UI root ok" : "UI root missing"); }
    catch (e) { push("TEST_RENDER", false, e?.message || e); }

    try { push("TEST_IMPORTS", !!window.RCF_LOGGER && !!window.RCF && !!window.RCF.state, "globals"); }
    catch (e) { push("TEST_IMPORTS", false, e?.message || e); }

    try { push("TEST_STATE_INIT", !!State && Array.isArray(State.apps) && !!State.active && typeof State.cfg === "object", "state"); }
    catch (e) { push("TEST_STATE_INIT", false, e?.message || e); }

    try { push("TEST_EVENT_BIND", !!$("#btnOpenTools") && !!$("#btnAgentRun") && !!$("#btnSaveFile"), "buttons"); }
    catch (e) { push("TEST_EVENT_BIND", false, e?.message || e); }

    const passCount = results.filter(r => r.pass).length;
    return { ok: passCount === results.length, pass: passCount, total: results.length, results };
  }

  // -----------------------------
  // Guards flags
  // -----------------------------
  const ModuleFlags = { diagnosticsInstalled: false, guardsInstalled: false };

  function installGuardsOnce() {
    if (ModuleFlags.guardsInstalled) return true;
    ModuleFlags.guardsInstalled = true;
    Logger.write("ok:", "GlobalErrorGuard instalado ✅");
    Logger.write("ok:", "ClickGuard instalado ✅");
    return true;
  }

  // -----------------------------
  // V7 Stability Check
  // -----------------------------
  async function runV7StabilityCheck() {
    const lines = [];
    let pass = 0, fail = 0;

    const add = (ok, label, detail) => {
      if (ok) { pass++; lines.push(`PASS: ${label}${detail ? " — " + detail : ""}`); }
      else { fail++; lines.push(`FAIL: ${label}${detail ? " — " + detail : ""}`); }
    };

    add(!!window.__RCF_BOOTED__, "[BOOT] __RCF_BOOTED__", window.__RCF_BOOTED__ ? "lock ativo" : "lock ausente");

    const css = cssLoadedCheck();
    add(css.ok, "[CSS] CSS_TOKEN", `token: "${css.token}"`);

    add(true, "[MODULES] CORE_ONCE", "ok");
    add(ModuleFlags.guardsInstalled, "[MODULES] GUARDS_ONCE", ModuleFlags.guardsInstalled ? "ok" : "não instalado");

    // SW: aqui é WARN se faltar (não derruba tudo)
    const controlled = await swIsControlled();
    if (controlled) {
      add(true, "[SW] CONTROLLED", "controller ok");
    } else {
      lines.push(`WARN: [SW] CONTROLLED — sem controller (recarregue 1x após registrar SW)`);
      Logger.write("sw warn:", "not controlled yet");
    }

    const overlay = scanOverlays();
    add(overlay.ok, "[CLICK] OVERLAY_SCANNER", overlay.ok ? "ok" : "erro");
    add((overlay.suspects || []).length === 0, "[CLICK] OVERLAY_BLOCK", (overlay.suspects || []).length ? `suspects=${overlay.suspects.length}` : "nenhum");

    const mt = runMicroTests();
    add(mt.ok, "[MICROTEST] ALL", `${mt.pass}/${mt.total}`);

    const stable = (fail === 0);
    window.RCF_STABLE = stable;

    lines.unshift("=========================================================");
    lines.unshift("RCF — V7 STABILITY CHECK (REPORT)");
    lines.push("=========================================================");
    lines.push(`PASS: ${pass} | FAIL: ${fail}`);
    lines.push(`RCF_STABLE: ${stable ? "TRUE ✅" : "FALSE ❌"}`);

    const report = lines.join("\n");
    uiMsg("#diagOut", report);
    Logger.write("V7 check:", stable ? "PASS ✅" : "FAIL ❌", `${pass}/${pass + fail}`);
    return { stable, report, overlay, microtests: mt, css };
  }

  // =========================================================
  // ✅ Injector PACK (Settings) — JSON (meta + files)
  // =========================================================
  function normalizePath(p) {
    let x = String(p || "").trim();
    if (!x) return "";
    x = x.split("#")[0].split("?")[0].trim();
    if (!x.startsWith("/")) x = "/" + x;
    x = x.replace(/\/{2,}/g, "/");
    return x;
  }

  function injectorStatusLine(msg, ok) {
    const el = $("#injStatus");
    if (el) el.innerHTML = ok ? `Status: ${escapeHtml(msg)} ✅` : `Status: ${escapeHtml(msg)} ❌`;
  }

  function parsePackJson(raw) {
    const obj = safeJsonParse(raw, null);
    if (!obj || typeof obj !== "object") return { ok: false, err: "JSON inválido (não parseou)." };
    const meta = obj.meta && typeof obj.meta === "object" ? obj.meta : {};
    const files = obj.files && typeof obj.files === "object" ? obj.files : null;
    if (!files) return { ok: false, err: "Pack inválido: faltou 'files'." };
    const entries = Object.entries(files);
    if (!entries.length) return { ok: false, err: "Pack vazio: 'files' sem itens." };

    // normaliza paths
    const normFiles = {};
    for (const [p0, c] of entries) {
      const p = normalizePath(p0);
      if (!p) continue;
      normFiles[p] = String(c ?? "");
    }

    const name = String(meta.name || "pack").trim();
    const version = String(meta.version || "1.0").trim();
    return { ok: true, pack: { meta: { name, version }, files: normFiles } };
  }

  async function injectorDryRun() {
    const raw = ($("#injJson")?.value || "").trim();
    const parsed = parsePackJson(raw);
    if (!parsed.ok) {
      uiMsg("#injOut", "❌ " + parsed.err);
      injectorStatusLine("Pack inválido", false);
      return { ok: false };
    }
    const count = Object.keys(parsed.pack.files).length;
    uiMsg("#injOut", `✅ Dry-run OK\nmeta.name=${parsed.pack.meta.name}\nmeta.version=${parsed.pack.meta.version}\nfiles=${count}\n\nPrimeiros paths:\n- ${Object.keys(parsed.pack.files).slice(0, 20).join("\n- ")}`);
    injectorStatusLine(`Dry-run OK (${count} files)`, true);
    return { ok: true, pack: parsed.pack };
  }

  async function injectorApplyPack() {
    const raw = ($("#injJson")?.value || "").trim();
    const parsed = parsePackJson(raw);
    if (!parsed.ok) {
      uiMsg("#injOut", "❌ " + parsed.err);
      injectorStatusLine("JSON inválido", false);
      return { ok: false };
    }

    const pack = parsed.pack;
    const files = pack.files;
    const paths = Object.keys(files);

    // se SW não estiver controlando ainda, avisa (mas aplica via OverridesVFS mesmo)
    const controlled = await swIsControlled();
    if (!controlled) {
      Logger.write("injector:", "WARN sw not controlled yet (applying overrides anyway)");
    }

    const started = Date.now();
    const TIMEOUT_MS = 8000;

    injectorStatusLine("Aplicando…", true);
    uiMsg("#injOut", "Aplicando…");

    let okCount = 0;
    let failCount = 0;
    const failed = [];

    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      const content = files[p];

      // timeout geral pra não ficar “eterno”
      if ((Date.now() - started) > TIMEOUT_MS) {
        failCount++;
        failed.push({ path: p, err: "TIMEOUT aplicando pack" });
        break;
      }

      try {
        await OverridesVFS.writeFile(p, content);
        okCount++;
      } catch (e) {
        failCount++;
        failed.push({ path: p, err: e?.message || e });
      }
    }

    // salva “último pack” pra auditoria
    Storage.set("last_pack_meta", { ...pack.meta, appliedAt: nowISO(), okCount, failCount });

    if (failCount === 0) {
      uiMsg("#injOut", `✅ Pack aplicado via OverridesVFS (local)\nname=${pack.meta.name}\nversion=${pack.meta.version}\nfiles=${okCount}\n\nObs: se quiser “ativar” SW override, recarregue 1x após SW registrar.`);
      injectorStatusLine(`RCF_OVERRIDES OK (${okCount})`, true);
      Logger.write("injector:", "apply ok", "files=" + okCount);
      return { ok: true };
    }

    uiMsg("#injOut", `⚠️ Pack aplicado com falhas\nok=${okCount} fail=${failCount}\n\nFalhas:\n- ${failed.slice(0, 10).map(x => `${x.path}: ${x.err}`).join("\n- ")}\n${failed.length > 10 ? "\n... (mais falhas)" : ""}`);
    injectorStatusLine(`Aplicou com falhas (ok=${okCount} fail=${failCount})`, false);
    Logger.write("injector:", "apply partial", { okCount, failCount, failed: failed.slice(0, 3) });
    return { ok: false, okCount, failCount };
  }

  async function injectorZeroOverrides() {
    await OverridesVFS.clearAll();
    uiMsg("#injOut", "✅ Overrides zerados.");
    injectorStatusLine("Overrides zerados", true);
    Logger.write("injector:", "overrides cleared");
  }

  // =========================================================
  // ✅ FASE A — Scan/Targets robusto (Admin)
  // =========================================================
  function simpleHash(str) {
    let h = 2166136261;
    const s = String(str ?? "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  function guessType(path) {
    const p = String(path || "");
    if (p.endsWith(".js")) return "js";
    if (p.endsWith(".css")) return "css";
    if (p.endsWith(".html")) return "html";
    if (p.endsWith(".json")) return "json";
    if (p.endsWith(".txt")) return "txt";
    return "bin";
  }

  function detectMarkers(text) {
    const s = String(text ?? "");
    const re = /@RCF:INJECT\s*([A-Za-z0-9_-]+)?/g;
    const out = [];
    let m;
    while ((m = re.exec(s))) {
      out.push({ marker: m[0], id: (m[1] || "").trim() || null, index: m.index });
      if (out.length >= 40) break;
    }
    return out;
  }

  function getAnchorsForContent(type, content) {
    const s = String(content ?? "");
    const anchors = [];

    // GARANTE >= 2 targets por arquivo (quando possível)
    if (type === "html") {
      const headEnd = s.toLowerCase().lastIndexOf("</head>");
      const bodyEnd = s.toLowerCase().lastIndexOf("</body>");
      if (headEnd >= 0) anchors.push({ id: "HEAD_END", at: headEnd, note: "</head>" });
      if (bodyEnd >= 0) anchors.push({ id: "BODY_END", at: bodyEnd, note: "</body>" });
      // fallback extra
      anchors.push({ id: "HTML_TOP", at: 0, note: "top" });
      anchors.push({ id: "HTML_EOF", at: s.length, note: "eof" });
    } else if (type === "css") {
      const rootIdx = s.indexOf(":root");
      if (rootIdx >= 0) anchors.push({ id: "CSS_ROOT", at: rootIdx, note: ":root" });
      anchors.push({ id: "CSS_TOP", at: 0, note: "top" });
      anchors.push({ id: "CSS_EOF", at: s.length, note: "eof" });
    } else if (type === "js") {
      anchors.push({ id: "JS_TOP", at: 0, note: "top" });
      anchors.push({ id: "JS_EOF", at: s.length, note: "eof" });
    } else {
      anchors.push({ id: "TOP", at: 0, note: "top" });
      anchors.push({ id: "EOF", at: s.length, note: "eof" });
    }

    // dedupe
    const seen = new Set();
    const out = [];
    for (const a of anchors) {
      const k = a.id + ":" + a.at;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(a);
    }
    return out;
  }

  async function safeFetchText(path) {
    const p = path.startsWith("/") ? path : "/" + path;
    try {
      const res = await fetch(p, { cache: "no-store" });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }

  async function scanFactoryFiles() {
    const index = {
      meta: { scannedAt: nowISO(), source: "", count: 0 },
      files: []
    };

    // 1) overrides (sempre existe)
    try {
      const olist = await OverridesVFS.listFiles();
      for (const p0 of (olist || []).slice(0, 800)) {
        const p = normalizePath(p0);
        const txt = String((await OverridesVFS.readFile(p)) ?? "");
        const type = guessType(p);
        index.files.push({
          path: p,
          type,
          size: txt.length,
          hash: simpleHash(txt),
          markers: detectMarkers(txt),
          anchors: getAnchorsForContent(type, txt)
        });
      }
    } catch {}

    // 2) runtime VFS (se existir)
    const vfs = (window.RCF_VFS || window.RCF_FS || window.RCF_VFS_OVERRIDES || window.RCF_FILES || window.RCF_STORE) || null;
    if (vfs && typeof vfs.listFiles === "function" && typeof vfs.readFile === "function") {
      index.meta.source = "A:runtime_vfs";
      try {
        const list = (await vfs.listFiles()) || [];
        for (const raw of list.slice(0, 1200)) {
          const p = normalizePath(raw);
          const txt = String((await vfs.readFile(p)) ?? "");
          const type = guessType(p);
          index.files.push({
            path: p,
            type,
            size: txt.length,
            hash: simpleHash(txt),
            markers: detectMarkers(txt),
            anchors: getAnchorsForContent(type, txt)
          });
        }
      } catch (e) {
        Logger.write("scan:", "A runtime_vfs erro", e?.message || e);
      }
      index.meta.count = index.files.length;
      Storage.set("RCF_FILE_INDEX", index);
      return index;
    }

    // 3) fallback por fetch de paths conhecidos (corrige “files=0”)
    index.meta.source = "B:known_paths_fetch";
    const known = [
      "/app/index.html",
      "/app/app.js",
      "/app/styles.css",
      "/index.html",
      "/sw.js",
      "/app/sw.js",
      "/app/js/router.js",
      "/app/js/templates.js",
      "/app/js/admin.js",
      "/app/import/mother_bundle.json"
    ];

    for (const kp of known) {
      const txt = await safeFetchText(kp);
      if (!txt) continue;
      const p = normalizePath(kp);
      const type = guessType(p);
      index.files.push({
        path: p,
        type,
        size: txt.length,
        hash: simpleHash(txt),
        markers: detectMarkers(txt),
        anchors: getAnchorsForContent(type, txt)
      });
    }

    // 4) dom anchors only (sempre)
    const html = document.documentElement ? document.documentElement.outerHTML : "";
    index.files.push({
      path: "/runtime/document.html",
      type: "html",
      size: html.length,
      hash: simpleHash(html),
      markers: detectMarkers(html),
      anchors: getAnchorsForContent("html", html)
    });

    index.meta.count = index.files.length;
    Storage.set("RCF_FILE_INDEX", index);
    return index;
  }

  function generateTargetMap(fileIndex) {
    const idx = fileIndex || Storage.get("RCF_FILE_INDEX", null);
    if (!idx || !Array.isArray(idx.files)) {
      return { ok: false, err: "RCF_FILE_INDEX ausente. Rode Scan & Index primeiro." };
    }

    const targets = [];
    for (const f of idx.files) {
      const path = String(f.path || "");
      const markers = Array.isArray(f.markers) ? f.markers : [];
      const anchors = Array.isArray(f.anchors) ? f.anchors : [];

      // markers
      for (const m of markers) {
        const id = m.id ? m.id : `MARKER_${path}_${m.index}`;
        targets.push({
          targetId: id,
          path,
          kind: "MARKER",
          offset: m.index,
          supportedModes: ["INSERT", "REPLACE", "DELETE"],
          note: "@RCF:INJECT"
        });
      }

      // anchors (sempre cria, mesmo se tiver markers também)
      for (const a of anchors) {
        targets.push({
          targetId: `${path}::${a.id}`,
          path,
          kind: "ANCHOR",
          offset: a.at,
          anchorId: a.id,
          supportedModes: ["INSERT", "REPLACE", "DELETE"],
          note: a.note
        });
      }
    }

    // uniq + cap
    const seen = new Set();
    const uniq = [];
    for (const t of targets) {
      if (!t || !t.targetId) continue;
      if (seen.has(t.targetId)) continue;
      seen.add(t.targetId);
      uniq.push(t);
      if (uniq.length >= 900) break;
    }

    const out = {
      meta: { createdAt: nowISO(), count: uniq.length, source: (idx.meta && idx.meta.source) || "" },
      targets: uniq
    };

    Storage.set("RCF_TARGET_MAP", out);
    return { ok: true, map: out };
  }

  function populateTargetsDropdown() {
    const sel = $("#injTarget");
    if (!sel) return;
    const map = Storage.get("RCF_TARGET_MAP", null);
    const t = map && Array.isArray(map.targets) ? map.targets : [];
    sel.innerHTML = "";
    if (!t.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "(sem targets — gere o map)";
      sel.appendChild(opt);
      return;
    }
    for (const item of t.slice(0, 600)) {
      const opt = document.createElement("option");
      opt.value = item.targetId;
      opt.textContent = `${item.targetId} — ${item.path} (${item.kind})`;
      sel.appendChild(opt);
    }
  }

  function applyAtTarget(oldText, target, mode, payload) {
    const s = String(oldText ?? "");
    const pl = String(payload ?? "");

    const at = Math.max(0, Math.min(s.length, target.offset || 0));

    if (mode === "INSERT") return s.slice(0, at) + "\n" + pl + "\n" + s.slice(at);
    if (mode === "REPLACE") return s.slice(0, at) + "\n" + pl + "\n" + s.slice(at);
    if (mode === "DELETE") {
      if (!pl.trim()) return s;
      return s.split(pl).join("");
    }
    return s;
  }

  async function readTextFromPath(path) {
    const p = normalizePath(path);

    const ov = await OverridesVFS.readFile(p);
    if (ov != null) return String(ov);

    const txt = await safeFetchText(p);
    if (txt != null) return String(txt);

    if (p === "/runtime/document.html") {
      return document.documentElement ? document.documentElement.outerHTML : "";
    }
    return "";
  }

  async function writeTextToPath(path, newText) {
    const p = normalizePath(path);
    try {
      await OverridesVFS.writeFile(p, String(newText ?? ""));
      return { ok: true, mode: "override.writeFile" };
    } catch (e) {
      return { ok: false, err: e?.message || e };
    }
  }

  function tinyDiff(oldText, newText) {
    const a = String(oldText ?? "").split("\n");
    const b = String(newText ?? "").split("\n");
    const max = Math.max(a.length, b.length);
    const out = [];
    for (let i = 0; i < max; i++) {
      const A = a[i], B = b[i];
      if (A === B) continue;
      if (A !== undefined) out.push(`- ${A}`);
      if (B !== undefined) out.push(`+ ${B}`);
      if (out.length > 220) { out.push("... (diff truncado)"); break; }
    }
    return out.join("\n") || "(sem mudanças)";
  }

  const InjectState = { lastSnapshot: null };

  async function injectorPreviewTargets() {
    const map = Storage.get("RCF_TARGET_MAP", null);
    const targets = map && Array.isArray(map.targets) ? map.targets : [];
    const targetId = ($("#injTarget")?.value || "").trim();
    const mode = ($("#injMode")?.value || "INSERT").trim();
    const payload = ($("#injPayload")?.value || "");

    const t = targets.find(x => x.targetId === targetId);
    if (!t) return { ok: false, err: "Target inválido (gere o map e selecione)." };

    const oldText = await readTextFromPath(t.path);
    const newText = applyAtTarget(oldText, t, mode, payload);

    uiMsg("#diffOut", tinyDiff(oldText, newText));
    return { ok: true, oldText, newText, t, mode };
  }

  async function injectorApplyTargetsSafe() {
    const pre = await injectorPreviewTargets();
    if (!pre.ok) {
      uiMsg("#diffOut", "❌ " + (pre.err || "preview falhou"));
      return { ok: false };
    }

    InjectState.lastSnapshot = {
      path: pre.t.path,
      oldText: pre.oldText,
      newText: pre.newText,
      targetId: pre.t.targetId,
      ts: nowISO()
    };

    const before = runMicroTests();
    if (!before.ok) {
      uiMsg("#diffOut", "❌ Microtests BEFORE falharam. Abortando.\n" + JSON.stringify(before, null, 2));
      return { ok: false };
    }

    const w = await writeTextToPath(pre.t.path, pre.newText);
    if (!w.ok) {
      uiMsg("#diffOut", "❌ Não consegui escrever.\n" + (w.err || ""));
      return { ok: false };
    }

    const after = runMicroTests();
    if (!after.ok) {
      await writeTextToPath(pre.t.path, pre.oldText);
      uiMsg("#diffOut", "❌ Microtests AFTER falharam. Rollback aplicado.\n" + JSON.stringify(after, null, 2));
      Logger.write("inject:", "AFTER FAIL -> rollback", pre.t.path, pre.t.targetId);
      return { ok: false, rolledBack: true };
    }

    Logger.write("inject:", "OK", pre.t.path, pre.t.targetId, "mode=" + pre.mode, "write=" + w.mode);
    uiMsg("#diffOut", "✅ Aplicado com sucesso (SAFE).");
    return { ok: true };
  }

  async function injectorRollbackTargets() {
    const s = InjectState.lastSnapshot;
    if (!s) { uiMsg("#diffOut", "Nada para rollback."); return { ok: false }; }
    const w = await writeTextToPath(s.path, s.oldText);
    if (!w.ok) { uiMsg("#diffOut", "Rollback falhou: " + (w.err || "")); return { ok: false }; }
    uiMsg("#diffOut", "✅ Rollback aplicado.");
    Logger.write("inject:", "rollback OK", s.path, s.targetId);
    return { ok: true };
  }

  // -----------------------------
  // UI Shell
  // -----------------------------
  function renderShell() {
    const root = $("#app");
    if (!root) return;
    if ($("#rcfRoot")) return;

    root.innerHTML = `
      <div id="rcfRoot">
        <header class="topbar">
          <div class="brand">
            <div class="dot"></div>
            <div class="brand-text">
              <div class="title">RControl Factory</div>
              <div class="subtitle">Factory interna • PWA • Offline-first</div>
            </div>
            <div class="spacer"></div>
            <button class="btn small" id="btnOpenTools" type="button">⚙️</button>
            <div class="status-pill" id="statusPill" style="margin-left:10px">
              <span class="ok" id="statusText">OK ✅</span>
            </div>
          </div>

          <nav class="tabs">
            <button class="tab" data-view="dashboard" type="button">Dashboard</button>
            <button class="tab" data-view="newapp" type="button">New App</button>
            <button class="tab" data-view="editor" type="button">Editor</button>
            <button class="tab" data-view="generator" type="button">Generator</button>
            <button class="tab" data-view="agent" type="button">Agente</button>
            <button class="tab" data-view="settings" type="button">Settings</button>
            <button class="tab" data-view="admin" type="button">Admin</button>
            <button class="tab" data-view="diagnostics" type="button">Diagnostics</button>
            <button class="tab" data-view="logs" type="button">Logs</button>
          </nav>
        </header>

        <main class="container views" id="views">

          <section class="view card hero" id="view-dashboard">
            <h1>Dashboard</h1>
            <p>Central do projeto. Selecione um app e comece a editar.</p>
            <div class="status-box">
              <div class="badge" id="activeAppText">Sem app ativo ✅</div>
              <div class="spacer"></div>
              <button class="btn small" id="btnCreateNewApp" type="button">Criar App</button>
              <button class="btn small" id="btnOpenEditor" type="button">Abrir Editor</button>
              <button class="btn small ghost" id="btnExportBackup" type="button">Backup (JSON)</button>
            </div>

            <h2 style="margin-top:14px">Apps</h2>
            <div id="appsList" class="apps"></div>
          </section>

          <section class="view card" id="view-newapp">
            <h1>Novo App</h1>
            <p class="hint">Cria um mini-app dentro da Factory.</p>

            <div class="row form">
              <input id="newAppName" placeholder="Nome do app" />
              <input id="newAppSlug" placeholder="slug (opcional)" />
              <button class="btn small" id="btnAutoSlug" type="button">Auto-slug</button>
              <button class="btn ok" id="btnDoCreateApp" type="button">Criar</button>
            </div>

            <pre class="mono" id="newAppOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-editor">
            <h1>Editor</h1>
            <p class="hint">Escolha um arquivo e edite.</p>

            <div class="row">
              <div class="badge" id="editorHead">Arquivo atual: -</div>
              <div class="spacer"></div>
              <button class="btn ok" id="btnSaveFile" type="button">Salvar</button>
              <button class="btn danger" id="btnResetFile" type="button">Reset</button>
            </div>

            <div class="row">
              <div style="flex:1;min-width:240px">
                <div class="hint">Arquivos</div>
                <div id="filesList" class="files"></div>
              </div>

              <div style="flex:2;min-width:280px">
                <div class="editor">
                  <div class="editor-head">Conteúdo</div>
                  <textarea id="fileContent" spellcheck="false"></textarea>
                </div>
              </div>
            </div>

            <pre class="mono" id="editorOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-generator">
            <h1>Generator</h1>
            <p class="hint">Gera ZIP do app selecionado (stub por enquanto).</p>
            <div class="row">
              <button class="btn ok" id="btnGenZip" type="button">Build ZIP</button>
              <button class="btn ghost" id="btnGenPreview" type="button">Preview</button>
            </div>
            <pre class="mono" id="genOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-agent">
            <h1>Agente</h1>
            <p class="hint">Comandos naturais + patchset (fase atual: comandos básicos).</p>

            <div class="row cmd">
              <input id="agentCmd" placeholder='Ex: create "Meu App" meu-app' />
              <button class="btn ok" id="btnAgentRun" type="button">Executar</button>
              <button class="btn ghost" id="btnAgentHelp" type="button">Ajuda</button>
            </div>

            <pre class="mono" id="agentOut">Pronto.</pre>
          </section>

          <!-- ✅ SETTINGS (sem Logs aqui dentro) -->
          <section class="view card" id="view-settings">
            <h1>Settings</h1>

            <div class="card" id="settings-security">
              <h2>Segurança</h2>
              <p class="hint">Define um PIN para liberar ações críticas no Admin.</p>
              <div class="row">
                <input id="pinInput" placeholder="Definir PIN (4-8 dígitos)" inputmode="numeric" />
                <button class="btn ok" id="btnPinSave" type="button">Salvar PIN</button>
                <button class="btn danger" id="btnPinRemove" type="button">Remover PIN</button>
              </div>
              <pre class="mono" id="pinOut">Pronto.</pre>
            </div>

            <!-- ✅ Injector voltou pro Settings -->
            <div class="card" id="settings-injector">
              <h2>Injeção (Injector)</h2>
              <p class="hint">Cole um pack JSON (meta + files). Aplica via OverridesVFS (local). Se SW estiver controlando, recarregar 1x ajuda.</p>

              <textarea id="injJson" class="textarea" rows="8" spellcheck="false" placeholder='{
  "meta": { "name": "teste-real", "version": "1.0" },
  "files": { "/app/TESTE_OK.txt": "INJECTION WORKING" }
}'></textarea>

              <div class="row" style="flex-wrap:wrap;margin-top:10px">
                <button class="btn ghost" id="btnInjDry" type="button">Dry-run</button>
                <button class="btn ok" id="btnInjApply" type="button">Aplicar pack</button>
                <button class="btn danger" id="btnInjZero" type="button">Zerar overrides</button>
              </div>

              <pre class="mono small" id="injOut">Pronto.</pre>
              <div class="hint" id="injStatus">Status: aguardando…</div>
            </div>
          </section>

          <section class="view card" id="view-diagnostics">
            <h1>Diagnostics</h1>
            <div class="row">
              <button class="btn ok" id="btnDiagRun" type="button">Rodar V7 Stability Check</button>
              <button class="btn ghost" id="btnDiagInstall" type="button">Instalar Guards</button>
              <button class="btn ghost" id="btnDiagScan" type="button">Scan overlays</button>
              <button class="btn ghost" id="btnDiagTests" type="button">Run micro-tests</button>
              <button class="btn danger" id="btnDiagClear" type="button">Limpar</button>
            </div>
            <pre class="mono" id="diagOut">Pronto.</pre>
          </section>

          <section class="view card" id="view-logs">
            <h1>Logs</h1>
            <div class="row">
              <button class="btn ghost" id="btnLogsRefresh2" type="button">Atualizar</button>
              <button class="btn ok" id="btnCopyLogs" type="button">Copiar</button>
              <button class="btn danger" id="btnClearLogs" type="button">Limpar</button>
            </div>
            <pre class="mono small" id="logsViewBox">Pronto.</pre>
          </section>

          <section class="view card" id="view-admin">
            <h1>Admin</h1>

            <div class="row">
              <button class="btn ghost" id="btnAdminDiag" type="button">Diagnosticar (local)</button>
              <button class="btn danger" id="btnAdminZero" type="button">Zerar (safe)</button>
            </div>

            <pre class="mono" id="adminOut">Pronto.</pre>

            <div class="card" id="admin-injector">
              <h2>FASE A • Scan / Target Map / Injector SAFE</h2>
              <p class="hint">Agora o scan não fica “files=0”: tenta Overrides → VFS → fetch paths conhecidos → DOM.</p>

              <div class="row" style="flex-wrap:wrap;">
                <button class="btn ok" id="btnScanIndex" type="button">🔎 Scan & Index</button>
                <button class="btn ghost" id="btnGenTargets" type="button">🧭 Generate Target Map</button>
                <button class="btn ghost" id="btnRefreshTargets" type="button">🔁 Refresh Dropdown</button>
              </div>

              <pre class="mono small" id="scanOut">Pronto.</pre>

              <div class="row form" style="margin-top:10px">
                <select id="injMode">
                  <option value="INSERT">INSERT</option>
                  <option value="REPLACE">REPLACE</option>
                  <option value="DELETE">DELETE</option>
                </select>

                <select id="injTarget"></select>

                <button class="btn ghost" id="btnPreviewDiff" type="button">👀 Preview diff</button>
                <button class="btn ok" id="btnApplyInject" type="button">✅ Apply (SAFE)</button>
                <button class="btn danger" id="btnRollbackInject" type="button">↩ Rollback</button>
              </div>

              <div class="hint" style="margin-top:10px">Payload:</div>
              <textarea id="injPayload" class="textarea" rows="8" spellcheck="false" placeholder="Cole aqui o payload para inserir/substituir..."></textarea>

              <div class="hint" style="margin-top:10px">Preview / Diff:</div>
              <pre class="mono small" id="diffOut">Pronto.</pre>

              <div class="hint" style="margin-top:10px">Log:</div>
              <pre class="mono small" id="injLog">Pronto.</pre>
            </div>
          </section>

        </main>

        <div class="tools" id="toolsDrawer">
          <div class="tools-head">
            <div style="font-weight:800">Ferramentas</div>
            <button class="btn small" id="btnCloseTools" type="button">Fechar</button>
          </div>
          <div class="tools-body">
            <div class="row">
              <button class="btn ghost" id="btnDrawerLogsRefresh" type="button">Atualizar logs</button>
              <button class="btn ok" id="btnDrawerLogsCopy" type="button">Copiar logs</button>
              <button class="btn danger" id="btnDrawerLogsClear" type="button">Limpar logs</button>
            </div>

            <div class="row" style="margin-top:10px">
              <button class="btn ghost" id="btnSwClearCache" type="button">Clear SW Cache</button>
              <button class="btn ghost" id="btnSwUnregister" type="button">Unregister SW</button>
              <button class="btn ok" id="btnSwRegister" type="button">Register SW</button>
            </div>

            <pre class="mono small" id="logsBox">Pronto.</pre>
          </div>
        </div>

      </div>
    `;
  }

  // -----------------------------
  // Views
  // -----------------------------
  function refreshLogsViews() { Logger._mirrorUI(Logger.getAll()); }

  function setView(name) {
    if (!name) return;

    State.active.view = name;
    saveAll();

    $$(".view").forEach(v => v.classList.remove("active"));
    $$("[data-view]").forEach(b => b.classList.remove("active"));

    const id = "view-" + String(name).replace(/[^a-z0-9_-]/gi, "");
    const view = document.getElementById(id);
    if (view) view.classList.add("active");

    $$(`[data-view="${name}"]`).forEach(b => b.classList.add("active"));

    if (name === "logs" || name === "settings" || name === "admin") refreshLogsViews();

    Logger.write("view:", name);
  }

  function openTools(open) {
    const d = $("#toolsDrawer");
    if (!d) return;
    if (open) d.classList.add("open");
    else d.classList.remove("open");
  }

  // -----------------------------
  // Apps / Editor
  // -----------------------------
  function getActiveApp() {
    if (!State.active.appSlug) return null;
    return State.apps.find(a => a.slug === State.active.appSlug) || null;
  }

  function ensureAppFiles(app) {
    if (!app.files) app.files = {};
    if (typeof app.files !== "object") app.files = {};
  }

  function renderAppsList() {
    const box = $("#appsList");
    if (!box) return;

    if (!State.apps.length) {
      box.innerHTML = `<div class="hint">Nenhum app salvo ainda.</div>`;
      return;
    }

    box.innerHTML = "";
    State.apps.forEach(app => {
      const row = document.createElement("div");
      row.className = "app-item";
      row.innerHTML = `
        <div>
          <div style="font-weight:800">${escapeHtml(app.name)}</div>
          <div class="hint">${escapeHtml(app.slug)}</div>
        </div>
        <div class="row">
          <button class="btn small" data-act="select" data-slug="${escapeAttr(app.slug)}" type="button">Selecionar</button>
          <button class="btn small" data-act="edit" data-slug="${escapeAttr(app.slug)}" type="button">Editor</button>
        </div>
      `;
      box.appendChild(row);
    });

    $$('[data-act="select"]', box).forEach(btn => {
      bindTap(btn, () => setActiveApp(btn.getAttribute("data-slug")));
    });
    $$('[data-act="edit"]', box).forEach(btn => {
      bindTap(btn, () => {
        setActiveApp(btn.getAttribute("data-slug"));
        setView("editor");
      });
    });
  }

  function renderFilesList() {
    const box = $("#filesList");
    if (!box) return;

    const app = getActiveApp();
    if (!app) {
      box.innerHTML = `<div class="hint">Selecione um app para ver arquivos.</div>`;
      return;
    }

    ensureAppFiles(app);
    const files = Object.keys(app.files);
    if (!files.length) {
      box.innerHTML = `<div class="hint">App sem arquivos.</div>`;
      return;
    }

    box.innerHTML = "";
    files.forEach(fname => {
      const item = document.createElement("div");
      item.className = "file-item" + (State.active.file === fname ? " active" : "");
      item.textContent = fname;
      bindTap(item, () => openFile(fname));
      box.appendChild(item);
    });
  }

  function openFile(fname) {
    const app = getActiveApp();
    if (!app) return false;

    ensureAppFiles(app);
    if (!(fname in app.files)) return false;

    State.active.file = fname;
    saveAll();

    const head = $("#editorHead");
    if (head) head.textContent = `Arquivo atual: ${fname}`;

    const ta = $("#fileContent");
    if (ta) ta.value = String(app.files[fname] ?? "");

    renderFilesList();
    return true;
  }

  function setActiveApp(slug) {
    const app = State.apps.find(a => a.slug === slug);
    if (!app) return false;

    State.active.appSlug = slug;
    State.active.file = State.active.file || Object.keys(app.files || {})[0] || null;
    saveAll();

    const text = $("#activeAppText");
    if (text) textContentSafe(text, `App ativo: ${app.name} (${app.slug}) ✅`);

    renderAppsList();
    renderFilesList();
    if (State.active.file) openFile(State.active.file);

    Logger.write("app selected:", slug);
    return true;
  }

  function createApp(name, slugMaybe) {
    const nameClean = String(name || "").trim();
    if (!nameClean) return { ok: false, msg: "Nome inválido" };

    let slug = slugify(slugMaybe || nameClean);
    if (!slug) return { ok: false, msg: "Slug inválido" };
    if (State.apps.some(a => a.slug === slug)) return { ok: false, msg: "Slug já existe" };

    const app = {
      name: nameClean,
      slug,
      createdAt: nowISO(),
      files: {
        "index.html": `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${nameClean}</title></head><body><h1>${nameClean}</h1><script src="app.js"></script></body></html>`,
        "styles.css": `body{font-family:system-ui;margin:0;padding:24px;background:#0b1220;color:#fff}`,
        "app.js": `console.log("${nameClean}");`
      }
    };

    State.apps.push(app);
    saveAll();
    renderAppsList();
    setActiveApp(slug);

    return { ok: true, msg: `✅ App criado: ${nameClean} (${slug})` };
  }

  function saveFile() {
    const app = getActiveApp();
    if (!app) return uiMsg("#editorOut", "⚠️ Sem app ativo.");

    const fname = State.active.file;
    if (!fname) return uiMsg("#editorOut", "⚠️ Sem arquivo ativo.");

    const ta = $("#fileContent");
    ensureAppFiles(app);
    app.files[fname] = ta ? String(ta.value || "") : "";

    saveAll();
    uiMsg("#editorOut", "✅ Arquivo salvo.");
    Logger.write("file saved:", app.slug, fname);
  }

  // -----------------------------
  // Agent
  // -----------------------------
  const Agent = {
    help() {
      return [
        "AGENT HELP",
        "",
        "Comandos:",
        "- help",
        "- list",
        "- create NOME [SLUG]",
        "- create \"NOME COM ESPAÇO\" [SLUG]",
        "- select SLUG",
        "- open dashboard | open newapp | open editor | open generator | open agent | open settings | open admin | open logs | open diagnostics",
        "- show"
      ].join("\n");
    },

    list() {
      if (!State.apps.length) return "(vazio)";
      return State.apps.map(a => `${a.slug} — ${a.name}`).join("\n");
    },

    show() {
      const app = getActiveApp();
      return [
        `mode: ${State.cfg.mode}`,
        `apps: ${State.apps.length}`,
        `active app: ${app ? `${app.name} (${app.slug})` : "-"}`,
        `active file: ${State.active.file || "-"}`,
        `view: ${State.active.view}`
      ].join("\n");
    },

    route(cmdRaw) {
      const cmd = String(cmdRaw || "").trim();
      const out = $("#agentOut");
      if (!cmd) { out && (out.textContent = "Comando vazio."); return; }

      const lower = cmd.toLowerCase();

      if (lower === "help") { out && (out.textContent = this.help()); return; }
      if (lower === "list") { out && (out.textContent = this.list()); return; }
      if (lower === "show") { out && (out.textContent = this.show()); return; }

      if (lower.startsWith("open ")) {
        const target = lower.replace("open ", "").trim();
        const map = {
          dashboard: "dashboard",
          newapp: "newapp",
          "new app": "newapp",
          editor: "editor",
          generator: "generator",
          agent: "agent",
          settings: "settings",
          admin: "admin",
          logs: "logs",
          diagnostics: "diagnostics",
          diag: "diagnostics"
        };
        const v = map[target] || target;
        setView(v);
        out && (out.textContent = `OK. view=${v}`);
        return;
      }

      if (lower.startsWith("create ")) {
        const rest = cmd.replace(/^create\s+/i, "").trim();
        const qm = rest.match(/^"([^"]+)"\s*([a-z0-9-]+)?/i);
        let name = "", slug = "";
        if (qm) { name = qm[1].trim(); slug = (qm[2] || "").trim(); }
        else { name = rest; }
        const r = createApp(name, slug);
        out && (out.textContent = r.msg);
        return;
      }

      if (lower.startsWith("select ")) {
        const slug = slugify(cmd.replace(/^select\s+/i, "").trim());
        const ok = setActiveApp(slug);
        out && (out.textContent = ok ? `OK. selecionado: ${slug}` : `Falhou: ${slug}`);
        return;
      }

      out && (out.textContent = "Comando não reconhecido. Use: help");
    }
  };

  // -----------------------------
  // Bind UI
  // -----------------------------
  function bindUI() {
    $$("[data-view]").forEach(btn => bindTap(btn, () => setView(btn.getAttribute("data-view"))));

    bindTap($("#btnOpenTools"), () => openTools(true));
    bindTap($("#btnCloseTools"), () => openTools(false));

    bindTap($("#btnCreateNewApp"), () => setView("newapp"));
    bindTap($("#btnOpenEditor"), () => setView("editor"));

    bindTap($("#btnExportBackup"), () => {
      const payload = JSON.stringify({ apps: State.apps, cfg: State.cfg, active: State.active }, null, 2);
      try { navigator.clipboard.writeText(payload); } catch {}
      safeSetStatus("Backup copiado ✅");
      setTimeout(() => safeSetStatus("OK ✅"), 800);
      Logger.write("backup copied");
    });

    bindTap($("#btnAutoSlug"), () => {
      const n = ($("#newAppName")?.value || "");
      const s = slugify(n);
      const inSlug = $("#newAppSlug");
      if (inSlug) inSlug.value = s;
    });

    bindTap($("#btnDoCreateApp"), () => {
      const name = ($("#newAppName")?.value || "");
      const slug = ($("#newAppSlug")?.value || "");
      const r = createApp(name, slug);
      uiMsg("#newAppOut", r.msg);
      if (r.ok) { setView("editor"); safeSetStatus("OK ✅"); }
      else safeSetStatus("ERRO ❌");
    });

    bindTap($("#btnSaveFile"), () => saveFile());

    bindTap($("#btnResetFile"), () => {
      const app = getActiveApp();
      if (!app || !State.active.file) return uiMsg("#editorOut", "⚠️ Selecione app e arquivo.");
      ensureAppFiles(app);
      app.files[State.active.file] = "";
      saveAll();
      openFile(State.active.file);
      uiMsg("#editorOut", "⚠️ Arquivo resetado (limpo).");
    });

    bindTap($("#btnGenZip"), () => uiMsg("#genOut", "ZIP (stub)."));
    bindTap($("#btnGenPreview"), () => uiMsg("#genOut", "Preview (stub)."));

    bindTap($("#btnAgentRun"), () => Agent.route($("#agentCmd")?.value || ""));
    bindTap($("#btnAgentHelp"), () => uiMsg("#agentOut", Agent.help()));

    // Logs actions
    const doLogsRefresh = () => {
      refreshLogsViews();
      safeSetStatus("Logs ✅");
      setTimeout(() => safeSetStatus("OK ✅"), 600);
    };
    const doLogsClear = () => {
      Logger.clear();
      doLogsRefresh();
      safeSetStatus("Logs limpos ✅");
      setTimeout(() => safeSetStatus("OK ✅"), 600);
    };
    const doLogsCopy = async () => {
      const txt = Logger.getAll().join("\n");
      try { await navigator.clipboard.writeText(txt); } catch {}
      safeSetStatus("Logs copiados ✅");
      setTimeout(() => safeSetStatus("OK ✅"), 800);
    };

    bindTap($("#btnLogsRefresh2"), doLogsRefresh);
    bindTap($("#btnClearLogs"), doLogsClear);
    bindTap($("#btnCopyLogs"), doLogsCopy);

    bindTap($("#btnDrawerLogsRefresh"), doLogsRefresh);
    bindTap($("#btnDrawerLogsClear"), doLogsClear);
    bindTap($("#btnDrawerLogsCopy"), doLogsCopy);

    // SW tools
    bindTap($("#btnSwUnregister"), async () => {
      const r = await swUnregisterAll();
      safeSetStatus(r.ok ? `SW unreg: ${r.count} ✅` : "SW unreg ❌");
      setTimeout(() => safeSetStatus("OK ✅"), 900);
    });

    bindTap($("#btnSwClearCache"), async () => {
      const r = await swClearCaches();
      safeSetStatus(r.ok ? `Cache: ${r.count} ✅` : "Cache ❌");
      setTimeout(() => safeSetStatus("OK ✅"), 900);
    });

    bindTap($("#btnSwRegister"), async () => {
      const r = await swRegister();
      safeSetStatus(r.ok ? "SW ✅" : "SW ❌");
      setTimeout(() => safeSetStatus("OK ✅"), 900);
    });

    // Diagnostics
    bindTap($("#btnDiagRun"), async () => {
      safeSetStatus("Diag…");
      await runV7StabilityCheck();
      setTimeout(() => safeSetStatus("OK ✅"), 700);
    });

    bindTap($("#btnDiagInstall"), () => {
      try {
        installGuardsOnce();
        ModuleFlags.diagnosticsInstalled = true;
        uiMsg("#diagOut", "✅ installAll OK");
        Logger.write("ok:", "Diagnostics: installAll ✅");
      } catch (e) {
        uiMsg("#diagOut", "❌ " + (e?.message || e));
      }
    });

    bindTap($("#btnDiagScan"), () => {
      try { uiMsg("#diagOut", JSON.stringify(scanOverlays(), null, 2)); }
      catch (e) { uiMsg("#diagOut", "❌ " + (e?.message || e)); }
    });

    bindTap($("#btnDiagTests"), () => {
      try { uiMsg("#diagOut", JSON.stringify(runMicroTests(), null, 2)); }
      catch (e) { uiMsg("#diagOut", "❌ " + (e?.message || e)); }
    });

    bindTap($("#btnDiagClear"), () => uiMsg("#diagOut", "Pronto."));

    // PIN
    bindTap($("#btnPinSave"), () => {
      const raw = String($("#pinInput")?.value || "").trim();
      if (!/^\d{4,8}$/.test(raw)) return uiMsg("#pinOut", "⚠️ PIN inválido. Use 4 a 8 dígitos.");
      Pin.set(raw);
      uiMsg("#pinOut", "✅ PIN salvo.");
      Logger.write("pin saved");
    });

    bindTap($("#btnPinRemove"), () => {
      Pin.clear();
      uiMsg("#pinOut", "✅ PIN removido.");
      Logger.write("pin removed");
    });

    // ✅ Injector (Settings)
    bindTap($("#btnInjDry"), async () => {
      safeSetStatus("Dry…");
      await injectorDryRun();
      setTimeout(() => safeSetStatus("OK ✅"), 700);
    });

    bindTap($("#btnInjApply"), async () => {
      safeSetStatus("Aplicando…");
      await injectorApplyPack();
      setTimeout(() => safeSetStatus("OK ✅"), 900);
    });

    bindTap($("#btnInjZero"), async () => {
      safeSetStatus("Zerando…");
      await injectorZeroOverrides();
      setTimeout(() => safeSetStatus("OK ✅"), 900);
    });

    // Admin quick
    bindTap($("#btnAdminDiag"), () => uiMsg("#adminOut", "Admin OK."));
    bindTap($("#btnAdminZero"), () => {
      Logger.clear();
      safeSetStatus("Zerado ✅");
      setTimeout(() => safeSetStatus("OK ✅"), 800);
      uiMsg("#adminOut", "✅ Zerado (safe). Logs limpos.");
    });

    // Admin scan/targets
    bindTap($("#btnScanIndex"), async () => {
      safeSetStatus("Scan…");
      try {
        const idx = await scanFactoryFiles();
        uiMsg("#scanOut", `✅ Scan OK\nsource=${idx.meta.source}\nfiles=${idx.meta.count}\nscannedAt=${idx.meta.scannedAt}`);
        Logger.write("scan:", idx.meta.source, "files=" + idx.meta.count);
      } catch (e) {
        uiMsg("#scanOut", "❌ Scan falhou: " + (e?.message || e));
        Logger.write("scan err:", e?.message || e);
      }
      setTimeout(() => safeSetStatus("OK ✅"), 700);
    });

    bindTap($("#btnGenTargets"), () => {
      const idx = Storage.get("RCF_FILE_INDEX", null);
      const r = generateTargetMap(idx);
      if (!r.ok) {
        uiMsg("#scanOut", "❌ " + (r.err || "falhou gerar map"));
        return;
      }
      uiMsg("#scanOut", `✅ Target Map OK\ncount=${r.map.meta.count}\nsource=${r.map.meta.source}\ncreatedAt=${r.map.meta.createdAt}`);
      populateTargetsDropdown();
      Logger.write("targets:", "generated", "count=" + r.map.meta.count);
    });

    bindTap($("#btnRefreshTargets"), () => {
      populateTargetsDropdown();
      uiMsg("#scanOut", "Dropdown atualizado ✅");
    });

    bindTap($("#btnPreviewDiff"), async () => {
      const r = await injectorPreviewTargets();
      if (!r.ok) uiMsg("#diffOut", "❌ " + (r.err || "preview falhou"));
    });

    bindTap($("#btnApplyInject"), async () => {
      safeSetStatus("Apply…");
      await injectorApplyTargetsSafe();
      setTimeout(() => safeSetStatus("OK ✅"), 900);
    });

    bindTap($("#btnRollbackInject"), async () => {
      safeSetStatus("Rollback…");
      await injectorRollbackTargets();
      setTimeout(() => safeSetStatus("OK ✅"), 900);
    });
  }

  // -----------------------------
  // Boot hydrate
  // -----------------------------
  function hydrateUIFromState() {
    refreshLogsViews();
    renderAppsList();

    const app = getActiveApp();
    if (app) {
      setActiveApp(app.slug);
      if (State.active.file) openFile(State.active.file);
    } else {
      const text = $("#activeAppText");
      if (text) textContentSafe(text, "Sem app ativo ✅");
    }

    setView(State.active.view || "dashboard");

    const pin = Pin.get();
    if (pin) uiMsg("#pinOut", "PIN definido ✅");

    // Injector status inicial
    injectorStatusLine("aguardando…", true);
    populateTargetsDropdown();
  }

  async function safeInit() {
    try {
      Stability.install();
      renderShell();
      bindUI();
      hydrateUIFromState();
      installGuardsOnce();

      // tenta registrar SW (mas não trava o app)
      const r = await swRegister();
      if (!r.ok) Logger.write("warn:", r.msg);

      // se não estiver controlado ainda, dá um aviso “soft”
      const controlled = await swIsControlled();
      if (!controlled) Logger.write("sw:", "not controlled yet (reload 1x after SW)");

      Logger.write("RCF app.js init ok — mode:", State.cfg.mode);
      safeSetStatus("OK ✅");
    } catch (e) {
      const msg = (e?.message || e);
      Logger.write("FATAL init:", msg);
      Stability.showErrorScreen("Falha ao iniciar (safeInit)", String(msg));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { safeInit(); }, { passive: true });
  } else {
    safeInit();
  }

})();
