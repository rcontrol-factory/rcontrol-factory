/* FILE: /app/js/core/doctor_scan.js
   RControl Factory — Doctor Scan — v1.0 SAFE (read-only)
   Objetivo:
   - ✅ Injetar botão "Doctor" no painel do Agent Tools (sem depender do index)
   - ✅ Rodar um diagnóstico leve (NÃO altera nada / não escreve / não limpa cache)
   - ✅ Resultado vai pro console + tenta mandar pro logger se existir
*/

(() => {
  "use strict";

  if (window.__RCF_DOCTOR_SCAN_V10__) return;
  window.__RCF_DOCTOR_SCAN_V10__ = true;

  const TAG = "DOCTOR";
  const ts = () => new Date().toISOString();

  function log(lvl, msg, obj) {
    try { window.RCF_LOGGER?.push?.(lvl, `[${TAG}] ${msg}`); } catch {}
    try {
      if (obj !== undefined) console.log(`[${TAG}]`, lvl, msg, obj);
      else console.log(`[${TAG}]`, lvl, msg);
    } catch {}
  }

  function h(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "style" && v && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else if (v !== false && v != null) el.setAttribute(k, String(v));
    }
    for (const c of (children || [])) {
      if (c == null) continue;
      if (typeof c === "string") el.appendChild(document.createTextNode(c));
      else el.appendChild(c);
    }
    return el;
  }

  function getHost() {
    // prioridade: painel do Agent Tools (já existe no seu boot)
    const a = document.getElementById("rcfAgentToolsPanel");
    if (a) return a;

    // fallback: slot tools (quando existe)
    const s = document.getElementById("rcfAgentSlotTools");
    if (s) return s;

    // fallback final: body
    return document.body;
  }

  function has(objPath) {
    try {
      const parts = String(objPath).split(".");
      let cur = window;
      for (const p of parts) {
        if (!cur) return false;
        cur = cur[p];
      }
      return !!cur;
    } catch { return false; }
  }

  async function scan() {
    const out = [];
    const push = (k, v) => out.push({ k, v });

    push("time", ts());
    push("href", location.href);
    push("baseURI", document.baseURI);
    push("userAgent", navigator.userAgent);

    // Service Worker (somente leitura)
    try {
      const swSupported = ("serviceWorker" in navigator);
      push("sw.supported", swSupported);
      if (swSupported) {
        push("sw.controller", !!navigator.serviceWorker.controller);
        const regs = await navigator.serviceWorker.getRegistrations();
        push("sw.regs", regs.length);
        for (let i = 0; i < Math.min(5, regs.length); i++) {
          push(`sw.scope[${i}]`, regs[i]?.scope || "");
        }
      }
    } catch (e) {
      push("sw.error", e?.message || String(e));
    }

    // Caches API (somente leitura)
    try {
      const cacheSupported = ("caches" in window);
      push("caches.supported", cacheSupported);
      if (cacheSupported) {
        const keys = await caches.keys();
        push("caches.keys", keys.length);
        for (let i = 0; i < Math.min(10, keys.length); i++) {
          push(`cache[${i}]`, keys[i]);
        }
      }
    } catch (e) {
      push("caches.error", e?.message || String(e));
    }

    // Sinais de módulos / globals (não depende de nomes exatos)
    const checks = [
      "RCF_VENDOR_LOADER",
      "RCF_GH_SYNC",
      "RCF_VFS",
      "RCF_MAE",
      "RCF_ZIP_VAULT",
      "RCF_AGENT_ZIP_BRIDGE",
      "RCF_UI",
      "RCF_LOGGER"
    ];
    for (const c of checks) {
      push(`global.${c}`, has(c));
    }

    // Scripts duplicados (ajuda detectar double-load)
    try {
      const scripts = Array.from(document.scripts || []).map(s => s.src || "[inline]");
      const map = {};
      for (const s of scripts) map[s] = (map[s] || 0) + 1;
      const dups = Object.entries(map).filter(([, n]) => n > 1).slice(0, 20);
      push("scripts.total", scripts.length);
      push("scripts.dupCount", dups.length);
      if (dups.length) push("scripts.dups", dups.map(([s, n]) => `${n}x ${s}`).join(" | "));
    } catch (e) {
      push("scripts.error", e?.message || String(e));
    }

    // Render final texto
    const text =
      "RCF DOCTOR SCAN (read-only)\n" +
      out.map(x => `- ${x.k}: ${typeof x.v === "string" ? x.v : JSON.stringify(x.v)}`).join("\n");

    return { out, text };
  }

  function showModal(text) {
    // modal leve, sem depender de CSS externo
    const overlay = h("div", {
      id: "rcfDoctorOverlay",
      style: {
        position: "fixed",
        inset: "0",
        background: "rgba(0,0,0,.55)",
        zIndex: "999999",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px"
      },
      onclick: (e) => { if (e.target?.id === "rcfDoctorOverlay") overlay.remove(); }
    });

    const box = h("div", {
      style: {
        width: "min(920px, 100%)",
        maxHeight: "80vh",
        overflow: "auto",
        background: "rgba(15,20,35,.98)",
        border: "1px solid rgba(255,255,255,.15)",
        borderRadius: "14px",
        padding: "14px",
        color: "#eaf0ff",
        fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,Arial"
      }
    }, [
      h("div", { style:{display:"flex", gap:"8px", alignItems:"center", justifyContent:"space-between"} }, [
        h("div", {}, ["🩺 Doctor Scan"]),
        h("button", {
          style:{
            border:"1px solid rgba(255,255,255,.18)",
            background:"rgba(255,255,255,.10)",
            color:"#eaf0ff",
            borderRadius:"999px",
            padding:"8px 10px",
            fontWeight:"800"
          },
          onclick: () => overlay.remove()
        }, ["Fechar"])
      ]),
      h("pre", {
        style:{
          marginTop:"10px",
          whiteSpace:"pre-wrap",
          background:"rgba(0,0,0,.35)",
          border:"1px solid rgba(255,255,255,.10)",
          borderRadius:"12px",
          padding:"10px",
          minHeight:"180px"
        }
      }, [text]),
      h("div", { style:{marginTop:"10px", opacity:".9", fontSize:"12px"} }, [
        "Obs: scan é somente leitura (não limpa cache, não altera SW, não faz rollback)."
      ])
    ]);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  async function runDoctor() {
    try {
      log("INFO", "scan start…");
      const r = await scan();
      log("OK", "scan done ✅");
      log("INFO", "scan text:", r.text);
      showModal(r.text);
    } catch (e) {
      log("WARN", "scan failed", e?.message || String(e));
      try { alert("Doctor scan falhou: " + (e?.message || String(e))); } catch {}
    }
  }

  function mountOnce() {
    if (document.getElementById("rcfDoctorBtn")) return true;

    const host = getHost();
    if (!host) return false;

    // botão discreto
    const btn = h("button", {
      id: "rcfDoctorBtn",
      style: {
        border: "1px solid rgba(255,255,255,.18)",
        background: "rgba(255,255,255,.10)",
        color: "#eaf0ff",
        borderRadius: "999px",
        padding: "9px 11px",
        fontWeight: "900",
        cursor: "pointer",
        margin: "8px 8px 0 0"
      },
      onclick: () => runDoctor()
    }, ["🩺 Doctor"]);

    // tenta colocar em um lugar bom dentro do Agent Tools Panel
    try {
      // se tiver um container de ações, insere lá; senão, adiciona no topo
      const actions =
        host.querySelector?.("[data-rcf-actions]") ||
        host.querySelector?.(".rcf_actions") ||
        host;

      actions.appendChild(btn);
      log("OK", "Doctor button injected ✅");
      return true;
    } catch (e) {
      log("WARN", "inject failed", e?.message || String(e));
      return false;
    }
  }

  function init() {
    // tenta agora
    mountOnce();

    // e tenta de novo quando UI estiver pronta
    try {
      window.addEventListener("RCF:UI_READY", () => mountOnce());
    } catch {}

    // retry curto (caso painel monte depois)
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (mountOnce() || tries >= 12) clearInterval(t);
    }, 350);

    log("OK", "doctor_scan.js ready ✅ (v1.0)");
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
