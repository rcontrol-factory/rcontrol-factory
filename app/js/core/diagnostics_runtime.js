/* FILE: /app/js/core/diagnostics_runtime.js
   RControl Factory — Diagnostics Runtime
   - Extrai microtests / overlay scan / css token / stability check
   - Seguro / tolerante / sem quebrar boot
*/
(() => {
  "use strict";

  function $(sel) {
    try { return document.querySelector(sel); } catch { return null; }
  }

  function $$(sel) {
    try { return Array.from(document.querySelectorAll(sel)); } catch { return []; }
  }

  function uiMsg(sel, text) {
    const el = $(sel);
    if (el) el.textContent = String(text ?? "");
  }

  function writeLog(...args) {
    try {
      if (window.RCF_LOGGER_RUNTIME && typeof window.RCF_LOGGER_RUNTIME.write === "function") {
        return window.RCF_LOGGER_RUNTIME.write(...args);
      }
    } catch {}
    try { console.log("[RCF][DIAG]", ...args); } catch {}
    return null;
  }

  const API = {
    scanOverlays() {
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
            rect: {
              x: Math.round(r.x),
              y: Math.round(r.y),
              w: Math.round(r.width),
              h: Math.round(r.height)
            }
          });
        } catch {}

        if (suspects.length >= 8) break;
      }

      return { ok: true, suspects };
    },

    runMicroTests() {
      const results = [];
      const push = (name, pass, info = "") => results.push({ name, pass: !!pass, info: String(info || "") });

      try { push("TEST_RENDER", !!$("#rcfRoot") && !!$("#views"), !!$("#rcfRoot") ? "UI root ok" : "UI root missing"); }
      catch (e) { push("TEST_RENDER", false, e?.message || e); }

      try { push("TEST_IMPORTS", !!window.RCF_LOGGER && !!window.RCF && !!window.RCF.state, "globals"); }
      catch (e) { push("TEST_IMPORTS", false, e?.message || e); }

      try { push("TEST_UI_REGISTRY", !!window.RCF_UI && typeof window.RCF_UI.getSlot === "function", "RCF_UI"); }
      catch (e) { push("TEST_UI_REGISTRY", false, e?.message || e); }

      try { push("TEST_EVENT_BIND", !!$("#btnOpenTools") && !!$("#btnAgentRun") && !!$("#btnSaveFile"), "buttons"); }
      catch (e) { push("TEST_EVENT_BIND", false, e?.message || e); }

      try {
        const hasState = !!(window.RCF && window.RCF.state);
        const hasApps = !!(window.RCF?.state && Array.isArray(window.RCF.state.apps));
        push("TEST_STATE_INIT", hasState && hasApps, "state");
      } catch (e) {
        push("TEST_STATE_INIT", false, e?.message || e);
      }

      const passCount = results.filter(r => r.pass).length;
      return { ok: passCount === results.length, pass: passCount, total: results.length, results };
    },

    cssLoadedCheck() {
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
    },

    async runV8StabilityCheck() {
      const lines = [];
      const failList = [];
      let pass = 0;
      let fail = 0;

      const add = (ok, label, detail) => {
        if (ok) {
          pass++;
          lines.push(`PASS: ${label}${detail ? " — " + detail : ""}`);
        } else {
          fail++;
          const t = `FAIL: ${label}${detail ? " — " + detail : ""}`;
          lines.push(t);
          failList.push(label + (detail ? `: ${detail}` : ""));
        }
      };

      add(!!window.__RCF_BOOTED__, "[BOOT] __RCF_BOOTED__", window.__RCF_BOOTED__ ? "lock ativo" : "lock ausente");

      const css = this.cssLoadedCheck();
      add(css.ok, "[CSS] CSS_TOKEN", `token: "${css.token}"`);

      let swr = { ok: false, status: "missing", detail: "sw runtime ausente" };
      try {
        if (window.RCF_SW_RUNTIME && typeof window.RCF_SW_RUNTIME.checkAutoFix === "function") {
          swr = await window.RCF_SW_RUNTIME.checkAutoFix();
        }
      } catch (e) {
        swr = { ok: false, status: "error", detail: e?.message || e };
      }

      if (swr.ok) add(true, "[SW] SW_REGISTERED", swr.detail || "registrado");
      else lines.push(`WARN: [SW] SW_REGISTERED — ${swr.detail || swr.status}${swr.err ? " | err=" + swr.err : ""}`);

      const overlay = this.scanOverlays();
      add(overlay.ok, "[CLICK] OVERLAY_SCANNER", overlay.ok ? "ok" : "erro");
      add((overlay.suspects || []).length === 0, "[CLICK] OVERLAY_BLOCK", (overlay.suspects || []).length ? `suspects=${overlay.suspects.length}` : "nenhum");

      const mt = this.runMicroTests();
      add(mt.ok, "[MICROTEST] ALL", `${mt.pass}/${mt.total}`);

      const stable = (fail === 0);
      try { window.RCF_STABLE = stable; } catch {}

      lines.unshift("=========================================================");
      lines.unshift("RCF — V8 STABILITY CHECK (REPORT)");
      lines.push("=========================================================");
      lines.push(`PASS: ${pass} | FAIL: ${fail}`);
      lines.push(`RCF_STABLE: ${stable ? "TRUE ✅" : "FALSE ❌"}`);
      lines.push("");

      if (!stable) {
        lines.push("FAIL LIST:");
        for (const f of failList) lines.push(`- ${f}`);
      } else {
        lines.push("STATUS: RCF_STABLE = TRUE ✅");
      }

      const report = lines.join("\n");
      uiMsg("#diagOut", report);
      writeLog("V8 check:", stable ? "PASS ✅" : "FAIL ❌", `${pass}/${pass + fail}`);

      return {
        stable,
        pass,
        fail,
        report,
        overlay,
        microtests: mt,
        css,
        sw: swr
      };
    },

    init() {
      try { window.RCF_DIAGNOSTICS_RUNTIME = API; } catch {}
      writeLog("diagnostics_runtime:", "init ok ✅");
      return true;
    }
  };

  try { window.RCF_DIAGNOSTICS_RUNTIME = API; } catch {}

  try {
    document.addEventListener("DOMContentLoaded", () => {
      try { API.init(); } catch {}
    }, { passive: true });
  } catch {}
})();
