/* builderPanel.js — UI simples do BUILDER SAFE (Admin)
   Requisitos:
   - window.RCF_BUILDER_SAFE.cmd()
   - window.RCF_PATCH_QUEUE
*/

(() => {
  "use strict";

  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") n.className = v;
      else if (k === "style") n.setAttribute("style", v);
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    children.forEach(c => n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return n;
  }

  function safeCmdAvailable() {
    return !!(window.RCF_BUILDER_SAFE && typeof window.RCF_BUILDER_SAFE.cmd === "function");
  }

  function patchPeek() {
    try { return window.RCF_PATCH_QUEUE?.peek?.() || null; } catch { return null; }
  }

  function formatPending() {
    const p = patchPeek();
    if (!p) return "Sem patch pendente.";
    return [
      "PENDING PATCH",
      `id: ${p.id}`,
      `type: ${p.type}`,
      `intent: ${p.intent}`,
      `risk: ${p.risk}`,
      `target: ${p.targetPath}`,
      `overwriteBlocked: ${p.overwriteBlocked}`,
      `duplicates: ${p.duplicates?.length ? p.duplicates.join(", ") : "-"}`,
      "",
      "diffPreview:",
      p.diffPreview || "(sem diff)"
    ].join("\n");
  }

  function mount(container) {
    if (!container) return;
    if (container.querySelector("#rcfBuilderPanel")) return; // já montado

    const out = el("pre", {
      id: "rcfBuilderOut",
      style: [
        "margin-top:10px",
        "padding:12px",
        "border-radius:14px",
        "border:1px solid rgba(255,255,255,.10)",
        "background:rgba(0,0,0,.25)",
        "color:rgba(255,255,255,.92)",
        "white-space:pre-wrap",
        "word-break:break-word",
        "overflow:auto",
        "-webkit-overflow-scrolling:touch",
        "min-height:140px",
        "font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        "font-size:13px",
        "line-height:1.35"
      ].join(";")
    }, []);

    const input = el("input", {
      id: "rcfBuilderInput",
      type: "text",
      placeholder: "Digite comando (ex: help, write, preview, apply)...",
      style: [
        "width:100%",
        "padding:12px 14px",
        "border-radius:14px",
        "border:1px solid rgba(255,255,255,.10)",
        "background:rgba(0,0,0,.20)",
        "color:rgba(255,255,255,.92)",
        "outline:none"
      ].join(";")
    });

    const btnRun = el("button", { class: "btn", type: "button" }, ["Run"]);
    const btnHelp = el("button", { class: "btn", type: "button" }, ["help"]);
    const btnPreview = el("button", { class: "btn", type: "button" }, ["preview"]);
    const btnApply = el("button", { class: "btn btnPrimary", type: "button" }, ["apply"]);
    const btnDiscard = el("button", { class: "btn btnDanger", type: "button" }, ["discard"]);
    const btnPending = el("button", { class: "btn", type: "button" }, ["show pending"]);

    function print(msg) {
      out.textContent = String(msg || "");
    }

    async function run(line) {
      if (!safeCmdAvailable()) {
        print("❌ RCF_BUILDER_SAFE não carregou. Verifique se /app/js/builder/builderSafe.js foi importado/rodou.");
        return;
      }
      try {
        const res = await window.RCF_BUILDER_SAFE.cmd(line);
        print(res);
      } catch (e) {
        print("❌ erro: " + (e?.message || String(e)));
      }
    }

    btnRun.addEventListener("click", () => run(input.value));
    btnHelp.addEventListener("click", () => run("help"));
    btnPreview.addEventListener("click", () => run("preview"));
    btnApply.addEventListener("click", () => run("apply"));
    btnDiscard.addEventListener("click", () => run("discard"));
    btnPending.addEventListener("click", () => print(formatPending()));

    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") run(input.value);
    });

    // painel
    const panel = el("div", { id: "rcfBuilderPanel", style: "margin-top:14px" }, [
      el("div", { style:"display:flex;align-items:center;justify-content:space-between;gap:10px" }, [
        el("h2", { style:"margin:0;font-size:18px" }, ["Builder SAFE"]),
        el("div", { style:"opacity:.75;font-size:12px" }, [ "patches + rollback" ])
      ]),
      el("div", { style:"margin-top:10px;display:flex;gap:8px;flex-wrap:wrap" }, [
        btnHelp, btnPending, btnPreview, btnApply, btnDiscard
      ]),
      el("div", { style:"margin-top:10px" }, [ input ]),
      el("div", { style:"margin-top:10px" }, [ out ])
    ]);

    // mensagem inicial
    print("Pronto. Digite 'help' ou clique no botão help.");

    container.appendChild(panel);
  }

  // API: o Admin chama isso depois de renderizar
  window.RCF_BUILDER_PANEL = { mount };
})();
