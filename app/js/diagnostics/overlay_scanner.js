/* =========================================================
  app/js/diagnostics/overlay_scanner.js  (FULL)
  FASE A — Scan/TargetMap com fallback em cascata (iOS SAFE)

  SOURCE ORDER:
  1) runtime_vfs (se existir e tiver arquivos)
  2) vfs_overrides/storage registry (mesma storage da Mãe)
  3) bundle em memória (mother_bundle.json)
  4) DOM anchors (HEAD_END/BODY_END...) => targets >= 2

  Logs:
  - "scan fallback -> DOM anchors"
========================================================= */
(() => {
  "use strict";

  const TAG = "[SCAN]";
  const log = (msg) => {
    try { window.RCF_LOGGER?.push?.("scan", msg); } catch {}
    try { console.log(TAG, msg); } catch {}
  };

  const isObj = (v) => v && typeof v === "object";
  const isFn = (v) => typeof v === "function";

  const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

  // --- DOM fallback targets (garante >= 2) ---
  function domTargets() {
    const t = [
      { id: "DOM::HEAD_END", label: "DOM::HEAD_END", mode: "HEAD_END", selector: "head" },
      { id: "DOM::BODY_END", label: "DOM::BODY_END", mode: "BODY_END", selector: "body" },
    ];
    try {
      const hasJs = !!document.querySelector("script");
      const hasCss = !!document.querySelector('link[rel="stylesheet"], style');
      if (hasJs) t.push({ id: "DOM::JS_EOF", label: "DOM::JS_EOF", mode: "JS_EOF", selector: "body" });
      if (hasCss) t.push({ id: "DOM::CSS_ROOT", label: "DOM::CSS_ROOT", mode: "CSS_ROOT", selector: "head" });
    } catch {}
    return t;
  }

  // --- normalize para /app (porque seu motherRoot = /app) ---
  function normalizePath(p) {
    p = String(p || "").trim();
    if (!p) return "";
    p = p.split("#")[0].split("?")[0];
    if (!p.startsWith("/")) p = "/" + p;
    p = p.replace(/\/{2,}/g, "/");

    // força /app/*
    if (!p.startsWith("/app/")) {
      if (p.startsWith("/js/")) p = "/app" + p;
      else if (/^\/[^/]+\.(html|js|css|json|txt|md|svg|png|jpg|jpeg|webp|ico)$/i.test(p)) p = "/app" + p;
    }
    return p;
  }

  // ---------------------------------------------------------
  // SOURCE 1: runtime_vfs (se existir)
  // ---------------------------------------------------------
  async function scanRuntimeVFS() {
    const rv = window.runtime_vfs || window.RUNTIME_VFS || window.RCF_RUNTIME_VFS;
    if (!rv) return [];

    try {
      // tentativas comuns
      if (isFn(rv.listFiles)) return (await rv.listFiles()) || [];
      if (isFn(rv.keys)) return (await rv.keys()) || [];
      if (Array.isArray(rv.files)) return rv.files;
      if (isObj(rv.files)) return Object.keys(rv.files);
      return [];
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------
  // SOURCE 2: overrides (RCF_VFS_OVERRIDES / RCF_VFS)
  // ---------------------------------------------------------
  async function scanOverrides() {
    const ov = window.RCF_VFS_OVERRIDES || window.RCF_VFS || window.RCF_VFS_OVERRIDE;
    if (!ov) return [];

    try {
      // padrões: list/keys/index/dump
      if (isFn(ov.list)) return (await ov.list()) || [];
      if (isFn(ov.keys)) return (await ov.keys()) || [];
      if (isFn(ov.index)) return (await ov.index()) || [];
      if (isFn(ov.dumpIndex)) return (await ov.dumpIndex()) || [];
      if (Array.isArray(ov._index)) return ov._index;
      if (isObj(ov._index)) return Object.keys(ov._index);
      return [];
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------
  // SOURCE 3: bundle da Mãe (mother_bundle.json)
  // - tenta cache + fetch normal
  // ---------------------------------------------------------
  async function scanMotherBundle() {
    const paths = [
      "./import/mother_bundle.json",
      "/app/import/mother_bundle.json",
      "app/import/mother_bundle.json"
    ];

    for (const p of paths) {
      try {
        const res = await fetch(p, { cache: "no-store" });
        if (!res.ok) continue;
        const txt = await res.text();
        const json = JSON.parse(txt);
        const files = json?.files || {};
        const keys = Object.keys(files);
        if (keys.length) return keys;
      } catch {}
    }
    return [];
  }

  // ---------------------------------------------------------
  // gera targets baseado em lista de arquivos
  // (se vazio -> DOM)
  // ---------------------------------------------------------
  function generateTargetsFromFiles(fileList) {
    const files = uniq((fileList || []).map(normalizePath));

    // se não tem nada -> DOM anchors
    if (!files.length) {
      log("scan fallback -> DOM anchors");
      return domTargets();
    }

    // targets derivados
    const targets = [];

    // sempre dá ao menos DOM também (safe)
    targets.push(...domTargets());

    // se achar index.html, cria target específico de html
    if (files.includes("/app/index.html")) {
      targets.push({ id: "/app/index.html::HEAD_END", label: "/app/index.html::HEAD_END", mode: "HEAD_END", file: "/app/index.html" });
      targets.push({ id: "/app/index.html::BODY_END", label: "/app/index.html::BODY_END", mode: "BODY_END", file: "/app/index.html" });
    }

    // se achar app.js, cria target específico de js
    if (files.includes("/app/app.js")) {
      targets.push({ id: "/app/app.js::EOF", label: "/app/app.js::EOF", mode: "JS_EOF", file: "/app/app.js" });
    }

    // se achar styles.css, cria target css
    if (files.includes("/app/styles.css")) {
      targets.push({ id: "/app/styles.css::ROOT", label: "/app/styles.css::ROOT", mode: "CSS_ROOT", file: "/app/styles.css" });
    }

    // garante >=2
    if (targets.length < 2) {
      log("scan fallback -> DOM anchors");
      return domTargets();
    }

    return targets;
  }

  // ---------------------------------------------------------
  // API principal: scanFactoryFiles()
  // ---------------------------------------------------------
  async function scanFactoryFiles() {
    // 1) runtime_vfs
    const a = await scanRuntimeVFS();
    if (a && a.length) {
      log(`A:runtime_vfs files=${a.length}`);
      return { source: "A:runtime_vfs", files: a };
    }

    // 2) overrides
    const b = await scanOverrides();
    if (b && b.length) {
      log(`B:overrides files=${b.length}`);
      return { source: "B:overrides", files: b };
    }

    // 3) mother bundle
    const c = await scanMotherBundle();
    if (c && c.length) {
      log(`C:mother_bundle files=${c.length}`);
      return { source: "C:mother_bundle", files: c };
    }

    // 4) DOM
    log("A:runtime_vfs files=0");
    log("scan fallback -> DOM anchors");
    return { source: "D:DOM", files: [] };
  }

  // ---------------------------------------------------------
  // API: generateTargetMap()
  // - guarda em window.RCF_TARGET_MAP para o dropdown usar
  // ---------------------------------------------------------
  async function generateTargetMap() {
    const res = await scanFactoryFiles();
    const targets = generateTargetsFromFiles(res.files);

    // salva em locais comuns
    window.RCF_TARGET_MAP = {
      count: targets.length,
      source: res.source,
      createdAt: new Date().toISOString(),
      targets
    };

    // compat: se algum código usa window.targets
    if (Array.isArray(window.targets)) window.targets = targets;

    log(`targets: generated count=${targets.length}`);
    return window.RCF_TARGET_MAP;
  }

  // ---------------------------------------------------------
  // export global
  // ---------------------------------------------------------
  window.RCF_OVERLAY_SCANNER = {
    scanFactoryFiles,
    generateTargetMap,
    normalizePath
  };

  // compat com chamadores antigos
  window.scanFactoryFiles = window.scanFactoryFiles || scanFactoryFiles;
  window.generateTargetMap = window.generateTargetMap || generateTargetMap;

  log("overlay_scanner loaded ✅ (cascade fallback enabled)");
})();
