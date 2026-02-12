/* builderUI.js — UI simples do Builder (iOS friendly)
   - botão flutuante
   - input de comando
   - área de output
*/

(() => {
  "use strict";

  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "style") Object.assign(n.style, v);
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, String(v));
    });
    children.forEach((c) => n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return n;
  }

  function ensure() {
    if (document.getElementById("rcfBuilderFab")) return;

    const fab = el("button", {
      id: "rcfBuilderFab",
      type: "button",
      style: {
        position: "fixed",
        right: "14px",
        bottom: "14px",
        zIndex: 999999,
        padding: "10px 12px",
        borderRadius: "999px",
        border: "1px solid rgba(255,255,255,.18)",
        background: "rgba(0,0,0,.55)",
        color: "white",
        fontSize: "14px",
        fontFamily: "ui-sans-serif, system-ui, -apple-system",
        backdropFilter: "blur(10px)",
      },
    }, ["Builder"]);

    const overlay = el("div", {
      id: "rcfBuilderOverlay",
      style: {
        position: "fixed",
        inset: "0",
        zIndex: 999998,
        background: "rgba(0,0,0,.45)",
        display: "none",
      }
    });

    const panel = el("div", {
      style: {
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%,-50%)",
        width: "min(720px, 92vw)",
        height: "min(720px, 82vh)",
        background: "rgba(15,20,30,.92)",
        border: "1px solid rgba(255,255,255,.16)",
        borderRadius: "16px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }
    });

    const header = el("div", {
      style: {
        padding: "10px 12px",
        borderBottom: "1px solid rgba(255,255,255,.12)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
        color: "white",
        fontFamily: "ui-sans-serif, system-ui, -apple-system",
      }
    }, [
      el("div", {}, ["RCF Builder SAFE"]),
      el("button", {
        type: "button",
        style: {
          padding: "6px 10px",
          borderRadius: "10px",
          border: "1px solid rgba(255,255,255,.16)",
          background: "rgba(0,0,0,.35)",
          color: "white",
        },
        onclick: () => (overlay.style.display = "none"),
      }, ["Fechar"])
    ]);

    const out = el("pre", {
      id: "rcfBuilderOut",
      style: {
        flex: "1",
        margin: "0",
        padding: "12px",
        overflow: "auto",
        color: "rgba(255,255,255,.92)",
        fontSize: "12px",
        lineHeight: "1.35",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        whiteSpace: "pre-wrap",
      }
    }, ["Digite: help"]);

    const inputRow = el("div", {
      style: {
        display: "flex",
        gap: "8px",
        padding: "10px 12px",
        borderTop: "1px solid rgba(255,255,255,.12)",
        background: "rgba(0,0,0,.20)",
      }
    });

    const input = el("input", {
      id: "rcfBuilderInput",
      type: "text",
      placeholder: "comando (help / set file ... / write / preview / apply)",
      style: {
        flex: "1",
        padding: "10px 12px",
        borderRadius: "12px",
        border: "1px solid rgba(255,255,255,.14)",
        background: "rgba(0,0,0,.28)",
        color: "white",
        outline: "none",
        fontSize: "14px",
        fontFamily: "ui-sans-serif, system-ui, -apple-system",
      }
    });

    function print(text) {
      out.textContent = String(text || "");
      out.scrollTop = out.scrollHeight;
    }

    async function runCmd() {
      const cmd = input.value || "";
      input.value = "";

      const builder = window.RCF_BUILDER;
      if (!builder?.run) {
        print("Builder engine não carregado. Verifique se app/js/engine/builderEngine.js foi criado e carregado.");
        return;
      }

      const r = builder.run(cmd);
      if (r && typeof r.then === "function") {
        try {
          const rr = await r;
          print(rr?.text || String(rr));
        } catch (e) {
          print("ERR: " + (e?.message || e));
        }
      } else {
        print(r?.text || String(r));
      }
    }

    const sendBtn = el("button", {
      type: "button",
      style: {
        padding: "10px 12px",
        borderRadius: "12px",
        border: "1px solid rgba(255,255,255,.16)",
        background: "rgba(0,0,0,.35)",
        color: "white",
        fontSize: "14px",
      },
      onclick: runCmd,
    }, ["Enviar"]);

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") runCmd();
    });

    inputRow.appendChild(input);
    inputRow.appendChild(sendBtn);

    panel.appendChild(header);
    panel.appendChild(out);
    panel.appendChild(inputRow);

    overlay.appendChild(panel);

    fab.addEventListener("click", () => {
      overlay.style.display = "block";
      setTimeout(() => { try { input.focus(); } catch {} }, 50);
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.style.display = "none";
    });

    document.body.appendChild(overlay);
    document.body.appendChild(fab);
  }

  // injeta quando DOM pronto
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensure);
  } else {
    ensure();
  }
})();
