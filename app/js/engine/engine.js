/* FILE: /app/js/engine/engine.js
   RCF — engine.js — v1.1a (AUTO ZIP -> APP)
   Objetivo:
   - Manter API pública da Engine
   - + NOVO: ao importar ZIP no VAULT, criar app automaticamente no State.apps
   - iOS-safe / fail-safe (nunca quebra a Factory)
   Requisitos:
   - RCF_ZIP_VAULT.importZip(file) deve existir (se não existir, só ignora)
   - State.apps deve ser array
*/
(() => {
  "use strict";

  const Engine = {
    version: "1.1a",
    _ctx: null,
    _hooked: false,

    init(ctx) {
      this._ctx = ctx || null;

      // hook do VAULT (auto-create app)
      try { this._installVaultHook(); } catch {}

      try { ctx?.Logger?.write?.("ENGINE:", "ready ✅ v" + this.version); } catch {}
      return true;
    },

    createSpec({ name, slug, template, modules }) {
      const sname = String(name || "").trim();
      if (!sname) return { ok: false, err: "Nome inválido" };

      const sslug =
        (slug && String(slug).trim()) ||
        (window.RCF_BUILDER?.slugify?.(sname) || this._slugifyFallback(sname));

      if (!sslug) return { ok: false, err: "Slug inválido" };

      return {
        ok: true,
        spec: {
          name: sname,
          slug: sslug,
          template: template || "pwa-base",
          modules: Array.isArray(modules) ? modules : []
        }
      };
    },

    createAppFromSpec(spec) {
      const ctx = this._ctx;
      if (!ctx || !ctx.State) return { ok: false, err: "Engine não inicializada (ctx)" };

      const State = ctx.State;
      const Logger = ctx.Logger;

      if (!Array.isArray(State.apps)) State.apps = [];

      if (State.apps.some(a => a && a.slug === spec.slug)) {
        return { ok: false, err: "Slug já existe: " + spec.slug };
      }

      if (!window.RCF_BUILDER || typeof window.RCF_BUILDER.buildAppFiles !== "function") {
        return { ok: false, err: "RCF_BUILDER.buildAppFiles ausente" };
      }

      const files = window.RCF_BUILDER.buildAppFiles(spec);

      const app = {
        name: spec.name,
        slug: spec.slug,
        createdAt: new Date().toISOString(),
        files
      };

      State.apps.push(app);
      try { ctx.Storage?.set?.("apps", State.apps); } catch {}
      try {
        Logger?.write?.("ENGINE:", "app created ✅", spec.slug, "modules=" + (spec.modules || []).join(","));
      } catch {}

      this._notifyAppsUpdated({ kind: "spec", slug: spec.slug });

      return { ok: true, app };
    },

    // =========================================================
    // NOVO: cria app a partir do VAULT (ZIP importado)
    // =========================================================
    async createAppFromVaultJob(jobId, opts) {
      const ctx = this._ctx;
      if (!ctx || !ctx.State) return { ok: false, err: "Engine não inicializada (ctx)" };
      if (!window.RCF_ZIP_VAULT) return { ok: false, err: "RCF_ZIP_VAULT ausente" };
      if (!jobId) return { ok: false, err: "jobId ausente" };

      const State = ctx.State;
      const Logger = ctx.Logger;
      if (!Array.isArray(State.apps)) State.apps = [];

      const nameHint = (opts && opts.name) ? String(opts.name) : ("ZIP App " + String(jobId).slice(-6));
      const slugHint =
        (opts && opts.slug) ? String(opts.slug) :
        (window.RCF_BUILDER?.slugify?.(nameHint) || this._slugifyFallback(nameHint));

      const slug = this._uniqueSlug(slugHint, State.apps);

      try { Logger?.write?.("ENGINE:", "vault->app start…", "job=" + jobId, "slug=" + slug); } catch {}

      // pega index do vault e filtra por jobId
      let idx = [];
      try { idx = window.RCF_ZIP_VAULT.list?.() || []; } catch { idx = []; }
      const items = (idx || []).filter(it => it && String(it.jobId || "") === String(jobId));

      if (!items.length) {
        try { Logger?.write?.("ENGINE:", "vault->app fail (0 files)", "job=" + jobId); } catch {}
        return { ok: false, err: "Nenhum arquivo encontrado no Vault para jobId=" + jobId };
      }

      // detecta prefixo comum (quando o zip vem dentro de uma pasta)
      const paths = items.map(it => String(it.path || "")).filter(Boolean);
      const rootPrefix = this._commonRootPrefix(paths);

      // monta files map (somente texto; binários ficam como base64 placeholder)
      const files = {};
      let textCount = 0;
      let binCount = 0;

      for (const it of items) {
        const fullPath = String(it.path || "");
        const relPath = rootPrefix ? this._stripPrefix(fullPath, rootPrefix) : fullPath;
        if (!relPath) continue;

        try {
          const rec = await window.RCF_ZIP_VAULT.get(fullPath);
          const mime = String(rec?.mime || it.mime || "");
          const ab = rec?.ab || null;

          if (!ab) continue;

          const isText = this._isText(mime, relPath);

          if (isText) {
            let txt = "";
            try {
              txt = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(ab));
            } catch {
              // fallback: tenta latin1-like
              txt = String.fromCharCode.apply(null, Array.from(new Uint8Array(ab)).slice(0, 200000));
            }
            files[relPath] = txt;
            textCount++;
          } else {
            // evita explodir o State com binário gigante
            files[relPath] = "/* binary omitted by RCF (stored in vault) mime=" + mime + " */";
            binCount++;
          }
        } catch (e) {
          try { Logger?.write?.("ENGINE:", "vault file read warn", relPath, String(e?.message || e)); } catch {}
        }
      }

      // heurística: se não tiver index.html, não cria app (evita lixo)
      if (!files["index.html"] && !files["./index.html"]) {
        try { Logger?.write?.("ENGINE:", "vault->app abort (sem index.html)", "slug=" + slug); } catch {}
        return { ok: false, err: "ZIP não parece app (index.html não encontrado)" };
      }

      const app = {
        name: nameHint,
        slug,
        createdAt: new Date().toISOString(),
        meta: {
          source: "vault",
          jobId: String(jobId),
          rootPrefix: rootPrefix || "",
          textCount,
          binCount
        },
        files
      };

      // salva no State
      State.apps.push(app);
      try { ctx.Storage?.set?.("apps", State.apps); } catch {}
      try {
        Logger?.write?.(
          "ENGINE:",
          "vault->app created ✅",
          slug,
          "files=" + Object.keys(files).length,
          "text=" + textCount,
          "bin=" + binCount
        );
      } catch {}

      this._notifyAppsUpdated({ kind: "vault", slug, jobId });

      return { ok: true, app, slug, jobId, files: Object.keys(files).length };
    },

    // =========================================================
    // Hook: depois do importZip (Vault) -> criar app
    // =========================================================
    _installVaultHook() {
      if (this._hooked) return true;
      this._hooked = true;

      const tryHook = () => {
        const V = window.RCF_ZIP_VAULT;
        if (!V || typeof V.importZip !== "function") return false;
        if (V.__engine_hooked__) return true;

        const original = V.importZip.bind(V);

        V.importZip = async (file) => {
          const r = await original(file);

          // sempre dispara evento (pra outros módulos escutarem)
          try {
            window.dispatchEvent(new CustomEvent("RCF:VAULT_IMPORTED", { detail: r || {} }));
          } catch {}

          // auto-create app quando OK
          if (r && r.ok && r.jobId) {
            try {
              // nome do app pelo nome do zip
              const nm = (file && file.name) ? String(file.name).replace(/\.zip$/i, "") : "ZIP App";
              await this.createAppFromVaultJob(r.jobId, { name: nm });
            } catch (e) {
              try { this._ctx?.Logger?.write?.("ENGINE:", "vault->app fail", String(e?.message || e)); } catch {}
            }
          }

          return r;
        };

        V.__engine_hooked__ = true;

        try { this._ctx?.Logger?.write?.("ENGINE:", "vault hook installed ✅"); } catch {}
        return true;
      };

      // tenta agora e tenta de novo (caso vault carregue depois)
      if (tryHook()) return true;
      setTimeout(() => { try { tryHook(); } catch {} }, 800);
      setTimeout(() => { try { tryHook(); } catch {} }, 2200);
      return true;
    },

    // =========================================================
    // Helpers
    // =========================================================
    _notifyAppsUpdated(detail) {
      try { window.dispatchEvent(new CustomEvent("RCF:APPS_UPDATED", { detail: detail || {} })); } catch {}
      // tenta chamar algum refresh conhecido (sem depender)
      try { window.RCF_UI?.refreshApps?.(); } catch {}
      try { window.RCF_UI?.renderApps?.(); } catch {}
      try { window.RCF_UI?.render?.(); } catch {}
    },

    _slugifyFallback(s) {
      return String(s || "")
        .toLowerCase()
        .trim()
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);
    },

    _uniqueSlug(base, apps) {
      const used = new Set((apps || []).map(a => String(a?.slug || "")));
      let s = String(base || "").trim() || ("app-" + Date.now());
      if (!used.has(s)) return s;
      for (let i = 2; i < 200; i++) {
        const cand = s + "-" + i;
        if (!used.has(cand)) return cand;
      }
      return s + "-" + Date.now();
    },

    _commonRootPrefix(paths) {
      if (!paths || paths.length < 2) {
        const p = paths && paths[0] ? String(paths[0]) : "";
        const a = p.split("/");
        return (a.length > 1) ? (a[0] + "/") : "";
      }

      // pega o primeiro segmento e vê se todos começam com ele + "/"
      const first = String(paths[0] || "");
      const seg = first.split("/")[0] || "";
      if (!seg) return "";

      const all = paths.every(p => String(p || "").startsWith(seg + "/"));
      if (!all) return "";

      // se tudo está dentro da mesma pasta raiz, remove ela
      return seg + "/";
    },

    _stripPrefix(path, prefix) {
      const p = String(path || "");
      const pre = String(prefix || "");
      if (!pre) return p;
      if (p.startsWith(pre)) return p.slice(pre.length);
      return p;
    },

    _isText(mime, path) {
      const m = String(mime || "").toLowerCase();
      if (m.startsWith("text/")) return true;
      const p = String(path || "").toLowerCase();
      return (
        p.endsWith(".js") || p.endsWith(".json") || p.endsWith(".css") ||
        p.endsWith(".html") || p.endsWith(".htm") || p.endsWith(".md") || p.endsWith(".txt") ||
        p.endsWith(".svg")
      );
    }
  };

  window.RCF_ENGINE = Engine;
})();
