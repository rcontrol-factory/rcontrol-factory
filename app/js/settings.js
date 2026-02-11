(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);

  function nowISO(){
    try { return new Date().toISOString(); } catch(e){ return ""; }
  }

  // --- LOGS helpers (compatível com o que já existe e com fallback) ---
  const LOG_KEY_PRIMARY = "rcf:logs";
  const LOG_KEY_ALT_1 = "RCF_LOGS";
  const LOG_KEY_ALT_2 = "logs";

  function getLogsRaw(){
    return (
      localStorage.getItem(LOG_KEY_PRIMARY) ||
      localStorage.getItem(LOG_KEY_ALT_1) ||
      localStorage.getItem(LOG_KEY_ALT_2) ||
      ""
    );
  }

  function setLogsRaw(s){
    localStorage.setItem(LOG_KEY_PRIMARY, String(s ?? ""));
  }

  function clearLogs(){
    localStorage.removeItem(LOG_KEY_PRIMARY);
    localStorage.removeItem(LOG_KEY_ALT_1);
    localStorage.removeItem(LOG_KEY_ALT_2);
  }

  function asText(raw){
    // aceita json array de strings/objetos OU texto puro
    const t = String(raw || "").trim();
    if (!t) return "";
    try{
      const v = JSON.parse(t);
      if (Array.isArray(v)) {
        return v.map(x => (typeof x === "string" ? x : JSON.stringify(x))).join("\n");
      }
      if (typeof v === "object") return JSON.stringify(v, null, 2);
      return String(v);
    } catch(e){
      return t;
    }
  }

  function downloadText(filename, text){
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 300);
  }

  // --- PIN (segurança) ---
  const PIN_KEY = "rcf:admin_pin";

  function renderSettings(){
    const mount = $("#settingsMount");
    if (!mount) return;

    mount.innerHTML = `
      <div class="card" style="margin-top:12px">
        <h3 style="margin:0 0 6px 0">✅ Settings carregado.</h3>
        <p class="hint">Central de configurações (sem GitHub aqui). GitHub fica no Admin.</p>
      </div>

      <div class="card" style="margin-top:12px" id="settings-security"></div>
      <div class="card" style="margin-top:12px" id="settings-logs"></div>
      <div class="card" style="margin-top:12px" id="settings-diag"></div>
    `;

    // 1) Segurança
    const secBox = $("#settings-security");
    secBox.innerHTML = `
      <h3>Segurança</h3>
      <p class="hint">Define um PIN para liberar ações críticas no Admin (recomendado).</p>
      <div class="row">
        <input id="pinInput" class="input" inputmode="numeric" placeholder="Definir PIN (4–8 dígitos)" />
        <button id="btnPinSave" class="btn primary" type="button">Salvar PIN</button>
        <button id="btnPinRemove" class="btn danger" type="button">Remover PIN</button>
      </div>
      <pre id="pinOut" class="mono small">Pronto.</pre>
    `;

    $("#btnPinSave")?.addEventListener("click", () => {
      const v = ($("#pinInput")?.value || "").trim();
      const ok = /^\d{4,8}$/.test(v);
      $("#pinOut").textContent = ok ? "PIN salvo." : "PIN inválido (use 4–8 dígitos).";
      if (ok) localStorage.setItem(PIN_KEY, v);
    });

    $("#btnPinRemove")?.addEventListener("click", () => {
      localStorage.removeItem(PIN_KEY);
      $("#pinOut").textContent = "PIN removido.";
    });

    // 2) Logs (no lugar do GitHub)
    const logsBox = $("#settings-logs");
    logsBox.innerHTML = `
      <h3>Logs</h3>
      <p class="hint">Ver, exportar e limpar logs locais (para diagnóstico rápido).</p>

      <div class="row">
        <button id="btnLogsRefresh" class="btn" type="button">Atualizar</button>
        <button id="btnLogsExport" class="btn primary" type="button">Exportar .txt</button>
        <button id="btnLogsClear" class="btn danger" type="button">Limpar logs</button>
      </div>

      <textarea id="logsView" class="textarea mono" spellcheck="false"
        placeholder="Sem logs ainda."></textarea>

      <pre id="logsOut" class="mono small">Pronto.</pre>
    `;

    const refreshLogs = () => {
      const raw = getLogsRaw();
      const txt = asText(raw);
      const el = $("#logsView");
      if (el) el.value = txt || "";
      $("#logsOut").textContent = txt ? `Logs carregados (${txt.split("\n").length} linhas).` : "Sem logs.";
    };

    $("#btnLogsRefresh")?.addEventListener("click", refreshLogs);

    $("#btnLogsExport")?.addEventListener("click", () => {
      const raw = getLogsRaw();
      const txt = asText(raw);
      if (!txt) {
        $("#logsOut").textContent = "Nada para exportar.";
        return;
      }
      downloadText(`rcf-logs-${nowISO().replaceAll(":","-")}.txt`, txt);
      $("#logsOut").textContent = "Exportado.";
    });

    $("#btnLogsClear")?.addEventListener("click", () => {
      clearLogs();
      setLogsRaw(""); // garante key principal zerada
      refreshLogs();
      $("#logsOut").textContent = "Logs limpos.";
    });

    // carrega na hora
    refreshLogs();

    // 3) Diag / Atalhos
    const diagBox = $("#settings-diag");
    diagBox.innerHTML = `
      <h3>Diag / Atalhos</h3>
      <p class="hint">Atalhos rápidos (o Admin continua com ações críticas).</p>
      <div class="row">
        <button id="btnGoDiagnose" class="btn" type="button">Diagnosticar</button>
        <button id="btnGoAdmin" class="btn" type="button">Abrir Admin</button>
      </div>
      <pre id="diagOut" class="mono small">Pronto.</pre>
    `;

    $("#btnGoDiagnose")?.addEventListener("click", () => {
      $("#diagOut").textContent = "Rodando diagnóstico…";
      try {
        document.getElementById("btnDiagnose")?.click?.();
        $("#diagOut").textContent = "Diagnóstico acionado.";
      } catch (e) {
        $("#diagOut").textContent = "Falhou ao acionar diagnóstico.";
      }
    });

    $("#btnGoAdmin")?.addEventListener("click", () => {
      try {
        document.querySelector('.tab[data-view="admin"]')?.click?.();
        $("#diagOut").textContent = "Abrindo Admin…";
      } catch (e) {
        $("#diagOut").textContent = "Falhou ao abrir Admin.";
      }
    });
  }

  window.addEventListener("DOMContentLoaded", renderSettings);
})();
