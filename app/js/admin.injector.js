/* RControl Factory — /app/js/admin.injector.js (PADRÃO) — v1.0
   Injector/Scanner robusto:
   - Scan em cascata:
     A) runtime_vfs (se existir list)
     B) mother_bundle_local (RCF_MAE.getLocalBundleText -> localStorage rcf:mother_bundle_local -> localStorage mother_bundle_local)
     C) DOM anchors (fallback garantido targets>=2)
   - Fix principal: não pode dar mother_bundle_local files=0 se a Mãe salvou filesCount=8
*/
(() => {
  "use strict";

  if (window.RCF_INJECTOR && window.RCF_INJECTOR.__v10) return;

  const log = (lvl, msg) => {
    try { window.RCF_LOGGER?.push?.(lvl, msg); } catch {}
    try { console.log("[INJECTOR]", lvl, msg); } catch {}
  };

  function safeParse(raw, fb) {
    try { return raw ? JSON.parse(raw) : fb; } catch { return fb; }
  }

  // ------------------------------------------------------------
  // B) mother_bundle_local robusto (FIX)
  // ------------------------------------------------------------
  function readMotherBundleLocal() {
    let raw = "";
    let source = "";

    // 1) via Mãe (melhor)
    try {
      if (window.RCF_MAE?.getLocalBundleText) {
        const v = window.RCF_MAE.getLocalBundleText();
        raw = String(v || "");
        if (raw.trim()) source = "RCF_MAE.getLocalBundleText";
      }
    } catch {}

    // 2) via localStorage (novo padrão)
    if (!raw.trim()) {
      raw = String(localStorage.getItem("rcf:mother_bundle_local") || "");
      if (raw.trim()) source = "localStorage:rcf:mother_bundle_local";
    }

    // 3) compat antigo
    if (!raw.trim()) {
      raw = String(localStorage.getItem("mother_bundle_local") || "");
      if (raw.trim()) source = "localStorage:mother_bundle_local";
    }

    raw = String(raw || "").trim();
    if (!raw) return { ok: false, files: [], source: "empty", rawLen: 0 };

    const j = safeParse(raw, null);
    if (!j) return { ok: false, files: [], source: source + ":json_parse_fail", rawLen: raw.length };

    // aceita vários formatos
    const arr =
      (Array.isArray(j?.files) && j.files) ||
      (Array.isArray(j?.bundle?.files) && j.bundle.files) ||
      (Array.isArray(j?.data?.files) && j.data.files) ||
      [];

    // normaliza: path/content/contentType
    const files = (arr || []).map(f => {
      const path = String(f?.path || f?.name || "").trim();
      if (!path) return null;

      const content =
        (f?.content != null) ? String(f.content) :
        (f?.text != null) ? String(f.text) :
        (f?.body != null) ? String(f.body) :
        "";

      const contentType = String(f?.contentType || f?.type || "");
      return { path, content, contentType };
    }).filter(Boolean);

    return { ok: true, files, source, rawLen: raw.length, rawKeys: Object.keys(j || {}) };
  }

  // ------------------------------------------------------------
  // A) runtime_vfs (se existir list no overrides)
  // ------------------------------------------------------------
  async function readRuntimeVfsList() {
    // Se seu vfs_overrides tiver listOverrides, usamos. Se não tiver, volta vazio.
    try {
      if (window.RCF_VFS?.list && typeof window.RCF_VFS.list === "function") {
        const res = await window.RCF_VFS.list();
        const files = Array.isArray(res?.files) ? res.files : [];
        return { ok: true, files, source: "runtime_vfs" };
      }
    } catch {}
    return { ok: false, files: [], source: "runtime_vfs_missing" };
  }

  // ------------------------------------------------------------
  // C) DOM anchors fallback (garante targets>=2)
  // ------------------------------------------------------------
  function domAnchorsTargets() {
    // targets mínimos: HEAD_END e BODY_END do "documento atual"
    // pra garantir que sempre tenha onde injetar.
    const path = "/runtime/document.html";
    return {
      ok: true,
      files: [{ path, content: "<!-- dom anchors only -->", contentType: "text/html" }],
      targets: [
        `${path}::HEAD_END`,
        `${path}::BODY_END`
      ],
      source: "dom_anchors_only"
    };
  }

  // ------------------------------------------------------------
  // Target map: a partir do bundle (padrão: index/head_end etc)
  // ------------------------------------------------------------
  function buildTargetsFromFiles(files) {
    // Se tiver index.html no bundle, oferece targets nele.
    const hasIndex = (files || []).some(f => String(f.path || "").endsWith("index.html") || String(f.path || "") === "/index.html");
    const base = hasIndex ? "/index.html" : "/runtime/document.html";

    // targets padrão (mínimo estável)
    return [
      `${base}::HEAD_END`,
      `${base}::BODY_END`,
    ];
  }

  // ------------------------------------------------------------
  // Scan principal (cascata)
  // ------------------------------------------------------------
  async function scan() {
    // A) runtime_vfs
    const a = await readRuntimeVfsList();
    if (a.ok && a.files.length > 0) {
      log("info", `scan: A:runtime_vfs files=${a.files.length}`);
      return { ok: true, source: "A:runtime_vfs", files: a.files, targets: buildTargetsFromFiles(a.files) };
    }
    log("warn", `scan: A:runtime_vfs files=0 => FALHA scan fallback -> mother_bundle`);

    // B) mother_bundle_local
    const b = readMotherBundleLocal();
    if (b.ok && b.files.length > 0) {
      log("info", `scan: B:mother_bundle_local files=${b.files.length} source=${b.source}`);
      return { ok: true, source: "B:mother_bundle_local", files: b.files, targets: buildTargetsFromFiles(b.files) };
    }
    log("warn", `scan: B:mother_bundle_local files=0 => FALHA scan fallback -> DOM anchors`);

    // C) dom anchors
    const c = domAnchorsTargets();
    log("info", `scan: C:dom_anchors_only files=1`);
    return { ok: true, source: "C:dom_anchors_only", files: c.files, targets: c.targets };
  }

  // ------------------------------------------------------------
  // UI helpers (dropdown)
  // ------------------------------------------------------------
  function updateDropdown(targets) {
    const sel = document.getElementById("rcfInjectorTarget");
    if (!sel) return;

    sel.innerHTML = "";
    (targets || []).forEach(t => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      sel.appendChild(opt);
    });

    // auto select
    if (targets && targets.length) sel.value = targets[0];
    log("info", `CP3 ui: dropdown updated auto-selected=${sel.value || ""}`);
  }

  // ------------------------------------------------------------
  // Apply (injeta via RCF_VFS.put se existir)
  // ------------------------------------------------------------
  async function applyInjection({ target, mode, content }) {
    if (!window.RCF_VFS?.put) {
      throw new Error("VFS.put ausente");
    }
    // aqui é só o esqueleto — você pode ligar na sua lógica real
    // target: "/index.html::HEAD_END" etc
    // mode: "INSERT"
    const [path, anchor] = String(target || "").split("::");
    const key = String(path || "").trim() || "/index.html";
    const payload = String(content ?? "");

    // Salva como override no arquivo “key”. A parte de “anchor” você aplica no seu pipeline existente.
    await window.RCF_VFS.put(key, payload, "text/html; charset=utf-8");

    log("ok", `apply: OK ${key} ${target} mode=${mode || "INSERT"} write=vfs.put`);
    return { ok: true };
  }

  // ------------------------------------------------------------
  // Boot / bind
  // ------------------------------------------------------------
  async function refresh() {
    try {
      const r = await scan();
      log("info", `CP1 scan: source=${r.source} files=${(r.files || []).length}`);
      log("info", `targets: count=${(r.targets || []).length} source=${r.source}`);
      log("info", `CP2 targets: count=${(r.targets || []).length}`);
      updateDropdown(r.targets);
      return r;
    } catch (e) {
      log("err", "scan err: " + (e?.message || e));
      return { ok: false };
    }
  }

  function boot() {
    // Não cria UI nova se você já tem UI — só tenta achar dropdown existente.
    // Se não existir, a gente cria um “mini” bloco no Admin, sem atrapalhar.
    let host = document.getElementById("rcfInjectorBox");
    if (!host) {
      // tenta anexar no admin
      const admin = document.querySelector("#viewAdmin, [data-view='admin'], .view-admin, body");
      host = document.createElement("div");
      host.id = "rcfInjectorBox";
      host.style.cssText = "margin:10px 0; padding:10px; border:1px solid rgba(255,255,255,.12); border-radius:12px; background:rgba(0,0,0,.12); color:#fff; font-size:12px;";
      host.innerHTML = `
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <b>Injector</b>
          <button id="rcfInjectorRefresh" style="padding:6px 10px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.08); color:#fff;">Scan</button>
          <select id="rcfInjectorTarget" style="min-width:260px; padding:6px 10px; border-radius:10px; border:1px solid rgba(255,255,255,.14); background:rgba(0,0,0,.25); color:#fff;"></select>
          <button id="rcfInjectorApply" style="padding:6px 10px; border-radius:999px; border:1px solid rgba(60,255,170,.25); background:rgba(60,255,170,.10); color:#eafff4;">Apply (test)</button>
        </div>
        <div id="rcfInjectorHint" style="margin-top:8px; opacity:.8;">
          Scan pega: runtime_vfs → mother_bundle_local → DOM anchors. (Fix: mother_bundle_local não pode virar 0)
        </div>
      `;
      try { admin.appendChild(host); } catch { document.body.appendChild(host); }
    }

    const btnR = document.getElementById("rcfInjectorRefresh");
    const btnA = document.getElementById("rcfInjectorApply");
    const sel = document.getElementById("rcfInjectorTarget");

    btnR?.addEventListener("click", () => refresh());
    btnA?.addEventListener("click", async () => {
      try {
        const target = sel?.value || "/index.html::HEAD_END";
        await applyInjection({ target, mode: "INSERT", content: "<!-- injector test -->" });
      } catch (e) {
        log("err", "apply err: " + (e?.message || e));
      }
    });

    // auto refresh
    refresh();

    log("ok", "injector.js ready ✅ (v1.0)");
  }

  window.RCF_INJECTOR = {
    __v10: true,
    scan,
    refresh,
    applyInjection,
    boot,
  };

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
